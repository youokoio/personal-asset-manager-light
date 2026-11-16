
/* ---------- FX累積確定損益 ---------- */

function getFxSettledPnlForDate(data,accountId,dateStr) {
  if (!data ||
      !Array.isArray(data.fxPositions) ||
      !isValidFxPositionAsOfDate(dateStr)) {
    return null;
  }

  const positions = data.fxPositions.filter(position =>
    position.accountId === accountId &&
    position.status === "決済済" &&
    position.closeDate === dateStr &&
    isFiniteMetricValue(position.realizedPnl)
  );

  if (positions.length === 0) return null;

  return positions.reduce(
    (sum,position) => sum + position.realizedPnl,
    0
  );
}

function getFxRealizedAt(data,accountId,dateStr) {
  if (!data ||
      !Array.isArray(data.accounts) ||
      !isValidFxPositionAsOfDate(dateStr)) {
    return null;
  }

  const account = data.accounts.find(item =>
    item.id === accountId && item.type === "fx"
  );
  if (!account) return null;

  const candidates = [];

  if (isFiniteMetricValue(account.realizedBaseAmount) &&
      isValidFxPositionAsOfDate(account.realizedBaseDate) &&
      account.realizedBaseDate <= dateStr) {
    candidates.push({
      amount:account.realizedBaseAmount,
      date:account.realizedBaseDate,
      source:"口座設定",
      recordedAt:"",
      priority:2
    });
  }

  const snapshots = Array.isArray(data.snapshots)
    ? data.snapshots
    : [];

  for (const snapshot of snapshots) {
    if (snapshot.accountId !== accountId ||
        !isFiniteMetricValue(snapshot.realizedPnlTotal) ||
        !isValidFxPositionAsOfDate(snapshot.asOfDate) ||
        snapshot.asOfDate > dateStr) {
      continue;
    }

    candidates.push({
      amount:snapshot.realizedPnlTotal,
      date:snapshot.asOfDate,
      source:"履歴",
      recordedAt:String(snapshot.recordedAt || ""),
      priority:1
    });
  }

  candidates.sort((a,b) => {
    const dateDifference = b.date.localeCompare(a.date);
    if (dateDifference !== 0) return dateDifference;

    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }

    return b.recordedAt.localeCompare(a.recordedAt);
  });

  const baseline = candidates[0] || null;
  const baseDate = baseline ? baseline.date : null;
  const baseAmount = baseline ? baseline.amount : null;

  const fxPositions = Array.isArray(data.fxPositions)
    ? data.fxPositions
    : [];

  const settledByDate = new Map();

  for (const position of fxPositions) {
    if (position.accountId !== accountId ||
        position.status !== "決済済" ||
        !isValidFxPositionAsOfDate(position.closeDate) ||
        position.closeDate > dateStr ||
        (baseDate && position.closeDate <= baseDate) ||
        !isFiniteMetricValue(position.realizedPnl)) {
      continue;
    }

    const current = settledByDate.get(position.closeDate) || {
      total:0,
      count:0
    };

    current.total += position.realizedPnl;
    current.count += 1;
    settledByDate.set(position.closeDate,current);
  }

  const dailyByDate = new Map();

  for (const snapshot of snapshots) {
    if (snapshot.accountId !== accountId ||
        !isValidFxPositionAsOfDate(snapshot.asOfDate) ||
        snapshot.asOfDate > dateStr ||
        (baseDate && snapshot.asOfDate <= baseDate)) {
      continue;
    }

    const recordedAt = String(snapshot.recordedAt || "");
    const current = dailyByDate.get(snapshot.asOfDate);

    if (!current ||
        recordedAt.localeCompare(current.recordedAt) > 0) {
      dailyByDate.set(snapshot.asOfDate,{
        value:isFiniteMetricValue(snapshot.realizedPnlDaily)
          ? snapshot.realizedPnlDaily
          : null,
        recordedAt
      });
    }
  }

  const dates = new Set([
    ...settledByDate.keys(),
    ...dailyByDate.keys()
  ]);

  const sortedDates = Array.from(dates).sort();
  const warnings = [];
  let dailyPnlTotal = 0;
  let dailyPnlCount = 0;
  let settledPnl = 0;
  let settledCount = 0;
  let fallbackSettledPnl = 0;
  let fallbackSettledCount = 0;

  for (const date of sortedDates) {
    const settled = settledByDate.get(date) || {
      total:0,
      count:0
    };
    const daily = dailyByDate.get(date);

    settledPnl += settled.total;
    settledCount += settled.count;

    if (daily && daily.value !== null) {
      dailyPnlTotal += daily.value;
      dailyPnlCount += 1;

      if (settled.count > 0 &&
          daily.value !== settled.total) {
        warnings.push({
          date,
          dailyPnl:daily.value,
          settledPnl:settled.total,
          difference:daily.value - settled.total,
          message:
            date + "の日次確定損益と決済損益の合計が一致しません。"
        });
      }
    } else if (settled.count > 0) {
      fallbackSettledPnl += settled.total;
      fallbackSettledCount += settled.count;
    }
  }

  if (!baseline &&
      dailyPnlCount === 0 &&
      fallbackSettledCount === 0) {
    return null;
  }

  const value =
    (baseAmount === null ? 0 : baseAmount) +
    dailyPnlTotal +
    fallbackSettledPnl;

  return {
    value,
    baseAmount,
    baseDate,
    baseSource:baseline ? baseline.source : null,
    baseUnset:!baseline,
    dailyPnlTotal,
    dailyPnlCount,
    settledPnl,
    settledCount,
    fallbackSettledPnl,
    fallbackSettledCount,
    warnings
  };
}

