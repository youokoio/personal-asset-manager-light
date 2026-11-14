
"use strict";

/* ---------- 分類別口座一覧・詳細 ---------- */

function appendAccountMetric(container,label,value,subText = "") {
  const row = el("div","account-metric-line");
  const labelBox = el("div","account-metric-label",label);
  row.appendChild(labelBox);

  const valueBox = el("div","account-metric-value");
  valueBox.appendChild(el("div","",value));
  if (subText) {
    valueBox.appendChild(el("div","account-metric-sub",subText));
  }
  row.appendChild(valueBox);
  container.appendChild(row);
}

function renderCategoryAccountList(category) {
  const label = CATEGORY_LABELS[category];
  app.appendChild(heading(label));

  const accounts = appData.accounts.filter(
    account => getCategory(account) === category
  );

  if (!accounts.length) {
    app.appendChild(el("div","empty","口座がありません。"));
    return;
  }

  const diff30 = category === "bank"
    ? calculateDiff30(appData)
    : null;

  for (const account of accounts) {
    const latest = getLatestSnapshot(appData,account.id);
    const card = el("section","card account-card");
    const top = el("div","account-card-top");

    const left = el("div");
    left.appendChild(el("div","account-name",account.name));
    const accountHoldingsSummary = isHoldingsAccount(account)
      ? calculateHoldingsSummary(appData,account.id)
      : null;
    left.appendChild(el("div","account-meta",
      latest
        ? formatDateWithWeekday(latest.asOfDate)
        : accountHoldingsSummary && accountHoldingsSummary.asOfDate
          ? formatDateWithWeekday(accountHoldingsSummary.asOfDate)
          : "記録なし"
    ));
    top.appendChild(left);

    const open = makeButton("詳細","open-account","secondary small");
    open.dataset.id = account.id;
    top.appendChild(open);
    card.appendChild(top);

    if (!latest) {
      const holdingsSummary = isHoldingsAccount(account)
        ? calculateHoldingsSummary(appData,account.id)
        : null;
      if (holdingsSummary && holdingsSummary.total !== null) {
        appendAccountMetric(
          card,
          "商品別保有合計",
          formatYen(holdingsSummary.total),
          "対象日：" + formatDateWithWeekday(holdingsSummary.asOfDate)
        );
      } else {
        card.appendChild(el("div","empty","未入力"));
      }
    } else if (category === "bank") {
      appendAccountMetric(card,"口座残高",formatYen(latest.value));

      const result = diff30.accounts.find(item =>
        item.accountId === account.id
      );

      appendAccountMetric(
        card,
        "30日前からの差",
        result && result.comparable
          ? formatSignedYen(result.difference)
          : "算出不可",
        result && result.comparable
          ? "比較値の対象日：" +
            formatDateWithWeekday(result.comparisonDate)
          : "30日前以前の比較記録がありません"
      );
    } else {
      appendAccountMetric(
        card,
        getAccountFieldLabel(account,"value","総資産"),
        formatYen(latest.value)
      );
      appendAccountMetric(
        card,
        getAccountFieldLabel(account,"effectivePrincipal","有効元本"),
        formatYen(latest.effectivePrincipal)
      );
      appendAccountMetric(
        card,
        getAccountFieldLabel(account,"pnl","評価損益"),
        formatSignedYen(latest.pnl)
      );

      if (category === "fx") {
        const realized = calculateFxAccountRealizedPnl(appData,account.id);
        appendAccountMetric(
          card,
          "累積確定損益",
          realized ? formatSignedYen(realized.value) : "未計算",
          realized && realized.baseUnset ? "基準額未設定" : ""
        );
        appendAccountMetric(
          card,
          getAccountFieldLabel(account,"swapTotal","累計スワップ"),
          formatYen(latest.swapTotal)
        );
        appendAccountMetric(card,"為替差益","後続段階で対応");
      } else {
        appendAccountMetric(card,"累積確定損益",
          formatSignedYen(latest.realizedPnlTotal));
      }
    }

    card.addEventListener("click",event => {
      if (event.target.closest("button")) {
        selectedAccountId = account.id;
        render();
      } else {
        selectedAccountId = account.id;
        render();
      }
    });

    app.appendChild(card);
  }
}

/* ---------- 入力フォーム補助 ---------- */

function getSnapshotInputValue(snapshot,field) {
  if (!snapshot) return null;

  if (field === "effectivePrincipal") {
    if (snapshot.effectivePrincipal !== null &&
        snapshot.effectivePrincipal !== undefined) {
      return snapshot.effectivePrincipal;
    }
    return snapshot.principal ?? null;
  }

  return snapshot[field] ?? null;
}

