"use strict";

/* ---------- S13c 積立実績画面 ---------- */

function getContributionAccountTotalForUi(data,accountId) {
  const result = calculateContributionSummary(
    data,
    localDateString().slice(0,7)
  );
  return result.accountTotals.find(item =>
    item.accountId === accountId
  ) || null;
}

function getContributionUnitLabel(productName,wrapper) {
  if (productName === null) return "口座全体";
  return productName + "（" + wrapper + "）";
}

function getContributionMonthLabel(month) {
  return month ? month.replace("-","年") + "月" : "未入力";
}

function appendContributionMetric(container,label,value,subText = "") {
  const row = el("div","account-metric-line");
  row.appendChild(el("div","account-metric-label",label));
  const valueBox = el("div","account-metric-value");
  valueBox.appendChild(el("div","",value));
  if (subText) {
    valueBox.appendChild(el("div","account-metric-sub",subText));
  }
  row.appendChild(valueBox);
  container.appendChild(row);
}

function getContributionProductsForAccount(data,accountId) {
  const names = new Set();

  for (const item of data.holdings || []) {
    if (item.accountId === accountId && item.name) {
      names.add(item.name);
    }
  }
  for (const item of data.contributions || []) {
    if (item.accountId === accountId && item.productName) {
      names.add(item.productName);
    }
  }
  for (const item of data.contributionPlans || []) {
    if (item.accountId === accountId && item.productName) {
      names.add(item.productName);
    }
  }

  return Array.from(names).sort((a,b) => a.localeCompare(b,"ja"));
}

function appendContributionProductFields(
  form,
  accountId,
  initialProductName,
  initialWrapper,
  prefix
) {
  const products = getContributionProductsForAccount(appData,accountId);
  const productField = el("div","field");
  productField.appendChild(el("label","", "商品"));
  const productSelect = document.createElement("select");
  productSelect.name = prefix + "Product";
  const choices = [
    {value:"__account__",label:"口座全体"},
    ...products.map(name => ({value:name,label:name})),
    {value:"__other__",label:"その他（入力）"}
  ];

  for (const choice of choices) {
    const option = document.createElement("option");
    option.value = choice.value;
    option.textContent = choice.label;
    productSelect.appendChild(option);
  }

  const selected = initialProductName === null
    ? "__account__"
    : products.includes(initialProductName)
      ? initialProductName
      : "__other__";
  productSelect.value = selected;
  productField.appendChild(productSelect);
  form.appendChild(productField);

  const otherField = makeField(
    "商品名（その他）",
    prefix + "OtherProduct",
    selected === "__other__" ? initialProductName : "",
    {type:"text"}
  );
  otherField.hidden = selected !== "__other__";
  form.appendChild(otherField);

  const wrapperField = makeSelectField(
    "口座区分",
    prefix + "Wrapper",
    HOLDING_WRAPPERS.map(value => ({value,label:value})),
    initialWrapper || HOLDING_WRAPPERS[0]
  );
  wrapperField.hidden = selected === "__account__";
  form.appendChild(wrapperField);

  productSelect.addEventListener("change",() => {
    otherField.hidden = productSelect.value !== "__other__";
    wrapperField.hidden = productSelect.value === "__account__";
  });

  return {
    getUnit() {
      if (productSelect.value === "__account__") {
        return {productName:null,wrapper:null};
      }
      const productName = productSelect.value === "__other__"
        ? otherField.querySelector("input").value.trim()
        : productSelect.value;
      if (!productName) {
        throw new Error("商品名を入力してください。");
      }
      return {
        productName,
        wrapper:wrapperField.querySelector("select").value
      };
    }
  };
}

function getContributionPreviousRecord(data,accountId,productName,wrapper,month) {
  return (data.contributions || [])
    .filter(item =>
      item.accountId === accountId &&
      item.productName === productName &&
      item.wrapper === wrapper &&
      item.toMonth < month
    )
    .sort((a,b) =>
      b.toMonth.localeCompare(a.toMonth) ||
      String(b.recordedAt || "").localeCompare(String(a.recordedAt || ""))
    )[0] || null;
}