/* ---------- 決済損益の自動計算 ---------- */

function calcCloseRealized(position,settlementQuantity,closeRate) {
  if (!position ||
      (position.side !== "買" && position.side !== "売") ||
      !Number.isSafeInteger(position.quantity) ||
      position.quantity <= 0 ||
      !Number.isSafeInteger(settlementQuantity) ||
      settlementQuantity <= 0 ||
      settlementQuantity > position.quantity ||
      !Number.isFinite(position.openRate) ||
      position.openRate <= 0 ||
      !Number.isFinite(closeRate) ||
      closeRate <= 0) {
    throw new Error("決済損益の計算に必要な建玉情報が正しくありません。");
  }

  const rateDifference = position.side === "買"
    ? closeRate - position.openRate
    : position.openRate - closeRate;

  const exchangePnl = Math.trunc(
    rateDifference * settlementQuantity
  );

  const swapMissing =
    position.swap === null ||
    position.swap === undefined;

  let swapPnl = 0;

  if (!swapMissing) {
    const swapSplit = splitFxPositionSwap(
      position.swap,
      settlementQuantity,
      position.quantity
    );
    swapPnl = swapSplit.settledSwap;
  }

  return {
    value:exchangePnl + swapPnl,
    exchangePnl,
    swapPnl,
    swapMissing,
    notice:swapMissing
      ? "スワップ未入力のため含まない"
      : ""
  };
}

/* ---------- 旧形式との互換用 ---------- */

function calculateFxAccountRealizedPnl(data,accountId) {
  const account = data.accounts.find(item =>
    item.id === accountId && item.type === "fx"
  );
  if (!account) return null;

  const hasBase = isFiniteMetricValue(account.realizedBaseAmount) &&
    isValidFxPositionAsOfDate(account.realizedBaseDate);
  const baseAmount = hasBase ? account.realizedBaseAmount : 0;
  const baseDate = hasBase ? account.realizedBaseDate : null;

  const fxPositions = Array.isArray(data.fxPositions)
    ? data.fxPositions
    : [];

  const settledPositions = fxPositions.filter(position =>
    position.accountId === accountId &&
    position.status === "決済済" &&
    (!hasBase || position.closeDate > baseDate) &&
    isFiniteMetricValue(position.realizedPnl)
  );

  const settledPnl = settledPositions.reduce(
    (sum,position) => sum + position.realizedPnl,
    0
  );

  return {
    value:baseAmount + settledPnl,
    baseAmount:hasBase ? account.realizedBaseAmount : null,
    baseDate,
    baseUnset:!hasBase,
    settledPnl,
    settledCount:settledPositions.length
  };
}
