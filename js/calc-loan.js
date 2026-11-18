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


function isValidLoanDate(value) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parts = value.split("-").map(Number);
  const date = new Date(Date.UTC(parts[0],parts[1] - 1,parts[2]));
  return date.getUTCFullYear() === parts[0] &&
    date.getUTCMonth() === parts[1] - 1 &&
    date.getUTCDate() === parts[2];
}

function formatLoanDateParts(year,month,day) {
  const lastDay = new Date(Date.UTC(year,month,0)).getUTCDate();
  const actualDay = Math.min(day,lastDay);
  return String(year).padStart(4,"0") + "-" +
    String(month).padStart(2,"0") + "-" +
    String(actualDay).padStart(2,"0");
}

function getLoanRepaymentDates(startDate,endDate,repayDay) {
  if (!isValidLoanDate(startDate) ||
      !isValidLoanDate(endDate) ||
      !Number.isInteger(repayDay) ||
      repayDay < 1 ||
      repayDay > 31 ||
      endDate <= startDate) {
    return [];
  }

  const start = startDate.split("-").map(Number);
  const end = endDate.split("-").map(Number);
  const firstMonth = start[0] * 12 + start[1] - 1;
  const lastMonth = end[0] * 12 + end[1] - 1;
  const dates = [];

  for (let monthIndex = firstMonth; monthIndex <= lastMonth; monthIndex += 1) {
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12 + 1;
    const date = formatLoanDateParts(year,month,repayDay);
    if (date > startDate && date <= endDate) dates.push(date);
  }

  return dates;
}

function calculateLoanForecast(balance,annualRatePct,monthlyPayment,paymentCount) {
  if (!isFiniteMetricValue(balance) ||
      !isFiniteMetricValue(annualRatePct) ||
      !isFiniteMetricValue(monthlyPayment) ||
      !Number.isInteger(paymentCount) ||
      balance < 0 ||
      annualRatePct < 0 ||
      monthlyPayment < 0 ||
      paymentCount < 0) {
    return null;
  }

  let currentBalance = balance;
  let interestTotal = 0;
  let unpaidInterest = false;
  const months = [];

  for (let index = 0; index < paymentCount && currentBalance > 0; index += 1) {
    const breakdown = calculateLoanMonthlyBreakdown(
      currentBalance,
      annualRatePct,
      monthlyPayment
    );
    if (!breakdown) return null;

    const principal = breakdown.principal < 0
      ? breakdown.principal
      : Math.min(breakdown.principal,currentBalance);
    const nextBalance = Math.max(0,currentBalance - principal);

    interestTotal += breakdown.interest;
    if (breakdown.unpaidInterest) unpaidInterest = true;

    months.push({
      month:index + 1,
      balance:currentBalance,
      interest:breakdown.interest,
      principal,
      payment:breakdown.interest + principal,
      nextBalance,
      unpaidInterest:breakdown.unpaidInterest
    });

    currentBalance = nextBalance;
  }

  return {
    balance:currentBalance,
    interestTotal,
    unpaidInterest,
    months,
    paymentCount:months.length
  };
}

function calculateLoanNewMonthlyPayment(
  balance,
  remainingMonths,
  annualRatePct,
  oldPayment,
  rule125
) {
  if (!isFiniteMetricValue(balance) ||
      !Number.isInteger(remainingMonths) ||
      !isFiniteMetricValue(annualRatePct) ||
      balance < 0 ||
      remainingMonths <= 0 ||
      annualRatePct < 0 ||
      (oldPayment !== null &&
       oldPayment !== undefined &&
       (!isFiniteMetricValue(oldPayment) || oldPayment < 0))) {
    return null;
  }

  if (balance === 0) {
    return {
      calculatedPayment:0,
      monthlyPayment:0,
      capped:false,
      capAmount:null
    };
  }

  const monthlyRate = annualRatePct / 100 / 12;
  const calculatedPayment = monthlyRate === 0
    ? balance / remainingMonths
    : balance * monthlyRate /
      (1 - Math.pow(1 + monthlyRate,-remainingMonths));
  const roundedPayment = Math.ceil(calculatedPayment);
  const capAmount = rule125 === true &&
    isFiniteMetricValue(oldPayment)
      ? Math.floor(oldPayment * 1.25)
      : null;
  const capped = capAmount !== null && roundedPayment > capAmount;

  return {
    calculatedPayment:roundedPayment,
    monthlyPayment:capped ? capAmount : roundedPayment,
    capped,
    capAmount
  };
}

function getLoanReviewDates(loan) {
  if (!loan ||
      !isValidLoanDate(loan.reviewDate) ||
      !isValidLoanDate(loan.finalDueDate) ||
      loan.reviewDate > loan.finalDueDate) {
    return [];
  }

  const first = loan.reviewDate.split("-").map(Number);
  const dates = [];

  for (let year = first[0]; ; year += 5) {
    const date = formatLoanDateParts(year,first[1],first[2]);
    if (date > loan.finalDueDate) break;
    dates.push(date);
    if (dates.length > 100) break;
  }

  return dates;
}

function calculateLoanRecentBreakdown(
  balance,
  annualRatePct,
  monthlyPayment,
  monthCount = 12
) {
  return calculateLoanForecast(
    balance,
    annualRatePct,
    monthlyPayment,
    monthCount
  );
}