function appendContributionPreviousValue(
  form,
  input,
  getPrevious,
  label
) {
  const row = el("div","previous-value-row");
  const hint = el("span","previous-value-text");
  const apply = makeButton("反映","contribution-previous","secondary small");
  const update = () => {
    const previous = getPrevious();
    if (!previous) {
      hint.textContent = "前回値：なし";
      apply.disabled = true;
      return;
    }
    hint.textContent = label(previous);
    apply.disabled = false;
    apply.dataset.value = String(previous.value);
  };
  apply.addEventListener("click",() => {
    if (apply.disabled) return;
    input.value = apply.dataset.value;
    input.dispatchEvent(new Event("input",{bubbles:true}));
  });
  row.append(hint,apply);
  form.appendChild(row);
  update();
  return update;
}

function appendContributionAmountField(
  form,
  label,
  name,
  value,
  previousValue
) {
  const wrapper = makeNumericField(label,name,value,{});
  form.appendChild(wrapper);
  const input = wrapper.querySelector("input");
  if (previousValue) {
    appendContributionPreviousValue(
      wrapper,
      input,
      previousValue.get,
      previousValue.label
    );
  }
  return input;
}

function saveContributionFromUi(
  accountId,
  record,
  editingId,
  storage = localStorage
) {
  const now = new Date().toISOString();
  const saved = saveStockTrackingData("contribution",data => {
    const next = {
      ...record,
      id:editingId || createId(),
      accountId,
      recordedAt:editingId
        ? data.contributions.find(item => item.id === editingId).recordedAt
        : now,
      createdAt:editingId
        ? data.contributions.find(item => item.id === editingId).createdAt
        : now,
      updatedAt:editingId ? now : null
    };
    if (editingId) {
      const index = data.contributions.findIndex(item =>
        item.id === editingId
      );
      if (index < 0) throw new Error("訂正する積立実績が見つかりません。");
      data.contributions[index] = {
        ...data.contributions[index],
        ...next
      };
    } else {
      data.contributions.push(next);
    }
  },storage);
  return saved;
}

function saveContributionPlanFromUi(
  accountId,
  plan,
  editingId,
  storage = localStorage
) {
  const now = new Date().toISOString();
  return saveStockTrackingData("contribution",data => {
    const next = {
      ...plan,
      id:editingId || createId(),
      accountId,
      createdAt:editingId
        ? data.contributionPlans.find(item => item.id === editingId).createdAt
        : now,
      updatedAt:editingId ? now : null
    };
    if (editingId) {
      const index = data.contributionPlans.findIndex(item =>
        item.id === editingId
      );
      if (index < 0) throw new Error("訂正する積立予定が見つかりません。");
      data.contributionPlans[index] = {
        ...data.contributionPlans[index],
        ...next
      };
    } else {
      data.contributionPlans.push(next);
    }
  },storage);
}

function deleteContributionFromUi(id,storage = localStorage) {
  return saveStockTrackingData("contribution",data => {
    const index = data.contributions.findIndex(item => item.id === id);
    if (index < 0) throw new Error("削除する積立実績が見つかりません。");
    data.contributions.splice(index,1);
  },storage);
}

function deleteContributionPlanFromUi(id,storage = localStorage) {
  return saveStockTrackingData("contribution",data => {
    const index = data.contributionPlans.findIndex(item => item.id === id);
    if (index < 0) throw new Error("削除する積立予定が見つかりません。");
    data.contributionPlans.splice(index,1);
  },storage);
}

