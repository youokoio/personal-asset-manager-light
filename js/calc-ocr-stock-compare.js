"use strict";

/* ---------- S11b 株式OCRの比較 ---------- */

function stockOcrNormalizeCompareNameStock(value) {
  const source = typeof normalizeOcrWidth === "function"
    ? normalizeOcrWidth(String(value || ""))
    : String(value || "");
  return source.trim().replace(/\s+/g," ");
}

function stockOcrGetImportKeyStock(
  accountId,name,wrapper,targetDate
) {
  return JSON.stringify([
    accountId,
    stockOcrNormalizeCompareNameStock(name),
    wrapper,
    targetDate
  ]);
}

function stockOcrGetPreviousHoldingStock(
  data,accountId,name,wrapper,targetDate
) {
  const normalizedName = stockOcrNormalizeCompareNameStock(name);
  return data.holdings
    .filter(item =>
      item.accountId === accountId &&
      stockOcrNormalizeCompareNameStock(item.name) === normalizedName &&
      item.wrapper === wrapper &&
      item.asOfDate < targetDate
    )
    .sort((a,b) =>
      b.asOfDate.localeCompare(a.asOfDate) ||
      String(b.recordedAt || "").localeCompare(String(a.recordedAt || ""))
    )[0] || null;
}

function stockOcrEditDistanceCompareStock(first,second) {
  if (Math.abs(first.length - second.length) > 1) return 2;
  const rows = first.length + 1;
  const columns = second.length + 1;
  const matrix = Array.from({length:rows},() => Array(columns).fill(0));

  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = first[row - 1] === second[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost
      );
    }
  }

  return matrix[first.length][second.length];
}

function stockOcrFindSimilarNamesCompareStock(
  data,accountId,name,wrapper,targetDate
) {
  const normalizedName = stockOcrNormalizeCompareNameStock(name);
  const priorDate = data.holdings
    .filter(item =>
      item.accountId === accountId && item.asOfDate < targetDate
    )
    .reduce((latest,item) =>
      !latest || item.asOfDate > latest ? item.asOfDate : latest,
      null
    );

  if (!priorDate || normalizedName.length < 4) return [];

  const candidates = data.holdings.filter(item =>
    item.accountId === accountId &&
    item.asOfDate === priorDate &&
    item.wrapper === wrapper &&
    stockOcrNormalizeCompareNameStock(item.name) !== normalizedName
  );
  const found = new Map();

  for (const item of candidates) {
    const candidateName = stockOcrNormalizeCompareNameStock(item.name);
    if (candidateName.length < 4) continue;
    if (stockOcrEditDistanceCompareStock(
      normalizedName,candidateName
    ) <= 1) {
      found.set(candidateName,item.name);
    }
  }

  return Array.from(found.values());
}

function stockOcrGetLatestPriorHoldingsCompareStock(
  data,accountId,targetDate
) {
  const prior = data.holdings.filter(item =>
    item.accountId === accountId && item.asOfDate < targetDate
  );
  if (prior.length === 0) return {asOfDate:null,holdings:[]};

  const asOfDate = prior.reduce((latest,item) =>
    !latest || item.asOfDate > latest ? item.asOfDate : latest,
    null
  );

  return {
    asOfDate,
    holdings:prior.filter(item => item.asOfDate === asOfDate)
  };
}

