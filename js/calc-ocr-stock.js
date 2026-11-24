"use strict";

/* ---------- S11b 株式OCR解析エンジン ---------- */

function stockOcrNormalizeLines(text) {
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

function stockOcrNormalizeText(value) {
  const text = typeof normalizeOcrWidth === "function"
    ? normalizeOcrWidth(value)
    : String(value === null || value === undefined ? "" : value);

  return text
    .replace(/[（]/g,"(")
    .replace(/[）]/g,")")
    .trim();
}

function stockOcrMask(value) {
  return typeof maskOcrSensitiveDigits === "function"
    ? maskOcrSensitiveDigits(value)
    : String(value === null || value === undefined ? "" : value)
        .replace(/\d{8,}/g,match => "●".repeat(match.length));
}

function stockOcrMakeField(value,status,original = null,source = null) {
  return {value,status,original,source};
}

function stockOcrIsCodeLine(value,pattern) {
  const text = stockOcrNormalizeText(value);
  return pattern instanceof RegExp && pattern.test(text);
}

function stockOcrIsNumberLine(value) {
  return /^[+\-−－]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(?:円)?$/
    .test(stockOcrNormalizeText(value));
}

function stockOcrIsPercentLine(value) {
  return /[+\-−－]?\s*\d+(?:\.\d+)?\s*[%％]/.test(
    stockOcrNormalizeText(value)
  );
}

function stockOcrSplitCards(lines,rule) {
  const style = rule && rule.cardStyle;
  if (!style || !Array.isArray(style.startLabels)) return [];

  const cards = [];
  let current = null;
  let started = false;

  for (const line of lines) {
    const text = stockOcrNormalizeText(line.text);

    if (style.startLabels.includes(text)) {
      if (current) cards.push(current);
      current = {
        heading:text,
        lineNumber:line.lineNumber,
        lines:[line]
      };
      started = true;
      continue;
    }

    if (!started) continue;

    if (style.endLabels && style.endLabels.includes(text)) {
      if (current) cards.push(current);
      current = null;
      break;
    }

    if (current) current.lines.push(line);
  }

  if (current) cards.push(current);

  return cards;
}

function stockOcrReadYenAmount(value,negativeMarks = []) {
  const original = String(value === null || value === undefined ? "" : value)
    .trim();

  if (!original || !/円/.test(stockOcrNormalizeText(original))) {
    return {
      value:null,
      status:"unreadable",
      original:stockOcrMask(original),
      error:"円表記を確認できません。外貨換算は行いません。"
    };
  }

  if (typeof normalizeOcrAmount !== "function") {
    return {
      value:null,
      status:"unreadable",
      original:stockOcrMask(original),
      error:"共通の金額正規化関数を利用できません。"
    };
  }

  const parsed = normalizeOcrAmount(original,negativeMarks);

  if (parsed.error || typeof parsed.value !== "number") {
    return {
      value:null,
      status:"unreadable",
      original:stockOcrMask(original),
      error:parsed.error || "金額を認識できません。"
    };
  }

  return {
    value:parsed.value,
    status:"recognized",
    original:stockOcrMask(original),
    error:null
  };
}

function stockOcrFindLabeledAmount(lines,labels,negativeMarks = []) {
  const normalizedLabels = labels.map(stockOcrNormalizeText);
  const matches = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (normalizedLabels.includes(
      stockOcrNormalizeText(lines[index].text)
    )) {
      matches.push(index);
    }
  }

  if (matches.length === 0) {
    return stockOcrMakeField(null,"missing");
  }

  if (matches.length > 1) {
    return stockOcrMakeField(null,"multiple");
  }

  const labelIndex = matches[0];
  const valueLine = lines[labelIndex + 1];

  if (!valueLine || !stockOcrIsNumberLine(valueLine.text)) {
    return stockOcrMakeField(null,"unreadable",null,"label");
  }

  let source = valueLine.text.trim();
  const followingLine = lines[labelIndex + 2];

  if (!/円/.test(source) &&
      followingLine &&
      /^円(?:\s|$|[（(])/.test(stockOcrNormalizeText(followingLine.text))) {
    source += "円";
  }

  const parsed = stockOcrReadYenAmount(source,negativeMarks);

  return stockOcrMakeField(
    parsed.value,
    parsed.status,
    parsed.original,
    "label"
  );
}

function stockOcrReadLabeledQuantity(lines,labels) {
  const normalizedLabels = labels.map(stockOcrNormalizeText);
  const matches = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (normalizedLabels.includes(
      stockOcrNormalizeText(lines[index].text)
    )) {
      matches.push(index);
    }
  }

  if (matches.length === 0) {
    return stockOcrMakeField(null,"missing");
  }

  if (matches.length > 1) {
    return stockOcrMakeField(null,"multiple");
  }

  const valueLine = lines[matches[0] + 1];
  if (!valueLine) return stockOcrMakeField(null,"unreadable");

  const source = stockOcrNormalizeText(valueLine.text);
  if (!/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(source)) {
    return stockOcrMakeField(
      null,
      "unreadable",
      stockOcrMask(source),
      "label"
    );
  }

  const value = Number(source.replace(/,/g,""));
  if (!Number.isFinite(value)) {
    return stockOcrMakeField(null,"unreadable",stockOcrMask(source));
  }

  return stockOcrMakeField(value,"recognized",source,"label");
}

