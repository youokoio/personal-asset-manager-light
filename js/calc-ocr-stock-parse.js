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
  const name = stockOcrExtractRakutenNameStock(lines,format,card.heading);
  const wrapper = stockOcrFindRakutenWrapperStock(lines,format);
  const kindValue = format.kindByHeading && format.kindByHeading[card.heading];
  const kind = stockOcrFieldStock(kindValue || null,
    kindValue ? "recognized" : "unreadable",card.heading,"heading");
  const tokens = stockOcrExtractRakutenAmountTokensStock(lines,format);
  const rate = stockOcrExtractRateStock(lines);
  const tolerance = 0.05;
  const pairResult = stockOcrFindRakutenAmountPairsStock(tokens,rate,tolerance);
  let value = stockOcrFieldStock(null,"missing");
  let pnl = stockOcrFieldStock(null,"missing");
  let costBasis = stockOcrFieldStock(null,"missing");
  let rateCheck = {status:pairResult.status,tolerance,expectedRate:null,actualRate:rate.value,difference:null};

  if (pairResult.status === "unique") {
    const pair = pairResult.pairs[0];
    value = stockOcrFieldStock(pair.valueToken.value,"recognized",pair.valueToken.original,"rate-validation");
    pnl = stockOcrFieldStock(pair.pnlValue,"recognized",pair.pnlToken.original,
      pair.signInferred ? "rate-sign-inference" : "rate-validation");
    costBasis = stockOcrFieldStock(pair.costBasis,"calculated",null,"value-minus-pnl");
    rateCheck = {status:pair.signInferred ? "matched-sign-inferred" : "matched",
      tolerance,expectedRate:pair.expectedRate,actualRate:pair.actualRate,difference:pair.difference};
  } else if (pairResult.status === "rate-unavailable") {
    if (tokens.some(token => token.status !== "recognized")) {
      value = stockOcrFieldStock(null,"unreadable");
      pnl = stockOcrFieldStock(null,"unreadable");
      reasons.push("金額候補を読み取れないため、確認してください。");
    } else {
      const unsigned = tokens.filter(token => !token.signed);
      const signed = tokens.filter(token => token.signed);
      if (tokens.some(token => token.signAmbiguous === true)) {
        value = stockOcrFieldStock(null,"multiple");
        pnl = stockOcrFieldStock(null,"multiple");
        reasons.push("金額の符号を判別できないため、評価額と評価損益を確認してください。");
      } else {
        if (unsigned.length === 1) value = stockOcrFieldStock(unsigned[0].value,"recognized",unsigned[0].original,"sign-heuristic");
        else if (unsigned.length > 1) value = stockOcrFieldStock(null,"multiple");
        if (signed.length === 1) pnl = stockOcrFieldStock(signed[0].value,"recognized",signed[0].original,"sign-heuristic");
        else if (signed.length > 1) pnl = stockOcrFieldStock(null,"multiple");
        if (typeof value.value === "number" && typeof pnl.value === "number") {
          costBasis = stockOcrFieldStock(value.value - pnl.value,"calculated",null,"value-minus-pnl");
        }
      }
    }
    reasons.push("評価損益率がないため、検算できません。金額を確認してください。");
  } else {
    value = stockOcrFieldStock(null,"multiple");
    pnl = stockOcrFieldStock(null,"multiple");
    reasons.push(pairResult.status === "ambiguous"
      ? "評価額と評価損益の組み合わせが複数あります。候補を確認してください。"
      : pairResult.status === "multiple-rates"
        ? "評価損益率が複数あります。確認してください。"
        : pairResult.status === "unreadable-candidate"
          ? "金額候補を読み取れないため、自動で割り当てません。確認してください。"
          : "評価額と評価損益の組み合わせを検算で確定できません。候補を確認してください。");
  }

  const quantity = stockOcrFieldStock(null,"missing");
  const emptyRate = stockOcrFieldStock(null,"missing");
  const result = stockOcrBuildCardResultStock(
    card,format,name,wrapper,kind,value,pnl,costBasis,quantity,emptyRate,reasons
  );
  result.rate = rate.value;
  result.fields.rate = rate;
  result.rateCheck = rateCheck;
  result.amountCandidates = tokens.map(token => ({
    value:token.value,signed:token.signed,
    signAmbiguous:token.signAmbiguous === true,
    hasYen:token.hasYen,original:token.original,
    lineNumber:token.lineNumber
  }));
  result.candidatePairs = pairResult.pairs.map(pair => ({
    valueOriginal:pair.valueToken.original,pnlOriginal:pair.pnlToken.original,
    expectedRate:pair.expectedRate,difference:pair.difference,signInferred:pair.signInferred
  }));
  return result;
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

  const kindValue = format.kindByHeading && format.kindByHeading[card.heading];
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

  if (isPrincipalProtected && tokens.length === 3) {
    reasons.push("元本確保型の商品に評価損益が表示されています。内容を確認してください。");
  }

  const orderedAmountFields = (format.amountLabelOrder || [])
    .map(fieldName => {
      const field = format.fields && format.fields[fieldName];
      const labels = field && Array.isArray(field.labels)
        ? field.labels.map(stockOcrNormalizeTextStock)
        : [];
      const labelIndex = lines.findIndex(line =>
        labels.includes(stockOcrNormalizeTextStock(line.text))
      );
      return {fieldName,labelIndex};
    })
    .filter(item => item.labelIndex >= 0)
    .sort((a,b) => a.labelIndex - b.labelIndex);

  if (tokens.length === 3 && orderedAmountFields.length === 3) {
    const valuesByField = new Map();
    for (let index = 0; index < orderedAmountFields.length; index += 1) {
      valuesByField.set(
        orderedAmountFields[index].fieldName,
        tokens[index]
      );
    }

    const valueToken = valuesByField.get("value");
    const costBasisToken = valuesByField.get("costBasis");
    const pnlToken = valuesByField.get("pnl");

    if (valueToken && costBasisToken && pnlToken) {
      value = stockOcrFieldStock(
        valueToken.value,valueToken.status,valueToken.original,"labels-before-values"
      );
      costBasis = stockOcrFieldStock(
        costBasisToken.value,costBasisToken.status,costBasisToken.original,"labels-before-values"
      );
      pnl = stockOcrFieldStock(
        pnlToken.value,pnlToken.status,pnlToken.original,"labels-before-values"
      );
    } else {
      reasons.push("評価額・取得価額・評価損益の対応を確定できません。");
    }
  } else if (tokens.length === 2 && isPrincipalProtected &&
      format.principalProtectedTwoValuesEqualAllowed &&
      orderedAmountFields.length === 2 &&
      orderedAmountFields.some(item => item.fieldName === "value") &&
      orderedAmountFields.some(item => item.fieldName === "costBasis") &&
      tokens[0].value !== null &&
      tokens[0].value === tokens[1].value) {
    const valuesByField = new Map();
    for (let index = 0; index < orderedAmountFields.length; index += 1) {
      valuesByField.set(
        orderedAmountFields[index].fieldName,
        tokens[index]
      );
    }
    const valueToken = valuesByField.get("value");
    const costBasisToken = valuesByField.get("costBasis");
    value = stockOcrFieldStock(
      valueToken.value,"recognized",valueToken.original,"labels-before-values"
    );
    costBasis = stockOcrFieldStock(
      costBasisToken.value,"recognized",costBasisToken.original,"labels-before-values"
    );
    pnl = stockOcrFieldStock(null,"not-shown");
  } else {
    reasons.push("評価額・取得価額・評価損益の対応を確定できません。");
  }

  const kindValue = format.kindByHeading && format.kindByHeading[card.heading];
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


