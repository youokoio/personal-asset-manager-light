"use strict";

function isFxLossCutYenPair(pair) {
  return typeof pair === "string" && /^[A-Z]{3}\/JPY$/.test(pair);
}

function getFxLossCutAccountContext(data,accountId,options = {}) {
  const account = data.accounts.find(item =>
    item.id === accountId && item.type === "fx"
  ) || null;
  if (!account) {
    return {
      account:null,
      positions:[],
      excludedPositions:[],
      rates:{},
      rateDates:{},
      missing:[],
      warnings:["FX口座が見つかりません。"],
      effectiveEquity:null,
      effectiveEquityDate:null,
      lossCutRatio:null,
      targetRatio:null,
      marginRatePct:null,
      correctionFactor:1,
      correctionDate:null
    };
  }

  const openPositions = getFxOpenPositions(data,accountId);
  const positions = openPositions.filter(position =>
    isFxLossCutYenPair(position.pair)
  );
  const excludedPositions = openPositions.filter(position =>
    !isFxLossCutYenPair(position.pair)
  );
  const rates = {};
  const rateDates = {};
  const missing = [];
  const warnings = [];

  for (const position of positions) {
    if (!Object.prototype.hasOwnProperty.call(rates,position.pair)) {
      const rateRecord = getFxRateRecord(data,accountId,position.pair);
      const rate = rateRecord && Number.isFinite(rateRecord.rate) &&
        rateRecord.rate > 0 ? rateRecord.rate : null;
      rates[position.pair] = rate;
      rateDates[position.pair] = rateRecord ? rateRecord.asOfDate || null : null;
      if (rate === null) missing.push("評価レート（" + position.pair + "）");
    }
  }

  if (excludedPositions.length) {
    const pairs = Array.from(new Set(excludedPositions.map(item => item.pair)));
    warnings.push("円建て以外の通貨ペアは計算から除外しました：" + pairs.join("、"));
  }

  const latestSnapshot = getLatestSnapshot(data,accountId);
  const hasEquityOverride = Object.prototype.hasOwnProperty.call(
    options,
    "effectiveEquity"
  );
  const effectiveEquity = hasEquityOverride
    ? (Number.isFinite(options.effectiveEquity) ? options.effectiveEquity : null)
    : (latestSnapshot && Number.isFinite(latestSnapshot.value)
        ? latestSnapshot.value
        : null);
  const effectiveEquityDate = hasEquityOverride
    ? (options.effectiveEquityDate || null)
    : (latestSnapshot ? latestSnapshot.asOfDate : null);

  const marginRatePct = Number.isFinite(account.marginRatePct) &&
    account.marginRatePct > 0 ? account.marginRatePct : null;
  const lossCutRatio = Number.isFinite(account.lossCutRatio) &&
    account.lossCutRatio > 0 ? account.lossCutRatio : null;
  const targetRatio = Number.isFinite(data.settings && data.settings.targetRatio) &&
    data.settings.targetRatio > 0 ? data.settings.targetRatio : 150;

  if (marginRatePct === null) missing.push("必要証拠金率");
  if (lossCutRatio === null) missing.push("ロスカット維持率");
  if (effectiveEquity === null) missing.push("有効証拠金");

  const requiredMarginHistory = data.snapshots
    .filter(snapshot => snapshot.accountId === accountId &&
      Number.isFinite(snapshot.requiredMargin) && snapshot.requiredMargin >= 0)
    .slice()
    .sort((a,b) => {
      if (a.asOfDate !== b.asOfDate) {
        return String(b.asOfDate || "").localeCompare(String(a.asOfDate || ""));
      }
      return String(b.recordedAt || "").localeCompare(String(a.recordedAt || ""));
    })[0] || null;

  let correctionFactor = 1;
  let correctionDate = null;
  if (requiredMarginHistory && marginRatePct !== null &&
      positions.length && positions.every(position =>
        Number.isFinite(rates[position.pair]) && rates[position.pair] > 0
      )) {
    const rawCurrentMargin = positions.reduce((sum,position) =>
      sum + position.quantity * rates[position.pair] * marginRatePct / 100,
      0
    );
    if (rawCurrentMargin > 0) {
      correctionFactor = requiredMarginHistory.requiredMargin / rawCurrentMargin;
      correctionDate = requiredMarginHistory.asOfDate || null;
    }
  }

  return {
    account,
    positions,
    excludedPositions,
    rates,
    rateDates,
    missing,
    warnings,
    effectiveEquity,
    effectiveEquityDate,
    lossCutRatio,
    targetRatio,
    marginRatePct,
    correctionFactor,
    correctionDate,
    requiredMarginHistory
  };
}

