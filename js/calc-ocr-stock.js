
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
    return stockOcrFieldStock(null,"multiple");
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

function stockOcrSplitRakutenCardsStock(lines,format) {
  const cards = [];
  const sectionLabel = "保有商品詳細（すべて）";
  const normalizedSection = stockOcrNormalizeTextStock(sectionLabel);
  let inSection = false;
  let current = null;

  for (const line of lines) {
    const text = stockOcrNormalizeTextStock(line.text);

    if (text === normalizedSection ||
        text === "保有商品詳細(すべて)") {
      inSection = true;
      continue;
    }
    if (!inSection) continue;

    if (stockOcrIsHeadingStock(text,format)) {
      if (current) cards.push(current);
      current = {
        heading:text,
        lineNumber:line.lineNumber,
        lines:[line]
      };
      continue;
    }

    if (current) current.lines.push(line);
  }

  if (current) cards.push(current);
  return cards;
}

function stockOcrSplitIdecoCardsStock(lines,format) {
  const heading = "● 外国株式";
  const start = lines.findIndex(line =>
    stockOcrNormalizeTextStock(line.text) === heading
  );
  if (start < 0) return [];

  const end = lines.findIndex((line,index) =>
    index > start &&
    ["元本確保型","投資信託"].includes(
      stockOcrNormalizeTextStock(line.text)
    )
  );

  const selected = lines.slice(start,end < 0 ? lines.length : end);
  return [{
    heading,
    lineNumber:selected[0].lineNumber,
    lines:selected
  }];
}

function stockOcrSplitDcCardsStock(lines,format) {
  const headings = format.cardStyle.startLabels || [];
  const codeIndexes = [];

  for (let index = 0; index < lines.length; index += 1) {
    const text = stockOcrNormalizeTextStock(lines[index].text);
    const ascii = text.replace(/[（）]/g,match =>
      match === "（" ? "(" : ")"
    );
    if (/^\([0-9]{5}\)$/.test(ascii)) {
      codeIndexes.push(index);
    }
  }

  const cards = [];

  for (let index = 0; index < codeIndexes.length; index += 1) {
    const codeIndex = codeIndexes[index];
    const nameIndex = codeIndex - 1;
    const nextNameIndex = index + 1 < codeIndexes.length
      ? codeIndexes[index + 1] - 1
      : lines.length;

    if (nameIndex < 0 || nextNameIndex <= nameIndex) continue;

    let heading = null;
    for (let cursor = 0; cursor < nameIndex; cursor += 1) {
      const candidate = stockOcrNormalizeTextStock(lines[cursor].text);
      if (headings.includes(candidate)) heading = candidate;
    }

    const cardLines = lines.slice(nameIndex,nextNameIndex);
    if (heading) {
      cardLines.unshift({
        lineNumber:lines[Math.max(0,nameIndex - 1)].lineNumber,
        text:heading
      });
    }

    cards.push({
      heading,
      lineNumber:lines[nameIndex].lineNumber,
      lines:cardLines
    });
  }

  if (cards.length === 0) {
    const headingLines = lines.filter(line =>
      headings.includes(stockOcrNormalizeTextStock(line.text))
    );
    return headingLines.map(line => ({
      heading:stockOcrNormalizeTextStock(line.text),
      lineNumber:line.lineNumber,
      lines:[line]
    }));
  }

  return cards;
}

function stockOcrSplitCardsStock(lines,rule,format) {
  if (rule.ruleId === "rakuten-securities") {
    return stockOcrSplitRakutenCardsStock(lines,format);
  }
  if (rule.ruleId === "ideco") {
    return stockOcrSplitIdecoCardsStock(lines,format);
  }
  if (rule.ruleId === "corporate-dc") {
    return stockOcrSplitDcCardsStock(lines,format);
  }
  return [];
}

