"use strict";

/* ---------- 定数・初期データ ---------- */

const APP_VERSION = "S1d追補B-v1";
const SPEC_VERSION = "v1.4";
const STORAGE_KEY = "pam2";
const SCHEMA_VERSION = 2;

const INITIAL_ACCOUNTS = [
  {name:"LIGHT FX", type:"fx", category:"fx"},
  {name:"セントラル短資FX", type:"fx", category:"fx"},
  {name:"クリック365", type:"fx", category:"fx"},
  {name:"LION FX", type:"fx", category:"fx"},
  {name:"楽天証券", type:"securities", category:"stock"},
  {name:"iDeCo", type:"ideco", category:"stock"},
  {name:"企業型DC", type:"dc", category:"stock"},
  {name:"GMOコイン", type:"crypto", category:"crypto"},
  {name:"UFJ1", type:"bank", category:"bank"},
  {name:"UFJ2", type:"bank", category:"bank"},
  {name:"三井住友", type:"bank", category:"bank"},
  {name:"楽天銀行", type:"bank", category:"bank"},
  {name:"静岡銀行", type:"bank", category:"bank"},
  {name:"ドコモSMTB", type:"bank", category:"bank"}
];

const FX_ACCOUNT_SETTINGS = {
  "LIGHT FX": {marginRatePct:4,lossCutRatio:100},
  "セントラル短資FX": {marginRatePct:5,lossCutRatio:100},
  "クリック365": {marginRatePct:4,lossCutRatio:50},
  "LION FX": {marginRatePct:4,lossCutRatio:100}
};

const TYPE_LABELS = {
  bank:"銀行",
  fx:"FX",
  securities:"証券",
  ideco:"iDeCo",
  dc:"企業型DC",
  crypto:"暗号資産",
  other:"その他"
};

const CATEGORY_LABELS = {
  fx:"FX",
  stock:"株式",
  crypto:"暗号資産",
  bank:"銀行"
};

/* ---------- 基本関数 ---------- */

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "id-" + Date.now().toString(36) + "-" +
    Math.random().toString(36).slice(2);
}

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2,"0");
  const d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function formatDateWithWeekday(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value || "未入力";
  }

  const parts = value.split("-").map(Number);
  const date = new Date(parts[0],parts[1] - 1,parts[2]);
  const weekdays = ["日","月","火","水","木","金","土"];

  if (date.getFullYear() !== parts[0] ||
      date.getMonth() !== parts[1] - 1 ||
      date.getDate() !== parts[2]) {
    return value;
  }

  return value + "（" + weekdays[date.getDay()] + "）";
}

function toNumberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatYen(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "未入力";
  }
  return "¥" + Math.round(value).toLocaleString("ja-JP");
}

function formatSignedYen(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "未入力";
  }
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return sign + "¥" + Math.abs(Math.round(value)).toLocaleString("ja-JP");
}

