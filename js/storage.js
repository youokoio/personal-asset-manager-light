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
    ...(item.type === "fx"
      ? {
          realizedBaseAmount:null,
          realizedBaseDate:null
        }
      : {}),
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
    contributionPlans:[],
    contributions:[],
    saleChecks:[],
    cashflowRules:[],
    cashflowRecords:[],
    settings:{
      taxRatePct:20.315,
      fxYtdRealized:0,
      fxLossCarry:0,
      targetRatio:150
    }
  };
}

function migrateAndSaveV4Data(data,rawV4,storage) {
  const backupKey = "pam2_pre_v5";

  if (storage.getItem(backupKey) === null) {
    storage.setItem(backupKey,rawV4);
  }

  const migrated = migrateDataV4ToV5(data);
  validateData(migrated);
  storage.setItem(STORAGE_KEY,JSON.stringify(migrated));

  return migrated;
}

function migrateAndSaveV3Data(data,rawV3,storage) {
  const backupKey = "pam2_pre_v4";

  if (storage.getItem(backupKey) === null) {
    storage.setItem(backupKey,rawV3);
  }

  const migratedV4 = migrateDataV3ToV4(data);

  return migrateAndSaveV4Data(
    migratedV4,
    JSON.stringify(migratedV4),
    storage
  );
}

function loadData(storage = localStorage) {
  const raw = storage.getItem(STORAGE_KEY);

  if (raw === null) {
    const initial = createInitialData();
    saveData(initial,storage);
    return initial;
  }

  const parsed = JSON.parse(raw);

  if (parsed && parsed.schemaVersion === 1) {
    const backupV1Key = "pam2_pre_v2";

    if (storage.getItem(backupV1Key) === null) {
      storage.setItem(backupV1Key,raw);
    }

    const migratedV2 = migrateDataV1ToV2(parsed);
    const backupV3Key = "pam2_pre_v3";

    if (storage.getItem(backupV3Key) === null) {
      storage.setItem(backupV3Key,JSON.stringify(migratedV2));
    }

    const migratedV3 = migrateDataV2ToV3(migratedV2);
    return migrateAndSaveV3Data(
      migratedV3,
      JSON.stringify(migratedV3),
      storage
    );
  }

  if (parsed && parsed.schemaVersion === 2) {
    const backupKey = "pam2_pre_v3";

    if (storage.getItem(backupKey) === null) {
      storage.setItem(backupKey,raw);
    }

    const migratedV3 = migrateDataV2ToV3(parsed);
    return migrateAndSaveV3Data(
      migratedV3,
      JSON.stringify(migratedV3),
      storage
    );
  }

  if (parsed && parsed.schemaVersion === 3) {
    return migrateAndSaveV3Data(parsed,raw,storage);
  }

  if (parsed && parsed.schemaVersion === 4) {
    return migrateAndSaveV4Data(parsed,raw,storage);
  }

  validateData(parsed);
  return parsed;
}

function saveData(data,storage = localStorage) {
  validateData(data);
  storage.setItem(STORAGE_KEY,JSON.stringify(data));
}

/*
 * 積立・売却確認の共通保存。
 * kind は "contribution" または "saleCheck"。
 * updateData は複製したデータをメモリ上で変更する関数。
 */
function saveStockTrackingData(kind,updateData,storage = localStorage) {
  const backupKeys = {
    contribution:"pam2_pre_contrib",
    saleCheck:"pam2_pre_salecheck"
  };
  const backupKey = backupKeys[kind];

  if (!backupKey || typeof updateData !== "function") {
    throw new Error("積立・売却確認の保存指定が正しくありません。");
  }

  const currentRaw = storage.getItem(STORAGE_KEY);
  if (currentRaw === null) {
    throw new Error("保存データがありません。");
  }

  const nextData = JSON.parse(currentRaw);

  storage.setItem(backupKey,currentRaw);
  updateData(nextData);
  validateData(nextData);
  storage.setItem(STORAGE_KEY,JSON.stringify(nextData));

  return nextData;
}

/*
 * 収支データの共通保存。
 * 既存データを pam2_pre_cashflow に複製してから、
 * 複製データを変更・検証し、本体へ1回だけ書き込む。
 */
function saveCashflowData(updateData,storage = localStorage) {
  if (typeof updateData !== "function") {
    throw new Error("収支データの保存指定が正しくありません。");
  }

  const currentRaw = storage.getItem(STORAGE_KEY);
  if (currentRaw === null) {
    throw new Error("保存データがありません。");
  }

  const nextData = JSON.parse(currentRaw);

  storage.setItem("pam2_pre_cashflow",currentRaw);
  updateData(nextData);
  validateData(nextData);
  storage.setItem(STORAGE_KEY,JSON.stringify(nextData));

  return nextData;
}