function calculateFxLossCutMetrics(context,scenarioRates,effectiveEquity) {
  const positions = context.positions;
  let currentProfit = 0;
  let scenarioProfit = 0;
  let rawRequiredMargin = 0;
  let totalQuantity = 0;

  for (const position of positions) {
    const currentRate = context.rates[position.pair];
    const scenarioRate = Object.prototype.hasOwnProperty.call(
      scenarioRates,
      position.pair
    ) ? scenarioRates[position.pair] : currentRate;
    if (!Number.isFinite(currentRate) || currentRate <= 0 ||
        !Number.isFinite(scenarioRate) || scenarioRate < 0 ||
        !Number.isFinite(position.quantity) || position.quantity <= 0 ||
        !Number.isFinite(position.openRate) || position.openRate <= 0 ||
        !["買","売"].includes(position.side)) {
      return null;
    }

    currentProfit += calculateFxPositionExchangeProfit(position,currentRate);
    scenarioProfit += calculateFxPositionExchangeProfit(position,scenarioRate);
    rawRequiredMargin += position.quantity * scenarioRate *
      context.marginRatePct / 100;
    totalQuantity += position.quantity;
  }

  const requiredMargin = rawRequiredMargin * context.correctionFactor;
  const scenarioEquity = effectiveEquity + scenarioProfit - currentProfit;
  const maintenanceRatio = requiredMargin > 0
    ? scenarioEquity / requiredMargin * 100
    : null;
  const headroom = context.lossCutRatio === null
    ? null
    : scenarioEquity - context.lossCutRatio * requiredMargin / 100;
  const lossCutShortfall = context.lossCutRatio === null
    ? null
    : context.lossCutRatio * requiredMargin / 100 - scenarioEquity;
  const targetShortfall = context.targetRatio === null
    ? null
    : context.targetRatio * requiredMargin / 100 - scenarioEquity;

  return {
    currentProfit,
    scenarioProfit,
    totalExchangeProfit:scenarioProfit,
    requiredMargin,
    rawRequiredMargin,
    effectiveEquity:scenarioEquity,
    maintenanceRatio,
    isLossCut:maintenanceRatio === null
      ? null
      : maintenanceRatio < context.lossCutRatio,
    headroom,
    lossCutShortfall,
    targetShortfall,
    totalQuantity
  };
}

function solveFxLossCutBoundary(evaluate,low,high,lossCutRatio) {
  const lowMetrics = evaluate(low);
  const highMetrics = evaluate(high);
  if (!lowMetrics || !highMetrics) {
    return null;
  }
  const lowValue = lowMetrics.effectiveEquity -
    lossCutRatio * lowMetrics.requiredMargin / 100;
  const highValue = highMetrics.effectiveEquity -
    lossCutRatio * highMetrics.requiredMargin / 100;
  if (lowValue === 0) return low;
  if (highValue === 0) return high;
  if ((lowValue < 0) === (highValue < 0)) return null;

  let left = low;
  let right = high;
  let leftValue = lowValue;
  for (let i = 0; i < 100; i += 1) {
    const middle = (left + right) / 2;
    const metrics = evaluate(middle);
    if (!metrics) return null;
    const middleValue = metrics.effectiveEquity -
      lossCutRatio * metrics.requiredMargin / 100;
    if (middleValue === 0 || right - left <= 1e-9) return middle;
    if ((middleValue < 0) === (leftValue < 0)) {
      left = middle;
      leftValue = middleValue;
    } else {
      right = middle;
    }
  }
  return (left + right) / 2;
}

