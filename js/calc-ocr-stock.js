
"use strict";

/* ---------- S11b 株式OCR解析エンジン ---------- */

function stockOcrGetFormatStock(rule) {
  if (!rule || !Array.isArray(rule.formats) ||
      rule.formats.length !== 1) return null;
  return rule.formats[0];
}

function stockOcrNormalizeLinesStock(text) {
  if (typeof splitOcrLines === "function") {
    return splitOcrLines(text);
  }
  return String(text === null || text === undefined ? "" : text)
    .split(/\r\n|\n|\r/)
    .map((value,index) => ({
      lineNumber:index + 1,
      text:value.trim()
    }))
    .filter(line => line.text !== "");
}

function stockOcrNormalizeTextStock(value) {
  return (
    typeof normalizeOcrWidth === "function"
      ? normalizeOcrWidth(value)
      : String(value === null || value === undefined ? "" : value)
  ).trim();
}

function stockOcrMaskStock(value) {
  return typeof maskOcrSensitiveDigits === "function"
    ? maskOcrSensitiveDigits(value)
    : String(value === null || value === undefined ? "" : value)
        .replace(/\d{8,}/g,match => "●".repeat(match.length));
}

function stockOcrFieldStock(value,status,original = null,source = null) {
  return {value,status,original,source};
}

function stockOcrCompilePatternStock(pattern) {
  if (!pattern) return null;
  try {
    return new RegExp(pattern);
  } catch (error) {
    return null;
  }
}

function stockOcrIsCodeLineStock(value,format) {
  const text = stockOcrNormalizeTextStock(value);
  const pattern = stockOcrCompilePatternStock(format.codePattern);
  if (pattern && pattern.test(text)) return true;

  const ascii = text.replace(/[（）]/g,match =>
    match === "（" ? "(" : ")"
  );
  return /^\(?[0-9]{4,5}\)?$/.test(ascii) ||
    /^\(?[A-Z]{1,6}\)?$/.test(ascii) ||
    /^\(?[A-Z0-9.]{1,8}\)?$/.test(ascii);
}

function stockOcrIsPercentLineStock(value) {
  return /[+\-−－]?\s*\d+(?:\.\d+)?\s*[%％]/.test(
    stockOcrNormalizeTextStock(value)
  );
}

function stockOcrIsYenLineStock(value) {
  return /^[+\-−－]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*円$/
    .test(stockOcrNormalizeTextStock(value));
}

function stockOcrIsPlainAmountLineStock(value) {
  return /^[+\-−－]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/
    .test(stockOcrNormalizeTextStock(value));
}

function stockOcrIsHeadingStock(value,format) {
  const headings = format.cardStyle &&
    format.cardStyle.startLabels;
  return Array.isArray(headings) &&
    headings.includes(stockOcrNormalizeTextStock(value));
}

function stockOcrIsWrapperCandidateStock(value,format) {
  const text = stockOcrNormalizeTextStock(value);
  const aliases = format.wrapperAliases || {};
  if (Object.prototype.hasOwnProperty.call(aliases,text)) return true;
  return /NISA|つみたて|特定/.test(text);
}

function stockOcrFindWrapperStock(lines,format) {
  const aliases = format.wrapperAliases || {};
  const found = [];
  const unknown = [];

  for (const line of lines) {
    const text = stockOcrNormalizeTextStock(line.text);
    if (Object.prototype.hasOwnProperty.call(aliases,text)) {
      found.push({
        value:aliases[text],
        original:stockOcrMaskStock(text)
      });
    } else if (stockOcrIsWrapperCandidateStock(text,format)) {
      unknown.push(stockOcrMaskStock(text));
    }
  }

  if (found.length > 1) {
    const candidates = Array.from(new Set(
      found.map(item => item.value)
    ));
    return {
      ...stockOcrFieldStock(null,"multiple"),
      candidates
    };
  }
  if (unknown.length > 0) {
    return stockOcrFieldStock(
      null,"unreadable",unknown.join(" / "),"screen"
    );
  }
  if (found.length === 1) {
    return stockOcrFieldStock(
      found[0].value,"recognized",found[0].original,"screen"
    );
  }
  if (format.wrapperFixed) {
    return stockOcrFieldStock(
      format.wrapperFixed,"recognized",format.wrapperFixed,"account"
    );
  }
  return stockOcrFieldStock(null,"missing");
}

