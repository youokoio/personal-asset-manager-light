"use strict";

function makeFxBatchEditInput(value,field,readOnly,type = "text") {
  const input = document.createElement("input");
  input.type = type;
  input.value = value === null || value === undefined ? "" : String(value);
  input.dataset.field = field;
  input.disabled = readOnly;
  return input;
}

function renderFxBatchEditRow(position,rowKey,readOnly = false) {
  const row = document.createElement("tr");
  row.className = "fx-edit-row" + (readOnly ? " fx-edit-settled-row" : "");
  row.dataset.rowKey = rowKey;
  row.dataset.positionId = position.id || "";
  row.dataset.readOnly = readOnly ? "true" : "false";

  const numberCell = document.createElement("td");
  row.appendChild(numberCell);

  const fields = [
    ["openDate",String(position.openDate || "").slice(0,10),"date"],
    ["pair",position.pair || "","text"],
    ["side",position.side || "","select"],
    ["quantity",position.quantity ?? "","text"],
    ["openRate",position.openRate ?? "","text"],
    ["swap",position.swap ?? "","text"]
  ];

  for (const [field,value,type] of fields) {
    const cell = document.createElement("td");
    if (field === "side") {
      const select = document.createElement("select");
      select.dataset.field = field;
      select.disabled = readOnly;
      for (const optionValue of ["買","売"]) {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = optionValue;
        select.appendChild(option);
      }
      select.value = value;
      cell.appendChild(select);
    } else {
      cell.appendChild(makeFxBatchEditInput(value,field,readOnly,type));
    }
    row.appendChild(cell);
  }

  const statusCell = document.createElement("td");
  statusCell.textContent = readOnly ? "決済済" : "保有中";
  row.appendChild(statusCell);

  const actionCell = document.createElement("td");
  actionCell.className = "fx-edit-delete-cell";
  if (!readOnly) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger small";
    remove.textContent = "削除";
    actionCell.appendChild(remove);
    remove.addEventListener("click",() => {
      const message = position.id
        ? "この保有中建玉を削除しますか？"
        : "追加行を取り消しますか？";
      if (!window.confirm(message)) return;
      if (position.id) {
        row.dataset.deletedId = position.id;
        row.hidden = true;
      } else {
        row.remove();
      }
    });
  }
  row.appendChild(actionCell);
  return row;
}

function collectFxBatchEditRows(tableBody) {
  const rows = [];
  const deletedIds = [];
  let newIndex = 0;

  for (const row of tableBody.querySelectorAll(".fx-edit-row")) {
    if (row.dataset.deletedId) {
      deletedIds.push(row.dataset.deletedId);
      continue;
    }
    const readOnly = row.dataset.readOnly === "true";
    if (readOnly) {
      rows.push({
        id:row.dataset.positionId,
        _rowKey:row.dataset.rowKey,
        readOnly:true
      });
      continue;
    }

    const values = {};
    for (const input of row.querySelectorAll("[data-field]")) {
      values[input.dataset.field] = input.value;
    }
    const id = row.dataset.positionId || null;
    const rowKey = row.dataset.rowKey || "new-" + (++newIndex);
    rows.push({
      id,
      _rowKey:rowKey,
      openDate:values.openDate,
      pair:values.pair,
      side:values.side,
      quantity:values.quantity,
      openRate:values.openRate,
      swap:values.swap
    });
  }
  return {rows,deletedIds};
}

function clearFxBatchEditErrors(tableBody,errorArea) {
  for (const input of tableBody.querySelectorAll("[data-field]")) {
    input.classList.remove("fx-edit-cell-invalid");
    const cell = input.closest("td");
    if (cell) {
      const oldError = cell.querySelector(".fx-edit-cell-error");
      if (oldError) oldError.remove();
    }
  }
  errorArea.replaceChildren();
}

function showFxBatchEditErrors(tableBody,errorArea,errors) {
  clearFxBatchEditErrors(tableBody,errorArea);
  const globalErrors = [];

  for (const item of errors) {
    if (!item.rowKey || !item.field) {
      globalErrors.push(item.message);
      continue;
    }
    const row = [...tableBody.querySelectorAll(".fx-edit-row")].find(target =>
      target.dataset.rowKey === item.rowKey
    );
    const input = row && row.querySelector(
      '[data-field="' + item.field + '"]'
    );
    if (input) {
      input.classList.add("fx-edit-cell-invalid");
      const cell = input.closest("td");
      const message = document.createElement("div");
      message.className = "fx-edit-cell-error";
      message.textContent = item.message;
      cell.appendChild(message);
    } else {
      globalErrors.push(item.message);
    }
  }

  if (globalErrors.length || errors.length) {
    const list = document.createElement("ul");
    for (const message of globalErrors) {
      const item = document.createElement("li");
      item.textContent = message;
      list.appendChild(item);
    }
    if (errors.length) {
      const item = document.createElement("li");
      item.textContent = "赤く表示されたセルを修正してください。";
      list.appendChild(item);
    }
    errorArea.appendChild(list);
  }
}

