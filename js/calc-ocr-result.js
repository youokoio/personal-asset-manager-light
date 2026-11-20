"use strict";

/* ---------- 表示用の伏せ字 ---------- */

function maskOcrSensitiveDigits(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/\d{8,}/g,match => "●".repeat(match.length));
}


/* ---------- OCR解析結果の警告・一括入力行への変換 ---------- */

function buildOcrWarnings(result,previousValue,accountType) {
  const warnings = [];
  if (!result || !result.fields) return warnings;

  const total = result.fields.value && result.fields.value.value;
  if (typeof previousValue === "number" &&
      Number.isFinite(previousValue) &&
      previousValue !== 0 &&
      typeof total === "number" &&
      Number.isFinite(total) &&
      Math.abs(total - previousValue) > Math.abs(previousValue) * 0.5) {
    warnings.push({
      code:"previous-value-change",
      message:"前回の総資産から50%を超える変化があります。桁の読み違いの疑いがあります。",
      previousValue,
      value:total
    });
  }

  if (accountType === "fx") {
    const principal = result.fields.effectivePrincipal && result.fields.effectivePrincipal.value;
    const pnl = result.fields.pnl && result.fields.pnl.value;
    const swap = result.fields.swapTotal && result.fields.swapTotal.value;
    if ([total,principal,pnl,swap].every(value =>
      typeof value === "number" && Number.isFinite(value)
    )) {
      const difference = total - principal - pnl - swap;
      if (difference !== 0) {
        warnings.push({
          code:"fx-identity",
          message:"FXの恒等式に差額があります。値は自動修正しません。",
          difference
        });
      }
    }
  }

  return warnings;
}

function isOcrResultAddable(result) {
  const reasons = [];
  if (!result || result.success !== true) {
    reasons.push("解析形式を確定できていません。");
    return {allowed:false,reasons};
  }
  if (!result.date || result.date.status !== "recognized" ||
      !result.date.value) {
    reasons.push("対象日を確定してください。");
  }
  if (!result.fields || !result.fields.value ||
      result.fields.value.status !== "recognized" ||
      typeof result.fields.value.value !== "number") {
    reasons.push("総資産を確定してください。");
  }
  if (result.fields) {
    for (const field of Object.values(result.fields)) {
      if (["unreadable","multiple"].includes(field.status)) {
        reasons.push("要確認の項目を確定してください。");
        break;
      }
      if (field.required && field.status !== "recognized") {
        reasons.push("必須項目を確定してください。");
        break;
      }
    }
  }
  return {allowed:reasons.length === 0,reasons};
}

function createOcrBulkImportRow(result,accountName,rowNumber,rowId) {
  if (!isOcrResultAddable(result).allowed) return null;
  const fields = result.fields;
  return {
    id:String(rowId),
    rowNumber:Number(rowNumber),
    asOfDate:result.date.value,
    accountName:String(accountName || "").trim(),
    value:fields.value.value,
    effectivePrincipal:fields.effectivePrincipal
      ? fields.effectivePrincipal.value
      : null,
    pnl:fields.pnl ? fields.pnl.value : null,
    realizedPnlTotal:fields.realizedPnlTotal
      ? fields.realizedPnlTotal.value
      : null,
    cash:null,
    memo:"",
    swapTotal:fields.swapTotal ? fields.swapTotal.value : null,
    parseErrors:{},
    status:"planned",
    reasons:[],
    accountId:null
  };
}

/* ---------- OCRルールの自己診断 ---------- */

function checkOcrRuleConsistency(accounts,rules) {
  const errors = [];
  const accountNames = new Set(
    (Array.isArray(accounts) ? accounts : []).map(account => account.name)
  );
  const ruleIds = new Set();
  const linkedNames = new Set();
  const sharedReferences = new WeakMap();

  function inspectReferences(value,ruleId) {
    if (!value || typeof value !== "object") return;
    const previousRuleId = sharedReferences.get(value);
    if (previousRuleId && previousRuleId !== ruleId) {
      errors.push("ルール間で定義を共有しています：" +
        previousRuleId + " / " + ruleId);
      return;
    }
    sharedReferences.set(value,ruleId);
    for (const child of Object.values(value)) {
      inspectReferences(child,ruleId);
    }
  }

  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule || typeof rule.ruleId !== "string" || !rule.ruleId) {
      errors.push("ruleId がありません。");
      continue;
    }
    if (ruleIds.has(rule.ruleId)) {
      errors.push("ruleId が重複しています：" + rule.ruleId);
    }
    ruleIds.add(rule.ruleId);
    inspectReferences(rule,rule.ruleId);

    if (!Array.isArray(rule.accountNames) || rule.accountNames.length === 0) {
      errors.push("対応する口座名がありません：" + rule.ruleId);
    }
    for (const name of Array.isArray(rule.accountNames) ? rule.accountNames : []) {
      if (!accountNames.has(name)) {
        errors.push("対応する口座がありません：" + name);
      }
      if (linkedNames.has(name)) {
        errors.push("同じ口座名を持つルールが重複しています：" + name);
      }
      linkedNames.add(name);
    }

    if (!Array.isArray(rule.formats) || rule.formats.length === 0) {
      errors.push("形式がありません：" + rule.ruleId);
      continue;
    }

    for (const format of rule.formats) {
      const labels = new Map();
      const fields = format.fields || {};
      for (const [fieldName,fieldRule] of Object.entries(fields)) {
        for (const label of normalizeOcrWordList(fieldRule.labels)) {
          if (labels.has(label) && labels.get(label) !== fieldName) {
            errors.push("ラベルが重複しています：" + label);
          } else {
            labels.set(label,fieldName);
          }
        }
      }
      if (!fields.value || fields.value.required !== true) {
        errors.push("必須の総資産がありません：" + format.formatId);
      }
      if (!format.date || format.date.required === false) {
        errors.push("必須の対象日がありません：" + format.formatId);
      }
    }
  }

  return {success:errors.length === 0,errors};
}