function getPreviousValueLabel(targetDate,value,isText = false) {
  const dateLabel = targetDate
    ? targetDate.slice(5).replace("-","/")
    : "";

  const displayValue = isText
    ? String(value)
    : formatInputNumber(value);

  return `前回（${dateLabel}）：${displayValue}`;
}

function updateSnapshotPreviousValues(form,account) {
  const dateInput = form.elements.namedItem("asOfDate");
  const targetDate = dateInput ? dateInput.value : "";
  const previous = getPreviousSnapshotForInput(
    appData,
    account.id,
    targetDate,
    editingSnapshotId
  );

  form.querySelectorAll("[data-previous-field]").forEach(wrapper => {
    const field = wrapper.dataset.previousField;
    const hint = wrapper.querySelector(".previous-value-text");
    const apply = wrapper.querySelector(".previous-value-apply");

    const value = previous
      ? getSnapshotInputValue(previous,field)
      : null;

    const hasValue = value !== null && value !== undefined &&
      value !== "";

    wrapper.classList.toggle("has-previous-value",hasValue);

    if (!hasValue) {
      hint.textContent = "";
      hint.classList.add("hidden");
      apply.classList.add("hidden");
      apply.disabled = true;
      delete wrapper.dataset.previousValue;
      delete wrapper.dataset.hasPreviousValue;
      return;
    }

    hint.textContent = getPreviousValueLabel(
      previous.asOfDate,
      value,
      Boolean(wrapper.dataset.textValue)
    );
    hint.classList.remove("hidden");
    apply.classList.remove("hidden");
    apply.disabled = false;

    wrapper.dataset.previousValue = String(value);
    wrapper.dataset.hasPreviousValue = "true";
  });

  const dateWeekday = form.querySelector(".snapshot-date-weekday");
  if (dateWeekday) {
    dateWeekday.textContent = targetDate
      ? formatDateWithWeekday(targetDate).slice(10)
      : "";
  }
}

function appendSnapshotInputField(
  form,
  account,
  label,
  field,
  value,
  options = {}
) {
  const wrapper = options.textarea
    ? makeField(label,field,value,{textarea:true})
    : makeNumericField(label,field,value,{
        required:Boolean(options.required),
        placeholder:options.placeholder
      });

  wrapper.dataset.previousField = field;
  if (options.textarea) wrapper.dataset.textValue = "true";

  const hintRow = el("div","previous-value-row");
  const hint = el("span","previous-value-text hidden");
  const apply = makeButton(
    "反映",
    "apply-previous-value",
    "secondary small previous-value-apply hidden"
  );
  apply.disabled = true;

  apply.addEventListener("click",() => {
    if (wrapper.dataset.hasPreviousValue !== "true") return;

    const input = wrapper.querySelector("input,textarea");
    if (!input) return;

    input.value = wrapper.dataset.previousValue;
    input.dispatchEvent(new Event("input",{bubbles:true}));
    input.dispatchEvent(new Event("change",{bubbles:true}));
  });

  hintRow.append(hint,apply);
  wrapper.appendChild(hintRow);
  form.appendChild(wrapper);
}

function getSnapshotFieldLabel(account,field,fallback) {
  return getAccountFieldLabel(account,field,fallback);
}

function setupSnapshotAutoCalculation(form,account) {
  let targetField = null;
  let sourceFields = [];

  if (account.autoCalc === "principal") {
    targetField = "effectivePrincipal";
    sourceFields = ["value","pnl"];
  } else if (account.autoCalc === "swap") {
    targetField = "swapTotal";
    sourceFields = ["value","effectivePrincipal","pnl"];
  } else {
    return;
  }

  const allowedValues = getAllowedAutoCalcValues(account);
  if (!allowedValues.includes(account.autoCalc)) return;

  const target = form.elements.namedItem(targetField);
  const status = Array.from(
    form.querySelectorAll(".auto-calc-status")
  ).find(item => item.dataset.target === targetField);
  if (!target || !status) return;

  let manualOverride = false;
  let hasAutoCalculated = false;

  const update = () => {
    if (manualOverride) return;

    const values = {};
    for (const field of sourceFields) {
      const input = form.elements.namedItem(field);
      values[field] = input ? toNumberOrNull(input.value) : null;
    }

    const calculated = calculateAutoCalcValue(account,values);
    if (calculated === null) {
      if (hasAutoCalculated) {
        target.value = "";
        hasAutoCalculated = false;
      }
      status.classList.add("hidden");
      return;
    }

    target.value = String(calculated);
    hasAutoCalculated = true;
    status.classList.remove("hidden");
  };

  target.addEventListener("input",() => {
    manualOverride = true;
    status.classList.add("hidden");
  });

  for (const field of sourceFields) {
    const input = form.elements.namedItem(field);
    if (input) {
      input.addEventListener("input",update);
      input.addEventListener("change",update);
    }
  }

  if (target.value.trim() === "") update();
}

