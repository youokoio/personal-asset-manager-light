/* ---------- FX累積確定損益の基準値 ---------- */

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

  const settledPositions = fxPositions.filter(position =>
    position.accountId === accountId &&
    position.status === "決済済" &&
    isValidFxPositionAsOfDate(position.closeDate) &&
    position.closeDate <= dateStr &&
    (!baseDate || position.closeDate > baseDate) &&
    isFiniteMetricValue(position.realizedPnl)
  );

  const settledPnl = settledPositions.reduce(
    (sum,position) => sum + position.realizedPnl,
    0
  );

  if (!baseline && settledPositions.length === 0) {
    return null;
  }

  return {
    value:(baseAmount === null ? 0 : baseAmount) + settledPnl,
    baseAmount,
    baseDate,
    baseSource:baseline ? baseline.source : null,
    baseUnset:!baseline,
    settledPnl,
    settledCount:settledPositions.length
  };
}

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
