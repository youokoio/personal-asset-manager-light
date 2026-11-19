"use strict";

/* ---------- S11a FX履歴編集：検証・保存 ---------- */

const HISTORY_EDIT_NUMERIC_FIELDS_S11A = [
  "value",
  "effectivePrincipal",
  "pnl",
  "swapTotal",
  "realizedPnlDaily",
  "requiredMargin",
  "realizedPnlTotal"
];

const HISTORY_EDIT_ALLOWED_FIELDS_S11A = [
  ...HISTORY_EDIT_NUMERIC_FIELDS_S11A,
  "asOfDate",
  "memo",
  "rates"
];

function normalizeHistoryEditNumberS11a(value) {
  const source = String(
    value === null || value === undefined ? "" : value
  ).replace(/[０-９]/g,character =>
    String.fromCharCode(character.charCodeAt(0) - 0xFEE0)
  ).trim();

  if (!source) {
    return {value:null,error:null};
  }

  let normalized = source
    .replace(/,/g,"")
    .replace(/円/g,"")
    .replace(/¥/g,"")
    .trim();

  if (normalized.startsWith("+")) {
    normalized = normalized.slice(1);
  }

  normalized = normalized.replace(/^−/,"-");

  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    return {
      value:null,
      error:"数値形式が正しくありません。"
    };
  }

  const number = Number(normalized);

  if (!Number.isFinite(number)) {
    return {
      value:null,
      error:"数値として扱えません。"
    };
  }

  return {value:number,error:null};
}

function validateHistoryEditsS11a(data,edits) {
  const errors = [];
  const normalizedEdits = [];
  const seenIds = new Set();

  if (!data ||
      !Array.isArray(data.accounts) ||
      !Array.isArray(data.snapshots)) {
    return {
      errors:[{
        snapshotId:null,
        field:null,
        pair:null,
        message:"保存データの形式が正しくありません。"
      }],
      normalizedEdits:[],
      changedCount:0
    };
  }

  if (!Array.isArray(edits)) {
    return {
      errors:[{
        snapshotId:null,
        field:null,
        pair:null,
        message:"編集内容の形式が正しくありません。"
      }],
      normalizedEdits:[],
      changedCount:0
    };
  }

  const addError = (snapshotId,field,pair,message) => {
    errors.push({snapshotId,field,pair,message});
  };

  let changedCount = 0;

  for (const edit of edits) {
    const snapshotId = edit &&
      typeof edit.snapshotId === "string"
        ? edit.snapshotId
        : null;

    if (!snapshotId || seenIds.has(snapshotId)) {
      addError(
        snapshotId,
        null,
        null,
        "編集対象の履歴が正しくありません。"
      );
      continue;
    }

    seenIds.add(snapshotId);

    const snapshot = data.snapshots.find(item =>
      item.id === snapshotId
    );

    if (!snapshot) {
      addError(
        snapshotId,
        null,
        null,
        "編集対象の履歴が見つかりません。"
      );
      continue;
    }

    const account = data.accounts.find(item =>
      item.id === snapshot.accountId
    );

    if (!account || account.type !== "fx") {
      addError(
        snapshotId,
        null,
        null,
        "FX口座の履歴ではありません。"
      );
      continue;
    }

    if (!edit.changes ||
        typeof edit.changes !== "object" ||
        Array.isArray(edit.changes)) {
      addError(
        snapshotId,
        null,
        null,
        "変更内容の形式が正しくありません。"
      );
      continue;
    }

    const normalizedChanges = {};

    for (const field of Object.keys(edit.changes)) {
      if (!HISTORY_EDIT_ALLOWED_FIELDS_S11A.includes(field)) {
        addError(
          snapshotId,
          field,
          null,
          "編集できない項目です。"
        );
        continue;
      }

      if (HISTORY_EDIT_NUMERIC_FIELDS_S11A.includes(field)) {
        const result = normalizeHistoryEditNumberS11a(
          edit.changes[field]
        );

        if (result.error) {
          addError(snapshotId,field,null,result.error);
          continue;
        }

        if (field === "value" && result.value === null) {
          addError(
            snapshotId,
            field,
            null,
            "総資産は空欄にできません。"
          );
          continue;
        }

        if (field === "requiredMargin" &&
            result.value !== null &&
            result.value < 0) {
          addError(
            snapshotId,
            field,
            null,
            "必要証拠金は0以上で入力してください。"
          );
          continue;
        }

        normalizedChanges[field] = result.value;

        const currentValue = snapshot[field] === undefined
          ? null
          : snapshot[field];

        if (currentValue !== result.value) {
          changedCount += 1;
        }

        continue;
      }

      if (field === "asOfDate") {
        const date = String(edit.changes.asOfDate || "");

        if (!isValidFxDateForStorage(date)) {
          addError(
            snapshotId,
            field,
            null,
            "対象日を正しく入力してください。"
          );
          continue;
        }

        normalizedChanges.asOfDate = date;

        if (snapshot.asOfDate !== date) {
          changedCount += 1;
        }

        continue;
      }

      if (field === "memo") {
        if (typeof edit.changes.memo !== "string") {
          addError(
            snapshotId,
            field,
            null,
            "メモの形式が正しくありません。"
          );
          continue;
        }

        normalizedChanges.memo = edit.changes.memo;

        if (snapshot.memo !== edit.changes.memo) {
          changedCount += 1;
        }

        continue;
      }

      if (field === "rates") {
        const sourceRates = edit.changes.rates;

        if (!sourceRates ||
            typeof sourceRates !== "object" ||
            Array.isArray(sourceRates)) {
          addError(
            snapshotId,
            field,
            null,
            "評価レートの形式が正しくありません。"
          );
          continue;
        }

        const normalizedRates = {};

        for (const pair of Object.keys(sourceRates)) {
          if (!isValidFxPairForStorage(pair)) {
            addError(
              snapshotId,
              field,
              pair,
              "通貨ペアの形式が正しくありません。"
            );
            continue;
          }

          const result = normalizeHistoryEditNumberS11a(
            sourceRates[pair]
          );

          if (result.error) {
            addError(
              snapshotId,
              field,
              pair,
              result.error
            );
            continue;
          }

          if (result.value !== null && result.value <= 0) {
            addError(
              snapshotId,
              field,
              pair,
              "評価レートは正の数を入力してください。"
            );
            continue;
          }

          normalizedRates[pair] = result.value;

          const currentRate = snapshot.rates &&
            Object.prototype.hasOwnProperty.call(
              snapshot.rates,
              pair
            )
              ? snapshot.rates[pair]
              : null;

          if (currentRate !== result.value) {
            changedCount += 1;
          }
        }

        normalizedChanges.rates = normalizedRates;
      }
    }

    normalizedEdits.push({
      snapshotId,
      changes:normalizedChanges
    });
  }

  return {
    errors,
    normalizedEdits,
    changedCount
  };
}

