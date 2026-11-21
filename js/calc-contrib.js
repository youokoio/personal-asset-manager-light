"use strict";

/* ---------- 積立実績の計算 ---------- */

function isValidContributionMonth(value) {
  return typeof value === "string" &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
    Number(value.slice(0,4)) > 0;
}

function getContributionMonthNumber(value) {
  if (!isValidContributionMonth(value)) {
    throw new Error("積立対象月の形式が正しくありません。");
  }

  const parts = value.split("-").map(Number);
  return parts[0] * 12 + parts[1] - 1;
}

function formatContributionMonthNumber(value) {
  const year = Math.floor(value / 12);
  const month = value % 12 + 1;
  return String(year).padStart(4,"0") + "-" +
    String(month).padStart(2,"0");
}

function normalizeContributionProductName(value) {
  if (value === null) return null;

  if (typeof value !== "string" || !value.trim()) {
    throw new Error("積立の商品名が正しくありません。");
  }

  return value.trim();
}

function getContributionUnitKey(record) {
  if (!record || typeof record.accountId !== "string" ||
      !record.accountId) {
    throw new Error("積立の口座IDが正しくありません。");
  }

  const productName =
    normalizeContributionProductName(record.productName);

  if (productName === null) {
    if (record.wrapper !== null) {
      throw new Error(
        "口座全体の積立記録ではwrapperをnullにしてください。"
      );
    }
  } else if (!HOLDING_WRAPPERS.includes(record.wrapper)) {
    throw new Error(
      "商品別の積立記録ではwrapperを正しく指定してください。"
    );
  }

  return JSON.stringify([
    record.accountId,
    productName,
    productName === null ? null : record.wrapper
  ]);
}

function normalizeContributionRecord(record) {
  if (!record || typeof record !== "object") {
    throw new Error("積立実績の記録が正しくありません。");
  }

  const productName =
    normalizeContributionProductName(record.productName);

  if (productName === null && record.wrapper !== null) {
    throw new Error(
      "口座全体の積立記録ではwrapperをnullにしてください。"
    );
  }

  if (productName !== null &&
      !HOLDING_WRAPPERS.includes(record.wrapper)) {
    throw new Error(
      "商品別の積立記録ではwrapperを正しく指定してください。"
    );
  }

  if (!isValidContributionMonth(record.fromMonth) ||
      !isValidContributionMonth(record.toMonth) ||
      record.toMonth < record.fromMonth) {
    throw new Error("積立実績の月の範囲が正しくありません。");
  }

  if (!["実行","未実行"].includes(record.status)) {
    throw new Error("積立実績の状態が正しくありません。");
  }

  for (const field of ["cashAmount","pointAmount"]) {
    if (typeof record[field] !== "number" ||
        !Number.isFinite(record[field]) ||
        record[field] < 0) {
      throw new Error("積立実績の金額が正しくありません。");
    }
  }

  return {
    ...record,
    productName,
    wrapper:productName === null ? null : record.wrapper
  };
}

function normalizeContributionPlan(plan) {
  if (!plan || typeof plan !== "object") {
    throw new Error("積立予定の記録が正しくありません。");
  }

  const productName =
    normalizeContributionProductName(plan.productName);

  if (productName === null && plan.wrapper !== null) {
    throw new Error(
      "口座全体の積立予定ではwrapperをnullにしてください。"
    );
  }

  if (productName !== null &&
      !HOLDING_WRAPPERS.includes(plan.wrapper)) {
    throw new Error(
      "商品別の積立予定ではwrapperを正しく指定してください。"
    );
  }

  if (typeof plan.accountId !== "string" ||
      !plan.accountId ||
      !isValidContributionMonth(plan.effectiveFrom) ||
      !["積立中","停止"].includes(plan.status)) {
    throw new Error("積立予定の内容が正しくありません。");
  }

  if (plan.status === "積立中" &&
      (typeof plan.plannedCash !== "number" ||
       !Number.isFinite(plan.plannedCash) ||
       plan.plannedCash < 0)) {
    throw new Error("積立予定の現金分が正しくありません。");
  }

  if (plan.plannedPoint !== null &&
      plan.plannedPoint !== undefined &&
      (typeof plan.plannedPoint !== "number" ||
       !Number.isFinite(plan.plannedPoint) ||
       plan.plannedPoint < 0)) {
    throw new Error("積立予定のポイント分が正しくありません。");
  }

  return {
    ...plan,
    productName,
    wrapper:productName === null ? null : plan.wrapper
  };
}