function calculateLoanScenarioTable(loan,snapshot,scenarioRates = []) {
  if (!loan ||
      !snapshot ||
      !isValidLoanDate(snapshot.asOfDate) ||
      !isValidLoanDate(loan.finalDueDate) ||
      !Number.isInteger(loan.repayDay) ||
      loan.repayDay < 1 ||
      loan.repayDay > 31 ||
      !isFiniteMetricValue(snapshot.balance) ||
      !isFiniteMetricValue(snapshot.rate) ||
      !isFiniteMetricValue(loan.monthlyPayment) ||
      snapshot.balance < 0 ||
      snapshot.rate < 0 ||
      loan.monthlyPayment < 0) {
    return null;
  }

  const reviewDates = getLoanReviewDates(loan);
  if (!reviewDates.length || snapshot.asOfDate >= reviewDates[0]) {
    return {rows:[],unpaidInterest:false};
  }

  let balance = snapshot.balance;
  let currentRate = snapshot.rate;
  let currentPayment = loan.monthlyPayment;
  let cursorDate = snapshot.asOfDate;
  let unpaidInterest = false;
  const rows = [];
  const periodInterests = [];

  for (let index = 0; index < reviewDates.length; index += 1) {
    const reviewDate = reviewDates[index];

    if (index === 0) {
      const beforeDates = getLoanRepaymentDates(
        cursorDate,
        reviewDate,
        loan.repayDay
      );
      const before = calculateLoanForecast(
        balance,
        currentRate,
        currentPayment,
        beforeDates.length
      );
      if (!before) return null;
      balance = before.balance;
      unpaidInterest = unpaidInterest || before.unpaidInterest;
    }

    const scenarioRate = isFiniteMetricValue(scenarioRates[index]) &&
      scenarioRates[index] >= 0
        ? scenarioRates[index]
        : currentRate;
    const remainingDates = getLoanRepaymentDates(
      reviewDate,
      loan.finalDueDate,
      loan.repayDay
    );
    const paymentResult = calculateLoanNewMonthlyPayment(
      balance,
      remainingDates.length,
      scenarioRate,
      currentPayment,
      loan.rule125 === true
    );
    if (!paymentResult) {
      rows.push({
        reviewDate,
        forecastBalance:balance,
        remainingMonths:remainingDates.length,
        scenarioRate,
        newPayment:null,
        firstMonth:null,
        difference:null,
        capped:false,
        cumulativeInterestAfterReview:null
      });
      periodInterests.push(null);
      break;
    }

    const firstMonth = remainingDates.length
      ? calculateLoanMonthlyBreakdown(
          balance,
          scenarioRate,
          paymentResult.monthlyPayment
        )
      : null;
    const nextReviewDate = reviewDates[index + 1] ||
      loan.finalDueDate;
    const afterDates = getLoanRepaymentDates(
      reviewDate,
      nextReviewDate,
      loan.repayDay
    );
    const after = calculateLoanForecast(
      balance,
      scenarioRate,
      paymentResult.monthlyPayment,
      afterDates.length
    );
    if (!after) return null;

    periodInterests.push(after.interestTotal);
    unpaidInterest = unpaidInterest || after.unpaidInterest;

    rows.push({
      reviewDate,
      forecastBalance:balance,
      remainingMonths:remainingDates.length,
      scenarioRate,
      newPayment:paymentResult.monthlyPayment,
      calculatedPayment:paymentResult.calculatedPayment,
      firstMonth,
      difference:paymentResult.monthlyPayment - currentPayment,
      capped:paymentResult.capped,
      capAmount:paymentResult.capAmount,
      unpaidInterest:firstMonth ? firstMonth.unpaidInterest : false,
      cumulativeInterestAfterReview:null
    });

    balance = after.balance;
    currentRate = scenarioRate;
    currentPayment = paymentResult.monthlyPayment;
    cursorDate = nextReviewDate;
  }

  let cumulative = 0;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (periodInterests[index] === null) {
      rows[index].cumulativeInterestAfterReview = null;
      continue;
    }
    cumulative += periodInterests[index];
    rows[index].cumulativeInterestAfterReview = cumulative;
  }

  return {
    rows,
    unpaidInterest,
    finalBalance:balance,
    finalDate:cursorDate
  };
}

function calculateLoanCombinedSummary(data) {
  const loans = Array.isArray(data.loans) ? data.loans : [];
  if (!loans.length) {
    return {
      complete:false,
      loanCount:0,
      monthlyPayment:null,
      principal:null,
      interest:null
    };
  }

  let monthlyPayment = 0;
  let principal = 0;
  let interest = 0;

  for (const loan of loans) {
    const snapshot = getLatestLoanSnapshot(data,loan.id);
    if (!snapshot ||
        !isFiniteMetricValue(snapshot.balance) ||
        !isFiniteMetricValue(snapshot.rate) ||
        !isFiniteMetricValue(loan.monthlyPayment)) {
      return {
        complete:false,
        loanCount:loans.length,
        monthlyPayment:null,
        principal:null,
        interest:null
      };
    }

    const breakdown = calculateLoanMonthlyBreakdown(
      snapshot.balance,
      snapshot.rate,
      loan.monthlyPayment
    );
    if (!breakdown) {
      return {
        complete:false,
        loanCount:loans.length,
        monthlyPayment:null,
        principal:null,
        interest:null
      };
    }

    monthlyPayment += loan.monthlyPayment;
    principal += breakdown.principal;
    interest += breakdown.interest;
  }

  return {
    complete:true,
    loanCount:loans.length,
    monthlyPayment,
    principal,
    interest
  };
}
