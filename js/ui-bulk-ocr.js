"use strict";

/* ---------- S12c OCR入力・解析結果・表への追加 ---------- */

let bulkOcrAccountId = "";
let bulkOcrFormatId = "";
let bulkOcrManualDate = "";
let bulkOcrPasteText = "";
let bulkOcrResult = null;
let bulkOcrRule = null;
let bulkOcrAccount = null;
let bulkOcrWarnings = [];
let bulkOcrDateConflict = null;

const BULK_OCR_FIELD_LABELS = {
  value:"総資産",
  effectivePrincipal:"有効元本",
  pnl:"評価損益",
  realizedPnlTotal:"累積確定損益",
  swapTotal:"累計スワップ"
};

function getBulkOcrAccountOptions(rules = OCR_ACCOUNT_RULES) {
  const options = [];

  for (const rule of rules) {
    for (const name of rule.accountNames || []) {
      const account = appData.accounts.find(item =>
        item.name === name
      );
      if (account) options.push({account,rule});
    }
  }

  return options;
}

function getBulkOcrSelection(rules = OCR_ACCOUNT_RULES) {
  const options = getBulkOcrAccountOptions(rules);
  let selected = options.find(item =>
    item.account.id === bulkOcrAccountId
  );

  if (!selected && options.length) {
    selected = options[0];
    bulkOcrAccountId = selected.account.id;
    bulkOcrFormatId = "";
  }

  bulkOcrAccount = selected ? selected.account : null;
  bulkOcrRule = selected ? selected.rule : null;

  return selected || null;
}

function resetBulkOcrState() {
  bulkOcrPasteText = "";
  bulkOcrManualDate = "";
  bulkOcrResult = null;
  bulkOcrWarnings = [];
  bulkOcrDateConflict = null;
}

function renderBulkInputTabs() {
  const tabs = el("div","bulk-tabs");

  const ocrButton = makeButton(
    "OCRテキスト",
    "bulk-tab-ocr",
    bulkImportActiveTab === "ocr"
      ? "bulk-tab active"
      : "bulk-tab"
  );
  const tsvButton = makeButton(
    "表形式（TSV）",
    "bulk-tab-tsv",
    bulkImportActiveTab === "tsv"
      ? "bulk-tab active"
      : "bulk-tab"
  );

  ocrButton.setAttribute(
    "aria-pressed",
    String(bulkImportActiveTab === "ocr")
  );
  tsvButton.setAttribute(
    "aria-pressed",
    String(bulkImportActiveTab === "tsv")
  );

  tabs.append(ocrButton,tsvButton);
  return tabs;
}

function bulkOcrIsManualDateRequired() {
  if (!bulkOcrRule) return false;

  const format = bulkOcrRule.formats.find(item =>
    item.formatId === bulkOcrFormatId
  ) || (bulkOcrRule.formats.length === 1
    ? bulkOcrRule.formats[0]
    : null);

  return Boolean(
    format && format.date && format.date.source === "manual"
  );
}

