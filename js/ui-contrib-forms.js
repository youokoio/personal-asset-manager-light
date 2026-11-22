"use strict";

/* ---------- 積立実績画面 ---------- */

function getContributionPreviousRecord(accountId,productName,wrapper,month) {
  const records = appData.contributions
    .filter(record =>
      record.accountId === accountId &&
      record.productName === productName &&
      record.wrapper === wrapper &&
      record.toMonth < month &&
      record.status === "実行"
    )
    .sort((a,b) => b.toMonth.localeCompare(a.toMonth));

  return records[0] || null;
}

function getContributionOverlapError(overlaps) {
  const ranges = Array.from(new Set(overlaps.map(overlap =>
    overlap.fromMonth === overlap.toMonth
      ? overlap.fromMonth
      : overlap.fromMonth + "〜" + overlap.toMonth
  )));
  return "同じ積立単位の実績期間が重複しています。重複月：" +
    ranges.join("、");
}

function saveContributionFromUi(accountId,candidate,recordId = null,storage = localStorage) {
  const now = new Date().toISOString();
  const existingRecord = recordId
    ? appData.contributions.find(item => item.id === recordId)
    : null;

  if (recordId && !existingRecord) {
    throw new Error("訂正する積立実績が見つかりません。");
  }

  const nextRecord = {
    ...candidate,
    id:recordId || createId(),
    accountId,
    recordedAt:existingRecord ? existingRecord.recordedAt : now,
    createdAt:existingRecord ? existingRecord.createdAt : now,
    updatedAt:now
  };

  const nextRecords = appData.contributions.filter(item =>
    item.id !== recordId
  );
  nextRecords.push(nextRecord);

  const overlaps = findContributionMonthOverlaps(nextRecords);
  if (overlaps.length) {
    throw new Error(getContributionOverlapError(overlaps));
  }

  const nextData = saveStockTrackingData(
    "contribution",
    data => {
      data.contributions = data.contributions.filter(item =>
        item.id !== recordId
      );
      data.contributions.push(nextRecord);
    },
    storage
  );

  appData = nextData;
  showMessage("積立実績を保存しました。");
  render();
}
function deleteContributionFromUi(recordId,storage = localStorage) {
  if (!window.confirm("この積立実績を削除しますか？")) return;

  const nextData = saveStockTrackingData(
    "contribution",
    data => {
      data.contributions = data.contributions.filter(item =>
        item.id !== recordId
      );
    },
    storage
  );

  appData = nextData;
  showMessage("積立実績を削除しました。");
  render();
}

function getContributionFormValue(form,name) {
  const input = form.querySelector(`[name="${name}"]`);
  return input ? input.value.trim() : "";
}

function getContributionFormNumber(form,name) {
  const value = getContributionFormValue(form,name);
  if (value === "") return 0;

  const number = toNumberOrNull(value);
  if (number === null || number < 0) {
    throw new Error("金額は0以上の数値で入力してください。");
  }
  return number;
}

function makeContributionInput(label,name,value,options = {}) {
  const wrapper = makeField(label,name,value,{
    type:options.type || "text",
    required:Boolean(options.required),
    placeholder:options.placeholder || ""
  });

  const input = wrapper.querySelector("input");
  if (input && options.type === "month") {
    input.type = "month";
  }
  return wrapper;
}

function getContributionProductNames(accountId) {
  const names = new Set();

  for (const holding of appData.holdings) {
    if (holding.accountId === accountId &&
        typeof holding.name === "string" &&
        holding.name.trim()) {
      names.add(holding.name.trim());
    }
  }

  for (const plan of appData.contributionPlans) {
    if (plan.accountId === accountId &&
        typeof plan.productName === "string" &&
        plan.productName.trim()) {
      names.add(plan.productName.trim());
    }
  }

  return Array.from(names).sort((a,b) => a.localeCompare(b,"ja"));
}

