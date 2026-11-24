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

function saveStockOcrImportStock(
  accountId,targetDate,cards,options = {}
) {
  if (!isValidFxDateForStorage(targetDate)) {
    throw new Error("対象日が正しくありません。");
  }

  if (!Array.isArray(cards)) {
    throw new Error("商品カードの形式が正しくありません。");
  }

  if (cards.some(card =>
    !card || card.status !== "recognized"
  )) {
    throw new Error("未確認の商品カードがあります。確認後に保存してください。");
  }

  const raw = localStorage.getItem(STORAGE_KEY);
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

  const now = new Date().toISOString();
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
    const value = options.value ??
      stockOcrSumFieldStock(selectedCards,"value");
    const effectivePrincipal = options.effectivePrincipal !== undefined
      ? options.effectivePrincipal
      : stockOcrSumFieldStock(selectedCards,"costBasis");
    const pnl = options.pnl !== undefined
      ? options.pnl
      : stockOcrSumFieldStock(selectedCards,"pnl");

    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("口座全体の評価額が確定できません。");
    }

    for (const [field,fieldValue] of [
      ["有効元本",effectivePrincipal],
      ["評価損益",pnl]
    ]) {
      if (fieldValue !== null &&
          fieldValue !== undefined &&
          (typeof fieldValue !== "number" ||
           !Number.isFinite(fieldValue))) {
        throw new Error(field + "が正しくありません。");
      }
    }

    const duplicateSnapshot = nextData.snapshots.some(item =>
      item.accountId === accountId &&
      item.asOfDate === targetDate
    );

    if (!duplicateSnapshot) {
      snapshot = {
        id:idFactory(),
        accountId,
        asOfDate:targetDate,
        recordedAt:now,
        value,
        cumulativeInvested:null,
        effectivePrincipal:effectivePrincipal ?? null,
        pnl:pnl ?? null,
        realizedPnlTotal:null,
        realizedPnlDaily:null,
        cash:null,
        swapTotal:null,
        requiredMargin:null,
        memo:typeof options.memo === "string"
          ? options.memo
          : "",
        createdAt:now,
        updatedAt:now
      };
    }
  }

  if (additions.length === 0 && !snapshot) {
    return {
      saved:false,
      addedHoldings:0,
      addedSnapshot:false,
      duplicateCount:selectedCards.length
    };
  }

  localStorage.setItem("pam2_pre_holdocr",raw);

  nextData.holdings.push(...additions);
  if (snapshot) nextData.snapshots.push(snapshot);

  validateData(nextData);

  localStorage.setItem(STORAGE_KEY,JSON.stringify(nextData));

  return {
    saved:true,
    addedHoldings:additions.length,
    addedSnapshot:Boolean(snapshot),
    duplicateCount:selectedCards.length - additions.length
  };
}
