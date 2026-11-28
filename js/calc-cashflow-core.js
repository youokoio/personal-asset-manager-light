"use strict";

/* ---------- 収支の固定定数 ---------- */

const CASHFLOW_KINDS = [
  "収入",
  "支出"
];

const CASHFLOW_TYPES = [
  "定期",
  "単発"
];

const CASHFLOW_RULE_STATUSES = [
  "有効",
  "停止"
];

const CASHFLOW_EXPENSE_CATEGORIES = [
  "住居費",
  "食費",
  "光熱費",
  "通信費",
  "保険",
  "交通費",
  "医療・教育",
  "娯楽・交際",
  "その他"
];

const CASHFLOW_INCOME_CATEGORIES = [
  "給与",
  "賞与",
  "その他収入"
];

function getCashflowCategories(kind) {
  if (kind === "収入") return CASHFLOW_INCOME_CATEGORIES.slice();
  if (kind === "支出") return CASHFLOW_EXPENSE_CATEGORIES.slice();
  return [];
}

/* ---------- 日付・月 ---------- */

function isValidCashflowMonth(value) {
  if (typeof value !== "string" ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return false;
  }

  return Number(value.slice(0,4)) >= 1;
}

function isValidCashflowDate(value) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];

  if (year < 1 || month < 1 || month > 12 ||
      day < 1 || day > 31) {
    return false;
  }

  const date = new Date(0);
  date.setUTCHours(0,0,0,0);
  date.setUTCFullYear(year,month - 1,day);

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function getCashflowMonthFromDate(value) {
  return isValidCashflowDate(value) ? value.slice(0,7) : null;
}

/* ---------- 一意キー ---------- */

function getCashflowRuleUniqueKey(rule) {
  if (!rule ||
      typeof rule.seriesId !== "string" ||
      !rule.seriesId ||
      !isValidCashflowMonth(rule.effectiveFrom)) {
    return null;
  }

  return JSON.stringify([rule.seriesId,rule.effectiveFrom]);
}

function getCashflowRecordUniqueKey(record) {
  if (!record ||
      record.type !== "定期" ||
      typeof record.seriesId !== "string" ||
      !record.seriesId ||
      !isValidCashflowMonth(record.month)) {
    return null;
  }

  return JSON.stringify([record.seriesId,record.month]);
}

function isValidCashflowKindCategory(kind,category) {
  return getCashflowCategories(kind).includes(category);
}

/* ---------- 収支データ検証 ---------- */

function validateCashflowData(data) {
  if (!data ||
      !Array.isArray(data.cashflowRules) ||
      !Array.isArray(data.cashflowRecords)) {
    throw new Error("収支データの配列が正しくありません。");
  }

  const ruleKeys = new Set();

  for (const rule of data.cashflowRules) {
    if (!rule ||
        typeof rule.id !== "string" ||
        !rule.id ||
        typeof rule.seriesId !== "string" ||
        !rule.seriesId ||
        !isValidCashflowMonth(rule.effectiveFrom) ||
        !CASHFLOW_RULE_STATUSES.includes(rule.status) ||
        !CASHFLOW_KINDS.includes(rule.kind) ||
        typeof rule.itemName !== "string" ||
        !rule.itemName.trim() ||
        !isValidCashflowKindCategory(rule.kind,rule.category) ||
        !Number.isSafeInteger(rule.amount) ||
        rule.amount < 0 ||
        !Number.isInteger(rule.day) ||
        rule.day < 1 ||
        rule.day > 31 ||
        typeof rule.memo !== "string" ||
        typeof rule.createdAt !== "string" ||
        !rule.createdAt ||
        typeof rule.updatedAt !== "string" ||
        !rule.updatedAt) {
      throw new Error("定期収支登録に不正な項目があります。");
    }

    const key = getCashflowRuleUniqueKey(rule);
    if (ruleKeys.has(key)) {
      throw new Error("定期収支登録の seriesId と適用開始月が重複しています。");
    }
    ruleKeys.add(key);
  }

  const recordKeys = new Set();

  for (const record of data.cashflowRecords) {
    if (!record ||
        typeof record.id !== "string" ||
        !record.id ||
        !CASHFLOW_KINDS.includes(record.kind) ||
        typeof record.itemName !== "string" ||
        !record.itemName.trim() ||
        !isValidCashflowKindCategory(record.kind,record.category) ||
        !Number.isSafeInteger(record.amount) ||
        record.amount < 0 ||
        !isValidCashflowDate(record.date) ||
        !CASHFLOW_TYPES.includes(record.type) ||
        typeof record.cancelled !== "boolean" ||
        typeof record.memo !== "string" ||
        typeof record.createdAt !== "string" ||
        !record.createdAt ||
        typeof record.updatedAt !== "string" ||
        !record.updatedAt) {
      throw new Error("収支実績に不正な項目があります。");
    }

    if (record.type === "定期") {
      if (typeof record.seriesId !== "string" ||
          !record.seriesId ||
          !isValidCashflowMonth(record.month)) {
        throw new Error("定期収支実績の seriesId または month が正しくありません。");
      }

      if (record.month !== getCashflowMonthFromDate(record.date)) {
        throw new Error("定期収支実績の month と date の月が一致しません。");
      }

      const key = getCashflowRecordUniqueKey(record);
      if (recordKeys.has(key)) {
        throw new Error("定期収支実績の seriesId と month が重複しています。");
      }
      recordKeys.add(key);
    } else if (record.seriesId !== null || record.month !== null) {
      throw new Error("単発収支実績の seriesId と month は null にしてください。");
    }
  }

  return true;
}

/* ---------- 収支データ自己診断 ---------- */

function runCashflowDataSelfDiagnosis(data) {
  const errors = [];
  const warnings = [];
  const rules = data && Array.isArray(data.cashflowRules)
    ? data.cashflowRules
    : [];
  const records = data && Array.isArray(data.cashflowRecords)
    ? data.cashflowRecords
    : [];

  try {
    validateCashflowData(data);
  } catch (error) {
    errors.push(error.message || "収支データの検証に失敗しました。");
  }

  const registeredSeriesIds = new Set(
    rules
      .filter(rule =>
        rule && typeof rule.seriesId === "string" && rule.seriesId
      )
      .map(rule => rule.seriesId)
  );

  for (const record of records) {
    if (record &&
        record.type === "定期" &&
        typeof record.seriesId === "string" &&
        record.seriesId &&
        !registeredSeriesIds.has(record.seriesId)) {
      warnings.push(
        "定期実績 " + (record.id || "ID不明") +
        " の seriesId に対応する定期登録がありません。"
      );
    }
  }

  return {errors,warnings};
}
