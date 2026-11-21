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
    settings:{
      taxRatePct:20.315,
      fxYtdRealized:0,
      fxLossCarry:0,
      targetRatio:150
    }
  };
}

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