function stockOcrReadAmountStock(source,negativeMarks) {
  const original = String(source || "").trim();
  if (!original || !/円/.test(stockOcrNormalizeTextStock(original))) {
    return {
      value:null,
      status:"unreadable",
      original:stockOcrMaskStock(original),
      error:"円表記を確認できません。外貨換算は行いません。"
    };
  }

  if (typeof normalizeOcrAmount !== "function") {
    return {
      value:null,
      status:"unreadable",
      original:stockOcrMaskStock(original),
      error:"共通の金額正規化関数を利用できません。"
    };
  }

  const parsed = normalizeOcrAmount(original,negativeMarks || []);
  if (!parsed || parsed.error ||
      typeof parsed.value !== "number" ||
      !Number.isFinite(parsed.value)) {
    return {
      value:null,
      status:"unreadable",
      original:stockOcrMaskStock(original),
      error:parsed && parsed.error
        ? parsed.error
        : "金額を認識できません。"
    };
  }

  return {
    value:parsed.value,
    status:"recognized",
    original:stockOcrMaskStock(original),
    error:null
  };
}

function stockOcrExtractAmountTokensStock(lines,format) {
  const tokens = [];
  const negativeMarks = format.negativeMarks || [];

  for (let index = 0; index < lines.length; index += 1) {
    const text = stockOcrNormalizeTextStock(lines[index].text);

    if (!text || stockOcrIsCodeLineStock(text,format) ||
        stockOcrIsPercentLineStock(text)) continue;

    if (stockOcrIsYenLineStock(text)) {
      const parsed = stockOcrReadAmountStock(text,negativeMarks);
      tokens.push({
        value:parsed.value,
        status:parsed.status,
        hasYen:true,
        signed:/^[+\-−－]/.test(text),
        lineNumber:lines[index].lineNumber,
        original:parsed.original
      });
      continue;
    }

    if (stockOcrIsPlainAmountLineStock(text)) {
      const following = lines[index + 1];
      const followingText = following
        ? stockOcrNormalizeTextStock(following.text)
        : "";

      if (/^円(?:$|[（(])/.test(followingText)) {
        const parsed = stockOcrReadAmountStock(
          text + "円",negativeMarks
        );
        tokens.push({
          value:parsed.value,
          status:parsed.status,
          hasYen:true,
          signed:/^[+\-−－]/.test(text),
          lineNumber:lines[index].lineNumber,
          original:parsed.original
        });
        index += 1;
      } else {
        tokens.push({
          value:null,
          status:"unreadable",
          hasYen:false,
          signed:/^[+\-−－]/.test(text),
          lineNumber:lines[index].lineNumber,
          original:stockOcrMaskStock(text)
        });
      }
    }
  }

  return tokens;
}

function stockOcrExtractRateStock(lines) {
  const found = [];

  for (const line of lines) {
    const text = stockOcrNormalizeTextStock(line.text);
    const matches = text.match(
      /[+\-−－]?\s*\d+(?:\.\d+)?\s*[%％]/g
    ) || [];

    for (const source of matches) {
      const value = Number(
        source.replace(/[%％\s]/g,"").replace(/[−－]/g,"-")
      );
      if (Number.isFinite(value)) {
        found.push({
          value,
          decimals:(source.match(/\.(\d+)/) || ["",""])[1].length,
          original:stockOcrMaskStock(source)
        });
      }
    }
  }

  if (found.length === 0) return stockOcrFieldStock(null,"missing");
  if (found.length > 1) return stockOcrFieldStock(null,"multiple");

  return stockOcrFieldStock(
    found[0].value,"recognized",found[0].original,"screen"
  );
}
