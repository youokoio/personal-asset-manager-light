```javascript
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
    left.appendChild(el("div","account-meta",
      latest
        ? formatDateWithWeekday(latest.asOfDate)
        : "記録なし"
    ));
    top.appendChild(left);

    const open = makeButton("詳細","open-account","secondary small");
    open.dataset.id = account.id;
    top.appendChild(open);
    card.appendChild(top);

    if (!latest) {
      card.appendChild(el("div","empty","未入力"));
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
        appendAccountMetric(card,"累積確定損益","後続段階で対応");
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

  const dateHelp = form.querySelector(".snapshot-date-help");
  if (dateHelp) {
    dateHelp.textContent =
      "対象日：" + formatDateWithWeekday(targetDate);
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
  const dateHelp = el(
    "div",
    "help snapshot-date-help",
    "対象日：" + formatDateWithWeekday(defaultDate)
  );
  dateField.appendChild(dateHelp);
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

  account.fieldLabels = fieldLabels;
  account.autoCalc = autoCalc || null;
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
  const info = el("section","card");
  info.appendChild(el("div","metric-label","最新評価額"));
  info.appendChild(el("div","metric-value",
    latest ? formatYen(latest.value) : "未入力"
  ));
  info.appendChild(el("div","metric-sub",
    latest
      ? "対象日：" + formatDateWithWeekday(latest.asOfDate)
      : "評価額の記録がありません"
  ));
  app.appendChild(info);

  const formCard = el("section","card");
  formCard.appendChild(renderSnapshotForm(account));
  app.appendChild(formCard);

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
