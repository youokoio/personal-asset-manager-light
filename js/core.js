"use strict";

/* ---------- 定数・初期データ ---------- */

const APP_VERSION = "S1d追補A-v1";
const SPEC_VERSION = "v1.3.1";
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
  return getAccountSnapshots(data, accountId)[0] || null;
}

function getPreviousSnapshot(data, accountId) {
  return getAccountSnapshots(data, accountId)[1] || null;
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
      bankChange:0,
      counts:{
        cumulativeInvested:0,
        effectivePrincipal:0,
        pnl:0,
        totalAssets:0,
        realizedPnlTotal:0,
        bankBalance:0,
        bankChange:0
      }
    };
  }

  for (const account of data.accounts) {
    const category = getCategory(account);
    const totals = result[category];
    if (!totals) continue;
    totals.accountCount += 1;

    const snapshots = getAccountSnapshots(data,account.id);
    const latest = snapshots[0] || null;
    const previous = snapshots[1] || null;
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

    if (category === "bank" && previous &&
        isFiniteMetricValue(latest.value) &&
        isFiniteMetricValue(previous.value)) {
      totals.bankChange += latest.value - previous.value;
      totals.counts.bankChange += 1;
    }
  }

  for (const totals of Object.values(result)) {
    for (const field of [
      "cumulativeInvested","effectivePrincipal","pnl","totalAssets",
      "realizedPnlTotal","bankBalance","bankChange"
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
  let previousDifference = 0;
  let previousAccountCount = 0;
  const accountRows = [];

  for (const account of data.accounts) {
    const latest = getLatestSnapshot(data,account.id);
    const previous = getPreviousSnapshot(data,account.id);
    const value = latest && isFiniteMetricValue(latest.value)
      ? latest.value
      : null;
    const previousValue = previous &&
      isFiniteMetricValue(previous.value)
      ? previous.value
      : null;

    if (value !== null) {
      total += value;
      includedAccountCount += 1;
    }

    let difference = null;
    if (value !== null && previousValue !== null) {
      difference = value - previousValue;
      previousDifference += difference;
      previousAccountCount += 1;
    }

    accountRows.push({
      account,
      latest,
      previous,
      value,
      difference
    });
  }

  return {
    total:includedAccountCount > 0 ? total : null,
    includedAccountCount,
    difference:previousAccountCount > 0 ? previousDifference : null,
    previousAccountCount,
    excludedPreviousCount:data.accounts.length - previousAccountCount,
    accountRows
  };
}