function renderSnapshotForm(account) {
  const existing = editingSnapshotId
    ? appData.snapshots.find(s => s.id === editingSnapshotId)
    : null;

  const category = getCategory(account);
  const isBank = category === "bank";
  const isFx = category === "fx";

  const form = document.createElement("form");
  form.id = "snapshot-form";
  form.appendChild(el("h3","",existing ? "履歴を編集" : "評価額を追加"));

  const defaultDate = existing
    ? existing.asOfDate
    : localDateString();

  const dateField = makeField("対象日","asOfDate",defaultDate,{
    type:"date",
    required:true
  });
  dateField.classList.add("snapshot-date-field");
  const dateInput = dateField.querySelector("input");
  const dateControl = el("div","snapshot-date-control");
  const dateWeekday = el(
    "span",
    "snapshot-date-weekday",
    formatDateWithWeekday(defaultDate).slice(10)
  );
  dateControl.append(dateInput,dateWeekday);
  dateField.appendChild(dateControl);
  form.appendChild(dateField);

  if (isBank) {
    appendSnapshotInputField(
      form,
      account,
      "口座残高（円）",
      "value",
      existing ? existing.value : "",
      {required:true}
    );
  } else {
    appendSnapshotInputField(
      form,
      account,
      getSnapshotFieldLabel(account,"value","総資産") + "（円）",
      "value",
      existing ? existing.value : "",
      {required:true}
    );

    appendSnapshotInputField(
      form,
      account,
      getSnapshotFieldLabel(account,"effectivePrincipal","有効元本") + "（円）",
      "effectivePrincipal",
      existing
        ? getSnapshotInputValue(existing,"effectivePrincipal")
        : "",
      {}
    );

    appendSnapshotInputField(
      form,
      account,
      getSnapshotFieldLabel(account,"pnl","評価損益") + "（円）",
      "pnl",
      existing ? existing.pnl : "",
      {}
    );

    if (isFx) {
      appendSnapshotInputField(
        form,
        account,
        getSnapshotFieldLabel(account,"swapTotal","累計スワップ") + "（円）",
        "swapTotal",
        existing ? existing.swapTotal : "",
        {}
      );

      appendSnapshotInputField(
        form,
        account,
        "必要証拠金（円・任意）",
        "requiredMargin",
        existing ? existing.requiredMargin : "",
        {}
      );

      const swapStatus = el("div","auto-calc-status hidden","自動計算");
      swapStatus.dataset.target = "swapTotal";
      form.appendChild(swapStatus);
    } else {
      appendSnapshotInputField(
        form,
        account,
        "累積確定損益（円）",
        "realizedPnlTotal",
        existing ? existing.realizedPnlTotal : "",
        {}
      );

      appendSnapshotInputField(
        form,
        account,
        "現金（円・任意）",
        "cash",
        existing ? existing.cash : "",
        {}
      );

      const principalStatus = el(
        "div",
        "auto-calc-status hidden",
        "自動計算"
      );
      principalStatus.dataset.target = "effectivePrincipal";
      form.appendChild(principalStatus);
    }
  }

  appendSnapshotInputField(
    form,
    account,
    "メモ（任意）",
    "memo",
    existing ? existing.memo || "" : "",
    {textarea:true}
  );

  form.appendChild(el(
    "div",
    "help",
    "口座番号・契約番号・暗証番号・ログイン情報は入力しないでください。"
  ));

  const actions = el("div","actions");
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = existing ? "変更を保存" : "追加する";
  actions.appendChild(save);

  if (existing) {
    actions.appendChild(makeButton("編集を中止","cancel-edit","secondary"));
  }
  form.appendChild(actions);

  dateInput.addEventListener("change",() => {
    updateSnapshotPreviousValues(form,account);
  });

  form.addEventListener("submit",handleSnapshotSubmit);

  updateSnapshotPreviousValues(form,account);
  setupSnapshotAutoCalculation(form,account);

  return form;
}

/* ---------- 口座設定 ---------- */

