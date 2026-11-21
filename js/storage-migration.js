"use strict";

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

/* ---------- v3 → v4 移行 ---------- */

function migrateDataV3ToV4(oldData) {
  if (!oldData ||
      oldData.schemaVersion !== 3 ||
      !Array.isArray(oldData.accounts) ||
      !Array.isArray(oldData.snapshots)) {
    throw new Error("v3データの形式が正しくありません。");
  }

  const data = JSON.parse(JSON.stringify(oldData));
  data.schemaVersion = 4;
  data.contributionPlans = [];
  data.contributions = [];
  data.saleChecks = [];

  return data;
}
