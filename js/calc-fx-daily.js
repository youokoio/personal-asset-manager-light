
"use strict";

/* ---------- FX日次入力・評価額計算 ---------- */

function validateFxSnapshotRates(data) {
  if (!data || !Array.isArray(data.snapshots)) {
    throw new Error("履歴データを確認できません。");
  }

  for (const snapshot of data.snapshots) {
    if (!snapshot ||
        snapshot.rates === null ||
        snapshot.rates === undefined) {
      continue;
    }

    const rates = snapshot.rates;

    if (typeof rates !== "object" || Array.isArray(rates)) {
      throw new Error("履歴の評価レート形式が正しくありません。");
    }

    for (const [pair, rate] of Object.entries(rates)) {
      if (!isValidFxPairForStorage(pair) ||
          typeof rate !== "number" ||
          !Number.isFinite(rate) ||
          rate <= 0) {
        throw new Error("履歴の評価レートに不正な項目があります。");
      }
    }
  }
}

const validateDataBeforeFxDaily = validateData;

validateData = function(data) {
  validateFxSnapshotRates(data);
  return validateDataBeforeFxDaily(data);
};

/* ---------- FX評価額の目安 ---------- */

function calculateFxDailyEstimatedTotal(
  data,
  accountId,
  effectivePrincipal,
  swapTotal
) {
  const missing = [];

  if (!Number.isFinite(effectivePrincipal)) {
    missing.push("有効元本");
  }

  if (!Number.isFinite(swapTotal)) {
    missing.push("累計スワップ");
  }

  const rows = calculateFxAggregateRows(data).filter(row =>
    row.accountId === accountId
  );

  let exchangeProfit = 0;

  for (const row of rows) {
    if (!Number.isFinite(row.exchangeProfit)) {
      missing.push(row.pair + "の評価レート");
      continue;
    }

    exchangeProfit += row.exchangeProfit;
  }

  if (missing.length) {
    return {
      value:null,
      exchangeProfit:rows.length && rows.every(row =>
        Number.isFinite(row.exchangeProfit)
      )
        ? exchangeProfit
        : null,
      missing:[...new Set(missing)]
    };
  }

  return {
    value:effectivePrincipal + exchangeProfit + swapTotal,
    exchangeProfit,
    missing:[]
  };
}

/* ---------- 最新評価レートの更新可否 ---------- */

function canUpdateFxDailyRate(
  data,
  accountId,
  pair,
  targetDate
) {
  if (!data ||
      !Array.isArray(data.snapshots) ||
      !Array.isArray(data.fxRates) ||
      typeof accountId !== "string" ||
      typeof pair !== "string" ||
      !isValidFxPairForStorage(pair) ||
      !isValidFxDateForStorage(targetDate)) {
    return false;
  }

  const account = data.accounts.find(item =>
    item.id === accountId && item.type === "fx"
  );

  if (!account) return false;

  const accountSnapshots = data.snapshots.filter(snapshot =>
    snapshot.accountId === accountId
  );

  if (accountSnapshots.length) {
    const latestSnapshotDate = accountSnapshots.reduce(
      (latest, snapshot) =>
        snapshot.asOfDate > latest
          ? snapshot.asOfDate
          : latest,
      accountSnapshots[0].asOfDate
    );

    if (targetDate < latestSnapshotDate) {
      return false;
    }
  }

  const currentRate = getFxRateRecord(data,accountId,pair);

  if (currentRate &&
      typeof currentRate.asOfDate === "string" &&
      targetDate < currentRate.asOfDate) {
    return false;
  }

  return true;
}
