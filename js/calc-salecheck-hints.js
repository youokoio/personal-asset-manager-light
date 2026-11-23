"use strict";

/* ---------- 売却・利確候補のヒント ---------- */

function getSaleCheckMonth(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value.slice(0,7)
      : null;
}

function getSaleCheckPreviousHolding(data,accountId,name,wrapper,date) {
  return data.holdings
    .filter(item =>
      item.accountId === accountId &&
      item.name === name &&
      item.wrapper === wrapper &&
      item.asOfDate <= date &&
      isFiniteMetricValue(item.costBasis)
    )
    .sort((a,b) =>
      b.asOfDate.localeCompare(a.asOfDate) ||
      String(b.recordedAt || "").localeCompare(
        String(a.recordedAt || "")
      )
    )[0] || null;
}

function getSaleCheckLatestHolding(data,accountId,name,wrapper,date) {
  return data.holdings
    .filter(item =>
      item.accountId === accountId &&
      item.name === name &&
      item.wrapper === wrapper &&
      item.asOfDate <= date
    )
    .sort((a,b) =>
      b.asOfDate.localeCompare(a.asOfDate) ||
      String(b.recordedAt || "").localeCompare(
        String(a.recordedAt || "")
      )
    )[0] || null;
}

function hasSaleCheckReplacementHint(data,candidate) {
  if (candidate.level !== "商品別" ||
      !isFiniteMetricValue(candidate.oldCostBasis) ||
      (candidate.kind !== "disappearance" &&
       !isFiniteMetricValue(candidate.newCostBasis))) {
    return false;
  }

  const newCostBasis = candidate.kind === "disappearance"
    ? 0
    : candidate.newCostBasis;
  const decrease = candidate.oldCostBasis - newCostBasis;

  if (decrease <= 0) return false;

  const otherUnits = new Map();

  for (const item of data.holdings) {
    if (item.accountId !== candidate.accountId ||
        item.name === candidate.productName &&
        item.wrapper === candidate.wrapper) {
      continue;
    }

    const key = JSON.stringify([item.name,item.wrapper]);
    if (!otherUnits.has(key)) {
      otherUnits.set(key,{
        name:item.name,
        wrapper:item.wrapper
      });
    }
  }

  let increaseTotal = 0;

  for (const unit of otherUnits.values()) {
    const previous = getSaleCheckPreviousHolding(
      data,
      candidate.accountId,
      unit.name,
      unit.wrapper,
      candidate.fromDate
    );
    const current = getSaleCheckLatestHolding(
      data,
      candidate.accountId,
      unit.name,
      unit.wrapper,
      candidate.toDate
    );

    const previousCost = previous
      ? previous.costBasis
      : 0;
    const currentCost = current &&
      isFiniteMetricValue(current.costBasis)
        ? current.costBasis
        : previousCost;

    if (currentCost > previousCost) {
      increaseTotal += currentCost - previousCost;
    }
  }

  return increaseTotal >= decrease;
}

function getSaleCheckAccountPrincipalAt(data,accountId,date) {
  const snapshot = getSaleCheckAccountSnapshotOnDate(
    data,
    accountId,
    date
  );

  return snapshot && isFiniteMetricValue(snapshot.effectivePrincipal)
    ? snapshot.effectivePrincipal
    : null;
}

function hasSaleCheckTransferHint(data,candidate) {
  if (candidate.level !== "口座全体" ||
      !isFiniteMetricValue(candidate.oldCostBasis) ||
      !isFiniteMetricValue(candidate.newCostBasis)) {
    return false;
  }

  const decrease = candidate.oldCostBasis -
    candidate.newCostBasis;

  if (decrease <= 0) return false;

  for (const account of data.accounts) {
    if (account.id === candidate.accountId ||
        getCategory(account) !== "stock") {
      continue;
    }

    const previousSnapshots = getAccountSnapshots(
      data,
      account.id
    ).filter(snapshot =>
      snapshot.asOfDate <= candidate.fromDate &&
      isFiniteMetricValue(snapshot.effectivePrincipal)
    );

    const currentSnapshots = getAccountSnapshots(
      data,
      account.id
    ).filter(snapshot =>
      snapshot.asOfDate > candidate.fromDate &&
      snapshot.asOfDate <= candidate.toDate &&
      isFiniteMetricValue(snapshot.effectivePrincipal)
    );

    if (!previousSnapshots.length || !currentSnapshots.length) {
      continue;
    }

    const previous = previousSnapshots
      .slice()
      .sort((a,b) => b.asOfDate.localeCompare(a.asOfDate))[0];
    const current = currentSnapshots
      .slice()
      .sort((a,b) => b.asOfDate.localeCompare(a.asOfDate))[0];

    if (current.effectivePrincipal > previous.effectivePrincipal) {
      return true;
    }
  }

  return false;
}

function hasSaleCheckContributionHint(data,candidate) {
  if (!Array.isArray(data.contributions) ||
      !isValidSaleCheckDate(candidate.fromDate) ||
      !isValidSaleCheckDate(candidate.toDate)) {
    return false;
  }

  const fromMonth = getSaleCheckMonth(candidate.fromDate);
  const toMonth = getSaleCheckMonth(candidate.toDate);

  if (!fromMonth || !toMonth || fromMonth >= toMonth) {
    return false;
  }

  const fromParts = fromMonth.split("-").map(Number);
  let year = fromParts[0];
  let month = fromParts[1] + 1;

  if (month > 12) {
    year += 1;
    month = 1;
  }

  const firstMonth = `${year}-${String(month).padStart(2,"0")}`;

  return data.contributions.some(item =>
    item.accountId === candidate.accountId &&
    item.status === "実行" &&
    typeof item.fromMonth === "string" &&
    typeof item.toMonth === "string" &&
    item.fromMonth <= toMonth &&
    item.toMonth >= firstMonth
  );
}

function getSaleCheckHints(candidate,data) {
  const hints = [];

  if (hasSaleCheckReplacementHint(data,candidate)) {
    hints.push("商品の入れ替えの可能性");
  }

  if (hasSaleCheckTransferHint(data,candidate)) {
    hints.push("口座間の移動の可能性");
  }

  if (hasSaleCheckContributionHint(data,candidate)) {
    hints.push(
      "積立があるため、実際の売却額は表示の減少より大きい可能性があります"
    );
  }

  return hints;
}
