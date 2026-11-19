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
    .replace(/－/g,"－");
}

function splitOcrLines(text) {
  const source = normalizeOcrWidth(text);
  const lines = source.split(/\r\n|\n|\r/);

  return lines
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

  if (matches.length > 1) {
    return {
      status:"multiple",
      format:null,
      matches
    };
  }

  return {
    status:"unidentified",
    format:null,
    matches:[]
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

  if (remainder !== "" && !/^[\s:]/.test(remainder)) {
    return null;
  }

  return remainder.replace(/^[\s:]+/,"").trim();
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
    if (source.startsWith(mark)) {
      negative = true;
      source = source.slice(mark.length).trim();
      break;
    }
  }

  if (source.startsWith("-") ||
      source.startsWith("−") ||
      source.startsWith("－")) {
    if (negative) {
      return {
        value:null,
        error:"負の符号が重複しています。",
        original
      };
    }

    negative = true;
    source = source.slice(1).trim();
  } else if (source.startsWith("+")) {
    source = source.slice(1).trim();
  }

  if (!source || /[+\-−－]/.test(source)) {
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

function parseOcrDateCandidate(value,patterns) {
  const source = normalizeOcrWidth(value).trim();
  const allowedPatterns = normalizeOcrWordList(patterns);

  const patternDefinitions = [
    {
      name:"YYYY/M/D",
      regex:/(\d{4})\/(\d{1,2})\/(\d{1,2})/
    },
    {
      name:"YYYY-MM-DD",
      regex:/(\d{4})-(\d{1,2})-(\d{1,2})/
    },
    {
      name:"YYYY年M月D日",
      regex:/(\d{4})年(\d{1,2})月(\d{1,2})日/
    }
  ];

  for (const definition of patternDefinitions) {
    if (!allowedPatterns.includes(definition.name)) continue;

    const match = source.match(definition.regex);
    if (!match) continue;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const date = new Date(Date.UTC(year,month - 1,day));

    if (date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day) {
      return {
        value:null,
        error:"実在しない日付です。",
        original:match[0]
      };
    }

    return {
      value:String(year).padStart(4,"0") + "-" +
        String(month).padStart(2,"0") + "-" +
        String(day).padStart(2,"0"),
      error:null,
      original:match[0]
    };
  }

  return null;
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
          item.lineNumber > line.lineNumber &&
          item.text.trim() !== ""
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
    const parsed = parseOcrDateCandidate(line.text,patterns);
    if (!parsed) continue;

    candidates.push({
      lineNumber:line.lineNumber,
      original:parsed.original,
      value:parsed.value,
      error:parsed.error
    });

    usedLineNumbers.add(line.lineNumber);
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
  const selectedMatches = occurrence === "first"
    ? matches.slice(0,1)
    : occurrence === "last"
      ? matches.slice(-1)
      : matches;

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

  const candidates = [];

  for (const match of selectedMatches) {
    let rawValue = match.remainder;
    let valueLineNumber = match.lineNumber;

    if (rule.layout === "nextLine") {
      const nextLine = lines.find(line =>
        line.lineNumber > match.lineNumber &&
        line.text.trim() !== ""
      );

      if (!nextLine) {
        rawValue = "";
      } else {
        rawValue = nextLine.text;
        valueLineNumber = nextLine.lineNumber;
      }
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
  }

  const usedLineNumbers = [];

  for (const match of selectedMatches) {
    usedLineNumbers.push(match.lineNumber);

    if (rule.layout === "nextLine") {
      const nextLine = lines.find(line =>
        line.lineNumber > match.lineNumber &&
        line.text.trim() !== ""
      );

      if (nextLine) usedLineNumbers.push(nextLine.lineNumber);
    }
  }

  if (occurrence === "only" && matches.length > 1) {
    return {
      field:fieldName,
      status:"multiple",
      value:null,
      original:null,
      candidates:matches.map(match => {
        const rawValue = rule.layout === "nextLine"
          ? (lines.find(line =>
              line.lineNumber > match.lineNumber &&
              line.text.trim() !== ""
            ) || {}).text || ""
          : match.remainder;

        const parsed = normalizeOcrAmount(
          rawValue,
          rule.negativeMarks
        );

        return {
          lineNumber:match.lineNumber,
          original:rawValue,
          value:parsed.value,
          error:parsed.error
        };
      }),
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

  let date = {
    status:"missing",
    value:null,
    original:null,
    candidates:[],
    required:true
  };

  if (dateResult.candidates.length === 1) {
    const candidate = dateResult.candidates[0];

    date = {
      status:candidate.error ? "unreadable" : "recognized",
      value:candidate.value,
      original:candidate.original,
      candidates:dateResult.candidates,
      required:selectedFormat.date
        ? selectedFormat.date.required !== false
        : true
    };
  } else if (dateResult.candidates.length > 1) {
    date = {
      status:"multiple",
      value:null,
      original:null,
      candidates:dateResult.candidates,
      required:selectedFormat.date
        ? selectedFormat.date.required !== false
        : true
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
      text:line.text
    }));

  const reasons = [];

  if (date.status === "missing" ||
      date.status === "unreadable" ||
      date.status === "multiple") {
    reasons.push("対象日を確定できません。");
  }

  if (fields.value.status === "missing-required" ||
      fields.value.status === "missing" ||
      fields.value.status === "unreadable" ||
      fields.value.status === "multiple") {
    reasons.push("総資産を確定できません。");
  }

  const needsConfirmation =
    date.status !== "recognized" ||
    Object.values(fields).some(field =>
      ["unreadable","multiple","missing-required"].includes(field.status)
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