function renderFxPositionManagement(accountId,pair,side) {
  app.replaceChildren();

  const account = appData.accounts.find(item =>
    item.id === accountId && item.type === "fx"
  );

  if (!account) {
    showMessage("FX口座が見つかりません。",true);
    render();
    return;
  }

  const section = el("section","card");
  section.appendChild(heading(
    account.name + " ／ " + pair + " ／ " + side
  ));

  const back = makeButton(
    "集計一覧へ戻る",
    "back-fx-aggregate",
    "secondary"
  );
  back.addEventListener("click",() => render());
  section.appendChild(back);

  const openPositions = getFxOpenPositions(appData,accountId)
    .filter(position =>
      position.pair === pair && position.side === side
    )
    .sort((a,b) =>
      String(a.openDate).localeCompare(String(b.openDate))
    );
  const settledPositions = appData.fxPositions
    .filter(position =>
      position.accountId === accountId &&
      position.pair === pair &&
      position.side === side &&
      position.status === "決済済"
    )
    .sort((a,b) =>
      String(a.openDate).localeCompare(String(b.openDate))
    );

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "fx-edit-settled-toggle";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = false;
  const toggleText = document.createElement("span");
  toggleText.textContent = "決済済みも表示";
  toggleLabel.append(toggle,toggleText);
  section.appendChild(toggleLabel);

  const tableWrap = el("div","fx-edit-table-wrap");
  const table = document.createElement("table");
  table.className = "fx-edit-table";
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const label of [
    "No.","約定日","通貨ペア","売買方向","数量","約定レート","累計スワップ（円）","状態","操作"
  ]) {
    const cell = document.createElement("th");
    cell.textContent = label;
    headerRow.appendChild(cell);
  }
  head.appendChild(headerRow);
  table.appendChild(head);

  const body = document.createElement("tbody");
  let rowSequence = 0;
  for (const position of openPositions) {
    body.appendChild(renderFxBatchEditRow(
      position,position.id,false
    ));
  }
  for (const position of settledPositions) {
    const row = renderFxBatchEditRow(
      position,position.id,true
    );
    row.hidden = true;
    body.appendChild(row);
  }
  table.appendChild(body);
  tableWrap.appendChild(table);
  section.appendChild(tableWrap);

  function updateRowNumbers() {
    let number = 0;
    for (const row of body.querySelectorAll(".fx-edit-row")) {
      if (row.hidden) continue;
      number += 1;
      row.firstElementChild.textContent = String(number);
    }
  }
  updateRowNumbers();

  toggle.addEventListener("change",() => {
    for (const row of body.querySelectorAll(".fx-edit-settled-row")) {
      row.hidden = !toggle.checked;
    }
    updateRowNumbers();
  });

  const add = makeButton(
    "行を追加",
    "add-fx-batch-row",
    "secondary"
  );
  add.addEventListener("click",() => {
    rowSequence += 1;
    const newPosition = {
      id:null,
      openDate:localDateString(),
      pair,
      side,
      quantity:"",
      openRate:"",
      swap:0,
      status:"保有中"
    };
    body.appendChild(renderFxBatchEditRow(
      newPosition,"new-" + rowSequence,false
    ));
    updateRowNumbers();
  });
  section.appendChild(add);

  const errorArea = el("div","fx-edit-errors");
  errorArea.hidden = true;
  section.appendChild(errorArea);

  const save = makeButton(
    "まとめて保存",
    "save-fx-batch-edit",
    "primary"
  );
  save.addEventListener("click",() => {
    clearFxBatchEditErrors(body,errorArea);
    const collected = collectFxBatchEditRows(body);
    const validation = validateFxPositionBatchRows(
      appData,accountId,pair,side,
      collected.rows,collected.deletedIds
    );
    if (!validation.valid) {
      errorArea.hidden = false;
      showFxBatchEditErrors(body,errorArea,validation.errors);
      showMessage("入力エラーがあります。赤く表示されたセルを修正してください。",true);
      return;
    }

    const storedData = localStorage.getItem("pam2");
    if (storedData === null) {
      showMessage("保存データが見つからないため、一括保存を中止しました。",true);
      return;
    }

    try {
      localStorage.setItem("pam2_pre_fxedit",storedData);
      const nextData = buildFxPositionBatchData(
        appData,accountId,pair,side,
        collected.rows,collected.deletedIds,{
          asOfDate:localDateString()
        }
      );
      validateData(nextData);
      saveData(nextData);
      appData = nextData;
      showMessage("建玉をまとめて保存しました。");
      renderFxPositionManagement(accountId,pair,side);
    } catch (error) {
      showMessage(
        error.message || "建玉の一括保存に失敗しました。既存データは変更していません。",
        true
      );
    }
  });
  section.appendChild(save);

  if (!openPositions.length && !settledPositions.length) {
    section.appendChild(el(
      "div",
      "empty",
      "建玉はありません。「行を追加」から登録できます。"
    ));
  }

  app.appendChild(section);
}