function stockOcrCompareCardsStock(
  data,accountId,cards,targetDate,screenTotalValue = null
) {
  if (!data || !Array.isArray(data.holdings) ||
      !Array.isArray(data.snapshots) || !Array.isArray(cards)) {
    throw new Error("株式OCRの比較データが正しくありません。");
  }

  const account = data.accounts.find(item =>
    item.id === accountId && item.category === "stock"
  );
  if (!account) throw new Error("比較対象の株式口座がありません。");

  const comparedCards = cards.map(card => {
    const previous = card.name && card.wrapper
      ? stockOcrGetPreviousHoldingStock(
          data,accountId,card.name,card.wrapper,targetDate
        )
      : null;
    const similarNames = !previous && card.name && card.wrapper
      ? stockOcrFindSimilarNamesCompareStock(
          data,accountId,card.name,card.wrapper,targetDate
        )
      : [];

    let comparison = "new";
    let costDifference = null;
    let quantityDifference = null;
    let wrapperWarning = false;

    if (previous) {
      if (card.costBasis === null || card.costBasis === undefined ||
          previous.costBasis === null || previous.costBasis === undefined ||
          card.value === null || card.value === undefined ||
          previous.value === null || previous.value === undefined) {
        comparison = "unavailable";
      } else {
        costDifference = card.costBasis - previous.costBasis;

        if (costDifference > 0) {
          comparison = "cost-increase";
        } else if (costDifference < 0) {
          comparison = "cost-decrease";
        } else if (card.value !== previous.value) {
          comparison = "value-change";
        } else {
          comparison = "unchanged";
        }

        if (typeof previous.costBasis === "number" &&
            previous.costBasis !== 0) {
          wrapperWarning =
            Math.abs(costDifference / previous.costBasis) > 0.5;
        }
      }

      if (typeof card.quantity === "number" &&
          typeof previous.quantity === "number") {
        quantityDifference = card.quantity - previous.quantity;
      }
    }

    const duplicateKey = stockOcrGetImportKeyStock(
      accountId,card.name,card.wrapper,targetDate
    );
    const duplicate = data.holdings.some(item =>
      stockOcrGetImportKeyStock(
        item.accountId,item.name,item.wrapper,item.asOfDate
      ) === duplicateKey
    );

    return {
      ...card,
      comparison,
      previousHolding:previous,
      costDifference,
      quantityDifference,
      wrapperWarning,
      similarNames,
      duplicate
    };
  });

  const prior = stockOcrGetLatestPriorHoldingsCompareStock(
    data,accountId,targetDate
  );
  const currentKeys = new Set(comparedCards
    .filter(card => card.name && card.wrapper)
    .map(card => JSON.stringify([
      stockOcrNormalizeCompareNameStock(card.name),card.wrapper
    ]))
  );
  const missingHoldings = prior.holdings.filter(item =>
    !currentKeys.has(JSON.stringify([
      stockOcrNormalizeCompareNameStock(item.name),item.wrapper
    ]))
  );

  const allValuesKnown = comparedCards.every(card =>
    typeof card.value === "number" && Number.isFinite(card.value)
  );
  const holdingsTotal = allValuesKnown
    ? comparedCards.reduce((total,card) => total + card.value,0)
    : null;

  const previousValuesKnown = prior.holdings.length > 0 &&
    prior.holdings.every(item =>
      typeof item.value === "number" && Number.isFinite(item.value)
    );
  const previousHoldingsTotal = previousValuesKnown
    ? prior.holdings.reduce((total,item) => total + item.value,0)
    : null;
  const holdingsTotalChange =
    previousHoldingsTotal !== null && holdingsTotal !== null
      ? holdingsTotal - previousHoldingsTotal
      : null;

  const latestSnapshot = typeof getLatestSnapshot === "function"
    ? getLatestSnapshot(data,accountId)
    : data.snapshots
        .filter(item => item.accountId === accountId)
        .sort((a,b) =>
          b.asOfDate.localeCompare(a.asOfDate) ||
          String(b.recordedAt || "").localeCompare(String(a.recordedAt || ""))
        )[0] || null;
  const accountValue = latestSnapshot &&
    typeof latestSnapshot.value === "number"
      ? latestSnapshot.value
      : null;
  const difference = holdingsTotal !== null && accountValue !== null
    ? accountValue - holdingsTotal
    : null;
  const differenceRate = difference !== null && accountValue !== 0
    ? Math.abs(difference) / Math.abs(accountValue)
    : difference === 0 ? 0 : null;

  const screenTotal = screenTotalValue &&
    screenTotalValue.status === "recognized" &&
    typeof screenTotalValue.value === "number" &&
    Number.isFinite(screenTotalValue.value)
      ? screenTotalValue.value
      : null;
  const screenTotalDifference =
    screenTotal !== null && holdingsTotal !== null
      ? screenTotal - holdingsTotal
      : null;

  return {
    accountId,
    accountName:account.name,
    targetDate,
    cards:comparedCards,
    previousDate:prior.asOfDate,
    missingHoldings,
    holdingsTotal,
    accountValue,
    accountSnapshotDate:latestSnapshot ? latestSnapshot.asOfDate : null,
    difference,
    differenceRate,
    previousHoldingsTotal,
    holdingsTotalChange,
    differenceWarning:differenceRate !== null && differenceRate > 0.05,
    screenTotal,
    screenTotalDifference,
    screenTotalMismatch:
      screenTotalDifference !== null && screenTotalDifference !== 0
  };
}
