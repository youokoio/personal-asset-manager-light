"use strict";

/* ---------- データ保存 ---------- */

function createDefaultFieldLabels(account) {
  const defaults = DEFAULT_FX_FIELD_LABELS[account.name];
  return defaults
    ? {...defaults}
    : {
        value:null,
        effectivePrincipal:null,
        pnl:null,
        swapTotal:null
      };
}

function createInitialAccount(item,index,now) {
  const fxSettings = item.type === "fx"
    ? FX_ACCOUNT_SETTINGS[item.name]
    : null;

  return {
    id:createId(),
    name:item.name,
    type:item.type,
    category:item.category,
    sortOrder:index,
    memo:"",
    lossCutRatio:fxSettings ? fxSettings.lossCutRatio : null,
    marginRatePct:fxSettings ? fxSettings.marginRatePct : null,
    fieldLabels:createDefaultFieldLabels(item),
    autoCalc:getDefaultAutoCalc(item),
    createdAt:now,
    updatedAt:now
  };
}

function createInitialData() {
  const now = new Date().toISOString();

  return {
    schemaVersion:SCHEMA_VERSION,
    accounts:INITIAL_ACCOUNTS.map((item,index) =>
      createInitialAccount(item,index,now)
    ),
    snapshots:[],
    holdings:[],
    fxPositions:[],
    fxRates:[],
    fxSwapLedger:[],
    loans:[],
    loanSnapshots:[],
    settings:{
      taxRatePct:20.315,
      fxYtdRealized:0,
      fxLossCarry:0,
      targetRatio:150
    }
  };
}

/* ---------- 型検証 ---------- */

function isNullableNumber(value) {
  return value === null || value === undefined ||
    (typeof value === "number" && Number.isFinite(value));
}

function isValidFxPairForStorage(value) {
  return typeof value === "string" &&
    /^[A-Z]{3}\/JPY$/.test(value);
}

function isValidFxDateForStorage(value) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(value + "T00:00:00");

  return Number.isFinite(date.getTime()) &&
    date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2,"0") + "-" +
    String(date.getDate()).padStart(2,"0") === value;
}