function stockOcrExtractNameStock(lines,format,heading) {
  const stopLabels = new Set(
    (format.nameStopLabels || []).map(stockOcrNormalizeTextStock)
  );
  const ignore = new Set(
    (format.ignoreLines || []).map(stockOcrNormalizeTextStock)
  );
  const parts = [];
  let code = null;

  for (const line of lines) {
    const text = stockOcrNormalizeTextStock(line.text);
    if (!text || text === heading || stopLabels.has(text) ||
        ignore.has(text)) continue;
    if (stockOcrIsHeadingStock(text,format)) continue;
    if (stockOcrIsWrapperCandidateStock(text,format)) continue;
    if (stockOcrIsCodeLineStock(text,format)) {
      if (code !== null) {
        return stockOcrFieldStock(null,"multiple");
      }
      code = text.replace(/[（）]/g,match =>
        match === "（" ? "(" : ")"
      ).replace(/^\(|\)$/g,"");
      continue;
    }
    if (stockOcrIsPercentLineStock(text) ||
        stockOcrIsYenLineStock(text) ||
        stockOcrIsPlainAmountLineStock(text)) continue;
    if (/円|％|%/.test(text)) continue;
    if (/^\d/.test(text)) continue;
    if (format.nameLinePattern &&
        !new RegExp(format.nameLinePattern).test(text)) continue;
    parts.push(text);
  }

  const name = parts.join("").trim();
  if (!name) return stockOcrFieldStock(null,"missing");

  const finalName = code
    ? name + " (" + code + ")"
    : name;

  return stockOcrFieldStock(
    finalName,"recognized",stockOcrMaskStock(finalName),"screen"
  );
}

function stockOcrFindGroupedAmountsStock(lines,format,expectedCount) {
  const tokens = stockOcrExtractAmountTokensStock(lines,format);
  if (tokens.length < expectedCount) {
    return {
      status:"insufficient",
      tokens
    };
  }
  if (tokens.length > expectedCount) {
    return {
      status:"multiple",
      tokens
    };
  }
  return {
    status:"recognized",
    tokens
  };
}

function stockOcrParseRakutenCardStock(card,format) {
  const lines = card.lines;
  const reasons = [];
  const name = stockOcrExtractNameStock(lines,format,card.heading);
  const wrapper = stockOcrFindWrapperStock(lines,format);
  const kindValue = format.kindByHeading &&
    format.kindByHeading[card.heading];
  const kind = stockOcrFieldStock(
    kindValue || null,
    kindValue ? "recognized" : "unreadable",
    card.heading,
    "heading"
  );

  const tokens = stockOcrExtractAmountTokensStock(lines,format);
  const signed = tokens.filter(token => token.signed);
  const unsigned = tokens.filter(token => !token.signed);

  let value = stockOcrFieldStock(null,"missing");
  let pnl = stockOcrFieldStock(null,"missing");

  if (unsigned.length === 1) {
    value = stockOcrFieldStock(
      unsigned[0].value,
      unsigned[0].status,
      unsigned[0].original,
      "amount-format"
    );
  } else if (unsigned.length > 1) {
    value = stockOcrFieldStock(null,"multiple");
  }

  if (signed.length === 1) {
    pnl = stockOcrFieldStock(
      signed[0].value,
      signed[0].status,
      signed[0].original,
      "amount-format"
    );
  } else if (signed.length > 1) {
    pnl = stockOcrFieldStock(null,"multiple");
  }

  if (value.status !== "recognized") {
    reasons.push("評価額を円表記で確定できません。");
  }
  if (pnl.status === "unreadable" || pnl.status === "multiple") {
    reasons.push("評価損益を確定できません。");
  }

  const costBasisValue =
    typeof value.value === "number" &&
    typeof pnl.value === "number"
      ? value.value - pnl.value
      : null;
  const costBasis = stockOcrFieldStock(
    costBasisValue,
    costBasisValue === null ? "missing" : "calculated",
    null,
    costBasisValue === null ? null : "value-minus-pnl"
  );

  const rate = stockOcrExtractRateStock(lines);
  const quantity = stockOcrFieldStock(null,"missing");

  return stockOcrBuildCardResultStock(
    card,format,name,wrapper,kind,value,pnl,costBasis,quantity,rate,reasons
  );
}