function renderAccountSettings(account) {
  const card = el("section","card account-settings-card");
  card.appendChild(el("h3","","口座設定"));

  const form = document.createElement("form");
  form.id = "account-settings-form";

  const labels = account.fieldLabels || {};
  const labelFields = [
    ["value","総資産の項目名"],
    ["effectivePrincipal","有効元本の項目名"],
    ["pnl","評価損益の項目名"],
    ["swapTotal","累計スワップの項目名"]
  ];

  for (const [field,label] of labelFields) {
    const wrapper = makeField(
      label,
      "label_" + field,
      labels[field] || "",
      {
        type:"text",
        placeholder:"標準名を使う場合は空欄"
      }
    );
    form.appendChild(wrapper);
  }

  const allowedAutoCalcValues = getAllowedAutoCalcValues(account);
  const autoCalcOptions = [
    {value:"",label:"なし"},
    {value:"swap",label:"累計スワップ（swap）"},
    {value:"principal",label:"有効元本（principal）"}
  ].filter(option => allowedAutoCalcValues.includes(option.value));

  const autoCalcField = makeSelectField(
    "自動計算",
    "autoCalc",
    autoCalcOptions,
    allowedAutoCalcValues.includes(account.autoCalc)
      ? account.autoCalc
      : ""
  );
  form.appendChild(autoCalcField);

  if (account.type === "fx") {
    const baseAmountField = el("div","field");
    const baseAmountLabel = document.createElement("label");
    baseAmountLabel.textContent = "累積確定損益の基準額（円・任意）";
    const baseAmountInput = document.createElement("input");
    baseAmountInput.type = "number";
    baseAmountInput.step = "1";
    baseAmountInput.name = "realizedBaseAmount";
    baseAmountInput.value = account.realizedBaseAmount ?? "";
    baseAmountLabel.appendChild(baseAmountInput);
    baseAmountField.appendChild(baseAmountLabel);
    form.appendChild(baseAmountField);

    const baseDateField = el("div","field");
    const baseDateLabel = document.createElement("label");
    baseDateLabel.textContent = "累積確定損益の基準日（任意）";
    const baseDateInput = document.createElement("input");
    baseDateInput.type = "date";
    baseDateInput.name = "realizedBaseDate";
    baseDateInput.value = account.realizedBaseDate || "";
    baseDateLabel.appendChild(baseDateInput);
    baseDateField.appendChild(baseDateLabel);
    form.appendChild(baseDateField);
  }

  form.appendChild(el(
    "div",
    "help",
    "項目名を空欄にすると標準名を表示します。自動計算は口座ごとに設定します。"
  ));

  const actions = el("div","actions");
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "口座設定を保存";
  actions.appendChild(save);
  form.appendChild(actions);

  form.addEventListener("submit",event => {
    event.preventDefault();
    handleAccountSettingsSubmit(event,account.id);
  });

  card.appendChild(form);
  return card;
}

function handleAccountSettingsSubmit(event,accountId) {
  event.preventDefault();

  const account = appData.accounts.find(item => item.id === accountId);
  if (!account) return;

  const values = new FormData(event.currentTarget);
  const fieldLabels = {};

  for (const field of [
    "value","effectivePrincipal","pnl","swapTotal"
  ]) {
    const value = String(values.get("label_" + field) || "").trim();
    fieldLabels[field] = value || null;
  }

  const autoCalc = String(values.get("autoCalc") || "");
  if (!getAllowedAutoCalcValues(account).includes(autoCalc)) {
    showMessage("この口座では選択できない自動計算です。",true);
    render();
    return;
  }

  let realizedBaseAmount = null;
  let realizedBaseDate = null;
  if (account.type === "fx") {
    const amountText = String(values.get("realizedBaseAmount") || "").trim();
    const dateText = String(values.get("realizedBaseDate") || "").trim();
    realizedBaseAmount = amountText === "" ? null : toNumberOrNull(amountText);
    realizedBaseDate = dateText || null;

    if ((amountText === "") !== (dateText === "") ||
        (amountText !== "" && realizedBaseAmount === null) ||
        (dateText !== "" && !isValidFxPositionAsOfDate(dateText))) {
      showMessage("累積確定損益の基準額と基準日を両方正しく入力してください。",true);
      render();
      return;
    }
  }

  account.fieldLabels = fieldLabels;
  account.autoCalc = autoCalc || null;
  if (account.type === "fx") {
    account.realizedBaseAmount = realizedBaseAmount;
    account.realizedBaseDate = realizedBaseDate;
  }
  account.updatedAt = new Date().toISOString();

  try {
    saveData(appData);
    showMessage("口座設定を保存しました。");
  } catch (error) {
    showMessage(error.message || "口座設定の保存に失敗しました。",true);
  }

  render();
}