function renderContributionRecordForm(account,record = null,storage = localStorage) {
  const form = document.createElement("form");
  form.className = "contribution-form";
  form.appendChild(el("h4","",record ? "積立実績の訂正" : "積立実績の入力"));

  const monthField = makeField(
    "対象月",
    "contributionMonth",
    record ? record.fromMonth : localDateString().slice(0,7),
    {type:"month",required:true}
  );
  form.appendChild(monthField);

  const product = appendContributionProductFields(
    form,
    account.id,
    record ? record.productName : null,
    record ? record.wrapper : null,
    "contribution"
  );

  const statusField = makeSelectField(
    "状態",
    "contributionStatus",
    [
      {value:"実行",label:"実行"},
      {value:"未実行",label:"未実行"}
    ],
    record ? record.status : "実行"
  );
  form.appendChild(statusField);

  const cashInput = appendContributionAmountField(
    form,
    "現金分（円）",
    "contributionCash",
    record ? record.cashAmount : "",
    record ? {
      get:() => {
        const unit = product.getUnit();
        return getContributionPreviousRecord(
          appData,account.id,unit.productName,unit.wrapper,
          monthField.querySelector("input").value
        ) ? {
          value:getContributionPreviousRecord(
            appData,account.id,unit.productName,unit.wrapper,
            monthField.querySelector("input").value
          ).cashAmount
        } : null;
      },
      label:item => "前回（" + item.toMonth + "）： " +
        formatInputNumber(item.cashAmount)
    } : null
  );

  const pointInput = appendContributionAmountField(
    form,
    "ポイント分（円）",
    "contributionPoint",
    record ? record.pointAmount : "0",
    record ? {
      get:() => {
        const unit = product.getUnit();
        const previous = getContributionPreviousRecord(
          appData,account.id,unit.productName,unit.wrapper,
          monthField.querySelector("input").value
        );
        return previous ? {value:previous.pointAmount} : null;
      },
      label:item => "前回（" + item.toMonth + "）： " +
        formatInputNumber(item.pointAmount)
    } : null
  );

  const memoField = makeField(
    "メモ",
    "contributionMemo",
    record ? record.memo : "",
    {type:"text"}
  );
  form.appendChild(memoField);

  const planHint = el("div","previous-value-row");
  const planText = el("span","previous-value-text");
  const applyPlan = makeButton("予定額を反映","contribution-plan-apply","secondary small");
  planHint.append(planText,applyPlan);
  form.appendChild(planHint);

  function updatePlanHint() {
    try {
      const unit = product.getUnit();
      const month = monthField.querySelector("input").value;
      const plan = getContributionPlanForMonth(
        appData.contributionPlans,
        account.id,
        unit.productName,
        unit.wrapper,
        month
      );
      const amounts = getContributionPlanAmounts(plan);
      if (!plan || plan.status !== "積立中") {
        planText.textContent = "予定額：なし";
        applyPlan.disabled = true;
        return;
      }
      planText.textContent = "予定額：" +
        formatYen(amounts.total);
      applyPlan.disabled = false;
      applyPlan.onclick = () => {
        cashInput.value = String(amounts.cash);
        pointInput.value = String(amounts.point);
        cashInput.dispatchEvent(new Event("input",{bubbles:true}));
        pointInput.dispatchEvent(new Event("input",{bubbles:true}));
      };
    } catch (error) {
      planText.textContent = "予定額：確認できません";
      applyPlan.disabled = true;
    }
  }
  monthField.querySelector("input").addEventListener("change",updatePlanHint);
  productFieldUpdateContribution(form,product,updatePlanHint);
  updatePlanHint();

  statusField.querySelector("select").addEventListener("change",() => {
    const notExecuted = statusField.querySelector("select").value === "未実行";
    cashInput.disabled = notExecuted;
    pointInput.disabled = notExecuted;
    if (notExecuted) {
      cashInput.value = "0";
      pointInput.value = "0";
    }
  });

  const buttons = el("div","contribution-form-actions");
  const save = makeButton(record ? "訂正を保存" : "実績を保存","contribution-save","primary");
  save.type = "submit";
  buttons.appendChild(save);
  if (record) {
    const remove = makeButton("削除","contribution-delete","danger");
    remove.addEventListener("click",() => {
      if (!confirm("この積立実績を削除しますか？削除すると、その月は未入力に戻ります。")) return;
      try {
        appData = deleteContributionFromUi(record.id,storage);
        showMessage("積立実績を削除しました。");
        render();
      } catch (error) {
        showMessage(error.message || "削除できませんでした。",true);
        render();
      }
    });
    buttons.appendChild(remove);
  }
  form.appendChild(buttons);

  form.addEventListener("submit",event => {
    event.preventDefault();
    try {
      const unit = product.getUnit();
      const month = monthField.querySelector("input").value;
      const status = statusField.querySelector("select").value;
      const cashAmount = status === "未実行"
        ? 0
        : toNumberOrNull(cashInput.value);
      const pointAmount = status === "未実行"
        ? 0
        : toNumberOrNull(pointInput.value);
      if (!isValidContributionMonth(month)) {
        throw new Error("対象月を正しく入力してください。");
      }
      if (cashAmount === null || pointAmount === null) {
        throw new Error("現金分・ポイント分を数値で入力してください。");
      }
      const candidate = {
        accountId:account.id,
        ...unit,
        fromMonth:month,
        toMonth:month,
        status,
        cashAmount,
        pointAmount,
        memo:memoField.querySelector("input").value
      };
      const overlaps = findContributionMonthOverlaps([
        ...appData.contributions.filter(item => item.id !== (record && record.id)),
        {...candidate,id:record ? record.id : "__new__"}
      ]);
      if (overlaps.length) {
        const overlap = overlaps[0];
        throw new Error(
          "同じ単位の積立実績が重複しています：" +
          overlap.fromMonth + "〜" + overlap.toMonth
        );
      }
      if (!confirm(record ? "積立実績を訂正しますか？" : "積立実績を保存しますか？")) return;
      appData = saveContributionFromUi(
        account.id,candidate,record ? record.id : null,storage
      );
      showMessage("積立実績を保存しました。");
      render();
    } catch (error) {
      showMessage(error.message || "積立実績を保存できませんでした。",true);
      render();
    }
  });

  return form;
}