function calculateFxLossCutPairRates(context,effectiveEquity) {
  if (!context.positions.length || context.missing.length) {
    return [];
  }
  const currentMetrics = calculateFxLossCutMetrics(
    context,
    context.rates,
    effectiveEquity
  );
  if (!currentMetrics) return [];

  const pairs = Array.from(new Set(context.positions.map(item => item.pair))).sort();
  const results = [];

  for (const pair of pairs) {
    const pairPositions = context.positions.filter(item => item.pair === pair);
    const hasBuy = pairPositions.some(item => item.side === "買");
    const hasSell = pairPositions.some(item => item.side === "売");
    const currentRate = context.rates[pair];
    const directions = [];
    if (hasBuy) directions.push("下落");
    if (hasSell) directions.push("上昇");
    const roots = [];

    for (const direction of directions) {
      if (currentMetrics.maintenanceRatio < context.lossCutRatio) {
        roots.push({direction,rate:null,status:"現在すでにロスカット水準"});
        continue;
      }
      if (currentMetrics.maintenanceRatio === context.lossCutRatio) {
        roots.push({direction,rate:currentRate,status:"算出"});
        continue;
      }

      const evaluate = rate => calculateFxLossCutMetrics(
        context,
        {...context.rates,[pair]:rate},
        effectiveEquity
      );
      const boundary = direction === "下落"
        ? solveFxLossCutBoundary(
            evaluate,
            currentRate * 1e-12,
            currentRate,
            context.lossCutRatio
          )
        : solveFxLossCutBoundary(
            evaluate,
            currentRate,
            currentRate * 10,
            context.lossCutRatio
          );
      roots.push(boundary === null
        ? {direction,rate:null,status:"該当なし"}
        : {direction,rate:boundary,status:"算出"});
    }

    results.push({pair,currentRate,roots});
  }
  return results;
}

function calculateFxLossCutUniformChange(context,effectiveEquity,percent) {
  if (!context.positions.length || context.missing.length ||
      !Number.isFinite(percent) || percent < -100 || percent > 1000) {
    return null;
  }
  const scenarioRates = {};
  for (const pair of Object.keys(context.rates)) {
    scenarioRates[pair] = context.rates[pair] * (1 + percent / 100);
    if (scenarioRates[pair] < 0) return null;
  }
  return calculateFxLossCutMetrics(context,scenarioRates,effectiveEquity);
}

function calculateFxLossCutUniformRoots(context,effectiveEquity) {
  if (!context.positions.length || context.missing.length) {
    return {down:null,up:null};
  }
  const hasBuy = context.positions.some(item => item.side === "買");
  const hasSell = context.positions.some(item => item.side === "売");
  const currentMetrics = calculateFxLossCutMetrics(
    context,
    context.rates,
    effectiveEquity
  );
  if (!currentMetrics) return {down:null,up:null};
  if (currentMetrics.maintenanceRatio < context.lossCutRatio) {
    return {
      down:hasBuy ? {percent:null,status:"現在すでにロスカット水準"} : null,
      up:hasSell ? {percent:null,status:"現在すでにロスカット水準"} : null
    };
  }
  if (currentMetrics.maintenanceRatio === context.lossCutRatio) {
    return {
      down:hasBuy ? {percent:0,status:"算出"} : null,
      up:hasSell ? {percent:0,status:"算出"} : null
    };
  }

  const evaluate = percent => {
    const rates = {};
    for (const pair of Object.keys(context.rates)) {
      rates[pair] = context.rates[pair] * (1 + percent / 100);
      if (rates[pair] < 0) return null;
    }
    return calculateFxLossCutMetrics(context,rates,effectiveEquity);
  };
  const find = (low,high) => {
    const root = solveFxLossCutBoundary(
      evaluate,low,high,context.lossCutRatio
    );
    return root === null
      ? {percent:null,status:"該当なし"}
      : {percent:root,status:"算出"};
  };
  return {
    down:hasBuy ? find(-100 + 1e-10,0) : null,
    up:hasSell ? find(0,1000) : null
  };
}