function validateData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("保存データの形式が正しくありません。");
  }

  if (data.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("対応していないデータ形式です。");
  }

  const collectionNames = [
    "accounts",
    "snapshots",
    "holdings",
    "fxPositions",
    "fxRates",
    "fxSwapLedger",
    "loans",
    "loanSnapshots"
  ];

  for (const name of collectionNames) {
    if (!Array.isArray(data[name])) {
      throw new Error(`${name} のデータが正しくありません。`);
    }
  }

  if (!data.settings || typeof data.settings !== "object" ||
      Array.isArray(data.settings)) {
    throw new Error("settings のデータが正しくありません。");
  }

  const accountTypes = Object.keys(TYPE_LABELS);
  const categories = Object.keys(CATEGORY_LABELS);

  for (const account of data.accounts) {
    if (!account ||
        typeof account.id !== "string" ||
        typeof account.name !== "string" ||
        !accountTypes.includes(account.type) ||
        !categories.includes(account.category) ||
        !Number.isFinite(account.sortOrder)) {
      throw new Error("口座データに不正な項目があります。");
    }

    if (!isNullableNumber(account.lossCutRatio) ||
        !isNullableNumber(account.marginRatePct)) {
      throw new Error("FX口座設定の数値が正しくありません。");
    }

    if (!account.fieldLabels ||
        typeof account.fieldLabels !== "object" ||
        Array.isArray(account.fieldLabels)) {
      throw new Error("口座の fieldLabels が正しくありません。");
    }

    for (const field of [
      "value","effectivePrincipal","pnl","swapTotal"
    ]) {
      if (account.fieldLabels[field] !== null &&
          typeof account.fieldLabels[field] !== "string") {
        throw new Error("口座の fieldLabels." + field + " が正しくありません。");
      }
    }

    if (![null,"swap","principal"].includes(account.autoCalc)) {
      throw new Error("口座の autoCalc が正しくありません。");
    }
  }

  const snapshotNumberFields = [
    "cumulativeInvested",
    "effectivePrincipal",
    "pnl",
    "realizedPnlTotal",
    "cash",
    "swapTotal",
    "requiredMargin",
    "principal"
  ];

  for (const snapshot of data.snapshots) {
    if (!snapshot ||
        typeof snapshot.id !== "string" ||
        typeof snapshot.accountId !== "string" ||
        typeof snapshot.asOfDate !== "string" ||
        typeof snapshot.recordedAt !== "string" ||
        !Number.isFinite(snapshot.value)) {
      throw new Error("履歴データに不正な項目があります。");
    }

    if (!data.accounts.some(account =>
      account.id === snapshot.accountId
    )) {
      throw new Error("履歴の口座参照先がありません。");
    }

    if (typeof snapshot.memo !== "string") {
      throw new Error("履歴メモの形式が正しくありません。");
    }

    for (const field of snapshotNumberFields) {
      if (!isNullableNumber(snapshot[field])) {
        throw new Error(`履歴の ${field} が正しくありません。`);
      }
    }
  }

  for (const holding of data.holdings) {
    if (!holding ||
        typeof holding.id !== "string" ||
        typeof holding.accountId !== "string" ||
        typeof holding.name !== "string" ||
        !holding.name.trim() ||
        !HOLDING_WRAPPERS.includes(holding.wrapper) ||
        !HOLDING_KINDS.includes(holding.kind) ||
        typeof holding.asOfDate !== "string" ||
        formatDateWithWeekday(holding.asOfDate) === holding.asOfDate ||
        typeof holding.recordedAt !== "string" ||
        !Number.isFinite(holding.value) ||
        typeof holding.memo !== "string" ||
        typeof holding.createdAt !== "string" ||
        typeof holding.updatedAt !== "string") {
      throw new Error("商品別保有データに不正な項目があります。");
    }

    const account = data.accounts.find(item =>
      item.id === holding.accountId
    );
    if (!isHoldingsAccount(account)) {
      throw new Error("商品別保有の口座参照先が正しくありません。");
    }

    for (const field of ["quantity","costBasis","pnl"]) {
      if (!isNullableNumber(holding[field])) {
        throw new Error("商品別保有の " + field + " が正しくありません。");
      }
    }
  }

  const fxRateKeys = new Set();

  for (const rate of data.fxRates) {
    if (!rate ||
        typeof rate.id !== "string" ||
        typeof rate.accountId !== "string" ||
        !isValidFxPairForStorage(rate.pair) ||
        !isNullableNumber(rate.rate) ||
        (rate.rate !== null &&
         rate.rate !== undefined &&
         rate.rate <= 0) ||
        (rate.asOfDate !== null &&
         rate.asOfDate !== undefined &&
         !isValidFxDateForStorage(rate.asOfDate)) ||
        typeof rate.createdAt !== "string" ||
        typeof rate.updatedAt !== "string") {
      throw new Error("FX評価レートに不正な項目があります。");
    }

    const account = data.accounts.find(item =>
      item.id === rate.accountId
    );

    if (!account || account.type !== "fx") {
      throw new Error("FX評価レートの口座参照先が正しくありません。");
    }

    const key = JSON.stringify([rate.accountId,rate.pair]);

    if (fxRateKeys.has(key)) {
      throw new Error("同じFX口座・通貨ペアの評価レートが重複しています。");
    }

    fxRateKeys.add(key);
  }

  const settingNumberFields = [
    "taxRatePct",
    "fxYtdRealized",
    "fxLossCarry",
    "targetRatio"
  ];

  for (const field of settingNumberFields) {
    if (!Number.isFinite(data.settings[field])) {
      throw new Error(`設定の ${field} が正しくありません。`);
    }
  }

  if (data.settings.chartPrefs !== undefined &&
      (data.settings.chartPrefs === null ||
       typeof data.settings.chartPrefs !== "object" ||
       Array.isArray(data.settings.chartPrefs))) {
    throw new Error("グラフ設定の形式が正しくありません。");
  }
}

/* ---------- 口座の追加・改名 ---------- */

/*
 * 名前が既に存在する口座は追加しない。
 * 新規口座の sortOrder は既存口座の最大値の次にする。
 */
function addMissingInitialAccounts(accounts) {
  const existingNames = new Set(accounts.map(account => account.name));
  let nextSortOrder = accounts.reduce(
    (maximum,account) =>
      Math.max(maximum,Number.isFinite(account.sortOrder)
        ? account.sortOrder
        : -1),
    -1
  ) + 1;

  const now = new Date().toISOString();

  for (const item of INITIAL_ACCOUNTS) {
    if (existingNames.has(item.name)) continue;

    const account = createInitialAccount(item,nextSortOrder,now);
    accounts.push(account);
    existingNames.add(item.name);
    nextSortOrder += 1;
  }

  return accounts;
}

/* ---------- FX口座設定 ---------- */

/*
 * FX設定は、値が null または未設定の場合だけ初期値を補う。
 * 利用者が変更した値は上書きしない。
 * 保存は呼び出し元が検証後に行う。
 */
function migrateFxAccountSettings(data) {
  for (const account of data.accounts) {
    if (account.name === "株365") {
      account.name = "クリック365";
    }

    const settings = FX_ACCOUNT_SETTINGS[account.name];
    if (!settings) continue;

    if (account.type !== "fx") {
      account.type = "fx";
    }

    if (account.lossCutRatio === null ||
        account.lossCutRatio === undefined) {
      account.lossCutRatio = settings.lossCutRatio;
    }

    if (account.marginRatePct === null ||
        account.marginRatePct === undefined) {
      account.marginRatePct = settings.marginRatePct;
    }
  }

  return data;
}

/* ---------- v1 → v2 移行 ---------- */

