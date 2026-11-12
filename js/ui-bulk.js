"use strict";

/* ---------- S3b 履歴一括入力画面 ---------- */

let bulkImportRows = [];
let bulkImportPasteText = "";
let bulkImportLastResult = null;

function bulkImportStatusLabel(status) {
  if (status === "planned") return "取込予定";
  if (status === "duplicate") return "重複";
  return "エラー";
}

function bulkImportDisplayValue(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function makeBulkImportInput(row,field) {
  const input = document.createElement("input");
  input.type = "text";
  input.autocomplete = "off";
  input.value = bulkImportDisplayValue(row[field]);
  input.dataset.bulkRowId = row.id;
  input.dataset.bulkField = field;
  input.setAttribute("aria-label",
    "行" + row.rowNumber + " " +
    BULK_IMPORT_HEADERS[BULK_IMPORT_FIELDS.indexOf(field)]
  );

  if (BULK_IMPORT_NUMERIC_FIELDS.includes(field)) {
    input.inputMode = "decimal";
    input.className = "numeric-input";
  } else if (field === "asOfDate") {
    input.placeholder = "YYYY-MM-DD";
  }

  return input;
}

function makeBulkImportCell(row,field) {
  const cell = el("td","bulk-edit-cell");
  const input = makeBulkImportInput(row,field);

  if (field === "accountName") {
    input.setAttribute("list","bulk-account-options");
  }

  if (BULK_IMPORT_NUMERIC_FIELDS.includes(field)) {
    const wrapper = el("div","bulk-numeric-wrap");
    wrapper.appendChild(input);
    enhanceNumericInput(wrapper,input);
    cell.appendChild(wrapper);
  } else {
    cell.appendChild(input);
  }

  return cell;
}

function renderBulkImportTable() {
  const wrapper = el("div","bulk-table-scroll");
  const table = el("table","bulk-table");
  const thead = el("thead","");
  const headerRow = el("tr","");

  const fixedHeaders = ["状態","行","削除"];
  for (const label of fixedHeaders) {
    const th = el("th","",label);
    th.scope = "col";
    headerRow.appendChild(th);
  }

  for (const label of BULK_IMPORT_HEADERS) {
    const th = el("th","",label);
    th.scope = "col";
    headerRow.appendChild(th);
  }

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = el("tbody","");

  for (const row of bulkImportRows) {
    const tr = el("tr","bulk-row-" + row.status);

    const statusCell = el("td","bulk-state-cell");
    const statusBadge = el("span",
      "bulk-status " + row.status,
      bulkImportStatusLabel(row.status)
    );
    statusCell.appendChild(statusBadge);

    if (row.reasons && row.reasons.length > 0) {
      statusCell.appendChild(el(
        "div",
        "bulk-reasons",
        row.reasons.join(" ")
      ));
    }

    const numberCell = el("td","bulk-number-cell",row.rowNumber);
    const deleteCell = el("td","bulk-delete-cell");
    const deleteButton = makeButton("削除","bulk-delete-row","secondary small");
    deleteButton.dataset.id = row.id;
    deleteButton.setAttribute("aria-label","行" + row.rowNumber + "を削除");
    deleteCell.appendChild(deleteButton);

    tr.append(statusCell,numberCell,deleteCell);

    for (const field of BULK_IMPORT_FIELDS) {
      tr.appendChild(makeBulkImportCell(row,field));
    }

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  wrapper.appendChild(table);

  const datalist = el("datalist","");
  datalist.id = "bulk-account-options";
  for (const account of appData.accounts) {
    const option = document.createElement("option");
    option.value = account.name;
    datalist.appendChild(option);
  }
  wrapper.appendChild(datalist);

  return wrapper;
}

function renderBulkInput() {
  app.appendChild(heading("履歴の一括入力"));

  app.appendChild(el(
    "div",
    "notice",
    "対象日・口座名・総資産・有効元本・評価損益・累積確定損益・現金・メモの順で、タブ区切りのテキストを貼り付けてください。累計投資元本の列はありません。FX口座の有効元本欄には口座残高を入力します。"
  ));

  const pasteCard = el("section","card");
  pasteCard.appendChild(el("h3","","TSV貼り付け"));

  const pasteField = el("div","field");
  const pasteLabel = el("label","","タブ区切りテキスト");
  pasteLabel.htmlFor = "bulk-import-paste";

  const pasteArea = document.createElement("textarea");
  pasteArea.id = "bulk-import-paste";
  pasteArea.rows = 6;
  pasteArea.value = bulkImportPasteText;
  pasteArea.placeholder =
    "対象日\t口座名\t総資産\t有効元本\t評価損益\t累積確定損益\t現金\tメモ";
  pasteArea.addEventListener("input",() => {
    bulkImportPasteText = pasteArea.value;
  });

  pasteField.append(pasteLabel,pasteArea);
  pasteCard.appendChild(pasteField);

  const pasteActions = el("div","actions");
  pasteActions.appendChild(makeButton("表に展開","bulk-expand"));
  pasteActions.appendChild(makeButton(
    "表を全消去",
    "bulk-clear-table",
    "secondary"
  ));
  pasteCard.appendChild(pasteActions);
  pasteCard.appendChild(el(
    "p",
    "help",
    "展開した行は表の末尾に追加されます。一度に展開できるのは500行までです。"
  ));
  app.appendChild(pasteCard);

  const summary = summarizeBulkImportRows(bulkImportRows);
  const summaryCard = el("section","card");
  summaryCard.appendChild(el("h3","","取込内容の確認"));

  const summaryLine = el(
    "p",
    "bulk-summary",
    `取込予定 ${summary.planned}件 ／ エラー ${summary.error}件 ／ 重複 ${summary.duplicate}件`
  );
  summaryCard.appendChild(summaryLine);

  const actions = el("div","actions");
  const importButton = makeButton(
    `取り込む（${summary.planned}件）`,
    "bulk-import-save"
  );
  importButton.disabled = summary.planned === 0;
  actions.appendChild(importButton);
  actions.appendChild(makeButton(
    "空行を追加",
    "bulk-add-row",
    "secondary"
  ));
  summaryCard.appendChild(actions);

  if (bulkImportLastResult) {
    summaryCard.appendChild(el(
      "p",
      "success",
      `${bulkImportLastResult}件の履歴を追加しました。エラー・重複の行は表に残しています。`
    ));
  }

  if (bulkImportRows.length === 0) {
    summaryCard.appendChild(el(
      "p",
      "empty",
      "まだ行がありません。上の欄にTSVを貼り付けて「表に展開」を押してください。"
    ));
  } else {
    summaryCard.appendChild(el(
      "p",
      "help",
      "セルを直接編集すると、行の状態を再判定します。表は横にスクロールできます。"
    ));
    summaryCard.appendChild(renderBulkImportTable());
  }

  app.appendChild(summaryCard);
}

function expandBulkImportText() {
  const parsed = parseBulkImportTsv(
    bulkImportPasteText,
    bulkImportRows.length + 1
  );

  if (parsed.error) {
    showMessage(parsed.error,true);
    render();
    return;
  }

  if (bulkImportRows.length + parsed.rows.length > BULK_IMPORT_MAX_ROWS) {
    showMessage(
      "表に保持できるのは合計500行までです。先に保存または表を整理してください。",
      true
    );
    render();
    return;
  }

  bulkImportRows = classifyBulkImportRows(
    [...bulkImportRows,...parsed.rows],
    appData.accounts,
    appData.snapshots
  );
  bulkImportLastResult = null;
  showMessage(parsed.rows.length + "行を表に展開しました。");
  render();
}

function reclassifyBulkImportRows() {
  bulkImportRows = classifyBulkImportRows(
    bulkImportRows,
    appData.accounts,
    appData.snapshots
  );
}

function editBulkImportCell(rowId,field,value) {
  bulkImportRows = updateBulkImportRow(
    bulkImportRows,
    rowId,
    field,
    value
  );
  reclassifyBulkImportRows();
  bulkImportLastResult = null;
  render();
}

function addBulkImportEmptyRow() {
  if (bulkImportRows.length >= BULK_IMPORT_MAX_ROWS) {
    showMessage("表に保持できるのは500行までです。",true);
  } else {
    bulkImportRows = addBulkImportRow(bulkImportRows);
    reclassifyBulkImportRows();
    bulkImportLastResult = null;
    showMessage("");
  }
  render();
}

function removeBulkImportRow(rowId) {
  bulkImportRows = deleteBulkImportRow(bulkImportRows,rowId);
  reclassifyBulkImportRows();
  bulkImportLastResult = null;
  showMessage("行を削除しました。");
  render();
}

function clearBulkImportTable() {
  if (bulkImportRows.length > 0 &&
      !window.confirm("表の行をすべて消去します。よろしいですか？")) {
    return;
  }

  bulkImportRows = [];
  bulkImportLastResult = null;
  showMessage("表を全消去しました。");
  render();
}

function executeBulkImport() {
  reclassifyBulkImportRows();

  const summary = summarizeBulkImportRows(bulkImportRows);
  if (summary.planned === 0) {
    showMessage("取り込む行がありません。",true);
    render();
    return;
  }

  const skippedCount = summary.error + summary.duplicate;
  const confirmed = window.confirm(
    `取り込む ${summary.planned}件、取り込まない ${skippedCount}件です。承認して保存しますか？`
  );

  if (!confirmed) return;

  try {
    const result = saveBulkImportRows(
      appData,
      bulkImportRows,
      localStorage,
      {recordedAt:new Date().toISOString()}
    );

    appData = result.data;
    bulkImportRows = classifyBulkImportRows(
      bulkImportRows.filter(row => row.status !== "planned"),
      appData.accounts,
      appData.snapshots
    );
    bulkImportLastResult = result.addedCount;
    bulkImportPasteText = "";
    showMessage(`${result.addedCount}件の履歴を追加しました。`);
  } catch (error) {
    showMessage(
      error.message || "履歴の一括入力に失敗しました。保存データは変更していません。",
      true
    );
  }

  render();
}