function calculateFxLossCut(data,accountId,options = {}) {
  const context = getFxLossCutAccountContext(data,accountId,options);
  const hasPositions = context.positions.length > 0;
  const missing = context.missing.slice();
  if (!hasPositions && context.account) missing.push("保有中の建玉");

  const canCalculate = Boolean(context.account) && hasPositions &&
    missing.length === 0;
  const scenarioRates = {...context.rates};
  if (options.scenarioRates && typeof options.scenarioRates === "object") {
    for (const pair of Object.keys(context.rates)) {
      if (Object.prototype.hasOwnProperty.call(options.scenarioRates,pair)) {
        scenarioRates[pair] = options.scenarioRates[pair];
      }
    }
  }
  const metrics = canCalculate
    ? calculateFxLossCutMetrics(
        context,
        scenarioRates,
        context.effectiveEquity
      )
    : null;
  const pairRates = canCalculate
    ? calculateFxLossCutPairRates(context,context.effectiveEquity)
    : [];
  const uniformRoots = canCalculate
    ? calculateFxLossCutUniformRoots(context,context.effectiveEquity)
    : {down:null,up:null};
  const uniformScenario = canCalculate &&
    Number.isFinite(options.uniformChangePct)
      ? calculateFxLossCutUniformChange(
          context,
          context.effectiveEquity,
          options.uniformChangePct
        )
      : null;
  const lossCutDetails = pairRates.flatMap(pairResult =>
    pairResult.roots
      .filter(root => root.rate !== null)
      .map(root => ({pair:pairResult.pair,...root}))
  );
  const lossCutAtDetails = lossCutDetails.map(detail => {
    const detailMetrics = calculateFxLossCutMetrics(
      context,
      {...context.rates,[detail.pair]:detail.rate},
      context.effectiveEquity
    );
    return {
      pair:detail.pair,
      direction:detail.direction,
      rate:detail.rate,
      exchangeProfit:detailMetrics.totalExchangeProfit,
      requiredMargin:detailMetrics.requiredMargin,
      effectiveEquity:detailMetrics.requiredMargin *
        context.lossCutRatio / 100
    };
  });

  if (context.effectiveEquityDate &&
      Object.values(context.rateDates).some(date =>
        date && date !== context.effectiveEquityDate)) {
    context.warnings.push("有効証拠金と評価レートの日付が違います。");
  }

  return {
    accountId,
    accountName:context.account ? context.account.name : null,
    canCalculate,
    missing,
    warnings:context.warnings,
    excludedPositionCount:context.excludedPositions.length,
    positions:context.positions,
    rates:context.rates,
    rateDates:context.rateDates,
    scenarioRates,
    effectiveEquity:context.effectiveEquity,
    effectiveEquityDate:context.effectiveEquityDate,
    lossCutRatio:context.lossCutRatio,
    targetRatio:context.targetRatio,
    marginRatePct:context.marginRatePct,
    correctionFactor:context.correctionFactor,
    correctionDate:context.correctionDate,
    metrics,
    pairRates,
    uniformScenario,
    uniformRoots,
    lossCutAtDetails,
    lossCutAtDetail:lossCutAtDetails[0] || null
  };
}

function calculateFxLossCutRatesForAccount(data,accountId) {
  const result = calculateFxLossCut(data,accountId);
  if (!result.canCalculate) {
    return {
      accountId,
      canCalculate:false,
      missing:result.missing,
      warnings:result.warnings,
      rates:[]
    };
  }
  return {
    accountId,
    canCalculate:true,
    missing:[],
    warnings:result.warnings,
    rates:result.pairRates
  };
}