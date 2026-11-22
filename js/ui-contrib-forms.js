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

function saveContributionFromUi(accountId,candidate,recordId = null,storage = localStorage) {
  const now = new Date().toISOString();
  const nextRecord = {
    ...candidate,
    id:recordId || createId(),
    accountId,
    recordedAt:recordId
      ? appData.contributions.find(item => item.id === recordId)?.recordedAt || now
      : now,
    createdAt:recordId
      ? appData.contributions.find(item => item.id === recordId)?.createdAt || now
      : now,
    updatedAt:recordId ? now : null
  };

  if (recordId &&
      !appData.contributions.some(item => item.id === recordId)) {
    throw new Error("訂正する積立実績が見つかりません。");
  }

  const nextRecords = appData.contributions.filter(item =>
    item.id !== recordId
  );
  nextRecords.push(nextRecord);

  const overlaps = findContributionMonthOverlaps(nextRecords);
  if (overlaps.length) {
    throw new Error("同じ積立単位の実績期間が重複しています。");
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

function appendContributionPreviousValue(form,record,field,labelText) {
  if (!record) return;

  const value = field === "cashAmount"
    ? record.cashAmount
    : record.pointAmount;

  const button = makeButton(
    "前回値を反映（" + labelText + "：" +
      formatYen(value) + "／" + record.toMonth + "）",
    "contribution-apply-previous",
    "secondary small"
  );

  button.addEventListener("click",() => {
    const input = form.querySelector(`[name="${field}"]`);
    if (input) input.value = String(value);
  });

  form.appendChild(button);
}

function appendContributionPlanApply(form,plan) {
  if (!plan || plan.status !== "積立中") return;

  const amounts = getContributionPlanAmounts(plan);
  const button = makeButton(
    "積立予定額を反映",
    "contribution-apply-plan",
    "secondary small"
  );

  button.addEventListener("click",() => {
    const cash = form.querySelector('[name="cashAmount"]');
    const point = form.querySelector('[name="pointAmount"]');

    if (cash) cash.value = String(amounts.cash);
    if (point) point.value = String(amounts.point);
  });

  form.appendChild(button);
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

  const form = el("form","contribution-form");
  const productName = record ? record.productName : "";
  const wrapper = record ? record.wrapper : "NISAつみたて";
  const month = record ? record.fromMonth : localDateString().slice(0,7);

  const productField = makeField(
    "商品名（口座全体の場合は空欄）",
    "productName",
    productName,
    {type:"text"}
  );
  form.appendChild(productField);

  const wrapperField = makeSelectField(
    "保有区分",
    "wrapper",
    HOLDING_WRAPPERS.map(value => ({
      value,
      label:value
    })),
    wrapper || "NISAつみたて"
  );
  form.appendChild(wrapperField);

  form.appendChild(makeContributionInput(
    "対象月",
    "fromMonth",
    month,
    {type:"month",required:true}
  ));

  form.appendChild(makeSelectField(
    "実績状態",
    "status",
    [
      {value:"実行",label:"実行"},
      {value:"未実行",label:"未実行"}
    ],
    record ? record.status : "実行"
  ));

  form.appendChild(makeNumericField(
    "現金分（円）",
    "cashAmount",
    record ? record.cashAmount : ""
  ));

  form.appendChild(makeNumericField(
    "ポイント分（円）",
    "pointAmount",
    record ? record.pointAmount : "0"
  ));

  form.appendChild(makeField(
    "メモ",
    "memo",
    record ? record.memo : "",
    {type:"text"}
  ));

  const selectedProduct = productName || null;
  const selectedWrapper = selectedProduct ? wrapper : null;
  const previous = getContributionPreviousRecord(
    account.id,
    selectedProduct,
    selectedWrapper,
    month
  );

  appendContributionPreviousValue(
    form,
    previous,
    "cashAmount",
    "現金"
  );
  appendContributionPreviousValue(
    form,
    previous,
    "pointAmount",
    "ポイント"
  );

  const currentPlan = getContributionPlanForMonth(
    appData.contributionPlans,
    account.id,
    selectedProduct,
    selectedWrapper,
    month
  );
  appendContributionPlanApply(form,currentPlan);

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
      const name = getContributionFormValue(form,"productName") || null;
      const selected = getContributionFormValue(form,"wrapper");
      const targetMonth = getContributionFormValue(form,"fromMonth");

      if (!isValidContributionMonth(targetMonth)) {
        throw new Error("対象月を正しく入力してください。");
      }

      const candidate = {
        productName:name,
        wrapper:name ? selected : null,
        fromMonth:targetMonth,
        toMonth:targetMonth,
        status:getContributionFormValue(form,"status"),
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
      showMessage(error.message || "積立実績を保存できませんでした。",true);
      render();
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

  const form = el("form","contribution-form");

  form.appendChild(makeField(
    "商品名（口座全体の場合は空欄）",
    "productName",
    record ? record.productName : "",
    {type:"text"}
  ));

  form.appendChild(makeSelectField(
    "保有区分",
    "wrapper",
    HOLDING_WRAPPERS.map(value => ({
      value,
      label:value
    })),
    record ? record.wrapper : "NISAつみたて"
  ));

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

  form.appendChild(makeSelectField(
    "実績状態",
    "status",
    [
      {value:"実行",label:"実行"},
      {value:"未実行",label:"未実行"}
    ],
    record ? record.status : "実行"
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
      const name = getContributionFormValue(form,"productName") || null;
      const selected = getContributionFormValue(form,"wrapper");
      const fromMonth = getContributionFormValue(form,"fromMonth");
      const toMonth = getContributionFormValue(form,"toMonth");

      if (!isValidContributionMonth(fromMonth) ||
          !isValidContributionMonth(toMonth) ||
          toMonth < fromMonth) {
        throw new Error("開始月と終了月の範囲を正しく入力してください。");
      }

      if (fromMonth === toMonth) {
        throw new Error("期間まとめは2か月以上の範囲を指定してください。");
      }

      const candidate = {
        productName:name,
        wrapper:name ? selected : null,
        fromMonth,
        toMonth,
        status:getContributionFormValue(form,"status"),
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
      showMessage(error.message || "期間まとめを保存できませんでした。",true);
      render();
    }
  });

  section.appendChild(form);
  return section;
}