/* ---------- 履歴表示 ---------- */

function renderSnapshotRow(snapshot) {
  const row = el("div","snapshot-row");

  const top = el("div","snapshot-top");
  top.appendChild(el("div","snapshot-date",
    formatDateWithWeekday(snapshot.asOfDate)));
  top.appendChild(el("div","snapshot-value",formatYen(snapshot.value)));
  row.appendChild(top);

  const metaParts = [];
  if (snapshot.pnl !== null && snapshot.pnl !== undefined) {
    metaParts.push("評価損益 " + formatSignedYen(snapshot.pnl));
  }
  if (snapshot.cash !== null && snapshot.cash !== undefined) {
    metaParts.push("現金 " + formatYen(snapshot.cash));
  }
  if (snapshot.effectivePrincipal !== null &&
      snapshot.effectivePrincipal !== undefined) {
    metaParts.push("有効元本 " + formatYen(snapshot.effectivePrincipal));
  } else if (snapshot.principal !== null &&
             snapshot.principal !== undefined) {
    metaParts.push("元本 " + formatYen(snapshot.principal));
  }
  if (snapshot.realizedPnlTotal !== null &&
      snapshot.realizedPnlTotal !== undefined) {
    metaParts.push("累積確定損益 " +
      formatSignedYen(snapshot.realizedPnlTotal));
  }
  if (snapshot.swapTotal !== null && snapshot.swapTotal !== undefined) {
    metaParts.push("累計スワップ " + formatYen(snapshot.swapTotal));
  }
  if (snapshot.requiredMargin !== null &&
      snapshot.requiredMargin !== undefined) {
    metaParts.push("必要証拠金 " + formatYen(snapshot.requiredMargin));
  }
  if (metaParts.length) {
    row.appendChild(el("div","snapshot-meta",metaParts.join(" ／ ")));
  }
  if (snapshot.memo) {
    row.appendChild(el("div","snapshot-meta","メモ：" + snapshot.memo));
  }

  const actions = el("div","actions");
  const edit = makeButton("編集","edit-snapshot","secondary small");
  edit.dataset.id = snapshot.id;
  const remove = makeButton("削除","delete-snapshot","danger small");
  remove.dataset.id = snapshot.id;
  actions.append(edit,remove);
  row.appendChild(actions);

  return row;
}

/* ---------- 口座詳細 ---------- */

/* ---------- S4 商品別保有 ---------- */

function parseHoldingsCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell === "") {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some(value => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell);
  if (row.some(value => value.trim() !== "")) rows.push(row);
  return rows;
}

function getHoldingsCsvColumnIndex(headers,aliases) {
  return headers.findIndex(header =>
    aliases.includes(header.replace(/^\uFEFF/,"").trim())
  );
}