function stockOcrIsRakutenEndMarkerStock(value) {
  const text = stockOcrNormalizeTextStock(value).replace(/^•\s*/,"");
  return ["参考為替レート","留意事項","楽天証券について"].includes(text) ||
    /^Rakuten Securities(?:,|$)/.test(text);
}

function stockOcrExtractRakutenAmountTokensStock(lines,format) {
  const tokens = [];
  const negativeMarks = format.negativeMarks || [];
  const amountPattern = /[+＋\-−－]?\s*(?:(?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.\d+)?/g;
  const ratePattern = /[+＋\-−－]?\s*\d+(?:\.\d+)?\s*[%％]/g;
  for (const line of lines) {
    const text = stockOcrNormalizeTextStock(line.text);
    if (!text || stockOcrIsHeadingStock(text,format) ||
        stockOcrIsRakutenEndMarkerStock(text) ||
        /現在の評価額合計/.test(text) ||
        /(?:USD|EUR|GBP|AUD|CAD|CHF|CNY|HKD|SGD|ドル|\$|€|£)/i.test(text) ||
        /(?:^|[^\d])\d{4}[./-]\d{1,2}[./-]\d{1,2}(?:$|[^\d])/.test(text) ||
        /(?:^|[^\d])\d{1,2}[./-]\d{1,2}[./-]\d{4}(?:$|[^\d])/.test(text) ||
        /\d{4}年\d{1,2}月\d{1,2}日/.test(text)) continue;
    if (stockOcrIsCodeLineStock(text,format) &&
        !/^[+＋\-−－]?\s*(?:(?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.\d+)?(?:円)?$/.test(text)) continue;
    const withoutRates = text.replace(ratePattern," ");
    amountPattern.lastIndex = 0;
    let match;
    while ((match = amountPattern.exec(withoutRates)) !== null) {
      const source = match[0].trim();
      const before = withoutRates[match.index - 1] || "";
      const after = withoutRates[match.index + match[0].length] || "";
      if (/[A-Za-z0-9]/.test(before) || /[A-Za-z0-9]/.test(after)) continue;
      const parsed = normalizeOcrAmount(source,negativeMarks);
      const signPrefix = withoutRates.slice(0,match.index);
      const preceding = signPrefix.trimEnd().slice(-1);
      const signAmbiguous = /[?？±△▲▽▼]/.test(preceding);
      tokens.push({
        value:parsed && !parsed.error ? parsed.value : null,
        status:parsed && !parsed.error ? "recognized" : "unreadable",
        hasYen:/円/.test(text),
        signed:/^[+＋\-−－]/.test(source),
        signAmbiguous,
        lineNumber:line.lineNumber,
        original:stockOcrMaskStock(source)
      });
    }
  }
  return tokens;
}

function stockOcrFindRakutenAmountPairsStock(tokens,rate,tolerance) {
  if (tokens.some(token => token.status !== "recognized")) {
    return {status:"unreadable-candidate",pairs:[]};
  }
  const unsigned = tokens.filter(token => !token.signed);
  const signed = tokens.filter(token => token.signed);
  const pairs = [];
  if (!rate || rate.status !== "recognized" || typeof rate.value !== "number") {
    return {status:rate && rate.status === "multiple" ? "multiple-rates" : "rate-unavailable",pairs:[]};
  }
  const findPairs = candidates => {
    for (const valueToken of unsigned) {
      for (const candidate of candidates) {
        if (candidate.token === valueToken) continue;
        const costBasis = valueToken.value - candidate.pnl;
        if (!Number.isFinite(costBasis) || costBasis === 0) continue;
        const expectedRate = 100 * candidate.pnl / costBasis;
        const difference = Math.abs(rate.value - expectedRate);
        if (difference <= tolerance) {
          pairs.push({
            valueToken,
            pnlToken:candidate.token,
            pnlValue:candidate.pnl,
            costBasis,
            expectedRate,
            actualRate:rate.value,
            difference,
            signInferred:candidate.signInferred
          });
        }
      }
    }
  };
  findPairs(signed.map(token => ({token,pnl:token.value,signInferred:false})));
  const hasAmbiguousSign = tokens.some(token =>
    token.signAmbiguous === true
  );
  if (pairs.length === 0 && hasAmbiguousSign && unsigned.length > 1) {
    findPairs(unsigned.map(token => ({
      token,
      pnl:rate.value < 0 ? -Math.abs(token.value) : Math.abs(token.value),
      signInferred:true
    })));
  }
  return {
    status:pairs.length === 1 ? "unique" : pairs.length === 0 ? "no-match" : "ambiguous",
    pairs
  };
}

function stockOcrFindRakutenWrapperStock(lines,format) {
  return stockOcrFindWrapperStock(lines,format);
}

function parseStockOcrText(text,rule) {
  const format = stockOcrGetFormatStock(rule);
  if (!format) {
    return {success:false,status:"no-rules",cards:[],reasons:["株式OCRの解析ルールがありません。"]};
  }
  const lines = stockOcrNormalizeLinesStock(text);
  const normalized = lines.map(line => stockOcrNormalizeTextStock(line.text));
  const identify = format.identify || {};
  const allMatched = (identify.all || []).every(label =>
    normalized.includes(stockOcrNormalizeTextStock(label))
  );
  const noneMatched = (identify.none || []).some(label =>
    normalized.includes(stockOcrNormalizeTextStock(label))
  );
  if (!allMatched || noneMatched) {
    return {success:false,status:"format-mismatch",cards:[],reasons:["選択した口座のOCR形式と一致しません。"]};
  }
  let parseLines = lines;
  let safeUnrecognizedLines = [];
  if (rule.ruleId === "rakuten-securities") {
    const endIndex = lines.findIndex(line => stockOcrIsRakutenEndMarkerStock(line.text));
    if (endIndex >= 0) {
      parseLines = lines.slice(0,endIndex);
      safeUnrecognizedLines = lines.slice(endIndex).map(line => ({
        lineNumber:line.lineNumber,text:stockOcrMaskStock(line.text)
      }));
    }
  }
  const cards = stockOcrSplitCardsStock(parseLines,rule,format);
  if (cards.length === 0) {
    return {success:false,status:"no-cards",cards:[],reasons:["商品カードを切り出せませんでした。"],safeUnrecognizedLines};
  }
  let parsedCards;
  if (rule.ruleId === "rakuten-securities") parsedCards = cards.map(card => stockOcrParseRakutenCardStock(card,format));
  else if (rule.ruleId === "ideco") parsedCards = cards.map(card => stockOcrParseIdecoCardStock(card,format));
  else if (rule.ruleId === "corporate-dc") parsedCards = cards.map(card => stockOcrParseDcCardStock(card,format));
  else return {success:false,status:"unsupported-rule",cards:[],reasons:["未対応の口座ルールです。"],safeUnrecognizedLines};
  stockOcrMarkDuplicateCardsStock(parsedCards);
  return {
    success:true,
    status:parsedCards.some(card => card.status !== "recognized") ? "needs-confirmation" : "recognized",
    ruleId:rule.ruleId,ruleVersion:rule.ruleVersion || null,cards:parsedCards,reasons:[],
    safeUnrecognizedLines
  };
}