function productFieldUpdateContribution(form,product,callback) {
  const select = form.querySelector('select[name="contributionProduct"]');
  if (select) select.addEventListener("change",callback);
}

function renderContributionPeriodForm(account,storage = localStorage) {
  const form = document.createElement("form");
  form.className = "contribution-form";
  form.appendChild(el("h4","","期間まとめの入力"));

  const product = appendContributionProductFields(
    form,account.id,null,null,"period"
  );
  form.appendChild(makeField(
    "開始月","periodFromMonth",localDateString().slice(0,7),
    {type:"month",required:true}
  ));
  form.appendChild(makeField(
    "終了月","periodToMonth",localDateString().slice(0,7),
    {type:"month",required:true}
  ));
  const cash = makeNumericField("現金分（円）","periodCash","",{});
  const point = makeNumericField("ポイント分（円）","periodPoint","0",{});
  form.append(cash,point);
  form.appendChild(makeField("メモ","periodMemo","",{type:"text"}));

  const overlapText = el("div","error hidden");
  form.appendChild(overlapText);

  const save = makeButton("期間まとめを保存","period-save","primary");
  save.type = "submit";
  form.appendChild(save);

  form.addEventListener("submit",event => {
    event.preventDefault();
    try {
      const unit = product.getUnit();
      const fromMonth = form.elements.namedItem("periodFromMonth").value;
      const toMonth = form.elements.namedItem("periodToMonth").value;
      const cashAmount = toNumberOrNull(cash.querySelector("input").value);
      const pointAmount = toNumberOrNull(point.querySelector("input").value);
      if (!isValidContributionMonth(fromMonth) ||
          !isValidContributionMonth(toMonth) ||
          toMonth < fromMonth) {
        throw new Error("開始月・終了月の範囲が正しくありません。");
      }
      if (cashAmount === null || pointAmount === null) {
        throw new Error("現金分・ポイント分を数値で入力してください。");
      }
      const candidate = {
        id:"__new__",
        accountId:account.id,
        ...unit,
        fromMonth,
        toMonth,
        status:"実行",
        cashAmount,
        pointAmount,
        memo:form.elements.namedItem("periodMemo").value
      };
      const overlaps = findContributionMonthOverlaps([
        ...appData.contributions,
        candidate
      ]);
      if (overlaps.length) {
        const labels = overlaps.map(item =>
          item.fromMonth + "〜" + item.toMonth
        ).join("、");
        overlapText.textContent = "重複する月があります：" + labels;
        overlapText.classList.remove("hidden");
        return;
      }
      if (!confirm("期間まとめを保存しますか？")) return;
      appData = saveContributionFromUi(
        account.id,candidate,null,storage
      );
      showMessage("期間まとめを保存しました。");
      render();
    } catch (error) {
      overlapText.textContent = error.message || "保存できませんでした。";
      overlapText.classList.remove("hidden");
    }
  });
  return form;
}

