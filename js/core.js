"use strict";

/* ---------- 定数・初期データ ---------- */

const APP_VERSION = "S1g-v2";
const SPEC_VERSION = "v1.7";
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

function getAccountSnapshots(data,accountId) {
  const latestByDate = new Map();

  for (const snapshot of data.snapshots) {
    if (snapshot.accountId !== accountId) continue;

    const current = latestByDate.get(snapshot.asOfDate);
    if (!current ||
        String(snapshot.recordedAt || "") >
        String(current.recordedAt || "")) {
      latestByDate.set(snapshot.asOfDate,snapshot);
    }
  }

  return Array.from(latestByDate.values()).sort(compareSnapshots);
}

function getLatestSnapshot(data,accountId) {
  return getAccountSnapshots(data,accountId)[0] || null;
}

/* ---------- 口座分類 ---------- */

function getCategory(account) {
  if (!account) return "other";
  if (account.category && CATEGORY_LABELS[account.category]) {
    return account.category;
  }

  if (account.type === "fx") return "fx";
  if (["securities","ideco","dc"].includes(account.type)) return "stock";
  if (account.type === "crypto") return "crypto";
  if (account.type === "bank") return "bank";
  return "other";
}

/* ---------- 集計 ---------- */

function calculateCategoryTotals(data) {
  const totals = {
    fx:{
      totalAssets:0,
      effectivePrincipal:0,
      pnl:0,
      swapTotal:0,
      accountCount:0
    },
    stock:{
      totalAssets:0,
      effectivePrincipal:0,
      pnl:0,
      realizedPnlTotal:0,
      accountCount:0
    },
    crypto:{
      totalAssets:0,
      effectivePrincipal:0,
      pnl:0,
      accountCount:0
    },
    bank:{
      bankBalance:0,
      accountCount:0
    }
  };

  for (const account of data.accounts) {
    const category = getCategory(account);
    const latest = getLatestSnapshot(data,account.id);
    if (!latest || !totals[category]) continue;

    const target = totals[category];
    target.accountCount += 1;

    if (category === "bank") {
      if (isFiniteMetricValue(latest.value)) {
        target.bankBalance += latest.value;
      }
      continue;
    }

    if (isFiniteMetricValue(latest.value)) {
      target.totalAssets += latest.value;
    }
    if (isFiniteMetricValue(latest.effectivePrincipal)) {
      target.effectivePrincipal += latest.effectivePrincipal;
    }
    if (isFiniteMetricValue(latest.pnl)) {
      target.pnl += latest.pnl;
    }

    if (category === "fx" &&
        isFiniteMetricValue(latest.swapTotal)) {
      target.swapTotal += latest.swapTotal;
    }

    if (category === "stock" &&
        isFiniteMetricValue(latest.realizedPnlTotal)) {
      target.realizedPnlTotal += latest.realizedPnlTotal;
    }
  }

  return totals;
}

/* ---------- 銀行の30日前比較 ---------- */

function subtractCalendarDays(dateString,days) {
  const parts = dateString.split("-").map(Number);
  const date = new Date(parts[0],parts[1] - 1,parts[2]);
  date.setDate(date.getDate() - days);
  return localDateString(date);
}

function calculateDiff30(data) {
  const allLatestDates = data.snapshots
    .map(snapshot => snapshot.asOfDate)
    .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();

  if (!allLatestDates.length) {
    return {
      baseDate:null,
      comparisonDate:null,
      difference:null,
      comparedAccountCount:0,
      excludedAccountCount:0,
      isUnavailable:true,
      accounts:[]
    };
  }

  const latestDate = allLatestDates[allLatestDates.length - 1];
  const baseDate = subtractCalendarDays(latestDate,30);

  const accounts = [];
  let difference = 0;
  let comparedAccountCount = 0;
  let excludedAccountCount = 0;

  for (const account of data.accounts) {
    if (getCategory(account) !== "bank") continue;

    const current = getLatestSnapshot(data,account.id);
    if (!current) continue;

    const previousCandidates = getAccountSnapshots(data,account.id)
      .filter(snapshot => snapshot.asOfDate <= baseDate);

    const previous = previousCandidates[0] || null;

    if (!previous ||
        !isFiniteMetricValue(previous.value) ||
        !isFiniteMetricValue(current.value)) {
      excludedAccountCount += 1;
      accounts.push({
        accountId:account.id,
        accountName:account.name,
        comparable:false,
        currentSnapshot:current,
        comparisonSnapshot:previous,
        difference:null
      });
      continue;
    }

    const accountDifference = current.value - previous.value;
    difference += accountDifference;
    comparedAccountCount += 1;

    accounts.push({
      accountId:account.id,
      accountName:account.name,
      comparable:true,
      currentSnapshot:current,
      comparisonSnapshot:previous,
      comparisonDate:previous.asOfDate,
      difference:accountDifference
    });
  }

  return {
    baseDate,
    comparisonDate:baseDate,
    difference:comparedAccountCount ? difference : null,
    comparedAccountCount,
    excludedAccountCount,
    isUnavailable:comparedAccountCount === 0,
    accounts
  };
}

