"use strict";

/* ---------- 定期収支の補完 ---------- */

function cashflowMonthNumber(month) {
  if (!isValidCashflowMonth(month)) return null;
  const parts = month.split("-").map(Number);
  return parts[0] * 12 + parts[1] - 1;
}

function cashflowMonthString(value) {
  const year = Math.floor(value / 12);
  const month = value % 12 + 1;
  return String(year).padStart(4,"0") + "-" + String(month).padStart(2,"0");
}

function cashflowDateForRule(month,day) {
  const monthNumber = cashflowMonthNumber(month);
  if (monthNumber === null || !Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error("定期収支の月または発生日が正しくありません。");
  }

  const year = Math.floor(monthNumber / 12);
  const monthIndex = monthNumber % 12;
  const lastDate = new Date(0);
  lastDate.setUTCHours(0,0,0,0);
  lastDate.setUTCFullYear(year,monthIndex + 1,0);
  const lastDay = lastDate.getUTCDate();

  return month + "-" + String(Math.min(day,lastDay)).padStart(2,"0");
}

function cashflowLatestRuleForMonth(rules,month) {
  let latest = null;

  for (const rule of rules) {
    if (rule.effectiveFrom <= month &&
        (!latest || rule.effectiveFrom > latest.effectiveFrom)) {
      latest = rule;
    }
  }

  return latest;
}

function generateCashflowRecords(today,data) {
  if (!isValidCashflowDate(today)) {
    throw new Error("補完基準日が正しくありません。");
  }

  if (!data ||
      !Array.isArray(data.cashflowRules) ||
      !Array.isArray(data.cashflowRecords)) {
    throw new Error("収支データの形式が正しくありません。");
  }

  const currentMonth = today.slice(0,7);
  const currentMonthNumber = cashflowMonthNumber(currentMonth);
  const existingKeys = new Set(
    data.cashflowRecords
      .filter(record => record && record.type === "定期")
      .map(record => getCashflowRecordUniqueKey(record))
      .filter(Boolean)
  );
  const rulesBySeries = new Map();

  for (const rule of data.cashflowRules) {
    if (!rule ||
        typeof rule.seriesId !== "string" ||
        !isValidCashflowMonth(rule.effectiveFrom)) {
      continue;
    }

    if (!rulesBySeries.has(rule.seriesId)) {
      rulesBySeries.set(rule.seriesId,[]);
    }

    rulesBySeries.get(rule.seriesId).push(rule);
  }

  const created = [];

  for (const [seriesId,seriesRules] of rulesBySeries) {
    seriesRules.sort((a,b) =>
      a.effectiveFrom < b.effectiveFrom ? -1 :
      a.effectiveFrom > b.effectiveFrom ? 1 : 0
    );

    const firstMonthNumber = cashflowMonthNumber(
      seriesRules[0].effectiveFrom
    );

    for (let monthNumber=firstMonthNumber;
         monthNumber<=currentMonthNumber;
         monthNumber+=1) {
      const month = cashflowMonthString(monthNumber);
      const rule = cashflowLatestRuleForMonth(seriesRules,month);

      if (!rule || rule.status !== "有効") continue;

      const date = cashflowDateForRule(month,rule.day);

      if (month === currentMonth && date > today) continue;

      const key = JSON.stringify([seriesId,month]);
      if (existingKeys.has(key)) continue;

      const timestamp = date + "T00:00:00.000Z";

      created.push({
        id:"cashflow-auto-" + encodeURIComponent(seriesId) + "-" + month,
        kind:rule.kind,
        itemName:rule.itemName,
        category:rule.category,
        amount:rule.amount,
        date,
        type:"定期",
        seriesId,
        month,
        cancelled:false,
        memo:rule.memo,
        createdAt:timestamp,
        updatedAt:timestamp
      });

      existingKeys.add(key);
    }
  }

  return created;
}

function previewCashflowRule(rule,data,today) {
  if (!rule ||
      !data ||
      !Array.isArray(data.cashflowRules)) {
    throw new Error("定期登録のプレビュー対象が正しくありません。");
  }

  const previewData = {
    ...data,
    cashflowRules:data.cashflowRules.concat([{...rule}])
  };
  const records = generateCashflowRecords(today,previewData);

  return {
    months:records.map(record => record.month),
    count:records.length
  };
}

/* ---------- 収支の集計 ---------- */