function renderContributionPlanForm(account,plan = null,storage = localStorage) {
  const form = document.createElement("form");
  form.className = "contribution-form";
  form.appendChild(el("h4","",plan ? "積立予定の訂正" : "積立予定の登録"));

  const product = appendContributionProductFields(
    form,
    account.id,
    plan ? plan.productName : null,
    plan ? plan.wrapper : null,
    "plan"
  );
  form.appendChild(makeField(
    "適用開始月","planEffectiveFrom",
    plan ? plan.effectiveFrom : localDateString().slice(0,7),
    {type:"month",required:true}
  ));
  const statusField = makeSelectField(
    "状態","planStatus",
    [
      {value:"積立中",label:"積立中"},
      {value:"停止",label:"停止"}
    ],
    plan ? plan.status : "積立中"
  );
  form.appendChild(statusField);
  const cash = makeNumericField(
    "予定の現金分（円）","planCash",
    plan && plan.plannedCash !== null ? plan.plannedCash : "",
    {}
  );
  const point = makeNumericField(
    "予定のポイント分（円）","planPoint",
    plan && plan.plannedPoint !== null ? plan.plannedPoint : "0",
    {}
  );
  form.append(cash,point);
  form.appendChild(makeField(
    "メモ","planMemo",plan ? plan.memo : "",{type:"text"}
  ));

  statusField.querySelector("select").addEventListener("change",() => {
    const stopped = statusField.querySelector("select").value === "停止";
    cash.querySelector("input").disabled = stopped;
    point.querySelector("input").disabled = stopped;
    if (stopped) {
      cash.querySelector("input").value = "";
      point.querySelector("input").value = "0";
    }
  });

  const actions = el("div","contribution-form-actions");
  const save = makeButton(plan ? "予定を訂正" : "予定を登録","plan-save","primary");
  save.type = "submit";
  actions.appendChild(save);
  if (plan) {
    const remove = makeButton("予定を削除","plan-delete","danger");
    remove.addEventListener("click",() => {
      if (!confirm("この積立予定を削除しますか？")) return;
      try {
        appData = deleteContributionPlanFromUi(plan.id,storage);
        showMessage("積立予定を削除しました。");
        render();
      } catch (error) {
        showMessage(error.message || "予定を削除できませんでした。",true);
        render();
      }
    });
    actions.appendChild(remove);
  }
  form.appendChild(actions);

  form.addEventListener("submit",event => {
    event.preventDefault();
    try {
      const unit = product.getUnit();
      const status = statusField.querySelector("select").value;
      const plannedCash = status === "停止"
        ? null
        : toNumberOrNull(cash.querySelector("input").value);
      const plannedPoint = status === "停止"
        ? 0
        : toNumberOrNull(point.querySelector("input").value);
      if (!isValidContributionMonth(
        form.elements.namedItem("planEffectiveFrom").value
      )) {
        throw new Error("適用開始月を正しく入力してください。");
      }
      if (status === "積立中" &&
          (plannedCash === null || plannedPoint === null)) {
        throw new Error("予定の現金分・ポイント分を入力してください。");
      }
      const candidate = {
        accountId:account.id,
        ...unit,
        effectiveFrom:form.elements.namedItem("planEffectiveFrom").value,
        status,
        plannedCash,
        plannedPoint,
        memo:form.elements.namedItem("planMemo").value
      };
      if (!confirm(plan ? "積立予定を訂正しますか？" : "積立予定を登録しますか？")) return;
      saveContributionPlanFromUi(
        account.id,candidate,plan ? plan.id : null,storage
      );
      appData = JSON.parse(storage.getItem(STORAGE_KEY));
      showMessage("積立予定を保存しました。");
      render();
    } catch (error) {
      showMessage(error.message || "積立予定を保存できませんでした。",true);
      render();
    }
  });
  return form;
}

