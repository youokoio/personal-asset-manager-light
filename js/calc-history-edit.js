"use strict";

/* ---------- S11a FX履歴編集の計算・保存 ---------- */

const HISTORY_EDIT_NUMERIC_FIELDS_S11A = [
  "value",
  "effectivePrincipal",
  "pnl",
  "swapTotal",
  "realizedPnlDaily",
  "realizedPnlTotal",
  "requiredMargin"
];

const HISTORY_EDIT_TEXT_FIELDS_S11A = [
  "memo"
];

function normalizeHistoryEditNumberS11a(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return {value:null,error:null};
  }

  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue)
      ? {value:rawValue,error:null}
      : {value:null,error:"数値を入力してください。"};
  }

  let text = String(rawValue).trim();

  if (text === "") {
    return {value:null,error:null};
  }

  text = text
    .replace(/[０-９]/g,char =>
      String.fromCharCode(char.charCodeAt(0) - 0xFEE0)
    )
    .replace(/，/g,",")
    .replace(/＋/g,"+")
    .replace(/,/g,"")
    .replace(/円/g,"")
    .replace(/[¥￥]/g,"")
    .replace(/^＋/,"")
    .replace(/^\+/,"")
    .replace(/\u2212/g,"-")
    .trim();

  if (text === "") {
    return {value:null,error:null};
  }

  const value = Number(text);

  if (!Number.isFinite(value)) {
    return {value:null,error:"数値形式が正しくありません。"};
  }

  return {value,error:null};
}

function isValidHistoryEditDateS11a(value) {
  return typeof value === "string" &&
    isValidFxDateForStorage(value);
}

function validateHistoryEditsS11a(data,changes) {
  const errors = [];
  const normalizedChanges = [];
  const seenIds = new Set();

  if (!data || !Array.isArray(data.snapshots) ||
      !Array.isArray(data.accounts) ||
      !Array.isArray(changes)) {
    return {
      errors:[{
        snapshotId:null,
        field:null,
        message:"編集データの形式が正しくありません。"
      }],
      normalizedChanges:[],
      changedCellCount:0,
      updatedRecordCount:0
    };
  }

  for (const change of changes) {
    if (!change ||
        typeof change.snapshotId !== "string" ||
        !change.fields ||
        typeof change.fields !== "object" ||
        Array.isArray(change.fields)) {
      errors.push({
        snapshotId:null,
        field:null,
        message:"編集対象の形式が正しくありません。"
      });
      continue;
    }

    const snapshotId = change.snapshotId;

    if (seenIds.has(snapshotId)) {
      errors.push({
        snapshotId,
        field:null,
        message:"同じ履歴が重複して指定されています。"
      });
      continue;
    }
    seenIds.add(snapshotId);

    const snapshot = data.snapshots.find(item =>
      item.id === snapshotId
    );

    if (!snapshot) {
      errors.push({
        snapshotId,
        field:null,
        message:"編集対象の履歴が見つかりません。"
      });
      continue;
    }

    const account = data.accounts.find(item =>
      item.id === snapshot.accountId
    );

    if (!account || account.type !== "fx") {
      errors.push({
        snapshotId,
        field:null,
        message:"FX口座の履歴ではありません。"
      });
      continue;
    }

    const normalizedFields = {};
    let changedCount = 0;

    for (const [field,rawValue] of Object.entries(change.fields)) {
      if (HISTORY_EDIT_NUMERIC_FIELDS_S11A.includes(field)) {
        const normalized = normalizeHistoryEditNumberS11a(rawValue);

        if (normalized.error) {
          errors.push({
            snapshotId,
            field,
            message:normalized.error
          });
          continue;
        }

        const value = normalized.value;

        if (field === "value" && value === null) {
          errors.push({
            snapshotId,
            field,
            message:"総資産は空欄にできません。"
          });
          continue;
        }

        if (field === "requiredMargin" &&
            value !== null && value < 0) {
          errors.push({
            snapshotId,
            field,
            message:"必要証拠金は0以上で入力してください。"
          });
          continue;
        }

        if (value !== snapshot[field]) {
          normalizedFields[field] = value;
          changedCount++;
        }

        continue;
      }

      if (field === "rates") {
        if (!rawValue ||
            typeof rawValue !== "object" ||
            Array.isArray(rawValue)) {
          errors.push({
            snapshotId,
            field,
            message:"評価レートの編集データが正しくありません。"
          });
          continue;
        }

        const rateChanges = {};

        for (const [pair,rateRaw] of Object.entries(rawValue)) {
          if (!isValidFxPairForStorage(pair)) {
            errors.push({
              snapshotId,
              field:"rates." + pair,
              message:"通貨ペアの形式が正しくありません。"
            });
            continue;
          }

          const normalized = normalizeHistoryEditNumberS11a(rateRaw);

          if (normalized.error) {
            errors.push({
              snapshotId,
              field:"rates." + pair,
              message:normalized.error
            });
            continue;
          }

          const rate = normalized.value;

          if (rate !== null && rate <= 0) {
            errors.push({
              snapshotId,
              field:"rates." + pair,
              message:"評価レートは正の数を入力してください。"
            });
            continue;
          }

          const oldRates = snapshot.rates &&
            typeof snapshot.rates === "object" &&
            !Array.isArray(snapshot.rates)
              ? snapshot.rates
              : {};

          const oldRate = Object.prototype.hasOwnProperty.call(
            oldRates,pair
          )
            ? oldRates[pair]
            : null;

          if (rate !== oldRate) {
            rateChanges[pair] = rate;
            changedCount++;
          }
        }

        if (Object.keys(rateChanges).length) {
          normalizedFields.rates = rateChanges;
        }

        continue;
      }

      if (field === "asOfDate") {
        if (!isValidHistoryEditDateS11a(rawValue)) {
          errors.push({
            snapshotId,
            field,
            message:"対象日を正しく入力してください。"
          });
          continue;
        }

        if (rawValue !== snapshot.asOfDate) {
          normalizedFields.asOfDate = rawValue;
          changedCount++;
        }

        continue;
      }

      if (HISTORY_EDIT_TEXT_FIELDS_S11A.includes(field)) {
        if (typeof rawValue !== "string") {
          errors.push({
            snapshotId,
            field,
            message:"メモの形式が正しくありません。"
          });
          continue;
        }

        if (rawValue !== snapshot[field]) {
          normalizedFields[field] = rawValue;
          changedCount++;
        }

        continue;
      }

      errors.push({
        snapshotId,
        field,
        message:"編集できない項目です。"
      });
    }

    if (changedCount > 0) {
      normalizedChanges.push({
        snapshotId,
        fields:normalizedFields,
        changedCount
      });
    }
  }

  return {
    errors,
    normalizedChanges,
    changedCellCount:normalizedChanges.reduce(
      (sum,item) => sum + item.changedCount,
      0
    ),
    updatedRecordCount:normalizedChanges.length
  };
}

