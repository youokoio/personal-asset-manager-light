"use strict";

/* ---------- 積立実績画面 ---------- */


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
  const displayYen = value =>
    value === null || value === undefined
      ? "未入力"
      : formatYen(value);
  const displaySignedYen = value =>
    value === null || value === undefined
      ? "未入力"
      : formatSignedYen(value);
  const financialCard = el("div","card");
  financialCard.appendChild(el("h4","","現在の金融状況"));

  appendAccountMetric(
    financialCard,
    "対象日",
    latest && latest.asOfDate
      ? formatDateWithWeekday(latest.asOfDate)
      : "未入力"
  );
  appendAccountMetric(
    financialCard,
    "有効元本",
    latest ? displayYen(latest.effectivePrincipal) : "未入力"
  );
  appendAccountMetric(
    financialCard,
    "評価額",
    latest ? displayYen(latest.value) : "未入力"
  );
  appendAccountMetric(
    financialCard,
    "評価損益",
    latest ? displaySignedYen(latest.pnl) : "未入力"
  );
  appendAccountMetric(
    financialCard,
    "累積確定損益",
    latest ? displaySignedYen(latest.realizedPnlTotal) : "未入力"
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
      "停止中の月数",
      String(unit.stoppedMonthCount) + "か月"
    );
    appendAccountMetric(
      row,
      "今月の状態",
      unit.currentMonthStatus
    );

    const plan = unit.currentPlan;
    const planAmounts = getContributionPlanAmounts(plan);
    appendAccountMetric(
      row,
      "現在の積立予定",
      !plan
        ? "予定なし"
        : plan.status === "停止"
          ? "停止"
          : "現金 " + displayYen(planAmounts.cash) +
            "／ポイント " + displayYen(planAmounts.point)
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

    if (item.type === "period") {
      const monthLabel = item.fromMonth + " ～ " + item.toMonth;
      row.appendChild(el("strong","",monthLabel + "　" + name));
      row.appendChild(el(
        "span",
        "contribution-period-badge",
        "期間まとめ"
      ));
      row.appendChild(el(
        "div",
        "contribution-month-detail",
        "現金合計：" + displayYen(item.cashAmount) +
          "／ポイント合計：" + displayYen(item.pointAmount)
      ));
    } else {
      row.appendChild(el(
        "strong",
        "",
        item.month + "　" + name + "　［" + item.status + "］"
      ));

      const actualText = item.status === "実行"
        ? "現金 " + displayYen(item.actualCash) +
          "／ポイント " + displayYen(item.actualPoint)
        : item.status;

      row.appendChild(el(
        "div",
        "contribution-month-detail",
        "予定：現金 " + displayYen(item.plannedCash) +
          "／ポイント " + displayYen(item.plannedPoint) +
          "　実績：" + actualText
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