function makeContributionProductFields(form,account,record = null) {
  const names = getContributionProductNames(account.id);
  const recordName = record ? record.productName : null;
  const isListedProduct = recordName !== null && names.includes(recordName);
  const initialChoice = !record
    ? ""
    : recordName === null
      ? "__account__"
      : isListedProduct
        ? "product:" + recordName
        : "__other__";

  const productOptions = [
    {value:"",label:"選択してください"},
    {value:"__account__",label:"口座全体"},
    ...names.map(name => ({value:"product:" + name,label:name})),
    {value:"__other__",label:"その他（入力）"}
  ];
  const productField = makeSelectField(
    "商品",
    "productChoice",
    productOptions,
    initialChoice
  );
  const productSelect = productField.querySelector("select");

  const otherField = makeField(
    "その他の商品名",
    "productOther",
    initialChoice === "__other__" ? recordName : "",
    {type:"text",placeholder:"商品名を入力"}
  );
  const otherInput = otherField.querySelector("input");

  const wrapperOptions = [
    {value:"",label:"選択してください"},
    ...HOLDING_WRAPPERS.map(value => ({value,label:value}))
  ];
  const wrapperField = makeSelectField(
    "保有区分",
    "wrapper",
    wrapperOptions,
    record && record.wrapper ? record.wrapper : ""
  );
  const wrapperSelect = wrapperField.querySelector("select");

  function updateFields() {
    const choice = productSelect.value;
    const custom = choice === "__other__";
    const productSelected = choice.startsWith("product:") || custom;

    otherField.classList.toggle("hidden",!custom);
    wrapperField.classList.toggle("hidden",!productSelected);
    otherInput.required = custom;
    wrapperSelect.required = productSelected;
    if (choice === "__account__") wrapperSelect.value = "";
  }

  function getProductName() {
    const choice = productSelect.value;
    if (choice === "__account__") return null;
    if (choice === "__other__") return otherInput.value.trim();
    if (choice.startsWith("product:")) return choice.slice(8).trim();
    return "";
  }

  function getWrapper() {
    return getProductName() === null ? null : wrapperSelect.value;
  }

  form.append(productField,otherField,wrapperField);
  updateFields();
  productSelect.addEventListener("change",updateFields);

  return {
    productSelect,
    otherInput,
    wrapperSelect,
    getProductName,
    getWrapper
  };
}

function appendContributionPreviousValue(container,record,field,labelText) {
  if (!record) return;

  const value = field === "cashAmount"
    ? record.cashAmount
    : record.pointAmount;
  const row = el("div","previous-value-row");
  row.appendChild(el(
    "div",
    "previous-value-text",
    "前回の" + labelText + "：" + formatYen(value) +
      "（" + record.toMonth + "）"
  ));

  const button = makeButton(
    "反映",
    "contribution-apply-previous",
    "secondary small previous-value-apply"
  );
  button.addEventListener("click",() => {
    const input = container.closest("form").querySelector(
      '[name="' + field + '"]'
    );
    if (input && !input.disabled) input.value = String(value);
  });

  row.appendChild(button);
  container.appendChild(row);
}

function appendContributionPlanApply(container,plan,field,labelText) {
  if (!plan || plan.status !== "積立中") return;

  const amounts = getContributionPlanAmounts(plan);
  const value = field === "cashAmount" ? amounts.cash : amounts.point;
  const row = el("div","previous-value-row");
  row.appendChild(el(
    "div",
    "previous-value-text",
    "積立予定：" + labelText + " " + formatYen(value)
  ));

  const button = makeButton(
    "反映",
    "contribution-apply-plan",
    "secondary small previous-value-apply"
  );
  button.addEventListener("click",() => {
    const input = container.closest("form").querySelector(
      '[name="' + field + '"]'
    );
    if (input && !input.disabled) input.value = String(value);
  });

  row.appendChild(button);
  container.appendChild(row);
}

function updateContributionMonthlyHints(
  cashContainer,pointContainer,account,productFields,monthInput,statusSelect
) {
  cashContainer.replaceChildren();
  pointContainer.replaceChildren();

  if (statusSelect.value !== "実行") return;

  const productName = productFields.getProductName();
  const wrapper = productFields.getWrapper();
  const month = monthInput.value;

  if (productName === "" ||
      (productName !== null && !wrapper) ||
      !isValidContributionMonth(month)) {
    return;
  }

  const previous = getContributionPreviousRecord(
    account.id,
    productName,
    wrapper,
    month
  );
  appendContributionPreviousValue(
    cashContainer,previous,"cashAmount","現金"
  );
  appendContributionPreviousValue(
    pointContainer,previous,"pointAmount","ポイント"
  );

  const plan = getContributionPlanForMonth(
    appData.contributionPlans,
    account.id,
    productName,
    wrapper,
    month
  );
  appendContributionPlanApply(
    cashContainer,plan,"cashAmount","現金"
  );
  appendContributionPlanApply(
    pointContainer,plan,"pointAmount","ポイント"
  );
}