function renderBulkOcrInput() {
  getBulkOcrSelection();

  const card = el("section","card bulk-ocr-card");
  card.appendChild(el("h3","","OCRテキストから履歴を作成"));

  const options = getBulkOcrAccountOptions();

  if (options.length === 0) {
    card.appendChild(el(
      "p",
      "empty",
      "OCR解析ルールのある口座がありません。表形式（TSV）を利用してください。"
    ));
    return card;
  }

  const accountField = el("div","field");
  const accountLabel = el("label","","口座");
  accountLabel.htmlFor = "bulk-ocr-account";

  const accountSelect = document.createElement("select");
  accountSelect.id = "bulk-ocr-account";

  for (const item of options) {
    const option = document.createElement("option");
    option.value = item.account.id;
    option.textContent = item.account.name;
    option.selected = item.account.id === bulkOcrAccountId;
    accountSelect.appendChild(option);
  }

  accountSelect.addEventListener("change",() => {
    bulkOcrAccountId = accountSelect.value;
    bulkOcrFormatId = "";
    resetBulkOcrState();
    render();
  });

  accountField.append(accountLabel,accountSelect);
  card.appendChild(accountField);

  const formats = bulkOcrRule.formats || [];

  if (formats.length === 1) {
    card.appendChild(el(
      "p",
      "help",
      "形式：" + formats[0].label
    ));
  } else {
    const formatField = el("div","field");
    const formatLabel = el("label","","形式");
    formatLabel.htmlFor = "bulk-ocr-format";

    const formatSelect = document.createElement("select");
    formatSelect.id = "bulk-ocr-format";

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "形式を選択";
    formatSelect.appendChild(empty);

    for (const format of formats) {
      const option = document.createElement("option");
      option.value = format.formatId;
      option.textContent = format.label;
      option.selected = format.formatId === bulkOcrFormatId;
      formatSelect.appendChild(option);
    }

    formatSelect.addEventListener("change",() => {
      bulkOcrFormatId = formatSelect.value;
      bulkOcrResult = null;
      bulkOcrWarnings = [];
      bulkOcrDateConflict = null;
      render();
    });

    formatField.append(formatLabel,formatSelect);
    card.appendChild(formatField);
  }

  const dateField = el("div","field bulk-ocr-date-field");
  const dateLabel = el("label","","対象日");
  dateLabel.htmlFor = "bulk-ocr-date";

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.id = "bulk-ocr-date";
  dateInput.value = bulkOcrManualDate;
  dateInput.required = bulkOcrIsManualDateRequired();

  dateInput.addEventListener("change",() => {
    bulkOcrApplyDateInput(dateInput.value);
    bulkOcrRefreshWarnings();
    render();
  });

  dateField.append(dateLabel,dateInput);
  dateField.appendChild(el(
    "p",
    "help",
    bulkOcrManualDate
      ? "入力日：" + formatDateWithWeekday(bulkOcrManualDate)
      : bulkOcrIsManualDateRequired()
        ? "この口座は対象日の入力が必要です。"
        : "画面から日付を取得できない場合は入力してください。"
  ));
  card.appendChild(dateField);

  const pasteField = el("div","field");
  const pasteLabel = el("label","","OCRテキスト");
  pasteLabel.htmlFor = "bulk-ocr-paste";

  const pasteArea = document.createElement("textarea");
  pasteArea.id = "bulk-ocr-paste";
  pasteArea.rows = 8;
  pasteArea.value = bulkOcrPasteText;
  pasteArea.placeholder =
    "iPhoneのテキスト認識でコピーした内容を貼り付け";
  pasteArea.dataset.bulkOcrSource = "true";

  pasteField.append(pasteLabel,pasteArea);
  card.appendChild(pasteField);

  const actions = el("div","actions");
  const parseButton = makeButton("解析","bulk-ocr-parse");
  parseButton.disabled = bulkOcrPasteText.trim() === "";

  actions.append(
    parseButton,
    makeButton("消去","bulk-ocr-clear","secondary")
  );
  card.appendChild(actions);

  if (bulkOcrResult) {
    card.appendChild(renderBulkOcrResult());
  }

  return card;
}

function bulkOcrFieldStatusLabel(status) {
  const labels = {
    recognized:"認識",
    "missing-required":"未取得（必須）",
    missing:"未取得",
    unreadable:"要確認",
    multiple:"要確認（複数候補）",
    "block-unconfirmed":"要確認（対応未確定）",
    "identity-unconfirmed":"要確認（恒等式）",
    "not-shown":"画面に表示なし"
  };

  return labels[status] || "要確認";
}

function bulkOcrMakeNumericInput(fieldName,field) {
  const wrapper = el("div","field bulk-ocr-value-field");
  const label = el(
    "label",
    "",
    BULK_OCR_FIELD_LABELS[fieldName] +
      "（" +
      getAccountFieldLabel(
        bulkOcrAccount,
        fieldName,
        BULK_OCR_FIELD_LABELS[fieldName]
      ) +
      "）"
  );

  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.autocomplete = "off";
  input.value = field.value === null || field.value === undefined
    ? ""
    : formatInputNumber(field.value);
  input.dataset.bulkOcrField = fieldName;
  input.setAttribute(
    "aria-label",
    BULK_OCR_FIELD_LABELS[fieldName]
  );

  wrapper.append(label,input);
  enhanceNumericInput(wrapper,input);

  return wrapper;
}