function calculateCashflowMonthlySummary(data,month) {
  if (!isValidCashflowMonth(month) ||
      !data ||
      !Array.isArray(data.cashflowRecords)) {
    throw new Error("月次集計の指定が正しくありません。");
  }

  const records = data.cashflowRecords.filter(record =>
    record &&
    record.date.slice(0,7) === month &&
    !record.cancelled
  );

  const incomeTotal = records
    .filter(record => record.kind === "収入")
    .reduce((sum,record) => sum + record.amount,0);

  const expenseRecords = records.filter(
    record => record.kind === "支出"
  );
  const expenseTotal = expenseRecords.reduce(
    (sum,record) => sum + record.amount,0
  );
  const recurringExpenseTotal = expenseRecords
    .filter(record => record.type === "定期")
    .reduce((sum,record) => sum + record.amount,0);
  const oneOffExpenseTotal = expenseRecords
    .filter(record => record.type === "単発")
    .reduce((sum,record) => sum + record.amount,0);

  const categoryTotals = new Map();

  for (const record of expenseRecords) {
    categoryTotals.set(
      record.category,
      (categoryTotals.get(record.category) || 0) + record.amount
    );
  }

  const categories = Array.from(
    categoryTotals,
    ([category,amount]) => ({category,amount})
  ).sort((a,b) =>
    b.amount - a.amount ||
    a.category.localeCompare(b.category)
  );

  return {
    month,
    hasRecords:records.length > 0,
    incomeTotal,
    expenseTotal,
    balance:incomeTotal - expenseTotal,
    recurringExpenseTotal,
    oneOffExpenseTotal,
    recurringExpenseRatio:expenseTotal === 0
      ? null
      : Math.round(recurringExpenseTotal / expenseTotal * 10000) / 100,
    categories
  };
}

function calculateCashflowCumulative(data,month) {
  if (!data ||
      !Array.isArray(data.cashflowRecords) ||
      !isValidCashflowMonth(month)) {
    throw new Error("収支累積の指定が正しくありません。");
  }

  const groups = new Map();

  for (const record of data.cashflowRecords) {
    if (!record || record.cancelled) continue;

    const itemName = record.itemName.trim();
    const key = JSON.stringify([record.kind,itemName]);

    if (!groups.has(key)) {
      groups.set(key,{
        kind:record.kind,
        itemName,
        totalAmount:0,
        count:0,
        monthAmount:0
      });
    }

    const group = groups.get(key);
    group.totalAmount += record.amount;
    group.count += 1;

    if (record.date.slice(0,7) === month) {
      group.monthAmount += record.amount;
    }
  }

  return Array.from(groups.values()).sort((a,b) =>
    a.kind === b.kind
      ? b.totalAmount - a.totalAmount ||
        a.itemName.localeCompare(b.itemName)
      : a.kind === "支出" ? -1 : 1
  );
}

function getCashflowItemCandidates(data,month) {
  if (!data ||
      !Array.isArray(data.cashflowRecords) ||
      !Array.isArray(data.cashflowRules) ||
      !isValidCashflowMonth(month)) {
    throw new Error("収支項目候補の指定が正しくありません。");
  }

  const groups = new Map();

  const ensureGroup = (kind,itemName) => {
    const normalizedName = itemName.trim();
    const key = JSON.stringify([kind,normalizedName]);

    if (!groups.has(key)) {
      groups.set(key,{
        kind,
        itemName:normalizedName,
        category:null,
        type:null,
        ruleAmount:null,
        previousAmount:null,
        latestDate:"",
        latestRuleDate:"",
        totalAmount:0,
        count:0,
        monthAmount:0,
        previousDate:""
      });
    }

    return groups.get(key);
  };

  for (const rule of data.cashflowRules) {
    if (!rule || typeof rule.itemName !== "string") continue;

    const group = ensureGroup(rule.kind,rule.itemName);
    const effectiveDate = rule.effectiveFrom + "-01";

    if (effectiveDate >= group.latestDate) {
      group.latestDate = effectiveDate;
      group.category = rule.category;
      group.type = "定期";
    }

    if (effectiveDate >= group.latestRuleDate) {
      group.latestRuleDate = effectiveDate;
      group.ruleAmount = rule.amount;
    }
  }

  for (const record of data.cashflowRecords) {
    if (!record || typeof record.itemName !== "string") continue;

    const group = ensureGroup(record.kind,record.itemName);

    if (record.date >= group.latestDate) {
      group.latestDate = record.date;
      group.category = record.category;
      group.type = record.type;
    }

    if (record.date >= group.previousDate) {
      group.previousDate = record.date;
      group.previousAmount = record.amount;
    }

    if (!record.cancelled) {
      group.totalAmount += record.amount;
      group.count += 1;

      if (record.date.slice(0,7) === month) {
        group.monthAmount += record.amount;
      }
    }
  }

  return Array.from(groups.values()).sort((a,b) =>
    a.kind === b.kind
      ? a.itemName.localeCompare(b.itemName)
      : a.kind === "支出" ? -1 : 1
  );
}

/* ---------- 起動時の保存 ---------- */

function applyCashflowAutoCompletion(data,today,storage = localStorage) {
  const created = generateCashflowRecords(today,data);

  if (created.length === 0) {
    return {data,createdCount:0};
  }

  const saved = saveCashflowData(nextData => {
    nextData.cashflowRecords.push(...created);
  },storage);

  return {
    data:saved,
    createdCount:created.length
  };
}
