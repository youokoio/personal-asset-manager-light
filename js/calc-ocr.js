"use strict";

/* ---------- OCRテキストの前処理 ---------- */

function normalizeOcrWidth(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/[！-～]/g,character =>
      String.fromCharCode(character.charCodeAt(0) - 0xFEE0)
    )
    .replace(/　/g," ")
    .replace(/：/g,":")
    .replace(/／/g,"/")
    .replace(/－/g,"-");
}

function splitOcrLines(text) {
  return normalizeOcrWidth(text)
    .split(/\r\n|\n|\r/)
    .map((value,index) => ({
      lineNumber:index + 1,
      text:value.trim()
    }))
    .filter(line => line.text !== "");
}

/* ---------- 解析形式の判定 ---------- */

function normalizeOcrWordList(value) {
  if (Array.isArray(value)) {
    return value
      .filter(item => typeof item === "string")
      .map(item => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function identifyOcrFormats(text,rule) {
  if (!rule || !Array.isArray(rule.formats) ||
      rule.formats.length === 0) {
    return {
      status:"no-rules",
      format:null,
      matches:[]
    };
  }

  const source = normalizeOcrWidth(text);
  const matches = [];

  for (const format of rule.formats) {
    const identify = format && format.identify
      ? format.identify
      : {};

    const requiredWords = normalizeOcrWordList(identify.all);
    const prohibitedWords = normalizeOcrWordList(identify.none);

    const hasAllWords = requiredWords.every(word =>
      source.includes(normalizeOcrWidth(word))
    );

    const hasNoProhibitedWords = prohibitedWords.every(word =>
      !source.includes(normalizeOcrWidth(word))
    );

    if (hasAllWords && hasNoProhibitedWords) {
      matches.push(format);
    }
  }

  if (matches.length === 1) {
    return {
      status:"identified",
      format:matches[0],
      matches
    };
  }

  return {
    status:matches.length > 1 ? "multiple" : "unidentified",
    format:null,
    matches
  };
}

/* ---------- ラベルの照合 ---------- */

function matchOcrLabel(line,label) {
  if (typeof line !== "string" ||
      typeof label !== "string" ||
      !label.trim()) {
    return null;
  }

  const normalizedLine = normalizeOcrWidth(line);
  const normalizedLabel = normalizeOcrWidth(label.trim());

  if (!normalizedLine.startsWith(normalizedLabel)) {
    return null;
  }

  const remainder = normalizedLine.slice(normalizedLabel.length);

  if (remainder !== "" && !/^[\s:\t]/.test(remainder)) {
    return null;
  }

  return remainder.replace(/^[\s:\t]+/,"").trim();
}

function findOcrLabelMatches(lines,labels) {
  const matches = [];
  const normalizedLabels = normalizeOcrWordList(labels);

  for (const line of lines) {
    for (const label of normalizedLabels) {
      const remainder = matchOcrLabel(line.text,label);

      if (remainder !== null) {
        matches.push({
          lineNumber:line.lineNumber,
          label,
          remainder,
          originalText:line.text
        });
        break;
      }
    }
  }

  return matches;
}

/* ---------- 金額の正規化 ---------- */

function normalizeOcrAmount(value,negativeMarks = []) {
  const original = String(
    value === null || value === undefined ? "" : value
  ).trim();

  if (!original) {
    return {
      value:null,
      error:"金額が空です。",
      original
    };
  }

  let source = normalizeOcrWidth(original).trim();

  source = source
    .replace(/^(?:¥|JPY)\s*/i,"")
    .replace(/\s*(?:円|JPY)$/i,"")
    .trim();

  let negative = false;
  const marks = normalizeOcrWordList(negativeMarks);

  for (const mark of marks) {
    const normalizedMark = normalizeOcrWidth(mark);

    if (source.startsWith(normalizedMark)) {
      negative = true;
      source = source.slice(normalizedMark.length).trim();
      break;
    }
  }

  if (/^[+\-−]/.test(source)) {
    const sign = source.charAt(0);

    if (negative && sign !== "+") {
      return {
        value:null,
        error:"負の符号が重複しています。",
        original
      };
    }

    if (sign === "+" && negative) {
      return {
        value:null,
        error:"符号の組み合わせを認識できません。",
        original
      };
    }

    negative = sign !== "+";
    source = source.slice(1).trim();
  }

  if (!source || /[+\-−－ー―]/.test(source)) {
    return {
      value:null,
      error:"金額の符号を認識できません。",
      original
    };
  }

  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(source)) {
    return {
      value:null,
      error:"金額の形式を認識できません。",
      original
    };
  }

  const number = Number(source.replace(/,/g,""));

  if (!Number.isFinite(number)) {
    return {
      value:null,
      error:"数値として扱えません。",
      original
    };
  }

  return {
    value:negative ? -number : number,
    error:null,
    original
  };
}

/* ---------- 日付の正規化 ---------- */

function parseOcrDateCandidates(value,patterns) {
  const source = normalizeOcrWidth(value);
  const allowedPatterns = normalizeOcrWordList(patterns);

  const patternDefinitions = [
    {
      name:"YYYY/M/D",
      regex:/\d{4}\/\d{1,2}\/\d{1,2}/
    },
    {
      name:"YYYY-MM-DD",
      regex:/\d{4}-\d{1,2}-\d{1,2}/
    },
    {
      name:"YYYY年M月D日",
      regex:/\d{4}年\d{1,2}月\d{1,2}日/
    }
  ];

  const candidates = [];

  for (const definition of patternDefinitions) {
    if (!allowedPatterns.includes(definition.name)) continue;

    const expression = new RegExp(
      "(?<!\\d)" + definition.regex.source + "(?!\\d)",
      "g"
    );

    for (const match of source.matchAll(expression)) {
      const original = match[0];
      const numbers = original.match(/\d+/g).map(Number);

      const year = numbers[0];
      const month = numbers[1];
      const day = numbers[2];

      const date = new Date(Date.UTC(year,month - 1,day));
      const valid =
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day;

      candidates.push({
        original,
        value:valid
          ? String(year).padStart(4,"0") + "-" +
            String(month).padStart(2,"0") + "-" +
            String(day).padStart(2,"0")
          : null,
        error:valid ? null : "実在しない日付です。"
      });
    }
  }

  return candidates;
}

function findOcrDateCandidates(lines,dateRule) {
  const rule = dateRule || {};
  const labels = normalizeOcrWordList(rule.labels);
  const patterns = normalizeOcrWordList(rule.patterns);
  const searchLines = [];
  const usedLineNumbers = new Set();

  if (labels.length > 0) {
    const labelMatches = findOcrLabelMatches(lines,labels);

    for (const match of labelMatches) {
      const line = lines.find(item =>
        item.lineNumber === match.lineNumber
      );

      if (!line) continue;

      if (match.remainder) {
        searchLines.push({
          lineNumber:line.lineNumber,
          text:match.remainder
        });
      } else {
        const nextLine = lines.find(item =>
          item.lineNumber > line.lineNumber
        );

        if (nextLine) searchLines.push(nextLine);
      }

      usedLineNumbers.add(match.lineNumber);
    }
  } else {
    searchLines.push(...lines);
  }

  const candidates = [];

  for (const line of searchLines) {
    const parsedCandidates = parseOcrDateCandidates(
      line.text,
      patterns
    );

    for (const parsed of parsedCandidates) {
      candidates.push({
        lineNumber:line.lineNumber,
        original:parsed.original,
        value:parsed.value,
        error:parsed.error
      });

      usedLineNumbers.add(line.lineNumber);
    }
  }

  return {
    candidates,
    usedLineNumbers:Array.from(usedLineNumbers)
  };
}

/* ---------- 項目の抽出 ---------- */

function getOcrFieldResult(fieldName,fieldRule,lines) {
  const rule = fieldRule || {};

  if (rule.show === false) {
    return {
      field:fieldName,
      status:"not-shown",
      value:null,
      original:null,
      candidates:[],
      required:false,
      usedLineNumbers:[]
    };
  }

  const matches = findOcrLabelMatches(lines,rule.labels);
  const occurrence = rule.occurrence || "only";

  if (matches.length === 0) {
    return {
      field:fieldName,
      status:rule.required ? "missing-required" : "missing",
      value:null,
      original:null,
      candidates:[],
      required:rule.required === true,
      usedLineNumbers:[]
    };
  }

  const selectedMatches = occurrence === "first"
    ? matches.slice(0,1)
    : occurrence === "last"
      ? matches.slice(-1)
      : matches;

  const candidates = [];
  const usedLineNumbers = [];

  for (const match of selectedMatches) {
    let rawValue = match.remainder;
    let valueLineNumber = match.lineNumber;

    if (rule.layout === "nextLine") {
      const nextLine = lines.find(line =>
        line.lineNumber > match.lineNumber
      );

      rawValue = nextLine ? nextLine.text : "";
      valueLineNumber = nextLine
        ? nextLine.lineNumber
        : null;
    } else {
      rawValue = rawValue.split(/\s+/)[0] || "";
    }

    const parsed = normalizeOcrAmount(
      rawValue,
      rule.negativeMarks
    );

    candidates.push({
      lineNumber:match.lineNumber,
      valueLineNumber,
      label:match.label,
      original:rawValue,
      value:parsed.value,
      error:parsed.error
    });

    usedLineNumbers.push(match.lineNumber);

    if (valueLineNumber !== null) {
      usedLineNumbers.push(valueLineNumber);
    }
  }

  if (occurrence === "only" && matches.length > 1) {
    return {
      field:fieldName,
      status:"multiple",
      value:null,
      original:null,
      candidates,
      required:rule.required === true,
      usedLineNumbers
    };
  }

  if (candidates.length !== 1 ||
      candidates[0].error ||
      candidates[0].value === null) {
    return {
      field:fieldName,
      status:"unreadable",
      value:null,
      original:candidates.length === 1
        ? candidates[0].original
        : null,
      candidates,
      required:rule.required === true,
      usedLineNumbers
    };
  }

  return {
    field:fieldName,
    status:"recognized",
    value:candidates[0].value,
    original:candidates[0].original,
    candidates,
    required:rule.required === true,
    usedLineNumbers
  };
}

/* ---------- OCR解析の実行 ---------- */

function parseOcrText(text,rule,formatId = null) {
  const source = String(text === null || text === undefined ? "" : text);

  if (!rule || !Array.isArray(rule.formats) ||
      rule.formats.length === 0) {
    return {
      success:false,
      status:"no-rules",
      format:null,
      fields:{},
      date:null,
      unrecognizedLines:[],
      reasons:["この口座の解析ルールがありません。"]
    };
  }

  const identification = identifyOcrFormats(source,rule);
  let selectedFormat = null;

  if (formatId !== null) {
    selectedFormat = rule.formats.find(format =>
      format.formatId === formatId
    ) || null;

    if (!selectedFormat) {
      return {
        success:false,
        status:"invalid-format",
        format:null,
        fields:{},
        date:null,
        unrecognizedLines:[],
        reasons:["指定された形式が見つかりません。"]
      };
    }
  } else if (identification.status === "identified") {
    selectedFormat = identification.format;
  } else {
    return {
      success:false,
      status:identification.status,
      format:null,
      matches:identification.matches.map(format => ({
        formatId:format.formatId,
        label:format.label
      })),
      fields:{},
      date:null,
      unrecognizedLines:[],
      reasons:identification.status === "multiple"
        ? ["複数の形式に一致しました。形式を選択してください。"]
        : ["画面の形式を判定できません。形式を選択してください。"]
    };
  }

  const lines = splitOcrLines(source);
  const fields = {};
  const usedLineNumbers = new Set();

  const dateResult = findOcrDateCandidates(
    lines,
    selectedFormat.date || {}
  );

  for (const lineNumber of dateResult.usedLineNumbers) {
    usedLineNumbers.add(lineNumber);
  }

  const dateRequired = selectedFormat.date
    ? selectedFormat.date.required !== false
    : true;

  let date = {
    status:dateRequired ? "missing-required" : "missing",
    value:null,
    original:null,
    candidates:[],
    required:dateRequired
  };

  if (dateResult.candidates.length === 1) {
    const candidate = dateResult.candidates[0];

    date = {
      status:candidate.error ? "unreadable" : "recognized",
      value:candidate.value,
      original:candidate.original,
      candidates:dateResult.candidates,
      required:dateRequired
    };
  } else if (dateResult.candidates.length > 1) {
    date = {
      status:"multiple",
      value:null,
      original:null,
      candidates:dateResult.candidates,
      required:dateRequired
    };
  }

  const fieldRules = selectedFormat.fields || {};

  for (const fieldName of [
    "value",
    "effectivePrincipal",
    "pnl",
    "realizedPnlTotal",
    "swapTotal"
  ]) {
    const fieldResult = getOcrFieldResult(
      fieldName,
      fieldRules[fieldName] || {},
      lines
    );

    fields[fieldName] = fieldResult;

    for (const lineNumber of fieldResult.usedLineNumbers) {
      usedLineNumbers.add(lineNumber);
    }
  }

  const unrecognizedLines = lines
    .filter(line => !usedLineNumbers.has(line.lineNumber))
    .map(line => ({
      lineNumber:line.lineNumber,
      text:maskOcrSensitiveDigits(line.text)
    }));

  const reasons = [];

  if (date.required && date.status !== "recognized") {
    reasons.push("対象日を確定できません。");
  }

  const fieldLabels = {
    value:"総資産",
    effectivePrincipal:"有効元本",
    pnl:"評価損益",
    realizedPnlTotal:"累積確定損益",
    swapTotal:"累計スワップ"
  };

  for (const [fieldName,field] of Object.entries(fields)) {
    if (field.required && field.status !== "recognized") {
      reasons.push(fieldLabels[fieldName] + "を確定できません。");
    } else if (["unreadable","multiple"].includes(field.status)) {
      reasons.push(fieldLabels[fieldName] + "を確認してください。");
    }
  }

  const needsConfirmation =
    (date.required && date.status !== "recognized") ||
    Object.values(fields).some(field =>
      field.required && field.status !== "recognized"
        ? true
        : ["unreadable","multiple"].includes(field.status)
    );

  return {
    success:true,
    status:needsConfirmation ? "needs-confirmation" : "recognized",
    format:{
      formatId:selectedFormat.formatId,
      label:selectedFormat.label
    },
    fields,
    date,
    unrecognizedLines,
    reasons
  };
}

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
