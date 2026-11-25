"use strict";

/* ---------- S11b 株式の月次更新画面 ---------- */

let stockOcrUpdateReturnTab = "stock";
let stockOcrUpdateReturnAccountId = null;
let stockOcrUpdateAccountId = "";
let stockOcrUpdateTargetDate = "";
let stockOcrUpdatePasteText = "";
let stockOcrUpdateCards = [];
let stockOcrUpdateComparison = null;
let stockOcrUpdateScreenTotalValue = null;
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
  stockOcrUpdateScreenTotalValue = null;
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
    stockOcrUpdateTargetDate,
    stockOcrUpdateScreenTotalValue
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
      stockOcrUpdateScreenTotalValue = null;
      stockOcrUpdateError = parsed.reasons.join(" ") ||
        "OCRテキストを解析できませんでした。";
      render();
      return;
    }

    stockOcrUpdateScreenTotalValue = parsed.screenTotalValue || null;
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
    stockOcrUpdateScreenTotalValue = null;
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
  stockOcrUpdateScreenTotalValue = null;
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
      stockOcrUpdateScreenTotalValue = null;
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

function stockOcrUpdateMakeInput(
  index,field,labelText,value,options = {}
) {
  const wrapper = el("div","field");
  const inputId = "stock-ocr-" + index + "-" + field;
  const label = el("label","",labelText);
  label.htmlFor = inputId;

  const input = document.createElement("input");
  input.type = "text";
  input.id = inputId;
  input.name = field;
  input.autocomplete = "off";

  if (options.numeric) {
    input.inputMode = "decimal";
    input.value = value === null || value === undefined
      ? ""
      : formatInputNumber(value);
  } else {
    input.value = value === null || value === undefined
      ? ""
      : String(value);
  }

  input.dataset.stockOcrIndex = String(index);
  input.dataset.stockOcrField = field;
  wrapper.append(label,input);
  return wrapper;
}

function stockOcrUpdateMakeSelect(
  index,field,labelText,values,selected
) {
  const wrapper = el("div","field");
  const inputId = "stock-ocr-" + index + "-" + field;
  const label = el("label","",labelText);
  label.htmlFor = inputId;

  const select = document.createElement("select");
  select.id = inputId;
  select.name = field;
  select.dataset.stockOcrIndex = String(index);
  select.dataset.stockOcrField = field;

  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "未選択";
  select.appendChild(blank);

  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }

  select.value = selected || "";
  wrapper.append(label,select);
  return wrapper;
}

