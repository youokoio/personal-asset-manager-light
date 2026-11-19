"use strict";

/* ---------- S11a FX履歴の行内編集・セル編集 ---------- */

let fxHistoryEditStateS11a = {
  accountId:null,
  openSnapshotId:null,
  changes:new Map(),
  errors:[],
  message:""
};

function resetFxHistoryEditStateS11a(accountId) {
  fxHistoryEditStateS11a = {
    accountId:accountId || null,
    openSnapshotId:null,
    changes:new Map(),
    errors:[],
    message:""
  };
}

function getFxHistoryPendingFieldsS11a(snapshotId) {
  return fxHistoryEditStateS11a.changes.get(snapshotId) || {};
}

function getFxHistoryPendingValueS11a(snapshot,field,pair) {
  const fields = getFxHistoryPendingFieldsS11a(snapshot.id);

  if (field === "rates") {
    const pendingRates = fields.rates || {};
    if (Object.prototype.hasOwnProperty.call(pendingRates,pair)) {
      return pendingRates[pair];
    }

    const rates = snapshot.rates &&
      typeof snapshot.rates === "object" &&
      !Array.isArray(snapshot.rates)
        ? snapshot.rates
        : {};

    return Object.prototype.hasOwnProperty.call(rates,pair)
      ? rates[pair]
      : null;
  }

  return Object.prototype.hasOwnProperty.call(fields,field)
    ? fields[field]
    : snapshot[field];
}

function getFxHistoryEditChangesS11a() {
  const changes = [];

  for (const [snapshotId,fields] of
    fxHistoryEditStateS11a.changes.entries()) {
    if (Object.keys(fields).length) {
      changes.push({
        snapshotId,
        fields:{...fields}
      });
    }
  }

  return changes;
}

function getFxHistoryChangedCellCountS11a() {
  let count = 0;

  for (const fields of fxHistoryEditStateS11a.changes.values()) {
    for (const [field,value] of Object.entries(fields)) {
      if (field === "rates") {
        count += Object.keys(value).length;
      } else {
        count += 1;
      }
    }
  }

  return count;
}

function hasFxHistoryPendingChangesS11a() {
  return getFxHistoryChangedCellCountS11a() > 0;
}

function setFxHistoryPendingValueS11a(snapshot,field,value,pair) {
  const current = getFxHistoryPendingFieldsS11a(snapshot.id);
  const fields = {...current};

  if (field === "rates") {
    const rates = {...(fields.rates || {})};
    const originalRates = snapshot.rates &&
      typeof snapshot.rates === "object" &&
      !Array.isArray(snapshot.rates)
        ? snapshot.rates
        : {};

    const originalValue = Object.prototype.hasOwnProperty.call(
      originalRates,pair
    )
      ? originalRates[pair]
      : null;

    const normalized = normalizeHistoryEditNumberS11a(value);

    if (!normalized.error &&
        normalized.value === originalValue) {
      delete rates[pair];
    } else {
      rates[pair] = value;
    }

    if (Object.keys(rates).length) {
      fields.rates = rates;
    } else {
      delete fields.rates;
    }
  } else {
    const originalValue = snapshot[field];
    const normalized = normalizeHistoryEditNumberS11a(value);

    if (!normalized.error &&
        normalized.value === originalValue) {
      delete fields[field];
    } else {
      fields[field] = value;
    }
  }

  if (Object.keys(fields).length) {
    fxHistoryEditStateS11a.changes.set(snapshot.id,fields);
  } else {
    fxHistoryEditStateS11a.changes.delete(snapshot.id);
  }

  fxHistoryEditStateS11a.errors = [];
  fxHistoryEditStateS11a.message = "";
}

function getFxHistoryEditErrorS11a(snapshotId,field,pair) {
  return fxHistoryEditStateS11a.errors.find(error => {
    if (error.snapshotId !== snapshotId) return false;

    if (pair) {
      return error.field === "rates." + pair;
    }

    return error.field === field;
  }) || null;
}

function formatFxHistoryEditableValueS11a(value,field) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (!Number.isFinite(value)) {
    return String(value);
  }

  if (field === "rate") {
    return formatFxRateValue(value);
  }

  return field === "pnl" ||
    field === "realizedPnlDaily" ||
    field === "swapTotal"
      ? formatSignedYen(value)
      : formatYen(value);
}