function buildHoldingsImportPreview(account,text) {
  const rows = parseHoldingsCsvRows(text);
  if (rows.length < 2) {
    return {
      items:[],
      error:"ヘッダー行とデータ行を含むCSVを貼り付けてください。"
    };
  }

  const headers = rows[0];
  const columns = {
    name:getHoldingsCsvColumnIndex(headers,["商品名","name"]),
    wrapper:getHoldingsCsvColumnIndex(headers,["口座枠","口座区分","wrapper"]),
    kind:getHoldingsCsvColumnIndex(headers,["種別","kind"]),
    asOfDate:getHoldingsCsvColumnIndex(headers,["対象日","asOfDate"]),
    quantity:getHoldingsCsvColumnIndex(headers,["数量","quantity"]),
    costBasis:getHoldingsCsvColumnIndex(headers,["取得額","costBasis"]),
    value:getHoldingsCsvColumnIndex(headers,["評価額","value"]),
    pnl:getHoldingsCsvColumnIndex(headers,["評価損益","pnl"]),
    memo:getHoldingsCsvColumnIndex(headers,["メモ","memo"])
  };

  for (const field of ["name","wrapper","kind","asOfDate","value"]) {
    if (columns[field] < 0) {
      return {
        items:[],
        error:"必須列がありません：" + field
      };
    }
  }

  const existingKeys = new Set(
    appData.holdings.map(item => getHoldingImportKey(item))
  );
  const items = [];

  for (let index = 1; index < rows.length; index += 1) {
    const cells = rows[index];
    const getCell = field => columns[field] < 0
      ? ""
      : String(cells[columns[field]] ?? "").trim();

    const name = getCell("name");
    const wrapper = getCell("wrapper");
    const kind = getCell("kind");
    const asOfDate = getCell("asOfDate");
    const value = toNumberOrNull(getCell("value"));
    const quantity = toNumberOrNull(getCell("quantity"));
    const costBasis = toNumberOrNull(getCell("costBasis"));
    const pnl = toNumberOrNull(getCell("pnl"));
    const memo = getCell("memo");

    let error = "";
    if (!name) error = "商品名が空欄です。";
    else if (!HOLDING_WRAPPERS.includes(wrapper)) {
      error = "口座枠が正しくありません。";
    } else if (!HOLDING_KINDS.includes(kind)) {
      error = "種別が正しくありません。";
    } else if (formatDateWithWeekday(asOfDate) === asOfDate) {
      error = "対象日が正しくありません。";
    } else if (value === null) {
      error = "評価額が数値ではありません。";
    } else if (["quantity","costBasis","pnl"].some(field =>
      getCell(field) !== "" &&
      ({quantity,costBasis,pnl})[field] === null
    )) {
      error = "数量・取得額・評価損益は数値または空欄にしてください。";
    }

    const item = {
      accountId:account.id,
      name,
      wrapper,
      kind,
      asOfDate,
      quantity,
      costBasis,
      value,
      pnl,
      memo
    };
    const key = getHoldingImportKey(item);

    if (!error && existingKeys.has(key)) {
      error = "同じ商品・口座枠・対象日が登録済みのためスキップします。";
      item.status = "duplicate";
    } else if (!error) {
      existingKeys.add(key);
      item.status = "add";
    } else {
      item.status = "error";
    }

    item.error = error;
    item.rowNumber = index + 1;
    items.push(item);
  }

  return {items,error:""};
}

function renderHoldingsImportPreview(preview,container) {
  container.replaceChildren();

  if (preview.error) {
    container.appendChild(el("div","error",preview.error));
    return;
  }

  const addCount = preview.items.filter(item => item.status === "add").length;
  const duplicateCount = preview.items.filter(
    item => item.status === "duplicate"
  ).length;
  const errorCount = preview.items.filter(
    item => item.status === "error"
  ).length;

  container.appendChild(el(
    "div",
    "help",
    "追加 " + addCount + "件 ／ 重複スキップ " +
      duplicateCount + "件 ／ エラー " + errorCount + "件"
  ));

  for (const item of preview.items) {
    const row = el("div","snapshot-row");
    row.appendChild(el(
      "div",
      "snapshot-top",
      "CSV " + item.rowNumber + "行目：" +
        (item.name || "商品名なし") + " ／ " +
        (item.status === "add"
          ? "追加予定"
          : item.status === "duplicate"
            ? "重複・スキップ"
            : "エラー")
    ));
    row.appendChild(el(
      "div",
      "snapshot-meta",
      item.error || (
        item.wrapper + " ／ " + item.kind + " ／ " +
        formatDateWithWeekday(item.asOfDate) + " ／ " +
        formatYen(item.value)
      )
    ));
    container.appendChild(row);
  }
}

