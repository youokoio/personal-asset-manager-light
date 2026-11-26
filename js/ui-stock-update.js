"use strict";

/* ---------- S11b 株式の月次更新画面 ---------- */

let stockOcrUpdateReturnTab = "stock";
let stockOcrUpdateReturnAccountId = null;
let stockOcrUpdateAccountId = "";
let stockOcrUpdateTargetDate = "";
let stockOcrUpdatePasteText = "";
let stockOcrUpdateCards = [];
let stockOcrUpdateComparison = null;
let stockOcrUpdateSnapshotEnabled = false;
let stockOcrUpdateSnapshotValue = "";
let stockOcrUpdateMessage = "";
let stockOcrUpdateError = "";

function openStockOcrUpdate(accountId = null) {
  stockOcrUpdateReturnTab = currentTab;
  stockOcrUpdateReturnAccountId = selectedAccountId;
  currentTab = "stock-update";
  selectedAccountId = null;
  stockOcrUpdateAccountId = accountId || "";
  stockOcrUpdateTargetDate = "";
  stockOcrUpdatePasteText = "";
  stockOcrUpdateCards = [];
  stockOcrUpdateComparison = null;
  stockOcrUpdateSnapshotEnabled = false;
  stockOcrUpdateSnapshotValue = "";
  stockOcrUpdateMessage = "";
  stockOcrUpdateError = "";
}

function closeStockOcrUpdate() {
  currentTab = stockOcrUpdateReturnTab;
  selectedAccountId = stockOcrUpdateReturnAccountId;
  stockOcrUpdateError = "";
  stockOcrUpdateMessage = "";
}

function stockOcrUpdateGetAccount(accountId = stockOcrUpdateAccountId) {
  return appData.accounts.find(account =>
    account.id === accountId &&
    account.category === "stock" &&
    STOCK_OCR_RULES.some(rule =>
      rule.accountNames.includes(account.name)
    )
  ) || null;
}

function stockOcrUpdateGetRule(account) {
  if (!account) return null;
  return STOCK_OCR_RULES.find(rule =>
    rule.accountNames.includes(account.name)
  ) || null;
}

function stockOcrUpdateGetAccounts() {
  return appData.accounts.filter(account =>
    account.category === "stock" &&
    STOCK_OCR_RULES.some(rule =>
      rule.accountNames.includes(account.name)
    )
  );
}

function stockOcrUpdateGetCardIssues(card) {
  const issues = [];

  if (card.batchDuplicate) {
    issues.push("同じ商品名・wrapperのカードが複数あります。");
  }
  if (typeof card.name !== "string" || !card.name.trim()) {
    issues.push("商品名を確定してください。");
  }
  if (!HOLDING_WRAPPERS.includes(card.wrapper)) {
    issues.push("wrapperを確定してください。");
  }
  if (!HOLDING_KINDS.includes(card.kind)) {
    issues.push("商品種別を確定してください。");
  }
  if (typeof card.value !== "number" ||
      !Number.isFinite(card.value)) {
    issues.push("評価額を数値で確定してください。");
  }

  if (typeof card.value === "number" &&
      typeof card.costBasis === "number" &&
      typeof card.pnl === "number") {
    const integrity = stockOcrCheckIntegrityStock(
      card.value,
      card.pnl,
      card.costBasis,
      card.rate === null || card.rate === undefined
        ? null
        : {value:card.rate}
    );

    if (integrity.status === "mismatch" ||
        integrity.status === "rate-mismatch") {
      issues.push("評価額・取得額・評価損益・率の整合を確認してください。");
    }
  }

  return issues;
}

function stockOcrUpdateMarkBatchDuplicates() {
  const groups = new Map();

  for (const card of stockOcrUpdateCards) {
    card.batchDuplicate = false;
    if (!card.name || !card.wrapper) continue;

    const key = JSON.stringify([
      stockOcrNormalizeCompareNameStock(card.name),
      card.wrapper
    ]);
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(card);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    for (const card of group) {
      card.batchDuplicate = true;
      card.manualConfirmed = false;
      card.status = "needs-confirmation";
      card.reasons = ["同じ商品名・wrapperのカードが複数あります。"];
    }
  }
}