function makeContributionFormError(section) {
  const error = el("div","error hidden");
  section.appendChild(error);
  return error;
}

function showContributionFormError(errorBox,error) {
  errorBox.textContent = error && error.message
    ? error.message
    : "積立実績を保存できませんでした。";
  errorBox.classList.remove("hidden");
}

function renderContributionRecordForm(account,record = null,storage = localStorage) {
  if (record && record.fromMonth < record.toMonth) {
    return renderContributionPeriodForm(account,storage,record);
  }

  const section = el("section","card");
  section.appendChild(el(
    "h3",
    "",
    record ? "積立実績の訂正" : "月次実績の入力"
  ));
  const errorBox = makeContributionFormError(section);
  const form = el("form","contribution-form");
  const productFields = makeContributionProductFields(form,account,record);
  const month = record ? record.fromMonth : localDateString().slice(0,7);
  const monthField = makeContributionInput(
    "対象月",
    "fromMonth",
    month,
    {type:"month",required:true}
  );
  form.appendChild(monthField);

  const statusField = makeSelectField(
    "実績状態",
    "status",
    [
      {value:"実行",label:"実行"},
      {value:"未実行",label:"未実行"}
    ],
    record ? record.status : "実行"
  );
  form.appendChild(statusField);

  const cashField = makeNumericField(
    "現金分（円）",
    "cashAmount",
    record ? record.cashAmount : ""
  );
  const cashHints = el("div","contribution-form-hints");
  const pointField = makeNumericField(
    "ポイント分（円）",
    "pointAmount",
    record ? record.pointAmount : "0"
  );
  const pointHints = el("div","contribution-form-hints");
  form.append(cashField,cashHints,pointField,pointHints);

  form.appendChild(makeField(
    "メモ",
    "memo",
    record ? record.memo : "",
    {type:"text"}
  ));

  const statusSelect = statusField.querySelector("select");
  const cashInput = cashField.querySelector("input");
  const pointInput = pointField.querySelector("input");
  const monthInput = monthField.querySelector("input");

  function refreshHints() {
    updateContributionMonthlyHints(
      cashHints,
      pointHints,
      account,
      productFields,
      monthInput,
      statusSelect
    );
  }

  function updateStatusFields() {
    const isUnexecuted = statusSelect.value === "未実行";
    cashInput.disabled = isUnexecuted;
    pointInput.disabled = isUnexecuted;
    if (isUnexecuted) {
      cashInput.value = "0";
      pointInput.value = "0";
    }
    refreshHints();
  }

  productFields.productSelect.addEventListener("change",refreshHints);
  productFields.otherInput.addEventListener("input",refreshHints);
  productFields.wrapperSelect.addEventListener("change",refreshHints);
  monthInput.addEventListener("change",refreshHints);
  statusSelect.addEventListener("change",updateStatusFields);
  updateStatusFields();

  const actions = el("div","form-actions");
  const save = makeButton(
    record ? "訂正を保存" : "実績を保存",
    "contribution-save",
    "primary"
  );
  save.type = "submit";
  actions.appendChild(save);

  const cancel = makeButton(
    "キャンセル",
    "contribution-cancel",
    "secondary"
  );
  cancel.addEventListener("click",() => render());
  actions.appendChild(cancel);

  if (record) {
    const remove = makeButton(
      "この実績を削除",
      "contribution-delete",
      "danger"
    );
    remove.addEventListener("click",() => {
      deleteContributionFromUi(record.id,storage);
    });
    actions.appendChild(remove);
  }

  form.appendChild(actions);

  form.addEventListener("submit",event => {
    event.preventDefault();

    try {
      const name = productFields.getProductName();
      const selectedWrapper = productFields.getWrapper();
      const targetMonth = getContributionFormValue(form,"fromMonth");
      const status = getContributionFormValue(form,"status");

      if (name === "") {
        throw new Error("商品または「口座全体」を選択してください。");
      }
      if (name !== null && !HOLDING_WRAPPERS.includes(selectedWrapper)) {
        throw new Error("商品に対応する保有区分を選択してください。");
      }
      if (!isValidContributionMonth(targetMonth)) {
        throw new Error("対象月を正しく入力してください。");
      }
      if (targetMonth > localDateString().slice(0,7)) {
        throw new Error("未来の月は入力できません。");
      }

      const isUnexecuted = status === "未実行";
      const candidate = {
        productName:name,
        wrapper:name === null ? null : selectedWrapper,
        fromMonth:targetMonth,
        toMonth:targetMonth,
        status,
        cashAmount:isUnexecuted
          ? 0
          : getContributionFormNumber(form,"cashAmount"),
        pointAmount:isUnexecuted
          ? 0
          : getContributionFormNumber(form,"pointAmount"),
        memo:getContributionFormValue(form,"memo")
      };

      saveContributionFromUi(
        account.id,
        candidate,
        record ? record.id : null,
        storage
      );
    } catch (error) {
      showContributionFormError(errorBox,error);
    }
  });

  section.appendChild(form);
  return section;
}

