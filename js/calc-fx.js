"use strict";

/* ---------- FX集計 ---------- */

function getFxOpenPositions(data,accountId = null) {
  return data.fxPositions.filter(position =>
    position.status === "保有中" &&
    (accountId === null || position.accountId === accountId)
  );
}

function getFxRateRecord(data,accountId,pair) {
  return data.fxRates.find(rate =>
    rate.accountId === accountId &&
    rate.pair === pair
  ) || null;
}

function calculateFxPositionExchangeProfit(position,rate) {
  if (!position ||
      !Number.isFinite(rate) ||
      !Number.isFinite(position.openRate) ||
      !Number.isFinite(position.quantity)) {
    return null;
  }

  if (position.side === "買") {
    return (rate - position.openRate) * position.quantity;
  }

  if (position.side === "売") {
    return (position.openRate - rate) * position.quantity;
  }

  return null;
}

function calculateFxAggregateRows(data) {
  const groups = new Map();

  for (const position of getFxOpenPositions(data)) {
    const key = JSON.stringify([
      position.accountId,
      position.pair,
      position.side
    ]);

    if (!groups.has(key)) {
      groups.set(key,{
        accountId:position.accountId,
        pair:position.pair,
        side:position.side,
        positions:[]
      });
    }

    groups.get(key).positions.push(position);
  }

  const accountOrder = new Map(
    data.accounts.map((account,index) => [account.id,index])
  );

  const rows = [];

  for (const group of groups.values()) {
    const positions = group.positions;
    const quantity = positions.reduce(
      (sum,position) => sum + position.quantity,
      0
    );

    const weightedRateTotal = positions.reduce(
      (sum,position) =>
        sum + position.quantity * position.openRate,
      0
    );

    const averageOpenRate = quantity > 0
      ? weightedRateTotal / quantity
      : null;

    const rateRecord = getFxRateRecord(
      data,
      group.accountId,
      group.pair
    );

    const evaluationRate = rateRecord &&
      Number.isFinite(rateRecord.rate) &&
      rateRecord.rate > 0
        ? rateRecord.rate
        : null;

    const exchangeProfit = evaluationRate === null
      ? null
      : positions.reduce((sum,position) =>
          sum + calculateFxPositionExchangeProfit(
            position,
            evaluationRate
          ),
          0
        );

    const allSwapsEntered = positions.every(position =>
      typeof position.swap === "number" &&
      Number.isFinite(position.swap)
    );

    const swapTotal = allSwapsEntered
      ? positions.reduce((sum,position) => sum + position.swap,0)
      : null;

    const evaluationPnl = exchangeProfit !== null &&
      swapTotal !== null
        ? exchangeProfit + swapTotal
        : null;

    const account = data.accounts.find(item =>
      item.id === group.accountId
    );

    rows.push({
      accountId:group.accountId,
      accountName:account ? account.name : "不明",
      pair:group.pair,
      side:group.side,
      quantity,
      positionCount:positions.length,
      averageOpenRate,
      evaluationRate,
      evaluationRateDate:rateRecord
        ? rateRecord.asOfDate ?? null
        : null,
      exchangeProfit,
      swapTotal,
      evaluationPnl
    });
  }

  return rows.sort((a,b) => {
    const accountDifference =
      (accountOrder.get(a.accountId) ?? Number.MAX_SAFE_INTEGER) -
      (accountOrder.get(b.accountId) ?? Number.MAX_SAFE_INTEGER);

    if (accountDifference !== 0) return accountDifference;
    if (a.pair !== b.pair) return a.pair.localeCompare(b.pair);
    if (a.side === b.side) return 0;
    return a.side === "買" ? -1 : 1;
  });
}

function calculateFxAccountAggregateSummary(data,accountId) {
  const rows = calculateFxAggregateRows(data).filter(row =>
    row.accountId === accountId
  );

  if (!rows.length) {
    return {
      aggregateCount:0,
      calculatedCount:0,
      exchangeProfit:null,
      status:"未入力"
    };
  }

  const calculatedRows = rows.filter(row =>
    row.exchangeProfit !== null
  );

  const allCalculated = calculatedRows.length === rows.length;

  return {
    aggregateCount:rows.length,
    calculatedCount:calculatedRows.length,
    exchangeProfit:allCalculated
      ? calculatedRows.reduce(
          (sum,row) => sum + row.exchangeProfit,
          0
        )
      : null,
    status:allCalculated
      ? "計算済"
      : calculatedRows.length > 0
        ? "一部未計算"
        : "未計算"
  };
}

function getFxAccountPairs(data,accountId) {
  return data.fxRates
    .filter(rate => rate.accountId === accountId)
    .slice()
    .sort((a,b) => a.pair.localeCompare(b.pair));
}
