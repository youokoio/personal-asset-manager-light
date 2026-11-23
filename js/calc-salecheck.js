"use strict";

/* ---------- 売却・利確候補の検出 ---------- */

const SALECHECK_OLD_DAYS = 366;
const SALECHECK_LONG_GAP_DAYS = 62;
const SALECHECK_SOURCES = [
  "取引履歴",
  "実現損益の画面",
  "その他の書類"
];

function isValidSaleCheckDate(value) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parts = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(0,0,0,0);
  date.setUTCFullYear(parts[0],parts[1] - 1,parts[2]);

  return date.getUTCFullYear() === parts[0] &&
    date.getUTCMonth() === parts[1] - 1 &&
    date.getUTCDate() === parts[2];
}

function getSaleCheckDateDays(fromDate,toDate) {
  if (!isValidSaleCheckDate(fromDate) ||
      !isValidSaleCheckDate(toDate) ||
      fromDate > toDate) {
    return null;
  }

  const fromParts = fromDate.split("-").map(Number);
  const toParts = toDate.split("-").map(Number);
  const from = new Date(0);
  const to = new Date(0);
  from.setUTCHours(0,0,0,0);
  to.setUTCHours(0,0,0,0);
  from.setUTCFullYear(fromParts[0],fromParts[1] - 1,fromParts[2]);
  to.setUTCFullYear(toParts[0],toParts[1] - 1,toParts[2]);

  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function getSaleCheckCandidateKey(item) {
  return JSON.stringify([
    item.accountId,
    item.level,
    item.productName === undefined ? null : item.productName,
    item.wrapper === undefined ? null : item.wrapper,
    item.toDate
  ]);
}

function getSaleCheckHoldingUnitKey(item) {
  return JSON.stringify([
    item.accountId,
    item.name,
    item.wrapper
  ]);
}

function getSaleCheckGapNote(gapDays) {
  return gapDays > SALECHECK_LONG_GAP_DAYS
    ? "間隔が長く、複数回の取引を含む可能性があります"
    : null;
}

function isWithinSaleCheckCompletenessTolerance(totalAssets,holdingsTotal) {
  if (totalAssets === 0) return holdingsTotal === 0;

  const difference = Math.abs(totalAssets - holdingsTotal);
  if (Number.isSafeInteger(difference) &&
      Number.isSafeInteger(totalAssets)) {
    return BigInt(difference) * 100n <= BigInt(totalAssets) * 5n;
  }

  return difference * 100 <= totalAssets * 5;
}

function getSaleCheckAccountSnapshotOnDate(data,accountId,asOfDate) {
  return getAccountSnapshots(data,accountId).find(snapshot =>
    snapshot.asOfDate === asOfDate
  ) || null;
}

function getSaleCheckCandidateStatus(candidate,saleChecks) {
  const record = (Array.isArray(saleChecks) ? saleChecks : []).find(item =>
    getSaleCheckCandidateKey(item) ===
      getSaleCheckCandidateKey(candidate)
  );

  if (!record) {
    return {status:"未確認",record:null};
  }

  return {
    status:record.status === "解除"
      ? "解除済み"
      : "利確確認済み",
    record
  };
}

function getSaleCheckRecordStatus(record) {
  if (!record || record.status !== "利確確認済み") return null;
  return record.manual === true
    ? "利確確認済み（候補なし）"
    : "利確確認済み";
}

function createSaleCheckCandidate(data,values,saleChecks) {
  const gapDays = getSaleCheckDateDays(
    values.fromDate,
    values.toDate
  );
  const candidate = {
    ...values,
    gapDays,
    gapNote:getSaleCheckGapNote(gapDays),
    hints:[]
  };
  const state = getSaleCheckCandidateStatus(candidate,saleChecks);
  candidate.status = state.status;
  candidate.saleCheck = state.record;
  candidate.hints = getSaleCheckHints(candidate,data);
  return candidate;
}

function calculateSaleCheckCandidates(data,today) {
  if (!data || !Array.isArray(data.accounts) ||
      !Array.isArray(data.snapshots) ||
      !Array.isArray(data.holdings)) {
    throw new Error("売却候補の検出に必要なデータがありません。");
  }
  if (!isValidSaleCheckDate(today)) {
    throw new Error("売却候補の判定日が正しくありません。");
  }

  const saleChecks = Array.isArray(data.saleChecks)
    ? data.saleChecks
    : [];
  const candidates = [];
  const warnings = [];
  const noComparison = [];
  let incomparableCount = 0;

  const stockAccounts = data.accounts.filter(account =>
    getCategory(account) === "stock"
  );

  for (const account of stockAccounts) {
    const snapshots = getAccountSnapshots(data,account.id)
      .slice()
      .sort((a,b) => a.asOfDate.localeCompare(b.asOfDate));

    if (snapshots.length < 2) {
      if (snapshots.length === 1) {
        noComparison.push({
          accountId:account.id,
          level:"口座全体",
          productName:null,
          wrapper:null,
          message:"比較できる過去記録がありません"
        });
      }
    }

    for (let index = 1; index < snapshots.length; index += 1) {
      const previous = snapshots[index - 1];
      const current = snapshots[index];
      const values = [
        previous.effectivePrincipal,
        current.effectivePrincipal,
        previous.value,
        current.value
      ];

      if (!values.every(isFiniteMetricValue)) {
        incomparableCount += 1;
        continue;
      }

      if (current.effectivePrincipal < previous.effectivePrincipal &&
          current.value < previous.value) {
        candidates.push(createSaleCheckCandidate(data,{
          accountId:account.id,
          accountName:account.name,
          level:"口座全体",
          productName:null,
          wrapper:null,
          fromDate:previous.asOfDate,
          toDate:current.asOfDate,
          oldCostBasis:previous.effectivePrincipal,
          newCostBasis:current.effectivePrincipal,
          oldValue:previous.value,
          newValue:current.value,
          kind:"decrease"
        },saleChecks));
      }
    }
  }

  const holdingGroups = new Map();

  for (const item of data.holdings) {
    const account = data.accounts.find(account =>
      account.id === item.accountId
    );
    if (!account || getCategory(account) !== "stock") continue;

    const key = getSaleCheckHoldingUnitKey(item);
    if (!holdingGroups.has(key)) holdingGroups.set(key,[]);
    holdingGroups.get(key).push(item);
  }

  const firstLaterDates = new Map();

  for (const [key,records] of holdingGroups.entries()) {
    records.sort((a,b) => a.asOfDate.localeCompare(b.asOfDate) ||
      String(a.recordedAt || "").localeCompare(
        String(b.recordedAt || "")
      ));

    if (records.length < 2) {
      const first = records[0];
      if (first) {
        noComparison.push({
          accountId:first.accountId,
          level:"商品別",
          productName:first.name,
          wrapper:first.wrapper,
          message:"比較できる過去記録がありません"
        });
      }
    }

    for (let index = 1; index < records.length; index += 1) {
      const previous = records[index - 1];
      const current = records[index];
      const values = [
        previous.costBasis,
        current.costBasis,
        previous.value,
        current.value
      ];

      if (!values.every(isFiniteMetricValue)) {
        incomparableCount += 1;
        continue;
      }

      if (current.costBasis < previous.costBasis &&
          current.value < previous.value) {
        candidates.push(createSaleCheckCandidate(data,{
          accountId:previous.accountId,
          accountName:data.accounts.find(account =>
            account.id === previous.accountId
          )?.name || null,
          level:"商品別",
          productName:previous.name,
          wrapper:previous.wrapper,
          fromDate:previous.asOfDate,
          toDate:current.asOfDate,
          oldCostBasis:previous.costBasis,
          newCostBasis:current.costBasis,
          oldValue:previous.value,
          newValue:current.value,
          kind:"decrease"
        },saleChecks));
      }
    }

    const last = records[records.length - 1];
    const laterDates = Array.from(new Set(
      data.holdings
        .filter(item =>
          item.accountId === last.accountId &&
          item.asOfDate > last.asOfDate
        )
        .map(item => item.asOfDate)
    )).sort();

    if (laterDates.length && isFiniteMetricValue(last.value)) {
      const d2 = laterDates[0];
      const missingOnD2 = !data.holdings.some(item =>
        item.accountId === last.accountId &&
        item.name === last.name &&
        item.wrapper === last.wrapper &&
        item.asOfDate === d2
      );

      if (missingOnD2) {
        firstLaterDates.set(key,{last,d2});
      }
    }
  }

  for (const {last,d2} of firstLaterDates.values()) {
    const accountSnapshot = getSaleCheckAccountSnapshotOnDate(
      data,
      last.accountId,
      d2
    );
    const totalAssets = accountSnapshot && accountSnapshot.value;
    const valuesOnDate = data.holdings.filter(item =>
      item.accountId === last.accountId &&
      item.asOfDate === d2
    );
    const holdingsTotal = valuesOnDate.reduce((total,item) =>
      total + (isFiniteMetricValue(item.value) ? item.value : 0),
      0
    );

    let confirmedComplete = false;

    if (isFiniteMetricValue(totalAssets) && totalAssets >= 0) {
      confirmedComplete = isWithinSaleCheckCompletenessTolerance(
        totalAssets,
        holdingsTotal
      );
    }

    if (confirmedComplete) {
      candidates.push(createSaleCheckCandidate(data,{
        accountId:last.accountId,
        accountName:data.accounts.find(account =>
          account.id === last.accountId
        )?.name || null,
        level:"商品別",
        productName:last.name,
        wrapper:last.wrapper,
        fromDate:last.asOfDate,
        toDate:d2,
        oldCostBasis:last.costBasis,
        newCostBasis:null,
        oldValue:last.value,
        newValue:null,
        kind:"disappearance"
      },saleChecks));
    } else {
      warnings.push({
        accountId:last.accountId,
        productName:last.name,
        wrapper:last.wrapper,
        fromDate:last.asOfDate,
        toDate:d2,
        message:`${last.name}の記録が ${d2} にありません（入力漏れの可能性）`
      });
    }
  }

  candidates.sort((a,b) =>
    b.toDate.localeCompare(a.toDate) ||
    a.accountName.localeCompare(b.accountName,"ja") ||
    a.level.localeCompare(b.level,"ja") ||
    String(a.productName || "").localeCompare(
      String(b.productName || ""),
      "ja"
    ) ||
    String(a.wrapper || "").localeCompare(
      String(b.wrapper || ""),
      "ja"
    )
  );

  return {
    candidates,
    incomparableCount,
    warnings,
    noComparison
  };
}

function classifyOldSaleCheckCandidates(candidates,today) {
  if (!Array.isArray(candidates) || !isValidSaleCheckDate(today)) {
    throw new Error("古い候補の分類に必要な値が正しくありません。");
  }

  const current = [];
  const old = [];

  for (const candidate of candidates) {
    const ageDays = getSaleCheckDateDays(candidate.toDate,today);
    const item = {
      ...candidate,
      ageDays,
      isOld:ageDays !== null && ageDays > SALECHECK_OLD_DAYS
    };
    (item.isOld ? old : current).push(item);
  }

  return {current,old};
}