function stockOcrUpdateRefreshComparison() {
  const account = stockOcrUpdateGetAccount();

  if (!account ||
      !isValidFxDateForStorage(stockOcrUpdateTargetDate) ||
      stockOcrUpdateCards.length === 0) {
    stockOcrUpdateComparison = null;
    return;
  }

  const currentCards = stockOcrUpdateCards;
  const result = stockOcrCompareCardsStock(
    appData,
    account.id,
    currentCards,
    stockOcrUpdateTargetDate
  );

  stockOcrUpdateCards = result.cards.map((card,index) => {
    const previous = currentCards[index];

    return {
      ...card,
      manualConfirmed:previous.manualConfirmed === true,
      batchDuplicate:previous.batchDuplicate === true,
      selected:card.duplicate
        ? false
        : previous.selected !== false,
      status:previous.status,
      reasons:Array.isArray(previous.reasons)
        ? previous.reasons.slice()
        : []
    };
  });

  stockOcrUpdateComparison = result;
}

function stockOcrUpdateParse() {
  const account = stockOcrUpdateGetAccount();
  const rule = stockOcrUpdateGetRule(account);

  if (!account || !rule) {
    stockOcrUpdateError = "口座を選択してください。";
    render();
    return;
  }
  if (!isValidFxDateForStorage(stockOcrUpdateTargetDate)) {
    stockOcrUpdateError = "対象日を入力してください。";
    render();
    return;
  }
  if (!stockOcrUpdatePasteText.trim()) {
    stockOcrUpdateError = "OCRテキストを貼り付けてください。";
    render();
    return;
  }

  try {
    const parsed = parseStockOcrText(
      stockOcrUpdatePasteText,
      rule
    );

    if (!parsed.success) {
      stockOcrUpdateCards = [];
      stockOcrUpdateComparison = null;
      stockOcrUpdateError = parsed.reasons.join(" ") ||
        "OCRテキストを解析できませんでした。";
      render();
      return;
    }

    stockOcrUpdateCards = parsed.cards.map(card => ({
      ...card,
      selected:true,
      manualConfirmed:card.status === "recognized",
      batchDuplicate:false
    }));

    stockOcrUpdateMarkBatchDuplicates();
    stockOcrUpdateRefreshComparison();

    stockOcrUpdateError = "";
    stockOcrUpdateMessage =
      stockOcrUpdateCards.length + "件の商品カードを解析しました。";
  } catch (error) {
    stockOcrUpdateCards = [];
    stockOcrUpdateComparison = null;
    stockOcrUpdateError = error.message ||
      "OCRテキストを解析できませんでした。";
  }

  render();
}

function stockOcrUpdateApplyCardEdit(index,field,value) {
  const card = stockOcrUpdateCards[index];
  if (!card) return;

  if (["value","pnl","costBasis","quantity"].includes(field)) {
    card[field] = toNumberOrNull(value);
    if (field === "costBasis") {
      card.costBasisSource = "manual";
    }
  } else {
    card[field] = value;
  }

  if ((field === "value" || field === "pnl") &&
      card.costBasisSource === "value-minus-pnl") {
    card.costBasis =
      typeof card.value === "number" &&
      typeof card.pnl === "number"
        ? card.value - card.pnl
        : null;
  }

  card.manualConfirmed = false;
  card.status = "needs-confirmation";
  card.reasons = stockOcrUpdateGetCardIssues(card);

  stockOcrUpdateMarkBatchDuplicates();
  stockOcrUpdateRefreshComparison();
  render();
}