function getContributionPlanForMonth(
  plans,
  accountId,
  productName,
  wrapper,
  month
) {
  if (!Array.isArray(plans)) {
    throw new Error("積立予定の一覧が正しくありません。");
  }

  if (!isValidContributionMonth(month)) {
    throw new Error("予定を取得する月が正しくありません。");
  }

  const target = {
    accountId,
    productName,
    wrapper
  };
  const targetKey = getContributionUnitKey(target);

  const applicable = plans
    .map(normalizeContributionPlan)
    .filter(plan =>
      getContributionUnitKey(plan) === targetKey &&
      plan.effectiveFrom <= month
    )
    .sort((a,b) =>
      b.effectiveFrom.localeCompare(a.effectiveFrom)
    );

  return applicable[0] || null;
}

function getContributionRecordForMonth(records,month) {
  return records.find(record =>
    record.fromMonth <= month &&
    record.toMonth >= month
  ) || null;
}

function getContributionPlanAmounts(plan) {
  if (!plan || plan.status !== "積立中") {
    return {
      cash:null,
      point:null,
      total:null
    };
  }

  const cash = plan.plannedCash;
  const point = plan.plannedPoint === null ||
    plan.plannedPoint === undefined
      ? 0
      : plan.plannedPoint;

  return {
    cash,
    point,
    total:cash + point
  };
}