function applyHistoryEditsS11a(data,normalizedEdits,savedAt) {
  const nextData = JSON.parse(JSON.stringify(data));
  const updatedAccountIds = new Set();
  let updatedCount = 0;

  for (const edit of normalizedEdits) {
    const snapshot = nextData.snapshots.find(item =>
      item.id === edit.snapshotId
    );

    if (!snapshot) {
      throw new Error("編集対象の履歴が見つかりません。");
    }

    let changed = false;

    for (const [field,value] of Object.entries(edit.changes)) {
      if (field === "rates") {
        const nextRates = snapshot.rates &&
          typeof snapshot.rates === "object" &&
          !Array.isArray(snapshot.rates)
            ? {...snapshot.rates}
            : {};

        let ratesChanged = false;

        for (const [pair,rate] of Object.entries(value)) {
          if (rate === null) {
            if (Object.prototype.hasOwnProperty.call(
              nextRates,
              pair
            )) {
              delete nextRates[pair];
              ratesChanged = true;
            }
          } else if (nextRates[pair] !== rate) {
            nextRates[pair] = rate;
            ratesChanged = true;
          }
        }

        if (ratesChanged) {
          snapshot.rates = Object.keys(nextRates).length
            ? nextRates
            : null;
          changed = true;
        }

        continue;
      }

      const currentValue = snapshot[field] === undefined
        ? null
        : snapshot[field];

      if (currentValue !== value) {
        snapshot[field] = value;
        changed = true;
      }
    }

    if (changed) {
      snapshot.updatedAt = savedAt;
      updatedAccountIds.add(snapshot.accountId);
      updatedCount += 1;
    }
  }

  for (const accountId of updatedAccountIds) {
    const account = nextData.accounts.find(item =>
      item.id === accountId
    );

    if (!account) {
      throw new Error("編集対象の口座が見つかりません。");
    }

    account.updatedAt = savedAt;
  }

  return {
    data:nextData,
    updatedCount
  };
}

function saveHistoryEditsS11a(data,edits,storage,options = {}) {
  if (!storage ||
      typeof storage.getItem !== "function" ||
      typeof storage.setItem !== "function") {
    throw new Error("保存先が正しくありません。");
  }

  const validation = validateHistoryEditsS11a(data,edits);

  if (validation.errors.length) {
    const error = new Error(
      validation.errors[0].message +
      "（エラー " + validation.errors.length + "件）"
    );
    error.errors = validation.errors;
    throw error;
  }

  if (validation.changedCount === 0) {
    throw new Error("変更された項目がありません。");
  }

  const currentRaw = storage.getItem("pam2");

  if (currentRaw === null) {
    throw new Error(
      "現在の保存データを確認できないため、中止しました。"
    );
  }

  try {
    storage.setItem("pam2_pre_histedit",currentRaw);
  } catch (error) {
    throw new Error(
      "一時バックアップを保存できないため、中止しました。"
    );
  }

  const savedAt = options.savedAt ||
    new Date().toISOString();

  const applied = applyHistoryEditsS11a(
    data,
    validation.normalizedEdits,
    savedAt
  );

  try {
    validateData(applied.data);
  } catch (error) {
    throw new Error(
      error.message || "変更後のデータ検証に失敗しました。"
    );
  }

  try {
    storage.setItem("pam2",JSON.stringify(applied.data));
  } catch (error) {
    throw new Error(
      "保存に失敗しました。保存データは変更していません。"
    );
  }

  return {
    data:applied.data,
    updatedCount:applied.updatedCount,
    changedCount:validation.changedCount
  };
}