function isFiniteMetricValue(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/* ---------- スナップショット ---------- */

function compareSnapshots(a,b) {
  if (a.asOfDate !== b.asOfDate) {
    return b.asOfDate.localeCompare(a.asOfDate);
  }
  return String(b.recordedAt || "").localeCompare(
    String(a.recordedAt || "")
  );
}

function getAccountSnapshots(data, accountId) {
  const snapshots = data.snapshots.filter(
    snapshot => snapshot.accountId === accountId
  );
  const latestByDate = new Map();

  for (const snapshot of snapshots) {
    const current = latestByDate.get(snapshot.asOfDate);
    if (!current ||
        String(snapshot.recordedAt || "") >
        String(current.recordedAt || "")) {
      latestByDate.set(snapshot.asOfDate, snapshot);
    }
  }

  return Array.from(latestByDate.values()).sort(compareSnapshots);
}

function getLatestSnapshot(data, accountId) {
  return getAccountSnapshots(data,accountId)[0] || null;
}

/* ---------- 30日前からの差 ---------- */

function subtractCalendarDays(dateString,days) {
  if (typeof dateString !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return null;
  }

  const parts = dateString.split("-").map(Number);
  const timestamp = Date.UTC(parts[0],parts[1] - 1,parts[2]);
  const sourceDate = new Date(timestamp);

  if (sourceDate.getUTCFullYear() !== parts[0] ||
      sourceDate.getUTCMonth() !== parts[1] - 1 ||
      sourceDate.getUTCDate() !== parts[2]) {
    return null;
  }

  const target = new Date(timestamp - days * 86400000);
  const year = target.getUTCFullYear();
  const month = String(target.getUTCMonth() + 1).padStart(2,"0");
  const day = String(target.getUTCDate()).padStart(2,"0");

  return `${year}-${month}-${day}`;
}

function calculateDiff30(data) {
  let differenceTotal = 0;
  let comparedAccountCount = 0;
  const accountResults = [];

  for (const account of data.accounts) {
    const snapshots = getAccountSnapshots(data,account.id);
    const current = snapshots[0] || null;

    let baseDate = null;
    let comparison = null;
    let difference = null;
    let comparable = false;

    if (current && isFiniteMetricValue(current.value)) {
      baseDate = subtractCalendarDays(current.asOfDate,30);

      if (baseDate !== null) {
        comparison = snapshots.find(snapshot =>
          snapshot.asOfDate <= baseDate &&
          isFiniteMetricValue(snapshot.value)
        ) || null;
      }

      if (comparison) {
        difference = current.value - comparison.value;
        differenceTotal += difference;
        comparedAccountCount += 1;
        comparable = true;
      }
    }

    accountResults.push({
      accountId:account.id,
      accountName:account.name,
      currentSnapshot:current,
      currentValue:current && isFiniteMetricValue(current.value)
        ? current.value
        : null,
      baseDate,
      comparisonSnapshot:comparison,
      comparisonDate:comparison ? comparison.asOfDate : null,
      comparisonValue:comparison ? comparison.value : null,
      difference,
      comparable
    });
  }

  const excludedAccountCount =
    data.accounts.length - comparedAccountCount;

  return {
    difference:comparedAccountCount > 0 ? differenceTotal : null,
    comparedAccountCount,
    excludedAccountCount,
    isUnavailable:comparedAccountCount === 0,
    accounts:accountResults
  };
}

/* ---------- 分類 ---------- */

function getCategory(account) {
  if (account && Object.prototype.hasOwnProperty.call(
    CATEGORY_LABELS,
    account.category
  )) return account.category;
  if (!account) return "stock";

  switch (account.type) {
    case "fx": return "fx";
    case "securities":
    case "ideco":
    case "dc": return "stock";
    case "crypto": return "crypto";
    case "bank": return "bank";
    default: return "stock";
  }
}

function calculateCategoryTotals(data) {
  const result = {};

  for (const category of Object.keys(CATEGORY_LABELS)) {
    result[category] = {
      category,
      label:CATEGORY_LABELS[category],
      accountCount:0,
      inputAccountCount:0,
      cumulativeInvested:0,
      effectivePrincipal:0,
      pnl:0,
      totalAssets:0,
      realizedPnlTotal:0,
      bankBalance:0,
      bankChange:null,
      bankComparedAccountCount:0,
      bankExcludedAccountCount:0,
      counts:{
        cumulativeInvested:0,
        effectivePrincipal:0,
        pnl:0,
        totalAssets:0,
        realizedPnlTotal:0,
        bankBalance:0
      }
    };
  }

  const diff30 = calculateDiff30(data);

  for (const account of data.accounts) {
    const category = getCategory(account);
    const totals = result[category];
    if (!totals) continue;
    totals.accountCount += 1;

    const latest = getLatestSnapshot(data,account.id);
    if (!latest) continue;
    totals.inputAccountCount += 1;

    if (isFiniteMetricValue(latest.value)) {
      totals.totalAssets += latest.value;
      totals.counts.totalAssets += 1;
      if (category === "bank") {
        totals.bankBalance += latest.value;
        totals.counts.bankBalance += 1;
      }
    }

    for (const field of [
      "cumulativeInvested","effectivePrincipal","pnl","realizedPnlTotal"
    ]) {
      if (isFiniteMetricValue(latest[field])) {
        totals[field] += latest[field];
        totals.counts[field] += 1;
      }
    }
  }

  const bankDiff = diff30.accounts.filter(item =>
    item.comparable &&
    data.accounts.some(account =>
      account.id === item.accountId &&
      getCategory(account) === "bank"
    )
  );

  const bankAccountCount = data.accounts.filter(account =>
    getCategory(account) === "bank"
  ).length;

  result.bank.bankComparedAccountCount = bankDiff.length;
  result.bank.bankExcludedAccountCount =
    bankAccountCount - bankDiff.length;

  result.bank.bankChange = bankDiff.length > 0
    ? bankDiff.reduce((sum,item) => sum + item.difference,0)
    : null;

  for (const totals of Object.values(result)) {
    for (const field of [
      "cumulativeInvested","effectivePrincipal","pnl","totalAssets",
      "realizedPnlTotal","bankBalance"
    ]) {
      if (totals.counts[field] === 0) totals[field] = null;
    }
  }

  return result;
}

/* ---------- ダッシュボード集計 ---------- */

function calculateDashboard(data) {
  let total = 0;
  let includedAccountCount = 0;

  for (const account of data.accounts) {
    const latest = getLatestSnapshot(data,account.id);
    if (!latest || !isFiniteMetricValue(latest.value)) continue;

    total += latest.value;
    includedAccountCount += 1;
  }

  return {
    total:includedAccountCount > 0 ? total : null,
    includedAccountCount,
    difference30:calculateDiff30(data)
  };
}