function bulkOcrRenderCandidates(fieldName,field) {
  if (!Array.isArray(field.candidates) ||
      field.candidates.length === 0) {
    return null;
  }

  const box = el("div","bulk-ocr-candidates");
  box.appendChild(el("p","help","候補を選択してください。"));

  field.candidates.forEach((candidate,index) => {
    const label =
      "行" + candidate.lineNumber + "：" +
      maskOcrSensitiveDigits(candidate.original || "") +
      (typeof candidate.value === "number"
        ? " → " + formatInputNumber(candidate.value)
        : "（数値を確認）");

    const button = makeButton(
      label,
      "bulk-ocr-candidate",
      "secondary small"
    );
    button.dataset.field = fieldName;
    button.dataset.index = String(index);
    box.appendChild(button);
  });

  return box;
}

function bulkOcrRenderDateResult() {
  const section = el("section","bulk-ocr-result-card");
  section.appendChild(el("h4","","対象日"));

  const date = bulkOcrResult.date || {};

  section.appendChild(el(
    "p",
    "bulk-ocr-status",
    bulkOcrFieldStatusLabel(date.status)
  ));

  if (date.original) {
    section.appendChild(el(
      "p",
      "help",
      "読み取った原文：" +
        maskOcrSensitiveDigits(date.original)
    ));
  }

  if (Array.isArray(date.candidates) &&
      date.candidates.length > 0) {
    const candidates = el("div","bulk-ocr-candidates");

    date.candidates.forEach((candidate,index) => {
      const button = makeButton(
        "行" + candidate.lineNumber + "：" +
          maskOcrSensitiveDigits(candidate.original || ""),
        "bulk-ocr-date-candidate",
        "secondary small"
      );
      button.dataset.index = String(index);
      candidates.appendChild(button);
    });

    section.appendChild(candidates);
  }

  if (bulkOcrDateConflict) {
    section.appendChild(el(
      "p",
      "error",
      "画面の日付（" + bulkOcrDateConflict.screenDate +
        "）と入力日（" + bulkOcrDateConflict.manualDate +
        "）が異なります。使用する日付を選択してください。"
    ));

    const actions = el("div","actions");
    actions.append(
      makeButton(
        "画面の日付を使う",
        "bulk-ocr-use-screen-date",
        "secondary"
      ),
      makeButton(
        "入力した日付を使う",
        "bulk-ocr-use-manual-date"
      )
    );
    section.appendChild(actions);
  }

  return section;
}

function bulkOcrFindPreviousSnapshot() {
  if (!bulkOcrAccount || !bulkOcrResult ||
      !bulkOcrResult.date || !bulkOcrResult.date.value) {
    return null;
  }

  return appData.snapshots
    .filter(snapshot =>
      snapshot.accountId === bulkOcrAccount.id &&
      snapshot.asOfDate <= bulkOcrResult.date.value
    )
    .sort(compareSnapshots)[0] || null;
}

function bulkOcrRefreshWarnings() {
  if (!bulkOcrResult || !bulkOcrResult.success ||
      !bulkOcrAccount) {
    bulkOcrWarnings = [];
    return;
  }

  const previous = bulkOcrFindPreviousSnapshot();

  bulkOcrWarnings = buildOcrWarnings(
    bulkOcrResult,
    previous ? previous.value : null,
    bulkOcrAccount.type
  ).filter(warning =>
    warning.code !== "fx-identity-strict"
  );
}