function renderFxHistoryEditableCellS11a(
  snapshot,
  field,
  options = {}
) {
  const cell = document.createElement("td");
  const pair = options.pair || null;
  const fieldKey = pair ? "rates" : field;
  const pending = getFxHistoryPendingFieldsS11a(snapshot.id);
  const pendingValue = getFxHistoryPendingValueS11a(
    snapshot,
    fieldKey,
    pair
  );

  const originalValue = pair
    ? snapshot.rates &&
      typeof snapshot.rates === "object" &&
      !Array.isArray(snapshot.rates)
        ? snapshot.rates[pair] ?? null
        : null
    : snapshot[field];

  const normalizedPending = normalizeHistoryEditNumberS11a(
    pendingValue
  );
  const changed = normalizedPending.error
    ? pendingValue !== originalValue
    : normalizedPending.value !== originalValue;

  cell.dataset.snapshotId = snapshot.id;
  cell.dataset.field = fieldKey;
  if (pair) cell.dataset.pair = pair;

  if (changed) {
    cell.classList.add("fx-history-cell-dirty");
    cell.title = "変更前：" +
      formatFxHistoryEditableValueS11a(originalValue,field);
  }

  const error = getFxHistoryEditErrorS11a(
    snapshot.id,
    fieldKey,
    pair
  );

  if (error) {
    cell.classList.add("fx-history-cell-invalid");
    cell.appendChild(el(
      "div",
      "fx-history-cell-error",
      error.message
    ));
  }

  const display = el(
    "span",
    "fx-history-cell-value",
    normalizedPending.error
      ? String(pendingValue ?? "")
      : formatFxHistoryEditableValueS11a(
          normalizedPending.value,
          field
        )
  );

  cell.appendChild(display);

  if (fxHistoryEditStateS11a.openSnapshotId !== null) {
    cell.classList.add("fx-history-cell-disabled");
    return cell;
  }

  const edit = () => {
    if (fxHistoryEditStateS11a.openSnapshotId !== null) return;
    if (cell.querySelector("input")) return;

    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.className = "fx-history-cell-input";
    input.value = pendingValue === null ||
      pendingValue === undefined
        ? ""
        : String(pendingValue);
    input.setAttribute(
      "aria-label",
      (pair ? "評価レート " + pair : field) + "を編集"
    );

    const originalText =
      formatFxHistoryEditableValueS11a(originalValue,field);
    input.title = "変更前：" + originalText;

    cell.replaceChildren(input);
    input.focus();
    input.select();

    const finish = () => {
      if (!cell.contains(input)) return;

      setFxHistoryPendingValueS11a(
        snapshot,
        fieldKey,
        input.value,
        pair
      );

      renderFxHistoryPageS5h(
        appData.accounts.find(item =>
          item.id === fxHistoryEditStateS11a.accountId
        )
      );
    };

    input.addEventListener("keydown",event => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        renderFxHistoryPageS5h(
          appData.accounts.find(item =>
            item.id === fxHistoryEditStateS11a.accountId
          )
        );
      }
    });

    input.addEventListener("blur",finish,{once:true});
  };

  cell.addEventListener("click",event => {
    event.stopPropagation();
    edit();
  });

  cell.tabIndex = 0;
  cell.setAttribute("role","button");
  cell.setAttribute("aria-label",
    (pair ? "評価レート " + pair : field) + "を編集");

  cell.addEventListener("keydown",event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      edit();
    }
  });

  return cell;
}

function renderFxHistoryEditToolbarS11a(account) {
  const section = el("section","fx-history-edit-toolbar");

  if (fxHistoryEditStateS11a.message) {
    section.appendChild(el(
      "div",
      "error",
      fxHistoryEditStateS11a.message
    ));
  }

  if (fxHistoryEditStateS11a.errors.length) {
    section.appendChild(el(
      "div",
      "fx-history-edit-errors",
      "入力エラー " + fxHistoryEditStateS11a.errors.length +
      "件。赤く表示されたセルを修正してください。"
    ));
  }

  const count = getFxHistoryChangedCellCountS11a();
  const actions = el("div","actions");

  const save = makeButton(
    "まとめて保存（" + count + "件）",
    "save-fx-history-edits",
    "primary"
  );
  save.disabled = count === 0;
  save.addEventListener("click",() => {
    saveFxHistoryPendingEditsS11a(account);
  });

  const discard = makeButton(
    "変更を破棄",
    "discard-fx-history-edits",
    "secondary"
  );
  discard.disabled = count === 0;
  discard.addEventListener("click",() => {
    if (!window.confirm("未保存の変更をすべて破棄しますか？")) {
      return;
    }

    fxHistoryEditStateS11a.changes.clear();
    fxHistoryEditStateS11a.errors = [];
    fxHistoryEditStateS11a.message = "";
    renderFxHistoryPageS5h(account);
  });

  actions.append(save,discard);
  section.appendChild(actions);
  return section;
}