function calculateContributionSummary(data,currentMonth) {
  if (!data || typeof data !== "object" ||
      !Array.isArray(data.accounts) ||
      !Array.isArray(data.contributions) ||
      !Array.isArray(data.contributionPlans)) {
    throw new Error("積立計算に必要なデータがありません。");
  }

  if (!isValidContributionMonth(currentMonth)) {
    throw new Error("今月の指定が正しくありません。");
  }

  const records = data.contributions.map(
    normalizeContributionRecord
  );
  const plans = data.contributionPlans.map(
    normalizeContributionPlan
  );

  const overlaps = findContributionMonthOverlaps(records);

  if (overlaps.length > 0) {
    throw new Error("積立実績の月の範囲が重複しています。");
  }

  const unitMap = new Map();

  function ensureUnit(record) {
    const key = getContributionUnitKey(record);

    if (!unitMap.has(key)) {
      unitMap.set(key,{
        key,
        accountId:record.accountId,
        productName:record.productName,
        wrapper:record.productName === null
          ? null
          : record.wrapper,
        records:[],
        plans:[]
      });
    }

    return unitMap.get(key);
  }

  for (const record of records) {
    ensureUnit(record).records.push(record);
  }

  for (const plan of plans) {
    ensureUnit(plan).plans.push(plan);
  }

  const units = [];
  const accountMap = new Map();

  for (const unit of unitMap.values()) {
    const unitRecords = unit.records.slice().sort((a,b) =>
      a.fromMonth.localeCompare(b.fromMonth) ||
      a.toMonth.localeCompare(b.toMonth)
    );

    let cashTotal = 0;
    let pointTotal = 0;

    for (const record of unitRecords) {
      if (record.status !== "実行") continue;
      cashTotal += record.cashAmount;
      pointTotal += record.pointAmount;
    }

    const hasRecords = unitRecords.length > 0;
    const firstMonth = hasRecords
      ? unitRecords.reduce((earliest,record) =>
          record.fromMonth < earliest
            ? record.fromMonth
            : earliest,
          unitRecords[0].fromMonth
        )
      : null;

    const missingMonths = [];
    const stoppedMonths = [];

    if (hasRecords) {
      const firstNumber =
        getContributionMonthNumber(firstMonth);
      const currentNumber =
        getContributionMonthNumber(currentMonth);

      for (let number = firstNumber;
           number < currentNumber;
           number += 1) {
        const month = formatContributionMonthNumber(number);
        const record =
          getContributionRecordForMonth(unitRecords,month);

        if (record) continue;

        const plan = getContributionPlanForMonth(
          unit.plans,
          unit.accountId,
          unit.productName,
          unit.wrapper,
          month
        );

        if (plan && plan.status === "停止") {
          stoppedMonths.push(month);
        } else {
          missingMonths.push(month);
        }
      }
    }

    const currentRecord =
      getContributionRecordForMonth(unitRecords,currentMonth);
    const currentPlan = getContributionPlanForMonth(
      unit.plans,
      unit.accountId,
      unit.productName,
      unit.wrapper,
      currentMonth
    );

    let currentMonthStatus = "未入力";

    if (currentRecord) {
      currentMonthStatus = currentRecord.status === "実行"
        ? "実績あり"
        : "未実行";
    } else if (currentPlan && currentPlan.status === "停止") {
      currentMonthStatus = "停止中";
    }

    const summary = {
      accountId:unit.accountId,
      productName:unit.productName,
      wrapper:unit.wrapper,
      cumulativeAmount:hasRecords
        ? cashTotal + pointTotal
        : null,
      cashTotal:hasRecords ? cashTotal : null,
      pointTotal:hasRecords ? pointTotal : null,
      status:hasRecords ? "入力済み" : "未入力",
      inputFromMonth:firstMonth,
      inputToMonth:hasRecords ? currentMonth : null,
      missingMonths,
      missingMonthCount:missingMonths.length,
      stoppedMonths,
      stoppedMonthCount:stoppedMonths.length,
      currentMonthStatus,
      currentPlan,
      records:unitRecords
    };

    units.push(summary);

    if (!accountMap.has(unit.accountId)) {
      accountMap.set(unit.accountId,{
        accountId:unit.accountId,
        accountName:data.accounts.find(account =>
          account.id === unit.accountId
        )?.name || null,
        hasRecords:false,
        cumulativeAmount:0,
        cashTotal:0,
        pointTotal:0,
        units:[]
      });
    }

    const accountSummary = accountMap.get(unit.accountId);
    accountSummary.units.push(summary);

    if (hasRecords) {
      accountSummary.hasRecords = true;
      accountSummary.cumulativeAmount += cashTotal + pointTotal;
      accountSummary.cashTotal += cashTotal;
      accountSummary.pointTotal += pointTotal;
    }
  }

  const accountTotals = Array.from(accountMap.values()).map(item => ({
    ...item,
    cumulativeAmount:item.hasRecords
      ? item.cumulativeAmount
      : null,
    cashTotal:item.hasRecords ? item.cashTotal : null,
    pointTotal:item.hasRecords ? item.pointTotal : null,
    status:item.hasRecords ? "入力済み" : "未入力"
  }));

  const monthlyRows = [];

  for (const unit of units) {
    const unitRecords = unit.records;
    const unitPlans = plans.filter(plan =>
      getContributionUnitKey(plan) === getContributionUnitKey(unit)
    );

    for (const record of unitRecords) {
      if (record.fromMonth < record.toMonth) {
        monthlyRows.push({
          type:"period",
          accountId:unit.accountId,
          productName:unit.productName,
          wrapper:unit.wrapper,
          fromMonth:record.fromMonth,
          toMonth:record.toMonth,
          cashAmount:record.cashAmount,
          pointAmount:record.pointAmount,
          totalAmount:record.status === "実行"
            ? record.cashAmount + record.pointAmount
            : 0,
          status:record.status,
          contributionId:record.id || null
        });
      }
    }

    if (!unit.inputFromMonth) continue;

    const firstNumber =
      getContributionMonthNumber(unit.inputFromMonth);
    const currentNumber =
      getContributionMonthNumber(currentMonth);

    for (let number = firstNumber;
         number <= currentNumber;
         number += 1) {
      const month = formatContributionMonthNumber(number);
      const record =
        getContributionRecordForMonth(unitRecords,month);

      if (record && record.fromMonth < record.toMonth) {
        continue;
      }

      const plan = getContributionPlanForMonth(
        unitPlans,
        unit.accountId,
        unit.productName,
        unit.wrapper,
        month
      );
      const planned = getContributionPlanAmounts(plan);

      if (record) {
        monthlyRows.push({
          type:"month",
          accountId:unit.accountId,
          productName:unit.productName,
          wrapper:unit.wrapper,
          month,
          plannedCash:planned.cash,
          plannedPoint:planned.point,
          plannedTotal:planned.total,
          actualCash:record.status === "実行"
            ? record.cashAmount
            : 0,
          actualPoint:record.status === "実行"
            ? record.pointAmount
            : 0,
          actualTotal:record.status === "実行"
            ? record.cashAmount + record.pointAmount
            : 0,
          status:record.status,
          contributionId:record.id || null
        });
      } else {
        const status = plan && plan.status === "停止"
          ? "停止中"
          : "未入力";

        monthlyRows.push({
          type:"month",
          accountId:unit.accountId,
          productName:unit.productName,
          wrapper:unit.wrapper,
          month,
          plannedCash:planned.cash,
          plannedPoint:planned.point,
          plannedTotal:planned.total,
          actualCash:null,
          actualPoint:null,
          actualTotal:null,
          status,
          contributionId:null
        });
      }
    }
  }

  monthlyRows.sort((a,b) => {
    const aMonth = a.type === "period" ? a.toMonth : a.month;
    const bMonth = b.type === "period" ? b.toMonth : b.month;

    if (aMonth !== bMonth) {
      return bMonth.localeCompare(aMonth);
    }

    if (a.type !== b.type) {
      return a.type === "period" ? -1 : 1;
    }

    return String(a.accountId).localeCompare(String(b.accountId)) ||
      String(a.productName || "").localeCompare(
        String(b.productName || ""),
        "ja"
      );
  });

  return {
    currentMonth,
    units,
    accountTotals,
    monthlyRows,
    overlaps
  };
}