function stockOcrParseIdecoCardStock(card,format) {
  const lines = card.lines;
  const reasons = [];
  const name = stockOcrExtractNameStock(lines,format,card.heading);
  const wrapper = stockOcrFindWrapperStock(lines,format);
  const grouped = stockOcrFindGroupedAmountsStock(lines,format,2);

  let value = stockOcrFieldStock(null,"missing");
  let pnl = stockOcrFieldStock(null,"missing");

  if (grouped.status === "recognized") {
    value = stockOcrFieldStock(
      grouped.tokens[0].value,
      grouped.tokens[0].status,
      grouped.tokens[0].original,
      "labels-before-values"
    );
    pnl = stockOcrFieldStock(
      grouped.tokens[1].value,
      grouped.tokens[1].status,
      grouped.tokens[1].original,
      "labels-before-values"
    );
  } else {
    reasons.push("時価評価額と評価損益の対応を確定できません。");
  }

  const kindValue = format.kindByHeading &&
    format.kindByHeading[card.heading];
  const kind = stockOcrFieldStock(
    kindValue || null,
    kindValue ? "recognized" : "unreadable",
    card.heading,
    "heading"
  );

  const quantityLabel = (format.fields.quantity.labels || [])
    .map(stockOcrNormalizeTextStock);
  const quantityLabelIndex = lines.findIndex(line =>
    quantityLabel.includes(stockOcrNormalizeTextStock(line.text))
  );
  let quantity = stockOcrFieldStock(null,"missing");

  if (quantityLabelIndex >= 0) {
    const quantityLine = lines[quantityLabelIndex + 1];
    const quantityText = quantityLine
      ? stockOcrNormalizeTextStock(quantityLine.text)
      : "";
    if (/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(quantityText)) {
      quantity = stockOcrFieldStock(
        Number(quantityText.replace(/,/g,"")),
        "recognized",
        stockOcrMaskStock(quantityText),
        "label"
      );
    } else {
      quantity = stockOcrFieldStock(
        null,"unreadable",
        stockOcrMaskStock(quantityText),
        "label"
      );
      reasons.push("保有数量の表示を確認してください。");
    }
  }

  const costBasisValue =
    typeof value.value === "number" &&
    typeof pnl.value === "number"
      ? value.value - pnl.value
      : null;
  const costBasis = stockOcrFieldStock(
    costBasisValue,
    costBasisValue === null ? "missing" : "calculated",
    null,
    costBasisValue === null ? null : "value-minus-pnl"
  );

  const rate = stockOcrExtractRateStock(lines);

  return stockOcrBuildCardResultStock(
    card,format,name,wrapper,kind,value,pnl,costBasis,quantity,rate,reasons
  );
}

function stockOcrParseDcCardStock(card,format) {
  const lines = card.lines;
  const reasons = [];
  const name = stockOcrExtractNameStock(lines,format,card.heading);
  const wrapper = stockOcrFindWrapperStock(lines,format);
  const isPrincipalProtected =
    card.heading === format.principalProtectedLabel;

  const tokens = stockOcrExtractAmountTokensStock(lines,format);
  let value = stockOcrFieldStock(null,"missing");
  let costBasis = stockOcrFieldStock(null,"missing");
  let pnl = stockOcrFieldStock(null,"missing");

  if (tokens.length === 3) {
    value = stockOcrFieldStock(
      tokens[0].value,tokens[0].status,tokens[0].original,"labels-before-values"
    );
    costBasis = stockOcrFieldStock(
      tokens[1].value,tokens[1].status,tokens[1].original,"labels-before-values"
    );
    pnl = stockOcrFieldStock(
      tokens[2].value,tokens[2].status,tokens[2].original,"labels-before-values"
    );
  } else if (tokens.length === 2 && isPrincipalProtected &&
      format.principalProtectedTwoValuesEqualAllowed &&
      tokens[0].value !== null &&
      tokens[0].value === tokens[1].value) {
    value = stockOcrFieldStock(
      tokens[0].value,"recognized",tokens[0].original,"labels-before-values"
    );
    costBasis = stockOcrFieldStock(
      tokens[1].value,"recognized",tokens[1].original,"labels-before-values"
    );
    pnl = stockOcrFieldStock(null,"not-shown");
  } else {
    reasons.push("評価額・取得価額・評価損益の対応を確定できません。");
  }

  const kindValue = format.kindByHeading &&
    format.kindByHeading[card.heading];
  const kind = stockOcrFieldStock(
    kindValue || null,
    kindValue ? "recognized" : "unreadable",
    card.heading,
    "heading"
  );
  const quantity = stockOcrFieldStock(null,"missing");
  const rate = stockOcrFieldStock(null,"missing");

  return stockOcrBuildCardResultStock(
    card,format,name,wrapper,kind,value,pnl,costBasis,quantity,rate,reasons
  );
}

