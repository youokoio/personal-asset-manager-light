"use strict";

/* ---------- S11b 株式OCRの保存 ---------- */

function stockOcrValidateSaveCardStock(card) {
  if (!card || card.status !== "recognized") {
    throw new Error("未確認の商品カードは保存できません。");
  }

  if (typeof card.name !== "string" || !card.name.trim()) {
    throw new Error("商品名が正しくありません。");
  }

  if (!HOLDING_WRAPPERS.includes(card.wrapper)) {
    throw new Error("wrapperが正しくありません。");
  }

  if (!HOLDING_KINDS.includes(card.kind)) {
    throw new Error("商品種別が正しくありません。");
  }

  if (typeof card.value !== "number" ||
      !Number.isFinite(card.value)) {
    throw new Error("評価額が正しくありません。");
  }

  for (const field of ["quantity","costBasis","pnl"]) {
    if (card[field] !== null &&
        card[field] !== undefined &&
        (typeof card[field] !== "number" ||
         !Number.isFinite(card[field]))) {
      throw new Error(field + "が正しくありません。");
    }
  }
}

function stockOcrSumFieldStock(cards,field) {
  if (!cards.every(card =>
    typeof card[field] === "number" &&
    Number.isFinite(card[field])
  )) {
    return null;
  }

  return cards.reduce((total,card) => total + card[field],0);
}

function stockOcrGetNewRecordedAtStock(
  snapshots,accountId,targetDate,requestedAt
) {
  const requestedTime = new Date(requestedAt).getTime();
  if (!Number.isFinite(requestedTime)) {
    throw new Error("登録日時が正しくありません。");
  }

  const sameDateSnapshots = snapshots.filter(snapshot =>
    snapshot.accountId === accountId &&
    snapshot.asOfDate === targetDate
  );

  let latestTime = null;
  for (const snapshot of sameDateSnapshots) {
    const time = new Date(snapshot.recordedAt).getTime();
    if (Number.isFinite(time) &&
        (latestTime === null || time > latestTime)) {
      latestTime = time;
    }
  }

  const nextTime = latestTime !== null &&
    requestedTime <= latestTime
      ? latestTime + 1
      : requestedTime;

  return new Date(nextTime).toISOString();
}

function saveStockOcrImportStock(
  accountId,targetDate,cards,options = {}
) {
  if (!isValidFxDateForStorage(targetDate)) {
    throw new Error("対象日が正しくありません。");
  }

  if (!Array.isArray(cards)) {
    throw new Error("商品カードの形式が正しくありません。");
  }

  const storage = options.storage &&
    typeof options.storage.getItem === "function" &&
    typeof options.storage.setItem === "function"
      ? options.storage
      : localStorage;
  const raw = storage.getItem(STORAGE_KEY);
  if (typeof raw !== "string" || !raw) {
    throw new Error("保存データを読み込めません。");
  }

  let currentData;
  try {
    currentData = JSON.parse(raw);
  } catch (error) {
    throw new Error("保存データを読み込めません。");
  }

  if (!currentData ||
      !Array.isArray(currentData.accounts) ||
      !Array.isArray(currentData.holdings) ||
      !Array.isArray(currentData.snapshots)) {
    throw new Error("保存データの構造が正しくありません。");
  }

  const account = currentData.accounts.find(item =>
    item.id === accountId &&
    item.category === "stock" &&
    STOCK_OCR_RULES.some(rule =>
      rule.accountNames.includes(item.name)
    )
  );

  if (!account) {
    throw new Error("対象の株式口座がありません。");
  }

  const selectedCards = cards.filter(card =>
    card.selected !== false
  );

  selectedCards.forEach(stockOcrValidateSaveCardStock);

  const requestedAt = typeof options.recordedAt === "string" &&
    options.recordedAt
      ? options.recordedAt
      : new Date().toISOString();

  const now = stockOcrGetNewRecordedAtStock(
    currentData.snapshots,
    accountId,
    targetDate,
    requestedAt
  );

  const idFactory = typeof options.idFactory === "function"
    ? options.idFactory
    : createId;

  const nextData = JSON.parse(raw);
  const additions = [];
  const existingKeys = new Set(nextData.holdings.map(item =>
    stockOcrGetImportKeyStock(
      item.accountId,item.name,item.wrapper,item.asOfDate
    )
  ));

  for (const card of selectedCards) {
    const key = stockOcrGetImportKeyStock(
      accountId,card.name,card.wrapper,targetDate
    );

    if (existingKeys.has(key)) continue;

    additions.push({
      id:idFactory(),
      accountId,
      name:card.name.trim(),
      wrapper:card.wrapper,
      kind:card.kind,
      asOfDate:targetDate,
      recordedAt:now,
      value:card.value,
      quantity:card.quantity ?? null,
      costBasis:card.costBasis ?? null,
      pnl:card.pnl ?? null,
      memo:"",
      createdAt:now,
      updatedAt:now
    });

    existingKeys.add(key);
  }

  let snapshot = null;

  if (options.addAccountSnapshot === true) {
    const builtSnapshot = stockOcrBuildAccountSnapshotStock(
      currentData,
      accountId,
      targetDate,
      cards,
      {
        id:idFactory(),
        recordedAt:now,
        value:options.value === undefined
          ? stockOcrSumFieldStock(cards,"value")
          : options.value,
        effectivePrincipal:options.effectivePrincipal,
        pnl:options.pnl
      }
    );

    if (!builtSnapshot.eligible) {
      throw new Error(
        builtSnapshot.reason ||
        "口座全体の履歴を追加できません。"
      );
    }

    snapshot = builtSnapshot.snapshot;
  }

  if (additions.length === 0 && !snapshot) {
    return {
      saved:false,
      addedHoldings:0,
      addedSnapshot:false,
      duplicateCount:selectedCards.length
    };
  }

  storage.setItem("pam2_pre_holdocr",raw);

  nextData.holdings.push(...additions);
  if (snapshot) nextData.snapshots.push(snapshot);

  validateData(nextData);

  storage.setItem(STORAGE_KEY,JSON.stringify(nextData));

  return {
    saved:true,
    addedHoldings:additions.length,
    addedSnapshot:Boolean(snapshot),
    duplicateCount:selectedCards.length - additions.length
  };
}