function renderBulkOcrResult() {
  const section = el("section","bulk-ocr-results");
  section.appendChild(el("h3","","解析結果"));

  if (!bulkOcrResult.success) {
    for (const reason of bulkOcrResult.reasons || []) {
      section.appendChild(el("p","error",reason));
    }

    if (bulkOcrResult.matches &&
        bulkOcrResult.matches.length > 0) {
      section.appendChild(el(
        "p",
        "help",
        "形式を選択して、もう一度解析してください。"
      ));
    }

    return section;
  }

  for (const block of bulkOcrResult.blocks || []) {
    if (block.status === "unconfirmed") {
      section.appendChild(el(
        "p",
        "error",
        "項目名と値の対応を確定できませんでした。自動では割り当てていません。理由：" +
          block.reason
      ));
    }
  }

  bulkOcrRefreshWarnings();

  for (const warning of bulkOcrWarnings) {
    const notice = el(
      "div",
      "notice bulk-ocr-warning",
      warning.message
    );

    if (warning.code === "previous-value-change") {
      notice.appendChild(el(
        "p",
        "help",
        "前回：" + formatYen(warning.previousValue) +
          " ／ 今回：" + formatYen(warning.value)
      ));
    } else if (warning.difference !== undefined) {
      notice.appendChild(el(
        "p",
        "help",
        "差額：" + formatSignedYen(warning.difference)
      ));
    }

    section.appendChild(notice);
  }

  if (bulkOcrResult.identityReview &&
      bulkOcrResult.identityReview.required) {
    const review = el(
      "div",
      "error",
      "恒等式に差額 " +
        formatSignedYen(bulkOcrResult.identityReview.difference) +
        " があります。4項目を確認してください。"
    );

    if (!bulkOcrResult.identityReview.confirmed) {
      review.appendChild(makeButton(
        "このままで確定",
        "bulk-ocr-confirm-identity",
        "secondary"
      ));
    } else {
      review.appendChild(el(
        "p",
        "help",
        "この値のまま確定することを確認済みです。"
      ));
    }

    section.appendChild(review);
  }

  section.appendChild(bulkOcrRenderDateResult());

  for (const fieldName of Object.keys(BULK_OCR_FIELD_LABELS)) {
    const field = bulkOcrResult.fields[fieldName];
    if (!field) continue;

    const card = el("section","bulk-ocr-result-card");
    card.appendChild(el(
      "h4",
      "",
      BULK_OCR_FIELD_LABELS[fieldName]
    ));
    card.appendChild(el(
      "p",
      "bulk-ocr-status",
      bulkOcrFieldStatusLabel(field.status)
    ));

    if (field.original) {
      card.appendChild(el(
        "p",
        "help",
        "読み取った原文：" +
          maskOcrSensitiveDigits(field.original)
      ));
    }

    if (field.status !== "not-shown") {
      card.appendChild(
        bulkOcrMakeNumericInput(fieldName,field)
      );

      const candidates = bulkOcrRenderCandidates(
        fieldName,
        field
      );
      if (candidates) card.appendChild(candidates);
    }

    section.appendChild(card);
  }

  const details = document.createElement("details");
  details.open = true;

  const summary = document.createElement("summary");
  summary.textContent = "未認識テキスト";
  details.appendChild(summary);

  const lines = bulkOcrResult.unrecognizedLines || [];

  if (lines.length === 0) {
    details.appendChild(el(
      "p",
      "help",
      "未認識の行はありません。"
    ));
  } else {
    const list = document.createElement("ul");

    for (const line of lines) {
      list.appendChild(el(
        "li",
        "",
        "行" + line.lineNumber + "：" +
          maskOcrSensitiveDigits(line.text)
      ));
    }

    details.appendChild(list);
  }

  section.appendChild(details);

  const addability = isOcrResultAddable(bulkOcrResult);
  const canAdd = addability.allowed && !bulkOcrDateConflict;
  const addButton = makeButton("表へ追加","bulk-ocr-add");
  addButton.disabled = !canAdd;
  section.appendChild(addButton);

  if (!canAdd) {
    const reasons = addability.reasons.slice();

    if (bulkOcrDateConflict) {
      reasons.push("画面の日付と入力日を確定してください。");
    }
    if (reasons.length === 0) {
      reasons.push("要確認の項目を確定してください。");
    }

    for (const reason of reasons) {
      section.appendChild(el("p","help",reason));
    }
  }

  return section;
}