function stockOcrCheckIntegrityStock(value,pnl,costBasis,rate) {
  if (typeof value !== "number" ||
      typeof costBasis !== "number" ||
      typeof pnl !== "number") {
    return {status:"unavailable",difference:null};
  }

  const difference = value - costBasis - pnl;
  if (difference !== 0) {
    return {status:"mismatch",difference};
  }

  if (rate && typeof rate.value === "number" &&
      typeof costBasis === "number" && costBasis !== 0) {
    const expected = Number((pnl / costBasis * 100).toFixed(2));
    const actual = Number(rate.value.toFixed(2));
    if (expected !== actual) {
      return {
        status:"rate-mismatch",
        difference,
        expectedRate:expected,
        actualRate:actual
      };
    }
  }

  return {status:"ok",difference:0};
}

function stockOcrBuildCardResultStock(
  card,format,name,wrapper,kind,value,pnl,costBasis,quantity,rate,extraReasons
) {
  const reasons = Array.isArray(extraReasons) ? extraReasons.slice() : [];
  const required = [
    ["商品名",name],
    ["wrapper",wrapper],
    ["種別",kind],
    ["評価額",value]
  ];

  for (const [label,field] of required) {
    if (!field || field.status !== "recognized") {
      reasons.push(label + "を確定できません。");
    }
  }

  if (pnl.status === "unreadable" || pnl.status === "multiple") {
    reasons.push("評価損益を確認してください。");
  }

  if (costBasis.status === "missing" &&
      pnl.status === "recognized") {
    reasons.push("取得額を算出できません。");
  }

  const integrity = stockOcrCheckIntegrityStock(
    value.value,pnl.value,costBasis.value,rate
  );
  if (integrity.status === "mismatch" ||
      integrity.status === "rate-mismatch") {
    reasons.push("評価額・取得額・評価損益・率の整合が取れません。");
  }

  return {
    cardId:card.lineNumber,
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
    integrity,
    fields:{name,wrapper,kind,value,pnl,costBasis,quantity,rate},
    reasons:[...new Set(reasons)],
    safeLines:card.lines.map(line => ({
      lineNumber:line.lineNumber,
      text:stockOcrMaskStock(line.text)
    }))
  };
}

function stockOcrMarkDuplicateCardsStock(cards) {
  const groups = new Map();

  for (const card of cards) {
    if (!card.name || !card.wrapper) continue;
    const key = card.name + "\u0000" + card.wrapper;
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(card);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const card of group) {
      card.status = "needs-confirmation";
      card.reasons.push("同じ商品名・wrapperのカードが複数あります。");
    }
  }
  return cards;
}

function parseStockOcrText(text,rule) {
  const format = stockOcrGetFormatStock(rule);
  if (!format) {
    return {
      success:false,
      status:"no-rules",
      cards:[],
      reasons:["株式OCRの解析ルールがありません。"]
    };
  }

  const lines = stockOcrNormalizeLinesStock(text);
  const normalized = lines.map(line =>
    stockOcrNormalizeTextStock(line.text)
  );
  const identify = format.identify || {};
  const allMatched = (identify.all || []).every(label =>
    normalized.includes(stockOcrNormalizeTextStock(label))
  );
  const noneMatched = (identify.none || []).some(label =>
    normalized.includes(stockOcrNormalizeTextStock(label))
  );

  if (!allMatched || noneMatched) {
    return {
      success:false,
      status:"format-mismatch",
      cards:[],
      reasons:["選択した口座のOCR形式と一致しません。"]
    };
  }

  const cards = stockOcrSplitCardsStock(lines,rule,format);
  if (cards.length === 0) {
    return {
      success:false,
      status:"no-cards",
      cards:[],
      reasons:["商品カードを切り出せませんでした。"]
    };
  }

  let parsedCards;
  if (rule.ruleId === "rakuten-securities") {
    parsedCards = cards.map(card =>
      stockOcrParseRakutenCardStock(card,format)
    );
  } else if (rule.ruleId === "ideco") {
    parsedCards = cards.map(card =>
      stockOcrParseIdecoCardStock(card,format)
    );
  } else if (rule.ruleId === "corporate-dc") {
    parsedCards = cards.map(card =>
      stockOcrParseDcCardStock(card,format)
    );
  } else {
    return {
      success:false,
      status:"unsupported-rule",
      cards:[],
      reasons:["未対応の口座ルールです。"]
    };
  }

  stockOcrMarkDuplicateCardsStock(parsedCards);

  return {
    success:true,
    status:parsedCards.some(card =>
      card.status !== "recognized"
    ) ? "needs-confirmation" : "recognized",
    ruleId:rule.ruleId,
    ruleVersion:rule.ruleVersion || null,
    cards:parsedCards,
    reasons:[],
    safeUnrecognizedLines:[]
  };
}