function migrateDataV1ToV2(oldData) {
  if (!oldData ||
      oldData.schemaVersion !== 1 ||
      !Array.isArray(oldData.accounts) ||
      !Array.isArray(oldData.snapshots)) {
    throw new Error("v1データの形式が正しくありません。");
  }

  const data = JSON.parse(JSON.stringify(oldData));

  data.schemaVersion = 2;

  for (let index = 0; index < data.accounts.length; index += 1) {
    const account = data.accounts[index];

    if (account.name === "暗号資産取引所") {
      account.name = "GMOコイン";
    }

    if (account.name === "株365") {
      account.name = "クリック365";
    }

    if (!account.category) {
      switch (account.type) {
        case "fx":
          account.category = "fx";
          break;
        case "securities":
        case "ideco":
        case "dc":
          account.category = "stock";
          break;
        case "crypto":
          account.category = "crypto";
          break;
        case "bank":
          account.category = "bank";
          break;
        default:
          account.category = "stock";
          break;
      }
    }

    if (!Number.isFinite(account.sortOrder)) {
      account.sortOrder = index;
    }

    if (account.lossCutRatio === undefined) {
      account.lossCutRatio = null;
    }

    if (account.marginRatePct === undefined) {
      account.marginRatePct = null;
    }
  }

  addMissingInitialAccounts(data.accounts);

  for (const snapshot of data.snapshots) {
    if (snapshot.effectivePrincipal === null ||
        snapshot.effectivePrincipal === undefined) {
      snapshot.effectivePrincipal =
        isNullableNumber(snapshot.principal) &&
        typeof snapshot.principal === "number"
          ? snapshot.principal
          : null;
    }

    const newFields = [
      "cumulativeInvested",
      "effectivePrincipal",
      "pnl",
      "realizedPnlTotal",
      "cash",
      "swapTotal",
      "requiredMargin"
    ];

    for (const field of newFields) {
      if (snapshot[field] === undefined) {
        snapshot[field] = null;
      }
    }

    if (snapshot.memo === undefined || snapshot.memo === null) {
      snapshot.memo = "";
    }
  }

  const collectionNames = [
    "holdings",
    "fxPositions",
    "fxRates",
    "loans",
    "loanSnapshots"
  ];

  for (const name of collectionNames) {
    if (!Array.isArray(data[name])) {
      data[name] = [];
    }
  }

  if (!data.settings ||
      typeof data.settings !== "object" ||
      Array.isArray(data.settings)) {
    data.settings = {};
  }

  const settingDefaults = {
    taxRatePct:20.315,
    fxYtdRealized:0,
    fxLossCarry:0,
    targetRatio:150
  };

  for (const [key,value] of Object.entries(settingDefaults)) {
    if (data.settings[key] === undefined) {
      data.settings[key] = value;
    }
  }

  migrateFxAccountSettings(data);

  return data;
}

/* ---------- v2 → v3 移行 ---------- */

function migrateDataV2ToV3(oldData) {
  if (!oldData ||
      oldData.schemaVersion !== 2 ||
      !Array.isArray(oldData.accounts) ||
      !Array.isArray(oldData.snapshots)) {
    throw new Error("v2データの形式が正しくありません。");
  }

  const data = JSON.parse(JSON.stringify(oldData));
  data.schemaVersion = 3;

  for (const account of data.accounts) {
    const defaults = createDefaultFieldLabels(account);

    if (account.fieldLabels === undefined) {
      account.fieldLabels = defaults;
    } else if (account.fieldLabels &&
        typeof account.fieldLabels === "object" &&
        !Array.isArray(account.fieldLabels)) {
      for (const field of [
        "value","effectivePrincipal","pnl","swapTotal"
      ]) {
        if (account.fieldLabels[field] === undefined) {
          account.fieldLabels[field] = defaults[field];
        }
      }
    }

    if (account.autoCalc === undefined) {
      account.autoCalc = getDefaultAutoCalc(account);
    }
  }

  if (data.fxSwapLedger === undefined) {
    data.fxSwapLedger = [];
  }

  return data;
}

/* ---------- 読み込み・保存 ---------- */

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (raw === null) {
    const initial = createInitialData();
    saveData(initial);
    return initial;
  }

  const parsed = JSON.parse(raw);

  if (parsed && parsed.schemaVersion === 1) {
    const backupV1Key = "pam2_pre_v2";

    if (localStorage.getItem(backupV1Key) === null) {
      localStorage.setItem(backupV1Key,raw);
    }

    const migratedV2 = migrateDataV1ToV2(parsed);
    const backupV3Key = "pam2_pre_v3";

    if (localStorage.getItem(backupV3Key) === null) {
      localStorage.setItem(backupV3Key,JSON.stringify(migratedV2));
    }

    const migratedV3 = migrateDataV2ToV3(migratedV2);
    validateData(migratedV3);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(migratedV3));

    return migratedV3;
  }

  if (parsed && parsed.schemaVersion === 2) {
    const backupKey = "pam2_pre_v3";

    if (localStorage.getItem(backupKey) === null) {
      localStorage.setItem(backupKey,raw);
    }

    const migrated = migrateDataV2ToV3(parsed);
    validateData(migrated);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(migrated));

    return migrated;
  }

  validateData(parsed);
  return parsed;
}

function saveData(data) {
  validateData(data);
  localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
}