function renderHoldingsImportForm(account) {
  const card = el("section","card");
  card.appendChild(el("h3","","商品別保有の一括取込"));

  card.appendChild(el(
    "div",
    "help",
    "この口座に取り込みます。CSVの1行目に「商品名,口座枠,種別,対象日,数量,取得額,評価額,評価損益,メモ」を置いてください。必須は商品名・口座枠・種別・対象日・評価額です。数値はカンマ区切りなしで入力し、空欄は未入力として保存します。"
  ));

  const form = document.createElement("form");
  const input = makeField("CSV貼り付け","holdingsCsv","",{textarea:true});
  const textarea = input.querySelector("textarea");
  textarea.rows = 6;
  textarea.placeholder =
    "商品名,口座枠,種別,対象日,数量,取得額,評価額,評価損益,メモ";
  form.appendChild(input);

  const previewButton = makeButton("プレビュー","holdings-preview","secondary");
  form.appendChild(previewButton);

  const previewContainer = el("div","holdings-import-preview");
  form.appendChild(previewContainer);

  const approve = makeButton("承認して追加","holdings-approve");
  approve.disabled = true;
  form.appendChild(approve);

  let preview = null;

  textarea.addEventListener("input",() => {
    preview = null;
    approve.disabled = true;
    previewContainer.replaceChildren();
  });

  previewButton.addEventListener("click",event => {
    event.preventDefault();
    preview = buildHoldingsImportPreview(account,textarea.value);
    renderHoldingsImportPreview(preview,previewContainer);
    approve.disabled = Boolean(preview.error) ||
      preview.items.some(item => item.status === "error") ||
      !preview.items.some(item => item.status === "add");
  });

  approve.addEventListener("click",event => {
    event.preventDefault();
    if (!preview || preview.error) return;

    const additions = preview.items.filter(item => item.status === "add");
    if (!additions.length) {
      showMessage("追加できる商品がありません。",true);
      render();
      return;
    }

    const nextData = JSON.parse(JSON.stringify(appData));
    const now = new Date().toISOString();

    for (const item of additions) {
      nextData.holdings.push({
        id:createId(),
        accountId:item.accountId,
        name:item.name,
        wrapper:item.wrapper,
        kind:item.kind,
        asOfDate:item.asOfDate,
        recordedAt:now,
        quantity:item.quantity,
        costBasis:item.costBasis,
        value:item.value,
        pnl:item.pnl,
        memo:item.memo,
        createdAt:now,
        updatedAt:now
      });
    }

    const updatedAccount = nextData.accounts.find(item =>
      item.id === account.id
    );
    if (updatedAccount) updatedAccount.updatedAt = now;

    try {
      saveData(nextData);
      appData = nextData;
      showMessage(additions.length + "件の商品別保有を追加しました。");
    } catch (error) {
      showMessage(
        error.message || "商品別保有を保存できませんでした。",
        true
      );
    }

    render();
  });

  card.appendChild(form);
  return card;
}

function renderHoldingsSection(account) {
  const card = el("section","card");
  card.appendChild(el("h3","","商品別保有"));

  const summary = calculateHoldingsSummary(appData,account.id);
  if (!summary.holdings.length) {
    card.appendChild(el("div","empty","商品別保有の記録はありません。"));
  } else {
    card.appendChild(el(
      "div",
      "metric-sub",
      "対象日：" + formatDateWithWeekday(summary.asOfDate)
    ));

    for (const wrapper of HOLDING_WRAPPERS) {
      const items = summary.holdings.filter(item => item.wrapper === wrapper);
      if (!items.length) continue;
      const subtotal = items.reduce((sum,item) => sum + item.value,0);
      appendAccountMetric(
        card,
        wrapper + " 小計",
        formatYen(subtotal),
        items.length + "商品"
      );
    }

    appendAccountMetric(card,"商品別合計",formatYen(summary.total));

    if (summary.accountValue !== null) {
      appendAccountMetric(
        card,
        "口座評価額との差額",
        formatSignedYen(summary.difference)
      );
    } else {
      appendAccountMetric(
        card,
        "口座評価額との差額",
        "算出不可",
        "口座全体の履歴がありません"
      );
    }

    for (const item of summary.holdings) {
      const row = el("div","snapshot-row");
      row.appendChild(el("div","snapshot-top",item.name));
      const details = [
        item.wrapper,
        item.kind,
        "評価額 " + formatYen(item.value),
        "取得額 " + formatYen(item.costBasis),
        "評価損益 " + formatSignedYen(item.pnl)
      ];
      if (item.quantity !== null && item.quantity !== undefined) {
        details.push("数量 " + formatInputNumber(item.quantity));
      }
      row.appendChild(el("div","snapshot-meta",details.join(" ／ ")));
      if (item.memo) {
        row.appendChild(el("div","snapshot-meta","メモ：" + item.memo));
      }
      card.appendChild(row);
    }
  }

  return card;
}