function stockOcrReadSignedRate(lines) {
  const matches = [];

  for (const line of lines) {
    const text = stockOcrNormalizeText(line.text);
    const match = text.match(/([+\-−－]\s*\d+(?:\.\d+)?)\s*[%％]/);
    if (!match) continue;

    const normalized = match[1].replace(/\s/g,"").replace(/[−－]/g,"-");
    const value = Number(normalized);

    if (Number.isFinite(value)) {
      matches.push({
        value,
        original:stockOcrMask(match[0])
      });
    }
  }

  if (matches.length === 0) return stockOcrMakeField(null,"missing");
  if (matches.length > 1) return stockOcrMakeField(null,"multiple");

  return stockOcrMakeField(
    matches[0].value,
    "recognized",
    matches[0].original,
    "label"
  );
}

function stockOcrExtractRakutenAmounts(lines,rule) {
  const tokens = [];

  for (const line of lines) {
    const text = stockOcrNormalizeText(line.text);

    if (stockOcrIsCodeLine(text,rule.codePattern) ||
        stockOcrIsPercentLine(text)) {
      continue;
    }

    const withoutRates = text.replace(
      /[+\-−－]?\s*\d+(?:\.\d+)?\s*[%％]/g,
      ""
    );

    const pattern = /[+\-−－]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(?:円)?/g;
    let match;

    while ((match = pattern.exec(withoutRates)) !== null) {
      const source = match[0].trim();
      if (!source || !/\d/.test(source)) continue;

      const parsed = stockOcrReadYenAmount(
        source,
        rule.negativeMarks || []
      );

      tokens.push({
        value:parsed.value,
        status:parsed.status,
        original:parsed.original,
        signed:/^[+\-−－]/.test(source),
        lineNumber:line.lineNumber
      });
    }
  }

  return tokens;
}

function stockOcrFindWrapper(lines,rule) {
  const aliases = rule.wrapperAliases || {};
  const found = [];
  const unknown = [];

  for (const line of lines) {
    const text = stockOcrNormalizeText(line.text);

    if (Object.prototype.hasOwnProperty.call(aliases,text)) {
      found.push({
        value:aliases[text],
        original:stockOcrMask(text)
      });
    } else if (rule.wrapperPattern &&
        rule.wrapperPattern.test(text)) {
      unknown.push(stockOcrMask(text));
    }
  }

  if (found.length > 1) {
    return stockOcrMakeField(null,"multiple");
  }

  if (unknown.length > 0) {
    return stockOcrMakeField(null,"unreadable",unknown.join(" / "));
  }

  if (found.length === 1) {
    return stockOcrMakeField(
      found[0].value,
      "recognized",
      found[0].original,
      "screen"
    );
  }

  if (rule.wrapperFixed) {
    return stockOcrMakeField(
      rule.wrapperFixed,
      "recognized",
      rule.wrapperFixed,
      "account"
    );
  }

  return stockOcrMakeField(null,"missing");
}

function stockOcrExtractProductName(lines,rule,heading) {
  const labels = new Set(
    (rule.nameStopLabels || []).map(stockOcrNormalizeText)
  );
  const wrappers = rule.wrapperAliases || {};
  const nameParts = [];
  let code = null;

  for (const line of lines) {
    const text = stockOcrNormalizeText(line.text);

    if (!text || text === heading || labels.has(text)) continue;
    if ((rule.cardStyle.startLabels || []).includes(text)) continue;
    if (rule.ignoreLines && rule.ignoreLines.includes(text)) continue;
    if (Object.prototype.hasOwnProperty.call(wrappers,text)) continue;
    if (rule.wrapperPattern && rule.wrapperPattern.test(text)) continue;
    if (stockOcrIsNumberLine(text) || stockOcrIsPercentLine(text)) continue;

    if (rule.codePattern && stockOcrIsCodeLine(text,rule.codePattern)) {
      if (code !== null) return {value:null,status:"multiple"};
      code = text;
      continue;
    }

    if (rule.nameLinePattern && !rule.nameLinePattern.test(text)) continue;
    nameParts.push(text);
  }

  const name = nameParts.join("").trim();
  if (!name) return stockOcrMakeField(null,"missing");

  const normalizedName = rule.codeFormat && code
    ? name + rule.codeFormat + code + ")"
    : name;

  return stockOcrMakeField(
    normalizedName,
    "recognized",
    stockOcrMask(normalizedName),
    "screen"
  );
}

