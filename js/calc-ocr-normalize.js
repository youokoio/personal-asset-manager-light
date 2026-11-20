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
  const source = rule.source === "manual" ? "manual" : "screen";

  if (source === "manual") {
    return {
      source,
      candidates:[],
      usedLineNumbers:[]
    };
  }

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
    source,
    candidates,
    usedLineNumbers:Array.from(usedLineNumbers)
  };
}
