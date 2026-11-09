"use strict";

/* ---------- 定数・初期データ ---------- */

const APP_VERSION = "S1b-v1";
const STORAGE_KEY = "pam2";
const SCHEMA_VERSION = 1;

const INITIAL_ACCOUNTS = [
  {name:"LIGHT FX", type:"fx"},
  {name:"セントラル短資FX", type:"fx"},
  {name:"クリック365", type:"fx"},
  {name:"LION FX", type:"fx"},
  {name:"楽天証券", type:"securities"},
  {name:"iDeCo", type:"ideco"},
  {name:"企業型DC", type:"dc"},
  {name:"暗号資産取引所", type:"crypto"}
];

/*
 * FX口座ごとの設定
 * marginRatePct：必要証拠金率
 * lossCutRatio：ロスカット水準（証拠金維持率）
 */
const FX_ACCOUNT_SETTINGS = {
  "LIGHT FX": {
    marginRatePct:4,
    lossCutRatio:100
  },
  "セントラル短資FX": {
    marginRatePct:5,
    lossCutRatio:100
  },
  "クリック365": {
    marginRatePct:4,
    lossCutRatio:50
  },
  "LION FX": {
    marginRatePct:4,
    lossCutRatio:100
  }
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

/* ---------- 純粋関数 ---------- */

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

function compareSnapshots(a,b) {
  if (a.asOfDate !== b.asOfDate) {
    return b.asOfDate.localeCompare(a.asOfDate);
  }
  return String(b.recordedAt).localeCompare(String(a.recordedAt));
}

function getAccountSnapshots(data, accountId) {
  return data.snapshots
    .filter(s => s.accountId === accountId)
    .slice()
    .sort(compareSnapshots);
}

function getLatestSnapshot(data, accountId) {
  return getAccountSnapshots(data, accountId)[0] || null;
}

function getPreviousSnapshot(data, accountId) {
  return getAccountSnapshots(data, accountId)[1] || null;
}

function calculateDashboard(data) {
  let total = 0;
  let previousTotal = 0;
  let previousComplete = true;
  const typeTotals = {};
  const accountRows = [];

  for (const account of data.accounts) {
    const latest = getLatestSnapshot(data, account.id);
    const previous = getPreviousSnapshot(data, account.id);

    const value = latest ? latest.value : null;
    const previousValue = previous ? previous.value : null;

    if (value !== null) {
      total += value;
      typeTotals[account.type] = (typeTotals[account.type] || 0) + value;
    }

    if (previousValue !== null) {
      previousTotal += previousValue;
    } else {
      previousComplete = false;
    }

    accountRows.push({
      account,
      latest,
      previous,
      value,
      difference: latest && previous
        ? latest.value - previous.value
        : null
    });
  }

  return {
    total,
    previousTotal: previousComplete ? previousTotal : null,
    difference: previousComplete ? total - previousTotal : null,
    typeTotals,
    accountRows
  };
}