function bulkOcrApplyDateInput(value) {
  bulkOcrManualDate = value;

  if (!bulkOcrResult || !bulkOcrResult.success) return;

  const current = bulkOcrResult.date || {};

  if (current.source === "manual") {
    const format = bulkOcrRule.formats.find(item =>
      item.formatId === bulkOcrResult.format.formatId
    );

    bulkOcrResult.date = createOcrManualDateResult(
      value,
      format ? format.date || {} : {}
    );
    return;
  }

  if (current.status === "date-conflict" &&
      bulkOcrDateConflict) {
    if (!value) {
      bulkOcrDateConflict = null;
      bulkOcrResult.date = {
        ...current,
        source:"screen",
        status:"recognized",
        value:bulkOcrDateConflict
          ? bulkOcrDateConflict.screenDate
          : current.value
      };
      bulkOcrManualDate = "";
      return;
    }

    bulkOcrDateConflict = {
      screenDate:bulkOcrDateConflict.screenDate,
      manualDate:value
    };
    return;
  }

  if (current.status === "recognized" &&
      current.value && value &&
      current.value !== value) {
    bulkOcrDateConflict = {
      screenDate:current.value,
      manualDate:value
    };
    bulkOcrResult.date = {
      ...current,
      status:"date-conflict",
      value:null
    };
    return;
  }

  bulkOcrDateConflict = null;

  if (!value && current.status === "recognized") {
    bulkOcrResult.date = current;
  } else {
    bulkOcrResult.date = value
      ? {
        source:"manual-override",
        status:"recognized",
        value,
        original:value,
        candidates:[],
        required:true
      }
      : {
        ...current,
        status:"missing-required",
        value:null,
        required:true
      };
  }
}

function bulkOcrSetFieldValue(fieldName,rawValue) {
  if (!bulkOcrResult ||
      !bulkOcrResult.fields[fieldName]) {
    return;
  }

  const field = bulkOcrResult.fields[fieldName];
  const raw = String(
    rawValue === null || rawValue === undefined
      ? ""
      : rawValue
  ).replace(/,/g,"").trim();

  if (!raw) {
    field.value = null;
    field.original = null;
    field.status = field.required
      ? "missing-required"
      : "missing";
  } else {
    const value = toNumberOrNull(raw);
    field.value = value;
    field.original = raw;
    field.status = value === null
      ? "unreadable"
      : "recognized";
  }

  bulkOcrRecalculateIdentity();
  bulkOcrRefreshWarnings();
}

function bulkOcrRecalculateIdentity() {
  if (!bulkOcrResult ||
      bulkOcrResult.identityStrict !== true) {
    return;
  }

  for (const name of [
    "value",
    "effectivePrincipal",
    "pnl",
    "swapTotal"
  ]) {
    const field = bulkOcrResult.fields[name];
    if (field && typeof field.value === "number") {
      field.status = "recognized";
    }
  }

  applyOcrIdentityStrict(
    bulkOcrResult,
    true,
    false
  );
}

