
function stockOcrFindGroupedAmountsStock(lines,format,requiredCount) {
  const order = Array.isArray(format.amountLabelOrder)
    ? format.amountLabelOrder
    : [];
  if (order.length !== requiredCount) {
    return {status:"invalid-rule",tokens:[]};
  }

  let lastLabelIndex = -1;
  for (const fieldName of order) {
    const field = format.fields && format.fields[fieldName];
    const labels = field && Array.isArray(field.labels)
      ? field.labels.map(stockOcrNormalizeTextStock)
      : [];
    const labelIndex = lines.findIndex(line =>
      labels.includes(stockOcrNormalizeTextStock(line.text))
    );
    if (labelIndex < 0) {
      return {status:"missing-label",tokens:[]};
    }
    lastLabelIndex = Math.max(lastLabelIndex,labelIndex);
  }

  const yenTokens = [];
  for (let index = lastLabelIndex + 1; index < lines.length; index += 1) {
    const text = stockOcrNormalizeTextStock(lines[index].text);
    const match = text.match(
      /^([+＋\-−－]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*円)/
    );
    if (!match) continue;

    const parsed = normalizeOcrAmount(
      match[1],format.negativeMarks || []
    );
    yenTokens.push({
      value:parsed && !parsed.error ? parsed.value : null,
      status:parsed && !parsed.error ? "recognized" : "unreadable",
      original:stockOcrMaskStock(match[1]),
      lineNumber:lines[index].lineNumber
    });
  }

  if (yenTokens.length !== 4) {
    return {
      status:yenTokens.length < 4 ? "insufficient" : "ambiguous",
      tokens:[]
    };
  }

  const selected = yenTokens.slice(0,requiredCount);
  if (selected.some(token =>
    token.status !== "recognized" ||
    typeof token.value !== "number" ||
    !Number.isFinite(token.value)
  )) {
    return {status:"unreadable",tokens:selected};
  }

  return {status:"recognized",tokens:selected};
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
    const stopLabels = (format.nameStopLabels || [])
      .map(stockOcrNormalizeTextStock);
    const lastValueLabelIndex = lines.reduce((last,line,index) =>
      stopLabels.includes(stockOcrNormalizeTextStock(line.text))
        ? Math.max(last,index)
        : last,
      quantityLabelIndex
    );
    const quantityLines = lines.slice(lastValueLabelIndex + 1);
    const invalidUnits = format.invalidQuantityUnits || [];
    const quantityCandidates = quantityLines
      .map(line => ({
        line,
        text:stockOcrNormalizeTextStock(line.text)
      }))
      .filter(item =>
        /^\d+(?:,\d{3})*(?:\.\d+)?(?:口)?$/.test(item.text) ||
        invalidUnits.some(unit => item.text.endsWith(unit))
      );

    if (quantityCandidates.length === 1) {
      const candidate = quantityCandidates[0];
      const quantityMatch = candidate.text.match(
        /^(\d+(?:,\d{3})*(?:\.\d+)?)(?:口)?$/
      );
      if (quantityMatch) {
        quantity = stockOcrFieldStock(
          Number(quantityMatch[1].replace(/,/g,"")),
          "recognized",
          stockOcrMaskStock(candidate.text),
          "label"
        );
      } else {
        quantity = stockOcrFieldStock(
          null,"unreadable",
          stockOcrMaskStock(candidate.text),
          "label"
        );
        reasons.push("保有数量の表示を確認してください。");
      }
    } else if (quantityCandidates.length > 1) {
      quantity = stockOcrFieldStock(
        null,"multiple",
        quantityCandidates.map(item => stockOcrMaskStock(item.text)).join(" / "),
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