function stockOcrUpdateRenderCard(card,index) {
  const section = el("section","card");
  section.appendChild(el(
    "h3",
    "",
    card.name && card.name.trim()
      ? card.name
      : "商品名未取得（要確認）"
  ));

  const statusLabel = card.duplicate
    ? "重複・追加しません"
    : card.status === "recognized"
      ? "認識・確定済み"
      : "要確認";

  section.appendChild(el(
    "div",
    card.status === "recognized" ? "success" : "help",
    "状態：" + statusLabel
  ));

  const selection = el("div","field");
  const checkboxLabel = el("label","","保存対象");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = card.selected !== false;
  checkbox.disabled = Boolean(
    card.duplicate || card.batchDuplicate ||
    card.status !== "recognized"
  );
  checkbox.dataset.stockOcrIndex = String(index);
  checkbox.dataset.stockOcrSelect = "true";
  checkboxLabel.appendChild(checkbox);
  selection.appendChild(checkboxLabel);
  section.appendChild(selection);

  section.appendChild(stockOcrUpdateMakeInput(
    index,"name","商品名",card.name
  ));
  section.appendChild(stockOcrUpdateMakeSelect(
    index,"wrapper","wrapper",HOLDING_WRAPPERS,card.wrapper
  ));
  section.appendChild(stockOcrUpdateMakeSelect(
    index,"kind","種別",HOLDING_KINDS,card.kind
  ));
  section.appendChild(stockOcrUpdateMakeInput(
    index,"value","評価額",card.value,{numeric:true}
  ));
  section.appendChild(stockOcrUpdateMakeInput(
    index,"pnl","評価損益",card.pnl,{numeric:true}
  ));
  section.appendChild(stockOcrUpdateMakeInput(
    index,"costBasis","取得額",card.costBasis,{numeric:true}
  ));
  if (card.costBasisSource === "value-minus-pnl") {
    section.appendChild(el("div","help","取得額：計算値"));
  }
  section.appendChild(stockOcrUpdateMakeInput(
    index,"quantity","数量",card.quantity,{numeric:true}
  ));

  if (card.reasons && card.reasons.length > 0) {
    for (const reason of card.reasons) {
      section.appendChild(el("div","error",reason));
    }
  }

  if (card.status !== "recognized" && !card.batchDuplicate) {
    section.appendChild(makeButton(
      "内容を確認して確定",
      "stock-ocr-confirm-card",
      "secondary"
    ));
    section.lastChild.dataset.index = String(index);
  }

  if (card.comparison) {
    const labels = {
      new:"新規追加候補",
      unavailable:"比較不可",
      "cost-increase":"取得額増",
      "cost-decrease":"取得額減",
      "value-change":"評価額のみ変化",
      unchanged:"変化なし"
    };
    let comparisonText = labels[card.comparison] ||
      "比較結果なし";

    if (card.costDifference !== null &&
        card.costDifference !== undefined) {
      comparisonText += "：" + formatSignedYen(card.costDifference);
    }
    section.appendChild(el("div","metric-sub",comparisonText));

    if (card.wrapperWarning) {
      section.appendChild(el(
        "div",
        "error",
        "wrapperの取り違えの疑いがあります。過去の取得額：" +
          formatYen(card.previousHolding.costBasis)
      ));
    }

    if (card.similarNames && card.similarNames.length > 0) {
      section.appendChild(el(
        "div",
        "help",
        "類似候補：" + card.similarNames.join("、") +
          "（自動統合しません）"
      ));
    }

    if (card.quantityDifference !== null &&
        card.quantityDifference !== undefined) {
      section.appendChild(el(
        "div",
        "metric-sub",
        "数量差：" + formatInputNumber(card.quantityDifference)
      ));
    }
  }

  if (Array.isArray(card.safeLines) && card.safeLines.length > 0) {
    const details = document.createElement("details");
    const summary = el("summary","","OCR行（伏せ字処理済み）");
    details.appendChild(summary);

    for (const line of card.safeLines) {
      details.appendChild(el(
        "div",
        "metric-sub",
        line.lineNumber + "行目：" + line.text
      ));
    }
    section.appendChild(details);
  }

  return section;
}

function stockOcrUpdateRenderComparison() {
  const result = stockOcrUpdateComparison;
  if (!result) return;

  const card = el("section","card");
  card.appendChild(el("h3","","過去記録との比較"));

  card.appendChild(el(
    "div",
    "metric-sub",
    result.previousDate
      ? "比較対象日：" + formatDateWithWeekday(result.previousDate)
      : "比較できる過去の記録はありません。"
  ));

  if (result.missingHoldings.length > 0) {
    card.appendChild(el("h4","","今回出ていません"));
    for (const item of result.missingHoldings) {
      card.appendChild(el(
        "div",
        "snapshot-row",
        item.name + " ／ " + item.wrapper
      ));
    }
    card.appendChild(el(
      "div",
      "help",
      "今回出ていない商品は、削除・保存しません。"
    ));
  }

  card.appendChild(el(
    "div",
    "metric-sub",
    "商品別評価額合計：" + formatYen(result.holdingsTotal)
  ));
  card.appendChild(el(
    "div",
    "metric-sub",
    "口座全体の最新評価額：" + formatYen(result.accountValue)
  ));
  card.appendChild(el(
    "div",
    "metric-sub",
    "差額：" + formatSignedYen(result.difference)
  ));

  if (result.differenceWarning) {
    card.appendChild(el(
      "div",
      "error",
      "商品別合計と口座全体の差が5%を超えています。内容を確認してください。保存は可能です。"
    ));
  }

  if (result.screenTotal !== null &&
      result.screenTotal !== undefined &&
      result.holdingsTotal !== null) {
    card.appendChild(el(
      "h4",
      "",
      "OCR画面の評価額合計との比較"
    ));
    card.appendChild(el(
      "div",
      "metric-sub",
      "画面に表示された評価額合計：" + formatYen(result.screenTotal)
    ));
    card.appendChild(el(
      "div",
      "metric-sub",
      "解析した商品カード合計：" + formatYen(result.holdingsTotal)
    ));
    card.appendChild(el(
      "div",
      "metric-sub",
      "差額（画面合計－商品カード合計）：" +
        formatSignedYen(result.screenTotalDifference)
    ));
    if (result.screenTotalMismatch) {
      card.appendChild(el(
        "div",
        "help",
        "画面に出ていない商品、または読み落としの可能性があります。内容を確認してください。保存は可能です。"
      ));
    }
  }

  app.appendChild(card);
}