/* ---------- ホーム集計 ---------- */

function calculateDashboard(data) {
  const totals = calculateCategoryTotals(data);
  const diff30 = calculateDiff30(data);

  const investmentTotal =
    totals.fx.totalAssets +
    totals.stock.totalAssets +
    totals.crypto.totalAssets;

  const bankTotal = totals.bank.bankBalance;

  return {
    totals,
    investmentTotal,
    bankTotal,
    grandTotal:investmentTotal + bankTotal,
    difference30:diff30
  };
}

/* ---------- 初期データ ---------- */

function createInitialData() {
  const now = new Date().toISOString();

  return {
    schemaVersion:SCHEMA_VERSION,
    appVersion:APP_VERSION,
    accounts:INITIAL_ACCOUNTS.map((item,index) => {
      const fxSettings = FX_ACCOUNT_SETTINGS[item.name] || {};
      const fieldLabels = DEFAULT_FX_FIELD_LABELS[item.name] || {};

      return {
        id:"account-" + (index + 1),
        name:item.name,
        type:item.type,
        category:item.category,
        sortOrder:index,
        memo:"",
        lossCutRatio:fxSettings.lossCutRatio ?? null,
        marginRatePct:fxSettings.marginRatePct ?? null,
        fieldLabels:{
          value:fieldLabels.value || null,
          effectivePrincipal:fieldLabels.effectivePrincipal || null,
          pnl:fieldLabels.pnl || null,
          swapTotal:fieldLabels.swapTotal || null
        },
        autoCalc:getDefaultAutoCalc(item),
        createdAt:now,
        updatedAt:now
      };
    }),
    snapshots:[],
    holdings:[],
    fxPositions:[],
    fxRates:[],
    loans:[],
    loanSnapshots:[],
    fxSwapLedger:[],
    settings:{
      targetRatio:150
    }
  };
}

/* ---------- 初期口座の補完 ---------- */

function addMissingInitialAccounts(accounts) {
  const now = new Date().toISOString();

  for (const item of INITIAL_ACCOUNTS) {
    const exists = accounts.some(account => account.name === item.name);
    if (exists) continue;

    const fxSettings = FX_ACCOUNT_SETTINGS[item.name] || {};
    const fieldLabels = DEFAULT_FX_FIELD_LABELS[item.name] || {};

    accounts.push({
      id:createId(),
      name:item.name,
      type:item.type,
      category:item.category,
      sortOrder:accounts.length,
      memo:"",
      lossCutRatio:fxSettings.lossCutRatio ?? null,
      marginRatePct:fxSettings.marginRatePct ?? null,
      fieldLabels:{
        value:fieldLabels.value || null,
        effectivePrincipal:fieldLabels.effectivePrincipal || null,
        pnl:fieldLabels.pnl || null,
        swapTotal:fieldLabels.swapTotal || null
      },
      autoCalc:getDefaultAutoCalc(item),
      createdAt:now,
      updatedAt:now
    });
  }

  return accounts;
}

/* ---------- FX設定補完 ---------- */

function migrateFxAccountSettings(data) {
  for (const account of data.accounts) {
    if (account.type !== "fx") continue;

    const defaults = FX_ACCOUNT_SETTINGS[account.name];
    if (!defaults) continue;

    if (account.lossCutRatio === null ||
        account.lossCutRatio === undefined) {
      account.lossCutRatio = defaults.lossCutRatio;
    }

    if (account.marginRatePct === null ||
        account.marginRatePct === undefined) {
      account.marginRatePct = defaults.marginRatePct;
    }

    if (!account.fieldLabels) {
      const labels = DEFAULT_FX_FIELD_LABELS[account.name] || {};
      account.fieldLabels = {
        value:labels.value || null,
        effectivePrincipal:labels.effectivePrincipal || null,
        pnl:labels.pnl || null,
        swapTotal:labels.swapTotal || null
      };
    }

    if (account.autoCalc === undefined) {
      account.autoCalc = getDefaultAutoCalc(account);
    }
  }
}

/* ---------- v1からv2への移行 ---------- */

function migrateDataV1ToV2(oldData) {
  const data = structuredClone(oldData);

  data.schemaVersion = 2;

  if (!Array.isArray(data.accounts)) data.accounts = [];
  if (!Array.isArray(data.snapshots)) data.snapshots = [];

  for (const account of data.accounts) {
    if (!account.category) {
      account.category = getCategory(account);
    }
  }

  for (const snapshot of data.snapshots) {
    if (snapshot.principal !== undefined &&
        snapshot.effectivePrincipal === undefined) {
      snapshot.effectivePrincipal = snapshot.principal;
    }
    if (snapshot.effectivePrincipal === undefined) {
      snapshot.effectivePrincipal = null;
    }
    if (snapshot.cumulativeInvested === undefined) {
      snapshot.cumulativeInvested = null;
    }
    if (snapshot.pnl === undefined) snapshot.pnl = null;
    if (snapshot.realizedPnlTotal === undefined) {
      snapshot.realizedPnlTotal = null;
    }
  }

  return data;
}

/* ---------- v2からv3への移行 ---------- */