function stockOcrParseRakutenCard(card,rule) {
  const lines = card.lines;
  const heading = card.heading;
  const name = stockOcrExtractProductName(lines,rule,heading);
  const wrapper = stockOcrFindWrapper(lines,rule);
  const amounts = stockOcrExtractRakutenAmounts(lines,rule);
  const signed = amounts.filter(item => item.signed);
  const unsigned = amounts.filter(item => !item.signed);
  const reasons = [];

  let value = stockOcrMakeField(null,"missing");
  let pnl = stockOcrMakeField(null,"missing");

  if (unsigned.length === 1 && signed.length === 1) {
    value = stockOcrMakeField(
      unsigned[0].value,
      unsigned[0].status,
      unsigned[0].original,
      "amount-format"
    );
    pnl = stockOcrMakeField(
      signed[0].value,
      signed[0].status,
      signed[0].original,
      "amount-format"
    );
  } else {
    reasons.push("評価額と評価損益の対応を確定できません。");
  }

  const kind = rule.kindByHeading[heading] || null;
  const kindField = stockOcrMakeField(
    kind,
    kind ? "recognized" : "unreadable",
    heading,
    "heading"
  );

  const costBasisValue =
    typeof value.value === "number" &&
    typeof pnl.value === "number"
      ? value.value - pnl.value
      : null;

  const costBasis = stockOcrMakeField(
    costBasisValue,
    costBasisValue === null ? "missing" : "calculated",
    null,
    costBasisValue === null ? null : "value-minus-pnl"
  );

  const rate = stockOcrReadSignedRate(lines);
  const quantity = stockOcrMakeField(null,"missing");

  return stockOcrBuildCardResult(
    card,rule,name,wrapper,kindField,value,pnl,costBasis,quantity,rate,reasons
  );
}

function stockOcrParseIdecoCard(card,rule) {
  const lines = card.lines;
  const name = stockOcrExtractProductName(lines,rule,card.heading);
  const wrapper = stockOcrFindWrapper(lines,rule);
  const value = stockOcrFindLabeledAmount(
    lines,rule.fields.value.labels,rule.negativeMarks
  );
  const pnl = stockOcrFindLabeledAmount(
    lines,rule.fields.pnl.labels,rule.negativeMarks
  );
  const quantity = stockOcrReadLabeledQuantity(
    lines,rule.fields.quantity.labels
  );
  const rate = stockOcrReadSignedRate(lines);
  const kindValue = name.value &&
    rule.fundNamePattern.test(name.value)
      ? "投信"
      : name.value ? "その他" : null;
  const kind = stockOcrMakeField(
    kindValue,
    kindValue ? "recognized" : "unreadable",
    null,
    "name-format"
  );
  const costBasisValue =
    typeof value.value === "number" &&
    typeof pnl.value === "number"
      ? value.value - pnl.value
      : null;
  const costBasis = stockOcrMakeField(
    costBasisValue,
    costBasisValue === null ? "missing" : "calculated",
    null,
    costBasisValue === null ? null : "value-minus-pnl"
  );

  return stockOcrBuildCardResult(
    card,rule,name,wrapper,kind,value,pnl,costBasis,quantity,rate,[]
  );
}

