"use strict";

/* ---------- データ保存 ---------- */

function createInitialData() {
  const now = new Date().toISOString();

  return {
    schemaVersion: SCHEMA_VERSION,
    accounts: INITIAL_ACCOUNTS.map(item => {
      const fxSettings = item.type === "fx"
        ? FX_ACCOUNT_SETTINGS[item.name]
        : null;

      return {
        id:createId(),
        name:item.name,
        type:item.type,
        memo:"",
        lossCutRatio:fxSettings ? fxSettings.lossCutRatio : null,
        marginRatePct:fxSettings ? fxSettings.marginRatePct : null,
        createdAt:now,
        updatedAt:now
      };
    }),
    snapshots:[]
  };
}

function validateData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("保存データの形式が正しくありません。");
  }
  if (data.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("対応していないデータ形式です。");
  }
  if (!Array.isArray(data.accounts) || !Array.isArray(data.snapshots)) {
    throw new Error("口座または履歴データが正しくありません。");
  }

  for (const account of data.accounts) {
    if (!account || typeof account.id !== "string" ||
        typeof account.name !== "string" ||
        !Object.hasOwn(TYPE_LABELS, account.type)) {
      throw new Error("口座データに不正な項目があります。");
    }
  }

  for (const snapshot of data.snapshots) {
    if (!snapshot || typeof snapshot.id !== "string" ||
        typeof snapshot.accountId !== "string" ||
        typeof snapshot.asOfDate !== "string" ||
        !Number.isFinite(snapshot.value)) {
      throw new Error("履歴データに不正な項目があります。");
    }
    if (!data.accounts.some(a => a.id === snapshot.accountId)) {
      throw new Error("履歴の口座参照先がありません。");
    }
  }
}

/*
 * 既存データのFX口座設定を更新する。
 * 口座名「株365」は正式名称「クリック365」に変更する。
 * 履歴データや口座IDは変更しない。
 */
function migrateFxAccountSettings(data) {
  let changed = false;

  for (const account of data.accounts) {
    if (account.name === "株365") {
      account.name = "クリック365";
      account.type = "fx";
      changed = true;
    }

    const settings = FX_ACCOUNT_SETTINGS[account.name];
    if (!settings) continue;

    if (account.type !== "fx") {
      account.type = "fx";
      changed = true;
    }

    if (account.lossCutRatio !== settings.lossCutRatio) {
      account.lossCutRatio = settings.lossCutRatio;
      changed = true;
    }

    if (account.marginRatePct !== settings.marginRatePct) {
      account.marginRatePct = settings.marginRatePct;
      changed = true;
    }

    if (changed) {
      account.updatedAt = new Date().toISOString();
    }
  }

  if (changed) {
    saveData(data);
  }

  return data;
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (raw === null) {
    const initial = createInitialData();
    saveData(initial);
    return initial;
  }

  const parsed = JSON.parse(raw);
  validateData(parsed);

  return migrateFxAccountSettings(parsed);
}

function saveData(data) {
  validateData(data);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