function renderStockOcrUpdate() {
  app.appendChild(makeButton(
    "← 戻る",
    "stock-ocr-back",
    "secondary"
  ));
  app.appendChild(heading("株式の月次更新"));

  app.appendChild(el(
    "div",
    "help",
    "楽天証券・iDeCo・企業型DCのOCRテキストを貼り付けて解析します。解析・比較だけでは保存されません。貼り付けた原文は保存しません。"
  ));

  const accountField = el("div","field");
  const accountLabel = el("label","","口座");
  accountLabel.htmlFor = "stock-ocr-account";

  const accountSelect = document.createElement("select");
  accountSelect.id = "stock-ocr-account";
  accountSelect.dataset.stockOcrAccount = "true";

  const blankOption = document.createElement("option");
  blankOption.value = "";
  blankOption.textContent = "口座を選択";
  accountSelect.appendChild(blankOption);

  for (const account of stockOcrUpdateGetAccounts()) {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = account.name;
    accountSelect.appendChild(option);
  }

  accountSelect.value = stockOcrUpdateAccountId;
  accountField.append(accountLabel,accountSelect);
  app.appendChild(accountField);

  const dateField = makeField(
    "対象日",
    "stockOcrTargetDate",
    stockOcrUpdateTargetDate,
    {type:"date",required:true}
  );
  dateField.querySelector("input").id = "stock-ocr-target-date";
  app.appendChild(dateField);

  const pasteField = makeField(
    "OCRテキスト",
    "stockOcrPasteText",
    stockOcrUpdatePasteText,
    {
      textarea:true,
      help:"証券会社の画面からコピーしたテキストを貼り付けてください。"
    }
  );
  const textarea = pasteField.querySelector("textarea");
  textarea.id = "stock-ocr-paste";
  textarea.rows = 8;
  app.appendChild(pasteField);

  const actions = el("div","form-actions");
  actions.appendChild(makeButton("解析","stock-ocr-parse"));
  actions.appendChild(makeButton(
    "消去",
    "stock-ocr-clear",
    "secondary"
  ));
  app.appendChild(actions);

  if (stockOcrUpdateMessage) {
    app.appendChild(el("div","success",stockOcrUpdateMessage));
  }
  if (stockOcrUpdateError) {
    app.appendChild(el("div","error",stockOcrUpdateError));
  }

  if (stockOcrUpdateCards.length > 0) {
    app.appendChild(el(
      "h3",
      "",
      "商品カード " + stockOcrUpdateCards.length + "件"
    ));

    for (let index = 0;
         index < stockOcrUpdateCards.length;
         index += 1) {
      app.appendChild(stockOcrUpdateRenderCard(
        stockOcrUpdateCards[index],
        index
      ));
    }

    stockOcrUpdateRenderComparison();

    const snapshotCard = el("section","card");
    snapshotCard.appendChild(el(
      "h3",
      "",
      "口座全体の履歴"
    ));

    const snapshotLabel = el(
      "label",
      "",
      "口座全体の履歴も追加する"
    );
    const snapshotCheckbox = document.createElement("input");
    snapshotCheckbox.type = "checkbox";
    snapshotCheckbox.id = "stock-ocr-snapshot-enabled";
    snapshotCheckbox.checked = stockOcrUpdateSnapshotEnabled;
    snapshotLabel.appendChild(snapshotCheckbox);
    snapshotCard.appendChild(snapshotLabel);

    const snapshotValueField = makeField(
      "口座全体の評価額",
      "stockOcrSnapshotValue",
      stockOcrUpdateSnapshotValue,
      {type:"text",inputmode:"decimal"}
    );
    const snapshotValueInput = snapshotValueField.querySelector("input");
    snapshotValueInput.id = "stock-ocr-snapshot-value";
    snapshotValueInput.inputMode = "decimal";
    snapshotCard.appendChild(snapshotValueField);

    app.appendChild(snapshotCard);

    const selectedCount = stockOcrUpdateCards.filter(card =>
      card.selected !== false && !card.duplicate
    ).length;
    const unresolved = stockOcrUpdateCards.some(card =>
      card.status !== "recognized"
    );
    const snapshotValue = toNumberOrNull(stockOcrUpdateSnapshotValue);

    const saveButton = makeButton(
      "保存（" + selectedCount + "件）",
      "stock-ocr-save"
    );
    saveButton.disabled = unresolved ||
      (selectedCount === 0 && !stockOcrUpdateSnapshotEnabled) ||
      (stockOcrUpdateSnapshotEnabled && snapshotValue === null);
    app.appendChild(saveButton);
  }
}

