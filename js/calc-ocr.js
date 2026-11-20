"use strict";

/* ---------- 解析形式の判定 ---------- */

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
