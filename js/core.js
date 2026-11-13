"use strict";

/* ---------- 定数・初期データ ---------- */

const APP_VERSION = "S5a-v3";
const SPEC_VERSION = "v1.10";
const STORAGE_KEY = "pam2";
const SCHEMA_VERSION = 3;

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

const DEFAULT_FX_FIELD_LABELS = {
  "LIGHT FX":{
    value:"純資産額",
    effectivePrincipal:"口座残高",
    pnl:"建玉評価損益",
    swapTotal:"スワップ"
  },
  "セントラル短資FX":{
    value:"口座清算価値",
    effectivePrincipal:"口座残高",
    pnl:"建玉評価損益",
    swapTotal:"未決済スワップ"
  },
  "クリック365":{
    value:"時価評価総額",
    effectivePrincipal:"口座残高",
    pnl:"未決済建玉評価損益",
    swapTotal:"累計スワップ"
  },
  "LION FX":{
    value:"有効証拠金",
    effectivePrincipal:"預託証拠金",
    pnl:"ポジション損益",
    swapTotal:"未実現スワップ"
  }
};

function getAccountFieldLabel(account,field,fallback) {
  const value = account && account.fieldLabels
    ? account.fieldLabels[field]
    : null;
  return typeof value === "string" && value.trim()
    ? value
    : fallback;
}

function getDefaultAutoCalc(account) {
  if (account && account.type === "fx") {
    return ["LIGHT FX","クリック365","LION FX"].includes(account.name)
      ? "swap"
      : null;
  }
  if (account && ["securities","ideco","dc"].includes(account.type)) {
    return "principal";
  }
  return null;
}

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
  const normalized = String(value).replace(/,/g,"").trim();
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatInputNumber(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = toNumberOrNull(value);
  if (number === null) return String(value);
  return number.toLocaleString("ja-JP",{
    useGrouping:true,
    maximumFractionDigits:20
  });
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

/* ---------- 入力補助の計算 ---------- */

function getPreviousSnapshotForInput(
  data,
  accountId,
  targetDate,
  excludeSnapshotId = null
) {
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return null;
  }

  return data.snapshots
    .filter(snapshot =>
      snapshot.accountId === accountId &&
      snapshot.id !== excludeSnapshotId &&
      snapshot.asOfDate < targetDate
    )
    .sort((a,b) => {
      if (a.asOfDate !== b.asOfDate) {
        return b.asOfDate.localeCompare(a.asOfDate);
      }
      return String(b.recordedAt || "").localeCompare(
        String(a.recordedAt || "")
      );
    })[0] || null;
}

function getAllowedAutoCalcValues(account) {
  const category = getCategory(account);

  if (category === "fx") {
    return account && account.name === "セントラル短資FX"
      ? [""]
      : ["","swap"];
  }

  if (category === "stock") return ["","principal"];

  return [""];
}

function calculateAutoCalcValue(account,values) {
  if (!account || !values) return null;

  if (account.autoCalc === "principal") {
    if (!isFiniteMetricValue(values.value) ||
        !isFiniteMetricValue(values.pnl)) {
      return null;
    }
    return values.value - values.pnl;
  }

  if (account.autoCalc === "swap") {
    if (!isFiniteMetricValue(values.value) ||
        !isFiniteMetricValue(values.effectivePrincipal) ||
        !isFiniteMetricValue(values.pnl)) {
      return null;
    }
    return values.value - values.effectivePrincipal - values.pnl;
  }

  return null;
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
      latestByDate.set(snapshot.asOfDate,snapshot);
    }
  }

  return Array.from(latestByDate.values()).sort(compareSnapshots);
}

function getLatestSnapshot(data, accountId) {
  return getAccountSnapshots(data,accountId)[0] || null;
}

/* ---------- 商品別保有 ---------- */

const HOLDING_WRAPPERS = [
  "NISAつみたて",
  "NISA成長",
  "旧つみたてNISA",
  "特定",
  "iDeCo",
  "企業型DC",
  "なし"
];

const HOLDING_KINDS = [
  "投信",
  "国内株",
  "元本確保型",
  "暗号資産",
  "その他"
];

function isHoldingsAccount(account) {
  if (!account) return false;

  const category = getCategory(account);
  if (category === "stock") {
    return ["securities","ideco","dc"].includes(account.type);
  }

  return category === "crypto" && account.type === "crypto";
}

function getLatestHoldingsForAccount(data,accountId) {
  const accountHoldings = data.holdings.filter(item =>
    item.accountId === accountId
  );

  if (!accountHoldings.length) {
    return {asOfDate:null,holdings:[]};
  }

  const latest = accountHoldings.reduce((current,item) => {
    if (!current || item.asOfDate > current.asOfDate) return item;
    if (item.asOfDate === current.asOfDate &&
        String(item.recordedAt || "") > String(current.recordedAt || "")) {
      return item;
    }
    return current;
  },null);

  const asOfDate = latest.asOfDate;
  return {
    asOfDate,
    holdings:accountHoldings
      .filter(item => item.asOfDate === asOfDate)
      .sort((a,b) => a.name.localeCompare(b.name,"ja") ||
        a.wrapper.localeCompare(b.wrapper,"ja"))
  };
}

