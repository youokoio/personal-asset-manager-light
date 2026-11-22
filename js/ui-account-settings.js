"use strict";

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