function bulkOcrParse(rules = OCR_ACCOUNT_RULES) {
  const selection = getBulkOcrSelection(rules);

  if (!selection || !bulkOcrPasteText.trim()) {
    showMessage("口座とOCRテキストを確認してください。",true);
    render();
    return;
  }

  const dateBeforeParse = bulkOcrManualDate;
  const formats = selection.rule.formats || [];
  let formatId = formats.length === 1
    ? null
    : bulkOcrFormatId || null;

  if (formats.length > 1 && !formatId) {
    const identified = identifyOcrFormats(
      bulkOcrPasteText,
      selection.rule
    );

    if (identified.status === "identified") {
      formatId = identified.format.formatId;
      bulkOcrFormatId = formatId;
    }
  }

  const format = formatId
    ? formats.find(item => item.formatId === formatId)
    : formats.length === 1
      ? formats[0]
      : null;

  try {
    bulkOcrResult = parseOcrText(
      bulkOcrPasteText,
      selection.rule,
      formatId,
      {
        manualDate:
          format && format.date &&
          format.date.source === "manual"
            ? dateBeforeParse
            : "",
        identityConfirmed:false
      }
    );

    bulkOcrDateConflict = null;

    if (bulkOcrResult.date &&
        bulkOcrResult.date.value) {
      if (dateBeforeParse &&
          bulkOcrResult.date.source !== "manual" &&
          dateBeforeParse !== bulkOcrResult.date.value) {
        bulkOcrDateConflict = {
          screenDate:bulkOcrResult.date.value,
          manualDate:dateBeforeParse
        };
        bulkOcrResult.date = {
          ...bulkOcrResult.date,
          status:"date-conflict",
          value:null
        };
      } else {
        bulkOcrManualDate = bulkOcrResult.date.value;
      }
    } else if (dateBeforeParse) {
      bulkOcrApplyDateInput(dateBeforeParse);
    }

    bulkOcrRefreshWarnings();
    showMessage("");
  } catch (error) {
    bulkOcrResult = null;
    bulkOcrWarnings = [];
    showMessage(
      "OCRテキストを解析できませんでした。貼り付けた原文は表示しません。",
      true
    );
  }

  render();
}

function bulkOcrSelectCandidate(fieldName,index) {
  const field = bulkOcrResult &&
    bulkOcrResult.fields[fieldName];
  const candidate = field && field.candidates
    ? field.candidates[index]
    : null;

  if (!candidate) return;

  field.value = typeof candidate.value === "number"
    ? candidate.value
    : null;
  field.original = candidate.original || null;
  field.status = typeof candidate.value === "number"
    ? "recognized"
    : "unreadable";

  bulkOcrRecalculateIdentity();
  bulkOcrRefreshWarnings();
  render();
}

function bulkOcrConfirmIdentity() {
  if (!bulkOcrResult ||
      !bulkOcrResult.identityReview ||
      !bulkOcrResult.identityReview.required) {
    return;
  }

  bulkOcrResult.identityReview.confirmed = true;

  for (const name of [
    "value",
    "effectivePrincipal",
    "pnl",
    "swapTotal"
  ]) {
    const field = bulkOcrResult.fields[name];

    if (field &&
        field.status === "identity-unconfirmed") {
      field.status = "recognized";
    }
  }

  bulkOcrResult.status = "recognized";
  bulkOcrRefreshWarnings();
  render();
}

function bulkOcrAddToTable() {
  getBulkOcrSelection();

  if (!bulkOcrResult) return;

  const addability = isOcrResultAddable(bulkOcrResult);

  if (!addability.allowed || bulkOcrDateConflict) {
    showMessage(
      addability.reasons.join(" ") ||
        "確認が必要な項目があります。",
      true
    );
    render();
    return;
  }

  if (bulkImportRows.length >= BULK_IMPORT_MAX_ROWS) {
    showMessage(
      "表に保持できるのは合計500行までです。先に表を整理してください。",
      true
    );
    render();
    return;
  }

  const row = createOcrBulkImportRow(
    bulkOcrResult,
    bulkOcrAccount.name,
    bulkImportRows.length + 1,
    createId()
  );

  if (!row) {
    showMessage(
      "解析結果を表へ追加できません。項目を確認してください。",
      true
    );
    render();
    return;
  }

  bulkImportRows = classifyBulkImportRows(
    [...bulkImportRows,row],
    appData.accounts,
    appData.snapshots
  );

  bulkImportLastResult = null;
  resetBulkOcrState();

  showMessage("1件を表に追加しました。表で状態を確認してください。");
  render();
}

function bulkOcrSwitchTab(tab) {
  if (tab !== "ocr" && tab !== "tsv") return;

  if (bulkImportActiveTab === "ocr" && tab !== "ocr") {
    resetBulkOcrState();
  }

  bulkImportActiveTab = tab;
  showMessage("");
  render();
}

/* ---------- OCR画面イベント ---------- */