function runStockOcrSelfDiagnosis(data) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(STOCK_OCR_RULES) ||
      STOCK_OCR_RULES.length !== 3) {
    errors.push("株式OCRの口座ルールが3口座分ありません。");
  }

  const requiredFunctions = [
    "parseStockOcrText",
    "stockOcrCompareCardsStock",
    "saveStockOcrImportStock",
    "renderStockOcrUpdate"
  ];

  for (const name of requiredFunctions) {
    if (typeof globalThis[name] !== "function") {
      errors.push(name + " が読み込まれていません。");
    }
  }

  const usedAccounts = new Set();

  for (const rule of Array.isArray(STOCK_OCR_RULES)
    ? STOCK_OCR_RULES
    : []) {
    if (!rule || !Array.isArray(rule.accountNames) ||
        rule.accountNames.length !== 1 ||
        !Array.isArray(rule.formats) ||
        rule.formats.length !== 1) {
      errors.push("株式OCRの口座ルールの形式が正しくありません。");
      continue;
    }

    const accountName = rule.accountNames[0];
    if (usedAccounts.has(accountName)) {
      errors.push("株式OCRの口座ルールが重複しています：" + accountName);
    }
    usedAccounts.add(accountName);

    const matches = data.accounts.filter(account =>
      account.name === accountName &&
      account.category === "stock"
    );
    if (matches.length !== 1) {
      errors.push(
        accountName + " の株式口座が1件に特定できません。"
      );
    }

    const format = rule.formats[0];
    if (!format.identify ||
        !Array.isArray(format.identify.all) ||
        !format.cardStyle ||
        !format.fields) {
      errors.push(accountName + " のOCRルールが不足しています。");
    }
  }

  if (STOCK_OCR_RULES.length === 3) {
    for (let first = 0; first < STOCK_OCR_RULES.length; first += 1) {
      for (let second = first + 1;
           second < STOCK_OCR_RULES.length;
           second += 1) {
        if (STOCK_OCR_RULES[first].formats[0].fields ===
            STOCK_OCR_RULES[second].formats[0].fields) {
          errors.push("口座別のOCR項目定義が共有されています。");
        }
      }
    }
  }

  return {errors,warnings};
}

/* ---------- S11b 画面イベント ---------- */

app.addEventListener("input",event => {
  const target = event.target;

  if (target.id === "stock-ocr-paste") {
    stockOcrUpdatePasteText = target.value;
  } else if (target.id === "stock-ocr-snapshot-value") {
    stockOcrUpdateSnapshotValue = target.value;
  }
});

app.addEventListener("change",event => {
  const target = event.target;

  if (target.dataset.stockOcrAccount === "true") {
    stockOcrUpdateAccountId = target.value;
    stockOcrUpdateCards = [];
    stockOcrUpdateComparison = null;
    stockOcrUpdateScreenTotalValue = null;
    stockOcrUpdateError = "";
    stockOcrUpdateMessage = "";
    render();
    return;
  }

  if (target.id === "stock-ocr-target-date") {
    stockOcrUpdateTargetDate = target.value;
    stockOcrUpdateRefreshComparison();
    render();
    return;
  }

  if (target.id === "stock-ocr-snapshot-enabled") {
    stockOcrUpdateSnapshotEnabled = target.checked;
    render();
    return;
  }

  if (target.dataset.stockOcrIndex !== undefined &&
      target.dataset.stockOcrSelect === "true") {
    const index = Number(target.dataset.stockOcrIndex);
    if (stockOcrUpdateCards[index]) {
      stockOcrUpdateCards[index].selected = target.checked;
      render();
    }
    return;
  }

  if (target.dataset.stockOcrIndex !== undefined &&
      target.dataset.stockOcrField) {
    stockOcrUpdateApplyCardEdit(
      Number(target.dataset.stockOcrIndex),
      target.dataset.stockOcrField,
      target.value
    );
  }
});

app.addEventListener("click",event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;

  if (action === "stock-ocr-back") {
    closeStockOcrUpdate();
    render();
    window.scrollTo(0,0);
  } else if (action === "stock-ocr-parse") {
    stockOcrUpdateParse();
  } else if (action === "stock-ocr-clear") {
    stockOcrUpdateClear();
  } else if (action === "stock-ocr-confirm-card") {
    stockOcrUpdateConfirmCard(Number(button.dataset.index));
  } else if (action === "stock-ocr-save") {
    stockOcrUpdateSave();
  }
});