function stockOcrParseDcCard(card,rule) {
  const lines = card.lines;
  const name = stockOcrExtractProductName(lines,rule,card.heading);
  const wrapper = stockOcrFindWrapper(lines,rule);
  const value = stockOcrFindLabeledAmount(
    lines,rule.fields.value.labels,rule.negativeMarks
  );
  const isPrincipalProtected =
    card.heading === rule.cardStyle.principalProtectedLabel;

  let costBasis;
  let pnl;

  if (isPrincipalProtected) {
    costBasis = stockOcrFindLabeledAmount(
      lines,rule.fields.costBasis.labels,rule.negativeMarks
    );
    pnl = stockOcrMakeField(null,"not-shown");
  } else {
    costBasis = stockOcrFindLabeledAmount(
      lines,rule.fields.costBasis.labels,rule.negativeMarks
    );
    pnl = stockOcrFindLabeledAmount(
      lines,rule.fields.pnl.labels,rule.negativeMarks
    );
  }

  const quantity = stockOcrMakeField(null,"missing");
  const rate = stockOcrMakeField(null,"missing");
  const kind = stockOcrMakeField(
    rule.kindByHeading[card.heading] || null,
    rule.kindByHeading[card.heading] ? "recognized" : "unreadable",
    card.heading,
    "heading"
  );

  return stockOcrBuildCardResult(
    card,rule,name,wrapper,kind,value,pnl,costBasis,quantity,rate,[]
  );
}

function stockOcrBuildCardResult(
  card,rule,name,wrapper,kind,value,pnl,costBasis,quantity,rate,extraReasons
) {
  const reasons = Array.isArray(extraReasons) ? extraReasons.slice() : [];
  const requiredFields = [
    ["商品名",name],
    ["wrapper",wrapper],
    ["種別",kind],
    ["評価額",value]
  ];

  for (const [label,field] of requiredFields) {
    if (!field || field.status !== "recognized") {
      reasons.push(label + "を確定できません。");
    }
  }

  if (pnl.status === "unreadable" || pnl.status === "multiple") {
    reasons.push("評価損益を確認してください。");
  }

  if (costBasis.value === null && pnl.value !== null) {
    reasons.push("取得額を算出できません。");
  }

  return {
    cardId:rule.ruleId + "-" + card.lineNumber,
    lineNumber:card.lineNumber,
    status:reasons.length === 0 ? "recognized" : "needs-confirmation",
    name:name.value,
    wrapper:wrapper.value,
    kind:kind.value,
    value:value.value,
    pnl:pnl.value,
    costBasis:costBasis.value,
    costBasisSource:costBasis.source,
    quantity:quantity.value,
    rate:rate.value,
    fields:{name,wrapper,kind,value,pnl,costBasis,quantity,rate},
    reasons:[...new Set(reasons)],
    safeLines:card.lines.map(line => ({
      lineNumber:line.lineNumber,
      text:stockOcrMask(line.text)
    }))
  };
}

function parseStockOcrText(text,rule) {
  if (!rule || !Array.isArray(rule.formats) ||
      rule.formats.length !== 1) {
    return {
      success:false,
      status:"no-rules",
      cards:[],
      reasons:["株式OCRの解析ルールがありません。"]
    };
  }

  const lines = stockOcrNormalizeLines(text);
  const format = rule.formats[0];
  const identify = format.identify || {};
  const normalizedLines = lines.map(line =>
    stockOcrNormalizeText(line.text)
  );

  const allMatched = (identify.all || []).every(label =>
    normalizedLines.includes(stockOcrNormalizeText(label))
  );
  const noneMatched = (identify.none || []).some(label =>
    normalizedLines.includes(stockOcrNormalizeText(label))
  );

  if (!allMatched || noneMatched) {
    return {
      success:false,
      status:"format-mismatch",
      cards:[],
      reasons:["選択した口座のOCR形式と一致しません。"]
    };
  }

  const cards = stockOcrSplitCards(lines,rule);
  if (cards.length === 0) {
    return {
      success:false,
      status:"no-cards",
      cards:[],
      reasons:["商品カードを切り出せませんでした。"]
    };
  }

  const parsedCards = cards.map(card => {
    if (rule.ruleId === "rakuten-securities-stock") {
      return stockOcrParseRakutenCard(card,rule);
    }
    if (rule.ruleId === "ideco-stock") {
      return stockOcrParseIdecoCard(card,rule);
    }
    if (rule.ruleId === "corporate-dc-stock") {
      return stockOcrParseDcCard(card,rule);
    }

    return {
      cardId:rule.ruleId + "-" + card.lineNumber,
      lineNumber:card.lineNumber,
      status:"needs-confirmation",
      reasons:["未対応のカード形式です。"],
      safeLines:card.lines.map(line => ({
        lineNumber:line.lineNumber,
        text:stockOcrMask(line.text)
      }))
    };
  });

  return {
    success:true,
    status:parsedCards.some(card =>
      card.status !== "recognized"
    ) ? "needs-confirmation" : "recognized",
    ruleId:rule.ruleId,
    ruleVersion:rule.ruleVersion,
    cards:parsedCards,
    reasons:[],
    safeUnrecognizedLines:[]
  };
}