function applyHistoryEditsS11a(data,normalizedChanges,now) {
  const updatedData = JSON.parse(JSON.stringify(data));

  for (const change of normalizedChanges) {
    const snapshot = updatedData.snapshots.find(item =>
      item.id === change.snapshotId
    );

    if (!snapshot) {
      throw new Error("編集対象の履歴が見つかりません。");
    }

    for (const [field,value] of Object.entries(change.fields)) {
      if (field !== "rates") {
        snapshot[field] = value;
        continue;
      }

      const rates = snapshot.rates &&
        typeof snapshot.rates === "object" &&
        !Array.isArray(snapshot.rates)
          ? {...snapshot.rates}
          : {};

      for (const [pair,rate] of Object.entries(value)) {
        if (rate === null) {
          delete rates[pair];
        } else {
          rates[pair] = rate;
        }
      }

      snapshot.rates = Object.keys(rates).length
        ? rates
        : null;
    }

    snapshot.updatedAt = now;

    const account = updatedData.accounts.find(item =>
      item.id === snapshot.accountId
    );

    if (!account) {
      throw new Error("履歴の口座が見つかりません。");
    }

    account.updatedAt = now;
  }

  return updatedData;
}

function saveHistoryEditsS11a(data,changes,storage,now) {
  const checked = validateHistoryEditsS11a(data,changes);

  if (checked.errors.length) {
    return {
      ok:false,
      errors:checked.errors,
      error:"入力内容にエラーがあります。",
      changedCellCount:checked.changedCellCount,
      updatedRecordCount:checked.updatedRecordCount
    };
  }

  if (checked.changedCellCount === 0) {
    return {
      ok:false,
      errors:[],
      error:"保存する変更がありません。",
      changedCellCount:0,
      updatedRecordCount:0
    };
  }

  if (!storage ||
      typeof storage.getItem !== "function" ||
      typeof storage.setItem !== "function") {
    return {
      ok:false,
      errors:[],
      error:"保存先を利用できません。",
      changedCellCount:checked.changedCellCount,
      updatedRecordCount:checked.updatedRecordCount
    };
  }

  try {
    const currentRaw = storage.getItem("pam2");

    if (typeof currentRaw !== "string") {
      throw new Error("現在の保存データを取得できません。");
    }

    storage.setItem("pam2_pre_histedit",currentRaw);

    const updatedData = applyHistoryEditsS11a(
      data,
      checked.normalizedChanges,
      now || new Date().toISOString()
    );

    validateData(updatedData);

    storage.setItem("pam2",JSON.stringify(updatedData));

    return {
      ok:true,
      data:updatedData,
      errors:[],
      error:null,
      changedCellCount:checked.changedCellCount,
      updatedRecordCount:checked.updatedRecordCount
    };
  } catch (error) {
    return {
      ok:false,
      errors:[],
      error:error && error.message
        ? error.message
        : "履歴の保存に失敗しました。",
      changedCellCount:checked.changedCellCount,
      updatedRecordCount:checked.updatedRecordCount
    };
  }
}
