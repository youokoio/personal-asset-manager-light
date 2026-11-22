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

function saveContributionPlanFromUi(accountId,candidate,planId = null,storage = localStorage) {
  const now = new Date().toISOString();
  const nextPlan = {
    ...candidate,
    id:planId || createId(),
    accountId,
    createdAt:planId
      ? appData.contributionPlans.find(item => item.id === planId)?.createdAt || now
      : now,
    updatedAt:planId ? now : null
  };

  if (planId &&
      !appData.contributionPlans.some(item => item.id === planId)) {
    throw new Error("訂正する積立予定が見つかりません。");
  }

  const nextData = saveStockTrackingData(
    "contribution",
    data => {
      data.contributionPlans = data.contributionPlans.filter(item =>
        item.id !== planId
      );
      data.contributionPlans.push(nextPlan);
    },
    storage
  );

  appData = nextData;
  showMessage("積立予定を保存しました。");
  render();
}

function deleteContributionPlanFromUi(planId,storage = localStorage) {
  if (!window.confirm("この積立予定を削除しますか？")) return;

  const nextData = saveStockTrackingData(
    "contribution",
    data => {
      data.contributionPlans = data.contributionPlans.filter(item =>
        item.id !== planId
      );
    },
    storage
  );

  appData = nextData;
  showMessage("積立予定を削除しました。");
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

function renderContributionPlanForm(account,plan = null,storage = localStorage) {
  const section = el("section","card");
  section.appendChild(el(
    "h3",
    "",
    plan ? "積立予定の訂正" : "積立予定の登録"
  ));

  const form = el("form","contribution-form");

  form.appendChild(makeField(
    "商品名（口座全体の場合は空欄）",
    "productName",
    plan ? plan.productName : "",
    {type:"text"}
  ));

  form.appendChild(makeSelectField(
    "保有区分",
    "wrapper",
    HOLDING_WRAPPERS.map(value => ({
      value,
      label:value
    })),
    plan ? plan.wrapper : "NISAつみたて"
  ));

  form.appendChild(makeContributionInput(
    "適用開始月",
    "effectiveFrom",
    plan ? plan.effectiveFrom : localDateString().slice(0,7),
    {type:"month",required:true}
  ));

  form.appendChild(makeSelectField(
    "予定状態",
    "status",
    [
      {value:"積立中",label:"積立中"},
      {value:"停止",label:"停止"}
    ],
    plan ? plan.status : "積立中"
  ));

  form.appendChild(makeNumericField(
    "予定現金額（円）",
    "plannedCash",
    plan ? plan.plannedCash : ""
  ));

  form.appendChild(makeNumericField(
    "予定ポイント額（円）",
    "plannedPoint",
    plan ? plan.plannedPoint : "0"
  ));

  form.appendChild(makeField(
    "メモ",
    "memo",
    plan ? plan.memo : "",
    {type:"text"}
  ));

  const actions = el("div","form-actions");
  const save = makeButton(
    plan ? "予定を訂正" : "予定を登録",
    "contribution-plan-save",
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

  if (plan) {
    const remove = makeButton(
      "この予定を削除",
      "contribution-plan-delete",
      "danger"
    );
    remove.addEventListener("click",() => {
      deleteContributionPlanFromUi(plan.id,storage);
    });
    actions.appendChild(remove);
  }

  form.appendChild(actions);

  form.addEventListener("submit",event => {
    event.preventDefault();

    try {
      const name = getContributionFormValue(form,"productName") || null;
      const selected = getContributionFormValue(form,"wrapper");
      const effectiveFrom = getContributionFormValue(form,"effectiveFrom");
      const status = getContributionFormValue(form,"status");

      if (!isValidContributionMonth(effectiveFrom)) {
        throw new Error("適用開始月を正しく入力してください。");
      }

      const candidate = {
        productName:name,
        wrapper:name ? selected : null,
        effectiveFrom,
        status,
        plannedCash:status === "積立中"
          ? getContributionFormNumber(form,"plannedCash")
          : null,
        plannedPoint:getContributionFormNumber(form,"plannedPoint"),
        memo:getContributionFormValue(form,"memo")
      };

      saveContributionPlanFromUi(
        account.id,
        candidate,
        plan ? plan.id : null,
        storage
      );
    } catch (error) {
      showMessage(error.message || "積立予定を保存できませんでした。",true);
      render();
    }
  });

  section.appendChild(form);
  return section;
}

function renderContributionSection(account,storage = localStorage) {
  const section = el("section","contribution-section");
  section.appendChild(el("h3","","積立実績"));

  const currentMonth = localDateString().slice(0,7);
  let summary;

  try {
    summary = calculateContributionSummary(appData,currentMonth);
  } catch (error) {
    section.appendChild(el(
      "div",
      "error",
      error.message || "積立実績を集計できませんでした。"
    ));
    return section;
  }

  const accountTotal = summary.accountTotals.find(item =>
    item.accountId === account.id
  );

  const totalsCard = el("div","card");
  totalsCard.appendChild(el("h4","","累積積立額"));

  if (!accountTotal || !accountTotal.hasRecords) {
    totalsCard.appendChild(el("div","empty","積立実績はありません。"));
  } else {
    appendAccountMetric(
      totalsCard,
      "累積積立額",
      formatYen(accountTotal.cumulativeAmount)
    );
    appendAccountMetric(
      totalsCard,
      "現金累計",
      formatYen(accountTotal.cashTotal)
    );
    appendAccountMetric(
      totalsCard,
      "ポイント累計",
      formatYen(accountTotal.pointTotal)
    );
  }

  const latest = getLatestSnapshot(appData,account.id);
  const financialCard = el("div","card");
  financialCard.appendChild(el("h4","","現在の金融状況"));

  appendAccountMetric(
    financialCard,
    "有効元本",
    latest ? formatYen(latest.effectivePrincipal) : "未入力"
  );
  appendAccountMetric(
    financialCard,
    "評価額",
    latest ? formatYen(latest.value) : "未入力"
  );
  appendAccountMetric(
    financialCard,
    "評価損益",
    latest ? formatSignedYen(latest.pnl) : "未入力"
  );
  appendAccountMetric(
    financialCard,
    "累積確定損益",
    latest ? formatSignedYen(latest.realizedPnlTotal) : "未入力"
  );

  section.append(totalsCard,financialCard);

  const unitRows = summary.units.filter(item =>
    item.accountId === account.id
  );

  const unitCard = el("div","card");
  unitCard.appendChild(el("h4","","積立単位別の状況"));

  if (!unitRows.length) {
    unitCard.appendChild(el("div","empty","積立予定・実績はありません。"));
  }

  for (const unit of unitRows) {
    const row = el("div","contribution-unit");
    const titleText = unit.productName
      ? unit.productName + "／" + unit.wrapper
      : "口座全体";
    row.appendChild(el("strong","",titleText));

    appendAccountMetric(
      row,
      "入力期間",
      unit.inputFromMonth
        ? unit.inputFromMonth + " ～ " + unit.inputToMonth
        : "実績なし"
    );
    appendAccountMetric(
      row,
      "未入力月数",
      String(unit.missingMonthCount) + "か月"
    );
    appendAccountMetric(
      row,
      "今月の状態",
      unit.currentMonthStatus
    );

    const plan = unit.currentPlan;
    appendAccountMetric(
      row,
      "現在の積立予定",
      !plan
        ? "予定なし"
        : plan.status === "停止"
          ? "停止"
          : formatYen(
              getContributionPlanAmounts(plan).total
            )
    );

    unitCard.appendChild(row);
  }

  section.appendChild(unitCard);

  const monthlyCard = el("div","card");
  monthlyCard.appendChild(el("h4","","月別実績・予定"));

  const rows = summary.monthlyRows.filter(item =>
    item.accountId === account.id
  );

  if (!rows.length) {
    monthlyCard.appendChild(el("div","empty","月別データはありません。"));
  }

  for (const item of rows) {
    const row = el("div","contribution-month-row");
    const name = item.productName
      ? item.productName + "／" + item.wrapper
      : "口座全体";

    const monthLabel = item.type === "period"
      ? item.fromMonth + " ～ " + item.toMonth
      : item.month;

    row.appendChild(el("strong","",monthLabel + "　" + name));
    row.appendChild(el("div","", "状態：" + item.status));

    if (item.type === "period") {
      row.appendChild(el(
        "div",
        "",
        "実績合計：" + formatYen(item.totalAmount)
      ));
    } else {
      row.appendChild(el(
        "div",
        "",
        "予定：" + formatYen(item.plannedTotal)
      ));
      row.appendChild(el(
        "div",
        "",
        "実績：" + formatYen(item.actualTotal)
      ));
    }

    if (item.contributionId) {
      const record = appData.contributions.find(recordItem =>
        recordItem.id === item.contributionId
      );

      if (record) {
        const edit = makeButton(
          "訂正",
          "contribution-edit",
          "secondary small"
        );
        edit.addEventListener("click",() => {
          app.replaceChildren();
          app.appendChild(renderContributionRecordForm(
            account,
            record,
            storage
          ));
        });
        row.appendChild(edit);
      }
    }

    monthlyCard.appendChild(row);
  }

  section.appendChild(monthlyCard);

  const recordActions = el("div","form-actions");
  const addMonth = makeButton(
    "月次実績を入力",
    "contribution-new-month",
    "primary"
  );
  addMonth.addEventListener("click",() => {
    app.replaceChildren();
    app.appendChild(renderContributionRecordForm(account,null,storage));
  });

  const addPeriod = makeButton(
    "期間まとめを入力",
    "contribution-new-period",
    "secondary"
  );
  addPeriod.addEventListener("click",() => {
    app.replaceChildren();
    app.appendChild(renderContributionPeriodForm(account,storage));
  });

  recordActions.append(addMonth,addPeriod);
  section.appendChild(recordActions);

  const planCard = el("div","card");
  planCard.appendChild(el("h4","","積立予定の管理"));

  const plans = appData.contributionPlans.filter(item =>
    item.accountId === account.id
  ).sort((a,b) =>
    b.effectiveFrom.localeCompare(a.effectiveFrom)
  );

  if (!plans.length) {
    planCard.appendChild(el("div","empty","積立予定はありません。"));
  }

  for (const plan of plans) {
    const row = el("div","contribution-plan-row");
    row.appendChild(el(
      "strong",
      "",
      (plan.productName || "口座全体") +
        "／" + (plan.wrapper || "区分なし")
    ));
    row.appendChild(el(
      "div",
      "",
      plan.effectiveFrom + " ～ " + plan.status
    ));

    if (plan.status === "積立中") {
      const amounts = getContributionPlanAmounts(plan);
      row.appendChild(el(
        "div",
        "",
        "予定：" + formatYen(amounts.total)
      ));
    }

    const edit = makeButton(
      "訂正",
      "contribution-plan-edit",
      "secondary small"
    );
    edit.addEventListener("click",() => {
      app.replaceChildren();
      app.appendChild(renderContributionPlanForm(
        account,
        plan,
        storage
      ));
    });
    row.appendChild(edit);
    planCard.appendChild(row);
  }

  const addPlan = makeButton(
    "積立予定を登録",
    "contribution-plan-new",
    "secondary"
  );
  addPlan.addEventListener("click",() => {
    app.replaceChildren();
    app.appendChild(renderContributionPlanForm(account,null,storage));
  });
  planCard.appendChild(addPlan);

  section.appendChild(planCard);
  return section;
}