function getHoldingImportKey(item) {
  return JSON.stringify([
    item.accountId,
    typeof item.name === "string" ? item.name.trim() : item.name,
    item.wrapper,
    item.asOfDate
  ]);
}

function calculateHoldingsSummary(data,accountId) {
  const latest = getLatestHoldingsForAccount(data,accountId);
  const wrapperTotals = {};

  for (const wrapper of HOLDING_WRAPPERS) {
    wrapperTotals[wrapper] = 0;
  }

  let total = 0;
  let hasValue = false;

  for (const item of latest.holdings) {
    if (!isFiniteMetricValue(item.value)) continue;
    total += item.value;
    wrapperTotals[item.wrapper] =
      (wrapperTotals[item.wrapper] || 0) + item.value;
    hasValue = true;
  }

  const accountSnapshot = getLatestSnapshot(data,accountId);
  const accountValue = accountSnapshot &&
    isFiniteMetricValue(accountSnapshot.value)
      ? accountSnapshot.value
      : null;
  const holdingsTotal = hasValue ? total : null;

  return {
    asOfDate:latest.asOfDate,
    holdings:latest.holdings,
    wrapperTotals,
    total:holdingsTotal,
    accountValue,
    difference:holdingsTotal !== null && accountValue !== null
      ? accountValue - holdingsTotal
      : null
  };
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

function getFxDataMappingTargets(data) {
  const fxAccounts = new Map(
    data.accounts
      .filter(account => account.type === "fx")
      .map(account => [account.id,account.name])
  );

  return data.snapshots
    .filter(snapshot =>
      fxAccounts.has(snapshot.accountId) &&
      (snapshot.effectivePrincipal === null ||
       snapshot.effectivePrincipal === undefined) &&
      isFiniteMetricValue(snapshot.cash)
    )
    .map(snapshot => ({
      snapshotId:snapshot.id,
      accountId:snapshot.accountId,
      accountName:fxAccounts.get(snapshot.accountId),
      asOfDate:snapshot.asOfDate,
      cash:snapshot.cash
    }));
}

function applyFxDataMapping(data,targets) {
  const nextData = JSON.parse(JSON.stringify(data));
  const targetById = new Map(
    targets.map(target => [target.snapshotId,target])
  );
  const fxAccountIds = new Set(
    nextData.accounts
      .filter(account => account.type === "fx")
      .map(account => account.id)
  );

  for (const snapshot of nextData.snapshots) {
    const target = targetById.get(snapshot.id);
    if (!target ||
        !fxAccountIds.has(snapshot.accountId) ||
        target.accountId !== snapshot.accountId ||
        (snapshot.effectivePrincipal !== null &&
         snapshot.effectivePrincipal !== undefined) ||
        snapshot.cash !== target.cash ||
        !isFiniteMetricValue(snapshot.cash)) {
      continue;
    }
    snapshot.effectivePrincipal = snapshot.cash;
  }

  return nextData;
}

function calculateCategoryTotals(data) {
  const result = {};

  for (const category of Object.keys(CATEGORY_LABELS)) {
    result[category] = {
      category,
      label:CATEGORY_LABELS[category],
      accountCount:0,
      inputAccountCount:0,
      effectivePrincipal:0,
      pnl:0,
      totalAssets:0,
      realizedPnlTotal:0,
      bankBalance:0,
      bankChange:null,
      bankComparedAccountCount:0,
      bankExcludedAccountCount:0,
      counts:{
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
    if (latest) {
      totals.inputAccountCount += 1;

      if (isFiniteMetricValue(latest.value)) {
        totals.totalAssets += latest.value;
        totals.counts.totalAssets += 1;
        if (category === "bank") {
          totals.bankBalance += latest.value;
          totals.counts.bankBalance += 1;
        }
      }
    } else if (isHoldingsAccount(account)) {
      const holdingsSummary = calculateHoldingsSummary(data,account.id);
      if (isFiniteMetricValue(holdingsSummary.total)) {
        totals.inputAccountCount += 1;
        totals.totalAssets += holdingsSummary.total;
        totals.counts.totalAssets += 1;
      }
    }

    if (!latest) continue;

    for (const field of [
      "effectivePrincipal","pnl","realizedPnlTotal"
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
      "effectivePrincipal","pnl","totalAssets",
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
    if (latest && isFiniteMetricValue(latest.value)) {
      total += latest.value;
      includedAccountCount += 1;
      continue;
    }

    if (!latest && isHoldingsAccount(account)) {
      const holdingsSummary = calculateHoldingsSummary(data,account.id);
      if (isFiniteMetricValue(holdingsSummary.total)) {
        total += holdingsSummary.total;
        includedAccountCount += 1;
      }
    }
  }

  return {
    total:includedAccountCount > 0 ? total : null,
    includedAccountCount,
    difference30:calculateDiff30(data)
  };
}