app.addEventListener("click",event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;

  if (action === "bulk-tab-ocr") {
    bulkOcrSwitchTab("ocr");
  } else if (action === "bulk-tab-tsv") {
    bulkOcrSwitchTab("tsv");
  } else if (action === "bulk-ocr-parse") {
    bulkOcrParse();
  } else if (action === "bulk-ocr-clear") {
    resetBulkOcrState();
    showMessage("OCRテキストと解析結果を消去しました。");
    render();
  } else if (action === "bulk-ocr-candidate") {
    bulkOcrSelectCandidate(
      button.dataset.field,
      Number(button.dataset.index)
    );
  } else if (action === "bulk-ocr-date-candidate") {
    const date = bulkOcrResult && bulkOcrResult.date;
    const candidate = date && date.candidates
      ? date.candidates[Number(button.dataset.index)]
      : null;

    if (candidate && candidate.value && !candidate.error) {
      bulkOcrResult.date = {
        ...date,
        status:"recognized",
        value:candidate.value,
        original:candidate.original
      };
      bulkOcrManualDate = candidate.value;
      bulkOcrDateConflict = null;
      bulkOcrRefreshWarnings();
      render();
    }
  } else if (action === "bulk-ocr-use-screen-date" &&
      bulkOcrDateConflict) {
    const value = bulkOcrDateConflict.screenDate;

    bulkOcrResult.date = {
      ...bulkOcrResult.date,
      source:"screen",
      status:"recognized",
      value,
      original:value
    };
    bulkOcrManualDate = value;
    bulkOcrDateConflict = null;
    bulkOcrRefreshWarnings();
    render();
  } else if (action === "bulk-ocr-use-manual-date" &&
      bulkOcrDateConflict) {
    const value = bulkOcrDateConflict.manualDate;

    bulkOcrResult.date = {
      source:"manual-override",
      status:"recognized",
      value,
      original:value,
      candidates:[],
      required:true
    };
    bulkOcrManualDate = value;
    bulkOcrDateConflict = null;
    bulkOcrRefreshWarnings();
    render();
  } else if (action === "bulk-ocr-confirm-identity") {
    bulkOcrConfirmIdentity();
  } else if (action === "bulk-ocr-add") {
    bulkOcrAddToTable();
  }
});

app.addEventListener("input",event => {
  const target = event.target;

  if (target.dataset.bulkOcrSource === "true") {
    bulkOcrPasteText = target.value;
    bulkOcrResult = null;
    bulkOcrWarnings = [];
    bulkOcrDateConflict = null;

    const selection = getBulkOcrSelection();
    if (selection &&
        selection.rule.formats.length > 1 &&
        !bulkOcrFormatId) {
      const identified = identifyOcrFormats(
        bulkOcrPasteText,
        selection.rule
      );

      if (identified.status === "identified") {
        bulkOcrFormatId = identified.format.formatId;
        const formatSelect = app.querySelector(
          "#bulk-ocr-format"
        );
        if (formatSelect) {
          formatSelect.value = bulkOcrFormatId;
        }
      }
    }

    const parseButton = app.querySelector(
      "[data-action='bulk-ocr-parse']"
    );
    if (parseButton) {
      parseButton.disabled = bulkOcrPasteText.trim() === "";
    }

    const resultPanel = app.querySelector(".bulk-ocr-results");
    if (resultPanel) resultPanel.remove();

    return;
  }

  const fieldName = target.dataset.bulkOcrField;
  if (!fieldName) return;

  bulkOcrSetFieldValue(fieldName,target.value);

  const addButton = app.querySelector(
    "[data-action='bulk-ocr-add']"
  );
  if (addButton) {
    addButton.disabled =
      !isOcrResultAddable(bulkOcrResult).allowed ||
      Boolean(bulkOcrDateConflict);
  }

  const status = target.closest(".bulk-ocr-result-card")
    ?.querySelector(".bulk-ocr-status");

  if (status) {
    status.textContent = bulkOcrFieldStatusLabel(
      bulkOcrResult.fields[fieldName].status
    );
  }
});

app.addEventListener("change",event => {
  const fieldName = event.target.dataset.bulkOcrField;
  if (!fieldName) return;

  bulkOcrSetFieldValue(fieldName,event.target.value);
  render();
});