function renderContributionPeriodForm(account,storage = localStorage,record = null) {
  const section = el("section","card");
  section.appendChild(el(
    "h3",
    "",
    record ? "期間まとめの訂正" : "期間まとめの入力"
  ));
  const errorBox = makeContributionFormError(section);
  const form = el("form","contribution-form");
  const productFields = makeContributionProductFields(form,account,record);

  form.appendChild(makeContributionInput(
    "開始月",
    "fromMonth",
    record ? record.fromMonth : "",
    {type:"month",required:true}
  ));
  form.appendChild(makeContributionInput(
    "終了月",
    "toMonth",
    record ? record.toMonth : "",
    {type:"month",required:true}
  ));

  form.appendChild(makeNumericField(
    "期間の現金合計（円）",
    "cashAmount",
    record ? record.cashAmount : ""
  ));
  form.appendChild(makeNumericField(
    "期間のポイント合計（円）",
    "pointAmount",
    record ? record.pointAmount : "0"
  ));
  form.appendChild(makeField(
    "メモ",
    "memo",
    record ? record.memo : "",
    {type:"text"}
  ));

  const actions = el("div","form-actions");
  const save = makeButton(
    record ? "訂正を保存" : "期間まとめを保存",
    "contribution-period-save",
    "primary"
  );
  save.type = "submit";
  actions.appendChild(save);

  const cancel = makeButton(
    "キャンセル",
    "contribution-cancel",
    "secondary"
  );
  cancel.addEventListener("click",() => render());
  actions.appendChild(cancel);

  if (record) {
    const remove = makeButton(
      "この実績を削除",
      "contribution-period-delete",
      "danger"
    );
    remove.addEventListener("click",() => {
      deleteContributionFromUi(record.id,storage);
    });
    actions.appendChild(remove);
  }

  form.appendChild(actions);

  form.addEventListener("submit",event => {
    event.preventDefault();

    try {
      const name = productFields.getProductName();
      const selectedWrapper = productFields.getWrapper();
      const fromMonth = getContributionFormValue(form,"fromMonth");
      const toMonth = getContributionFormValue(form,"toMonth");
      const currentMonth = localDateString().slice(0,7);

      if (name === "") {
        throw new Error("商品または「口座全体」を選択してください。");
      }
      if (name !== null && !HOLDING_WRAPPERS.includes(selectedWrapper)) {
        throw new Error("商品に対応する保有区分を選択してください。");
      }
      if (!isValidContributionMonth(fromMonth) ||
          !isValidContributionMonth(toMonth) ||
          toMonth < fromMonth) {
        throw new Error("開始月と終了月の範囲を正しく入力してください。");
      }
      if (toMonth > currentMonth) {
        throw new Error("未来の月は入力できません。");
      }
      if (fromMonth === toMonth) {
        throw new Error("期間まとめは2か月以上の範囲を指定してください。");
      }

      const candidate = {
        productName:name,
        wrapper:name === null ? null : selectedWrapper,
        fromMonth,
        toMonth,
        status:"実行",
        cashAmount:getContributionFormNumber(form,"cashAmount"),
        pointAmount:getContributionFormNumber(form,"pointAmount"),
        memo:getContributionFormValue(form,"memo")
      };

      saveContributionFromUi(
        account.id,
        candidate,
        record ? record.id : null,
        storage
      );
    } catch (error) {
      showContributionFormError(errorBox,error);
    }
  });

  section.appendChild(form);
  return section;
}