function migrateDataV2ToV3(oldData) {
  const data = structuredClone(oldData);

  data.schemaVersion = 3;

  if (!Array.isArray(data.accounts)) data.accounts = [];
  if (!Array.isArray(data.snapshots)) data.snapshots = [];

  for (const key of [
    "holdings",
    "fxPositions",
    "fxRates",
    "loans",
    "loanSnapshots",
    "fxSwapLedger"
  ]) {
    if (!Array.isArray(data[key])) data[key] = [];
  }

  if (!data.settings || typeof data.settings !== "object") {
    data.settings = {};
  }
  if (data.settings.targetRatio === undefined) {
    data.settings.targetRatio = 150;
  }

  for (const account of data.accounts) {
    if (!account.category) {
      account.category = getCategory(account);
    }

    if (!account.fieldLabels || typeof account.fieldLabels !== "object") {
      const defaults = DEFAULT_FX_FIELD_LABELS[account.name] || {};
      account.fieldLabels = {
        value:defaults.value || null,
        effectivePrincipal:defaults.effectivePrincipal || null,
        pnl:defaults.pnl || null,
        swapTotal:defaults.swapTotal || null
      };
    } else {
      for (const field of [
        "value","effectivePrincipal","pnl","swapTotal"
      ]) {
        if (account.fieldLabels[field] === undefined) {
          const defaults = DEFAULT_FX_FIELD_LABELS[account.name] || {};
          account.fieldLabels[field] = defaults[field] || null;
        }
      }
    }

    if (account.autoCalc === undefined) {
      account.autoCalc = getDefaultAutoCalc(account);
    }
  }

  for (const snapshot of data.snapshots) {
    if (snapshot.effectivePrincipal === undefined) {
      snapshot.effectivePrincipal =
        snapshot.principal !== undefined
          ? snapshot.principal
          : null;
    }
    if (snapshot.cumulativeInvested === undefined) {
      snapshot.cumulativeInvested = null;
    }
    if (snapshot.pnl === undefined) snapshot.pnl = null;
    if (snapshot.realizedPnlTotal === undefined) {
      snapshot.realizedPnlTotal = null;
    }
    if (snapshot.cash === undefined) snapshot.cash = null;
    if (snapshot.swapTotal === undefined) snapshot.swapTotal = null;
    if (snapshot.requiredMargin === undefined) {
      snapshot.requiredMargin = null;
    }
  }

  migrateFxAccountSettings(data);
  addMissingInitialAccounts(data.accounts);

  data.appVersion = APP_VERSION;

  return data;
}

/* ---------- 読み込み前検証 ---------- */

function validateData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("データ形式が正しくありません。");
  }
  if (data.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("対応していないデータ形式です。");
  }
  if (!Array.isArray(data.accounts) ||
      !Array.isArray(data.snapshots)) {
    throw new Error("口座または履歴データがありません。");
  }

  const accountIds = new Set();
  for (const account of data.accounts) {
    if (!account.id || accountIds.has(account.id)) {
      throw new Error("口座IDが不正または重複しています。");
    }
    accountIds.add(account.id);
  }

  for (const snapshot of data.snapshots) {
    if (!snapshot.id || !accountIds.has(snapshot.accountId)) {
      throw new Error("履歴データの参照先口座が不正です。");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.asOfDate || "")) {
      throw new Error("履歴の対象日が不正です。");
    }
    if (!isFiniteMetricValue(snapshot.value)) {
      throw new Error("履歴の金額が不正です。");
    }
  }

  return true;
}
function migrateData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("保存データを読み込めません。");
  }

  let migrated = structuredClone(data);

  if (migrated.schemaVersion === 1) {
    migrated = migrateDataV1ToV2(migrated);
  }
  if (migrated.schemaVersion === 2) {
    migrated = migrateDataV2ToV3(migrated);
  }

  if (migrated.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("対応していないデータ形式です。");
  }

  validateData(migrated);
  return migrated;
}

/* ---------- FXデータ読み替え ---------- */

function getFxDataMappingTargets(data) {
  const targets = [];

  for (const snapshot of data.snapshots) {
    const account = data.accounts.find(
      item => item.id === snapshot.accountId
    );
    if (!account || getCategory(account) !== "fx") continue;

    const hasEffectivePrincipal =
      snapshot.effectivePrincipal !== null &&
      snapshot.effectivePrincipal !== undefined;

    if (hasEffectivePrincipal) continue;

    if (snapshot.cash === null || snapshot.cash === undefined) continue;

    targets.push({
      snapshotId:snapshot.id,
      accountId:account.id,
      accountName:account.name,
      asOfDate:snapshot.asOfDate,
      cash:snapshot.cash
    });
  }

  return targets;
}

function applyFxDataMapping(data,targets) {
  const result = structuredClone(data);
  const targetIds = new Set(
    targets.map(item => item.snapshotId)
  );

  for (const snapshot of result.snapshots) {
    if (!targetIds.has(snapshot.id)) continue;

    if (snapshot.effectivePrincipal === null ||
        snapshot.effectivePrincipal === undefined) {
      snapshot.effectivePrincipal = snapshot.cash;
    }
  }

  return result;
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