function stockOcrUpdateConfirmCard(index) {
  const card = stockOcrUpdateCards[index];
  if (!card) return;

  const issues = stockOcrUpdateGetCardIssues(card);
  if (issues.length > 0) {
    card.status = "needs-confirmation";
    card.manualConfirmed = false;
    card.reasons = issues;
    stockOcrUpdateError = issues.join(" ");
    render();
    return;
  }

  card.status = "recognized";
  card.manualConfirmed = true;
  card.reasons = [];
  stockOcrUpdateError = "";
  stockOcrUpdateRefreshComparison();
  render();
}

function stockOcrUpdateClear() {
  stockOcrUpdatePasteText = "";
  stockOcrUpdateCards = [];
  stockOcrUpdateComparison = null;
  stockOcrUpdateSnapshotEnabled = false;
  stockOcrUpdateSnapshotValue = "";
  stockOcrUpdateMessage = "";
  stockOcrUpdateError = "";
  render();
}

function stockOcrUpdateSave() {
  const account = stockOcrUpdateGetAccount();

  if (!account ||
      !isValidFxDateForStorage(stockOcrUpdateTargetDate)) {
    stockOcrUpdateError = "口座と対象日を確認してください。";
    render();
    return;
  }

  if (stockOcrUpdateCards.length === 0 ||
      stockOcrUpdateCards.some(card =>
        card.status !== "recognized"
      )) {
    stockOcrUpdateError =
      "要確認の商品カードがあります。すべて確認してから保存してください。";
    render();
    return;
  }

  const selectedCount = stockOcrUpdateCards.filter(card =>
    card.selected !== false && !card.duplicate
  ).length;
  const duplicateCount = stockOcrUpdateCards.filter(card =>
    card.duplicate
  ).length;

  const snapshotValue = stockOcrUpdateSnapshotEnabled
    ? toNumberOrNull(stockOcrUpdateSnapshotValue)
    : null;

  if (stockOcrUpdateSnapshotEnabled && snapshotValue === null) {
    stockOcrUpdateError = "口座全体の評価額を入力してください。";
    render();
    return;
  }

  if (selectedCount === 0 && !stockOcrUpdateSnapshotEnabled) {
    stockOcrUpdateError = "保存対象を選択してください。";
    render();
    return;
  }

  const confirmed = window.confirm(
    "商品別保有を" + selectedCount + "件追加します。" +
    "重複は" + duplicateCount + "件です。保存しますか？"
  );
  if (!confirmed) return;

  try {
    const selectedCards = stockOcrUpdateCards.filter(card =>
      card.selected !== false && !card.duplicate
    );

    const result = saveStockOcrImportStock(
      account.id,
      stockOcrUpdateTargetDate,
      stockOcrUpdateCards,
      {
        addAccountSnapshot:stockOcrUpdateSnapshotEnabled,
        value:snapshotValue,
        effectivePrincipal:selectedCards.length > 0
          ? stockOcrSumFieldStock(selectedCards,"costBasis")
          : null,
        pnl:selectedCards.length > 0
          ? stockOcrSumFieldStock(selectedCards,"pnl")
          : null
      }
    );

    if (result.saved) {
      appData = loadData();

      stockOcrUpdateMessage =
        "商品別保有 " + result.addedHoldings + "件を追加しました。" +
        " 重複 " + duplicateCount + "件。" +
        (result.addedSnapshot
          ? " 口座全体の履歴も追加しました。"
          : stockOcrUpdateSnapshotEnabled
            ? " 口座全体の履歴は同じ対象日の記録があるため追加していません。"
            : "");

      stockOcrUpdatePasteText = "";
      stockOcrUpdateCards = [];
      stockOcrUpdateComparison = null;
      stockOcrUpdateSnapshotEnabled = false;
      stockOcrUpdateSnapshotValue = "";
      stockOcrUpdateError = "";
    } else {
      stockOcrUpdateMessage =
        "追加されたデータはありません。重複 " +
        duplicateCount + "件。";
    }
  } catch (error) {
    stockOcrUpdateError = error.message ||
      "株式OCRの保存に失敗しました。";
  }

  render();
}
