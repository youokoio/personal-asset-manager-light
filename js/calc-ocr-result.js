"use strict";

/* ---------- 表示用の伏せ字 ---------- */

function maskOcrSensitiveDigits(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/\d{8,}/g,match => "●".repeat(match.length));
}


/* ---------- OCR解析結果の警告・恒等式 ---------- */

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
          code:result.identityStrict === true
            ? "fx-identity-strict"
            : "fx-identity",
          message:result.identityStrict === true
            ? "FXの恒等式に差額があります。4項目の対応を確認してください。"
            : "FXの恒等式に差額があります。値は自動修正しません。",
          difference
        });
      }
    }
  }

  return warnings;
}

/* ---------- identityStrict の確認状態 ---------- */

function applyOcrIdentityStrict(result,identityStrict,identityConfirmed) {
  if (!result || !result.fields) return result;

  result.identityStrict = identityStrict === true;
  result.identityReview = {
    required:false,
    confirmed:false,
    difference:null
  };

  if (!result.identityStrict) return result;

  const fieldNames = [
    "value",
    "effectivePrincipal",
    "pnl",
    "swapTotal"
  ];

  const values = fieldNames.map(fieldName => {
    const field = result.fields[fieldName];
    return field && field.status === "recognized" &&
      typeof field.value === "number" &&
      Number.isFinite(field.value)
      ? field.value
      : null;
  });

  if (values.some(value => value === null)) return result;

  const difference = values[0] - values[1] - values[2] - values[3];

  if (difference === 0) return result;

  result.identityReview = {
    required:true,
    confirmed:identityConfirmed === true,
    difference
  };

  if (identityConfirmed === true) return result;

  for (const fieldName of fieldNames) {
    const field = result.fields[fieldName];
    field.status = "identity-unconfirmed";
  }

  return result;
}

/* ---------- OCR解析結果の警告・一括入力行への変換 ---------- */

function isOcrResultAddable(result,identityConfirmed) {
  const reasons = [];
  if (!result || result.success !== true) {
    reasons.push("解析形式を確定できていません。");
    return {allowed:false,reasons};
  }

  if (!result.date || result.date.status !== "recognized" ||
      !result.date.value) {
    reasons.push("対象日を確定してください。");
  }

  if (result.date && result.date.source === "manual" &&
      !result.date.value) {
    reasons.push("対象日を入力してください。");
  }

  if (!result.fields || !result.fields.value ||
      result.fields.value.status !== "recognized" ||
      typeof result.fields.value.value !== "number") {
    reasons.push("総資産を確定してください。");
  }

  if (result.fields) {
    for (const field of Object.values(result.fields)) {
      if ([
        "unreadable",
        "multiple",
        "block-unconfirmed",
        "identity-unconfirmed"
      ].includes(field.status)) {
        reasons.push("要確認の項目を確定してください。");
        break;
      }
      if (field.required && field.status !== "recognized") {
        reasons.push("必須項目を確定してください。");
        break;
      }
    }
  }

  if (result.identityReview && result.identityReview.required &&
      result.identityReview.confirmed !== true &&
      identityConfirmed !== true) {
    reasons.push("恒等式の差額を確認し、「このままで確定」を選択してください。");
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

      const blocks = Array.isArray(format.blocks)
        ? format.blocks
        : [];
      const blockIds = new Set();
      const blocksById = new Map();

      for (const block of blocks) {
        if (!block || typeof block.blockId !== "string" ||
            !block.blockId) {
          errors.push("ブロックIDがありません：" + format.formatId);
          continue;
        }
        if (blockIds.has(block.blockId)) {
          errors.push("ブロックIDが重複しています：" + block.blockId);
        }
        blockIds.add(block.blockId);
        blocksById.set(block.blockId,block);

        const entries = Array.isArray(block.entries)
          ? block.entries
          : [];
        if (entries.length === 0) {
          errors.push("ブロックの項目定義がありません：" + block.blockId);
        }

        const entryLabels = new Set();
        const entryFields = new Set();

        for (const entry of entries) {
          if (!entry || typeof entry.label !== "string" ||
              !entry.label.trim() ||
              !(entry.field === null ||
                (typeof entry.field === "string" && entry.field)) ||
              !["amount","percent","multiple","text"].includes(entry.kind)) {
            errors.push("ブロックの項目定義が不正です：" + block.blockId);
            continue;
          }

          if (entryLabels.has(entry.label)) {
            errors.push("ブロック内の項目名が重複しています：" +
              block.blockId + " / " + entry.label);
          }
          entryLabels.add(entry.label);

          if (entry.field === null) continue;

          if (entryFields.has(entry.field)) {
            errors.push("複数のブロック項目が同じ共通項目を参照しています：" +
              block.blockId + " / " + entry.field);
          }
          entryFields.add(entry.field);

          if (!Object.prototype.hasOwnProperty.call(fields,entry.field)) {
            errors.push("ブロック項目の共通項目がありません：" +
              block.blockId + " / " + entry.field);
            continue;
          }

          const fieldRule = fields[entry.field] || {};
          if (fieldRule.layout !== "block" ||
              fieldRule.blockId !== block.blockId) {
            errors.push("ブロック項目とfieldsのblockIdが一致しません：" +
              block.blockId + " / " + entry.field);
          }

          if (!normalizeOcrWordList(fieldRule.labels).includes(entry.label)) {
            errors.push("ブロック項目とfieldsのlabelsが一致しません：" +
              block.blockId + " / " + entry.field);
          }
        }

        for (const heading of normalizeOcrWordList(block.headingLabels)) {
          if (entryLabels.has(heading)) {
            errors.push("headingLabelsとentriesの項目名が重複しています：" +
              block.blockId + " / " + heading);
          }
        }

        for (const ignored of normalizeOcrWordList(block.ignoreLines)) {
          if (entryLabels.has(ignored)) {
            errors.push("ignoreLinesとentriesの項目名が重複しています：" +
              block.blockId + " / " + ignored);
          }
        }
      }

      for (const [fieldName,fieldRule] of Object.entries(fields)) {
        if (!fieldRule || fieldRule.layout !== "block") continue;

        const block = blocksById.get(fieldRule.blockId);
        if (!block) {
          errors.push("fieldsが存在しないblockIdを参照しています：" +
            format.formatId + " / " + fieldName);
          continue;
        }

        const mappedEntries = (Array.isArray(block.entries)
          ? block.entries
          : []).filter(entry =>
          entry && entry.field === fieldName
        );

        if (mappedEntries.length !== 1) {
          errors.push("fieldsとブロック項目の対応が1対1ではありません：" +
            block.blockId + " / " + fieldName);
          continue;
        }

        if (!normalizeOcrWordList(fieldRule.labels)
          .includes(mappedEntries[0].label)) {
          errors.push("fieldsのlabelsがブロック項目を参照していません：" +
            block.blockId + " / " + fieldName);
        }
      }

      if (format.date &&
          !["screen","manual",undefined].includes(format.date.source)) {
        errors.push("日付の取得元が不正です：" + format.formatId);
      }

      if (format.date && format.date.source === "manual" &&
          (normalizeOcrWordList(format.date.labels).length > 0 ||
           normalizeOcrWordList(format.date.patterns).length > 0)) {
        errors.push("manualの日付ルールにlabels・patternsを定義できません：" +
          format.formatId);
      }

      if (format.identityStrict !== undefined &&
          typeof format.identityStrict !== "boolean") {
        errors.push("identityStrict の指定が不正です：" + format.formatId);
      }
    }
  }

  return {success:errors.length === 0,errors};
}