function renderAccountDetail() {
  const account = appData.accounts.find(a => a.id === selectedAccountId);
  if (!account) {
    selectedAccountId = null;
    renderCategoryAccountList(currentTab);
    return;
  }

  const back = makeButton(
    "← " + CATEGORY_LABELS[getCategory(account)] + "一覧へ",
    "back-accounts",
    "secondary"
  );
  app.appendChild(back);

  app.appendChild(heading(account.name));

  const latest = getLatestSnapshot(appData,account.id);
  const holdingsSummary = isHoldingsAccount(account)
    ? calculateHoldingsSummary(appData,account.id)
    : null;
  const displayedValue = latest
    ? latest.value
    : holdingsSummary
      ? holdingsSummary.total
      : null;
  const displayedDate = latest
    ? latest.asOfDate
    : holdingsSummary
      ? holdingsSummary.asOfDate
      : null;
  const info = el("section","card");
  info.appendChild(el("div","metric-label","最新評価額"));
  info.appendChild(el("div","metric-value",
    displayedValue !== null ? formatYen(displayedValue) : "未入力"
  ));
  info.appendChild(el("div","metric-sub",
    displayedDate
      ? "対象日：" + formatDateWithWeekday(displayedDate)
      : "評価額の記録がありません"
  ));
  app.appendChild(info);

  const formCard = el("section","card");
  formCard.appendChild(renderSnapshotForm(account));
  app.appendChild(formCard);

  if (isHoldingsAccount(account)) {
    app.appendChild(renderHoldingsSection(account));
    app.appendChild(renderHoldingsImportForm(account));
  }

  app.appendChild(renderAccountSettings(account));

  const historyCard = el("section","card");
  historyCard.appendChild(el("h3","","評価額履歴"));

  const snapshots = getAccountSnapshots(appData,account.id);
  if (!snapshots.length) {
    historyCard.appendChild(el("div","empty","履歴はまだありません。"));
  } else {
    for (const snapshot of snapshots) {
      historyCard.appendChild(renderSnapshotRow(snapshot));
    }
  }

  app.appendChild(historyCard);
}

/* ---------- 保存操作 ---------- */

function handleSnapshotSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const values = new FormData(form);

  const asOfDate = String(values.get("asOfDate") || "");
  const value = toNumberOrNull(values.get("value"));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    showMessage("対象日を正しく入力してください。",true);
    render();
    return;
  }

  if (value === null) {
    showMessage("金額を数値で入力してください。",true);
    render();
    return;
  }

  const account = appData.accounts.find(a => a.id === selectedAccountId);
  if (!account) return;

  const category = getCategory(account);
  const isBank = category === "bank";
  const isFx = category === "fx";
  const now = new Date().toISOString();

  const previousSnapshot = editingSnapshotId
    ? appData.snapshots.find(s => s.id === editingSnapshotId)
    : null;

  const snapshot = {
    id:editingSnapshotId || createId(),
    accountId:account.id,
    asOfDate,
    recordedAt:now,
    value,
    cash:isBank
      ? null
      : isFx
        ? previousSnapshot
          ? previousSnapshot.cash ?? null
          : null
        : toNumberOrNull(values.get("cash")),
    pnl:isBank ? null : toNumberOrNull(values.get("pnl")),
    principal:previousSnapshot
      ? previousSnapshot.principal ?? null
      : null,
    cumulativeInvested:previousSnapshot
      ? previousSnapshot.cumulativeInvested ?? null
      : null,
    effectivePrincipal:isBank
      ? null
      : toNumberOrNull(values.get("effectivePrincipal")),
    realizedPnlTotal:isBank || isFx
      ? null
      : toNumberOrNull(values.get("realizedPnlTotal")),
    swapTotal:isFx
      ? toNumberOrNull(values.get("swapTotal"))
      : null,
    requiredMargin:isFx
      ? toNumberOrNull(values.get("requiredMargin"))
      : null,
    memo:String(values.get("memo") || "")
  };

  if (editingSnapshotId) {
    const index = appData.snapshots.findIndex(s => s.id === editingSnapshotId);
    if (index < 0) {
      showMessage("編集対象の履歴が見つかりません。",true);
      render();
      return;
    }
    appData.snapshots[index] = snapshot;
  } else {
    appData.snapshots.push(snapshot);
  }

  account.updatedAt = now;

  try {
    saveData(appData);
    editingSnapshotId = null;
    showMessage("保存しました。");
  } catch (error) {
    showMessage(error.message || "保存に失敗しました。",true);
  }

  render();
}

function editSnapshot(id) {
  const snapshot = appData.snapshots.find(s => s.id === id);
  if (!snapshot) return;
  selectedAccountId = snapshot.accountId;
  editingSnapshotId = id;
  showMessage("");
  render();
  window.scrollTo(0,0);
}

function deleteSnapshot(id) {
  const snapshot = appData.snapshots.find(s => s.id === id);
  if (!snapshot) return;

  if (!window.confirm(
    "この評価額履歴を削除しますか？\nこの操作は取り消せません。"
  )) return;

  appData.snapshots = appData.snapshots.filter(s => s.id !== id);

  const account = appData.accounts.find(a => a.id === snapshot.accountId);
  if (account) account.updatedAt = new Date().toISOString();

  try {
    saveData(appData);
    editingSnapshotId = null;
    showMessage("履歴を削除しました。");
  } catch (error) {
    showMessage(error.message || "削除に失敗しました。",true);
  }

  render();
}