function saveFxHistoryPendingEditsS11a(account) {
  const changes = getFxHistoryEditChangesS11a();

  if (!changes.length) return;

  const result = saveHistoryEditsS11a(
    appData,
    changes,
    localStorage,
    new Date().toISOString()
  );

  if (!result.ok) {
    fxHistoryEditStateS11a.errors = result.errors || [];
    fxHistoryEditStateS11a.message = result.error ||
      "履歴の保存に失敗しました。";

    renderFxHistoryPageS5h(account);

    const firstError = fxHistoryEditStateS11a.errors[0];
    if (firstError && firstError.snapshotId) {
      const selector = [
        '[data-snapshot-id="' + CSS.escape(firstError.snapshotId) + '"]',
        '[data-field="' + CSS.escape(firstError.field || "") + '"]'
      ].join("");
      const target = app.querySelector(selector);
      if (target) target.scrollIntoView({
        behavior:"smooth",
        block:"center",
        inline:"center"
      });
    }
    return;
  }

  appData = result.data;
  fxHistoryEditStateS11a.changes.clear();
  fxHistoryEditStateS11a.errors = [];
  fxHistoryEditStateS11a.message =
    "履歴 " + result.updatedRecordCount + "件を保存しました。";

  renderFxHistoryPageS5h(account);
}

function renderFxHistoryInlineFormRowS11a(account,snapshot) {
  const row = document.createElement("tr");
  row.className = "fx-history-inline-form-row";

  const cell = document.createElement("td");
  cell.colSpan = 20;

  const formAccount = account;
  const previousEditingSnapshotId = editingSnapshotId;

  editingSnapshotId = snapshot.id;
  fxHistoryEditStateS11a.openSnapshotId = snapshot.id;

  const form = renderSnapshotForm(formAccount,{
    inline:true,
    onSubmit:event => {
      event.preventDefault();

      const values = new FormData(event.currentTarget);
      const fields = {
        asOfDate:String(values.get("asOfDate") || ""),
        value:String(values.get("value") ?? ""),
        effectivePrincipal:String(values.get("effectivePrincipal") ?? ""),
        pnl:String(values.get("pnl") ?? ""),
        swapTotal:String(values.get("swapTotal") ?? ""),
        realizedPnlDaily:String(values.get("realizedPnlDaily") ?? ""),
        realizedPnlTotal:String(values.get("realizedPnlTotal") ?? ""),
        requiredMargin:String(values.get("requiredMargin") ?? ""),
        memo:String(values.get("memo") || "")
      };

      const result = saveHistoryEditsS11a(
        appData,
        [{snapshotId:snapshot.id,fields}],
        localStorage,
        new Date().toISOString()
      );

      if (!result.ok) {
        fxHistoryEditStateS11a.errors = result.errors || [];
        fxHistoryEditStateS11a.message = result.error ||
          "履歴の保存に失敗しました。";
        renderFxHistoryPageS5h(account);
        return;
      }

      appData = result.data;
      editingSnapshotId = previousEditingSnapshotId;
      fxHistoryEditStateS11a.openSnapshotId = null;
      fxHistoryEditStateS11a.errors = [];
      fxHistoryEditStateS11a.message =
        "履歴を保存しました。";
      renderFxHistoryPageS5h(account);
    }
  });

  form.classList.add("fx-history-inline-form");

  const close = makeButton(
    "閉じる",
    "close-fx-history-inline-form",
    "secondary"
  );
  close.addEventListener("click",() => {
    editingSnapshotId = previousEditingSnapshotId;
    fxHistoryEditStateS11a.openSnapshotId = null;
    fxHistoryEditStateS11a.errors = [];
    fxHistoryEditStateS11a.message = "";
    renderFxHistoryPageS5h(account);
  });

  const actions = form.querySelector(".actions");
  if (actions) {
    actions.appendChild(close);
  } else {
    form.appendChild(close);
  }

  cell.appendChild(form);
  row.appendChild(cell);
  return row;
}

function openFxHistoryInlineFormS11a(account,snapshot) {
  if (hasFxHistoryPendingChangesS11a()) {
    fxHistoryEditStateS11a.message =
      "先に『まとめて保存』か『変更を破棄』をしてください";
    renderFxHistoryPageS5h(account);
    return;
  }

  if (fxHistoryEditStateS11a.openSnapshotId === snapshot.id) {
    fxHistoryEditStateS11a.openSnapshotId = null;
  } else {
    fxHistoryEditStateS11a.openSnapshotId = snapshot.id;
  }

  renderFxHistoryPageS5h(account);
}

function confirmFxHistoryLeaveS11a() {
  if (hasFxHistoryPendingChangesS11a()) {
    return window.confirm(
      "未保存の変更があります。ページを離れると変更は失われます。続けますか？"
    );
  }

  return true;
}

function renderFxHistoryEditStateS11a(account) {
  if (fxHistoryEditStateS11a.accountId !== account.id) {
    resetFxHistoryEditStateS11a(account.id);
  }

  return renderFxHistoryEditToolbarS11a(account);
}