function renderContributionSection(account,storage = localStorage) {
  if (!account || account.category !== "stock") return null;

  const section = el("section","card contribution-section");
  section.appendChild(el("h3","","積立実績"));

  const result = calculateContributionSummary(
    appData,
    localDateString().slice(0,7)
  );
  const accountTotal = result.accountTotals.find(item =>
    item.accountId === account.id
  ) || null;
  const units = result.units.filter(item =>
    item.accountId === account.id
  );
  const latest = getLatestSnapshot(appData,account.id);

  appendContributionMetric(
    section,
    "累積積立額",
    accountTotal && accountTotal.hasRecords
      ? formatYen(accountTotal.cumulativeAmount)
      : "未入力"
  );
  appendContributionMetric(
    section,
    "現金累計",
    accountTotal && accountTotal.hasRecords
      ? formatYen(accountTotal.cashTotal)
      : "未入力"
  );
  appendContributionMetric(
    section,
    "ポイント累計",
    accountTotal && accountTotal.hasRecords
      ? formatYen(accountTotal.pointTotal)
      : "未入力"
  );
  appendContributionMetric(
    section,
    "入力済み期間",
    accountTotal && accountTotal.hasRecords
      ? units.map(item => item.inputFromMonth + "〜" +
          item.inputToMonth).join("、")
      : "未入力"
  );
  appendContributionMetric(
    section,
    "未入力月",
    units.length
      ? units.map(item =>
          getContributionUnitLabel(item.productName,item.wrapper) +
          "：" + item.missingMonthCount + "か月"
        ).join(" ／ ")
      : "未入力"
  );
  appendContributionMetric(
    section,
    "今月の状態",
    units.length
      ? units.map(item =>
          getContributionUnitLabel(item.productName,item.wrapper) +
          "：" + item.currentMonthStatus
        ).join(" ／ ")
      : "未入力"
  );
  appendContributionMetric(
    section,
    "現在の積立予定",
    units.map(item => {
      const amounts = getContributionPlanAmounts(item.currentPlan);
      return getContributionUnitLabel(item.productName,item.wrapper) +
        "：" + (amounts.total === null ? "予定なし" : formatYen(amounts.total));
    }).join(" ／ ") || "未登録"
  );

  section.appendChild(el(
    "div","help",
    "累積積立額は、売却しても減りません。"
  ));

  const currentCard = el("div","contribution-current-values");
  currentCard.appendChild(el("h4","","現在の資産状況"));
  const latestDate = latest
    ? "対象日：" + formatDateWithWeekday(latest.asOfDate)
    : "対象日：未入力";
  appendContributionMetric(
    currentCard,"有効元本",
    latest && latest.effectivePrincipal !== null
      ? formatYen(latest.effectivePrincipal) : "未入力",latestDate
  );
  appendContributionMetric(
    currentCard,"評価額",
    latest && latest.value !== null ? formatYen(latest.value) : "未入力",latestDate
  );
  appendContributionMetric(
    currentCard,"評価損益",
    latest && latest.pnl !== null ? formatSignedYen(latest.pnl) : "未入力",latestDate
  );
  appendContributionMetric(
    currentCard,"累積確定損益",
    latest && latest.realizedPnlTotal !== null
      ? formatSignedYen(latest.realizedPnlTotal) : "未入力",latestDate
  );
  section.appendChild(currentCard);

  section.appendChild(el("h4","","月別一覧"));
  const rows = result.monthlyRows.filter(item =>
    item.accountId === account.id
  );
  if (!rows.length) {
    section.appendChild(el("div","empty","積立実績はまだありません。"));
  } else {
    const list = el("div","contribution-month-list");
    for (const item of rows) {
      const row = el("div","contribution-month-row");
      const title = item.type === "period"
        ? item.fromMonth + "〜" + item.toMonth + "（期間まとめ）"
        : item.month;
      row.appendChild(el("div","contribution-month-title",title));
      row.appendChild(el(
        "div","contribution-month-unit",
        getContributionUnitLabel(item.productName,item.wrapper)
      ));
      if (item.type === "period") {
        row.appendChild(el(
          "div","contribution-month-amount",
          "期間合計：" + formatYen(item.cashAmount) +
          "（現金）／" + formatYen(item.pointAmount) + "（ポイント）"
        ));
        row.appendChild(el("span","contribution-period-badge","期間まとめ"));
      } else {
        row.appendChild(el(
          "div","contribution-month-plan",
          "予定：" + (item.plannedTotal === null
            ? "なし"
            : formatYen(item.plannedTotal))
        ));
        row.appendChild(el(
          "div","contribution-month-amount",
          "実績：" + (item.actualTotal === null
            ? "未入力"
            : formatYen(item.actualTotal)) +
          "（現金 " + (item.actualCash === null
            ? "未入力" : formatYen(item.actualCash)) +
          " ／ ポイント " + (item.actualPoint === null
            ? "未入力" : formatYen(item.actualPoint)) + "）"
        ));
      }
      row.appendChild(el("span","contribution-status",item.status));
      if (item.contributionId) {
        const record = appData.contributions.find(entry =>
          entry.id === item.contributionId
        );
        if (record) {
          const edit = makeButton("訂正・削除","contribution-edit","secondary small");
          edit.addEventListener("click",() => {
            const editor = renderContributionRecordForm(account,record,storage);
            row.after(editor);
            edit.disabled = true;
          });
          row.appendChild(edit);
        }
      }
      list.appendChild(row);
    }
    section.appendChild(list);
  }

  const inputDetails = document.createElement("details");
  inputDetails.className = "contribution-details";
  inputDetails.appendChild(el("summary","","積立実績を入力"));
  const monthForm = renderContributionRecordForm(account,null,storage);
  inputDetails.appendChild(monthForm);
  inputDetails.appendChild(renderContributionPeriodForm(account,storage));
  section.appendChild(inputDetails);

  const planDetails = document.createElement("details");
  planDetails.className = "contribution-details";
  planDetails.appendChild(el("summary","","積立予定を登録・訂正・削除"));
  planDetails.appendChild(renderContributionPlanForm(account,null,storage));
  const plans = appData.contributionPlans.filter(item =>
    item.accountId === account.id
  ).sort((a,b) =>
    b.effectiveFrom.localeCompare(a.effectiveFrom)
  );
  for (const plan of plans) {
    const row = el("div","contribution-plan-row");
    row.appendChild(el(
      "div","contribution-month-title",
      plan.effectiveFrom + "〜 " + plan.status
    ));
    row.appendChild(el(
      "div","contribution-month-unit",
      getContributionUnitLabel(plan.productName,plan.wrapper)
    ));
    const amounts = getContributionPlanAmounts(plan);
    row.appendChild(el(
      "div","contribution-month-amount",
      amounts.total === null ? "予定なし" : formatYen(amounts.total)
    ));
    const edit = makeButton("訂正・削除","plan-edit","secondary small");
    edit.addEventListener("click",() => {
      row.after(renderContributionPlanForm(account,plan,storage));
      edit.disabled = true;
    });
    row.appendChild(edit);
    planDetails.appendChild(row);
  }
  section.appendChild(planDetails);

  return section;
}
