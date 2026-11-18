"use strict";

/* ---------- 住宅ローン計算 ---------- */

function getLatestLoanSnapshot(data,loanId) {
  return data.loanSnapshots
    .filter(item => item.loanId === loanId)
    .sort((a,b) => {
      if (a.asOfDate !== b.asOfDate) {
        return b.asOfDate.localeCompare(a.asOfDate);
      }
      return String(b.recordedAt || "").localeCompare(
        String(a.recordedAt || "")
      );
    })[0] || null;
}

function calculateLoanMonthlyBreakdown(
  balance,
  annualRatePct,
  monthlyPayment
) {
  if (!isFiniteMetricValue(balance) ||
      !isFiniteMetricValue(annualRatePct) ||
      !isFiniteMetricValue(monthlyPayment) ||
      balance < 0 ||
      annualRatePct < 0 ||
      monthlyPayment < 0) {
    return null;
  }

  const monthlyRate = annualRatePct / 100 / 12;
  const interest = Math.floor(balance * monthlyRate);
  const principal = monthlyPayment - interest;

  return {
    balance,
    annualRatePct,
    monthlyPayment,
    interest,
    principal,
    unpaidInterest:principal < 0,
    nextBalance:balance - principal
  };
}

function calculateLoanDebtSummary(data,totalAssets) {
  const loans = Array.isArray(data.loans) ? data.loans : [];
  const loanSnapshots = Array.isArray(data.loanSnapshots)
    ? data.loanSnapshots
    : [];

  let debtTotal = 0;
  let recordedLoanCount = 0;

  for (const loan of loans) {
    const latest = getLatestLoanSnapshot(
      {loanSnapshots},
      loan.id
    );

    if (!latest || !isFiniteMetricValue(latest.balance)) {
      continue;
    }

    debtTotal += latest.balance;
    recordedLoanCount += 1;
  }

  const isComplete = loans.length > 0 &&
    recordedLoanCount === loans.length;

  const debt = isComplete ? debtTotal : null;
  const netWorth = isComplete && isFiniteMetricValue(totalAssets)
    ? totalAssets - debtTotal
    : null;

  return {
    debt,
    netWorth,
    loanCount:loans.length,
    recordedLoanCount,
    isComplete
  };
}
