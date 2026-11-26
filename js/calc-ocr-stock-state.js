"use strict";

/* ---------- S11b追補C：株式OCRの画面状態・口座snapshot ---------- */

function stockOcrGetCandidateOptionsStock(card,field,rule = null) {
  if (!card || card.duplicate || card.batchDuplicate) return [];

  if (field === "name") {
    const names = Array.isArray(card.similarNames)
      ? card.similarNames
      : [];
    return Array.from(new Set(names.filter(name =>
      typeof name === "string" && name.trim()
    ))).map(name => ({
      value:name,
      label:name
    }));
  }

  if (field === "wrapper") {
    const wrapperField = card.fields && card.fields.wrapper;
    const format = rule && Array.isArray(rule.formats)
      ? rule.formats[0]
      : null;
    const aliases = format && format.wrapperAliases
      ? format.wrapperAliases
      : null;

    if (!wrapperField || wrapperField.status !== "multiple" ||
        !aliases || !Array.isArray(card.safeLines)) return [];

    const values = [];
    for (const line of card.safeLines) {
      const text = stockOcrNormalizeTextStock(line.text);
      if (Object.prototype.hasOwnProperty.call(aliases,text)) {
        values.push(aliases[text]);
      }
    }

    return Array.from(new Set(values)).map(value => ({
      value,
      label:value
    }));
  }

  if (field === "amountPair") {
    if (!Array.isArray(card.candidatePairs) ||
        card.candidatePairs.length < 2 ||
        !Array.isArray(card.amountCandidates)) return [];

    const options = [];

    for (const pair of card.candidatePairs) {
      const valueIndex = card.amountCandidates.findIndex(token =>
        token.original === pair.valueOriginal &&
        token.signed === false
      );
      if (valueIndex < 0) continue;

      const pnlIndex = card.amountCandidates.findIndex((token,index) =>
        index !== valueIndex &&
        token.original === pair.pnlOriginal &&
        (pair.signInferred
          ? token.signed === false
          : token.signed === true)
      );
      if (pnlIndex < 0) continue;

      const value = card.amountCandidates[valueIndex].value;
      const pnlToken = card.amountCandidates[pnlIndex];
      const pnl = pair.signInferred
        ? pair.expectedRate < 0
          ? -Math.abs(pnlToken.value)
          : Math.abs(pnlToken.value)
        : pnlToken.value;
      const costBasis = value - pnl;

      if (![value,pnl,costBasis].every(Number.isFinite)) continue;

      const candidate = {value,pnl,costBasis};
      options.push({
        value:candidate,
        label:"評価額 " + formatYen(value) +
          " ／ 評価損益 " + formatSignedYen(pnl) +
          " ／ 取得額 " + formatYen(costBasis)
      });
    }

    return options;
  }

  return [];
}

function stockOcrCaptureCandidateOriginalsStock(card) {
  const fields = {};
  for (const [key,value] of Object.entries(card.fields || {})) {
    fields[key] = value && typeof value === "object"
      ? {...value}
      : value;
  }

  return {
    name:card.name,
    wrapper:card.wrapper,
    value:card.value,
    pnl:card.pnl,
    costBasis:card.costBasis,
    costBasisSource:card.costBasisSource,
    fields
  };
}

function stockOcrGetCandidateSelectionIssuesStock(card) {
  const issues = [];

  if (card.batchDuplicate) {
    issues.push("同じ商品名・wrapperのカードが複数あります。");
  }
  if (typeof card.name !== "string" || !card.name.trim()) {
    issues.push("商品名を確定してください。");
  }
  if (!HOLDING_WRAPPERS.includes(card.wrapper)) {
    issues.push("wrapperを確定してください。");
  }
  if (!HOLDING_KINDS.includes(card.kind)) {
    issues.push("商品種別を確定してください。");
  }
  if (typeof card.value !== "number" ||
      !Number.isFinite(card.value)) {
    issues.push("評価額を数値で確定してください。");
  }

  if (typeof card.value === "number" &&
      typeof card.costBasis === "number" &&
      typeof card.pnl === "number") {
    const integrity = stockOcrCheckIntegrityStock(
      card.value,
      card.pnl,
      card.costBasis,
      card.rate === null || card.rate === undefined
        ? null
        : {value:card.rate}
    );

    if (integrity.status === "mismatch" ||
        integrity.status === "rate-mismatch") {
      issues.push("評価額・取得額・評価損益・率の整合を確認してください。");
    }
  }

  return issues;
}

function stockOcrApplyCandidateStatusStock(card) {
  const issues = stockOcrGetCandidateSelectionIssuesStock(card);
  return {
    ...card,
    status:issues.length === 0 ? "recognized" : "needs-confirmation",
    manualConfirmed:issues.length === 0,
    reasons:issues
  };
}

function stockOcrSelectCandidateStateStock(
  card,field,candidateIndex,rule = null
) {
  const options = stockOcrGetCandidateOptionsStock(card,field,rule);
  if (!Number.isInteger(candidateIndex) ||
      candidateIndex < 0 ||
      candidateIndex >= options.length) return null;

  const option = options[candidateIndex];
  const next = {
    ...card,
    fields:{...(card.fields || {})},
    candidateSelections:{...(card.candidateSelections || {})},
    candidateOriginals:card.candidateOriginals ||
      stockOcrCaptureCandidateOriginalsStock(card)
  };

  if (field === "amountPair") {
    next.value = option.value.value;
    next.pnl = option.value.pnl;
    next.costBasis = option.value.costBasis;
    next.costBasisSource = "value-minus-pnl";

    for (const amountField of ["value","pnl","costBasis"]) {
      next.fields[amountField] = {
        ...(next.fields[amountField] || {}),
        value:next[amountField],
        status:amountField === "costBasis"
          ? "calculated"
          : "recognized",
        source:amountField === "costBasis"
          ? "value-minus-pnl"
          : "candidate"
      };
    }
  } else {
    next[field] = option.value;
    next.fields[field] = {
      ...(next.fields[field] || {}),
      value:option.value,
      status:"recognized",
      source:"candidate"
    };
  }

  next.candidateSelections[field] = {
    value:option.value,
    label:option.label
  };

  return stockOcrApplyCandidateStatusStock(next);
}

function stockOcrClearCandidateStateStock(card,field) {
  if (!card || !card.candidateSelections ||
      !Object.prototype.hasOwnProperty.call(
        card.candidateSelections,field
      )) return null;

  const originals = card.candidateOriginals ||
    stockOcrCaptureCandidateOriginalsStock(card);
  const next = {
    ...card,
    fields:{...(card.fields || {})},
    candidateSelections:{...card.candidateSelections}
  };

  if (field === "amountPair") {
    for (const amountField of ["value","pnl","costBasis"]) {
      next[amountField] = originals[amountField];
      next.fields[amountField] = originals.fields[amountField]
        ? {...originals.fields[amountField]}
        : undefined;
      if (!next.fields[amountField]) {
        delete next.fields[amountField];
      }
    }
    next.costBasisSource = originals.costBasisSource;
  } else {
    next[field] = originals[field];
    next.fields[field] = originals.fields[field]
      ? {...originals.fields[field]}
      : undefined;
    if (!next.fields[field]) delete next.fields[field];
  }

  delete next.candidateSelections[field];

  const issues = stockOcrGetCandidateSelectionIssuesStock(next);
  issues.push("候補選択を解除しました。内容を確認してください。");

  return {
    ...next,
    status:"needs-confirmation",
    manualConfirmed:false,
    reasons:issues
  };
}

function stockOcrBuildAccountSnapshotStateStock(
  data,accountId,targetDate,cards
) {
  const account = data && Array.isArray(data.accounts)
    ? data.accounts.find(item =>
        item.id === accountId && item.category === "stock"
      )
    : null;
  const validDate = isValidFxDateForStorage(targetDate);
  const cardList = Array.isArray(cards) ? cards : [];
  const unresolvedCount = cardList.filter(card =>
    !card ||
    card.status !== "recognized" ||
    card.batchDuplicate === true
  ).length;
  const uncheckedCount = cardList.filter(card =>
    card && card.selected === false && card.duplicate !== true
  ).length;

  let reason = "";
  if (!account) {
    reason = "対象の株式口座を確認してください。";
  } else if (!validDate) {
    reason = "対象日を入力してください。";
  } else if (cardList.length === 0) {
    reason = "商品カードがありません。";
  } else if (unresolvedCount > 0) {
    reason = "未確定の商品カードがあります。";
  } else if (uncheckedCount > 0) {
    reason = "保存対象から外した商品カードがあります。";
  }

  const canSaveManual = reason === "";
  const autoValue = canSaveManual
    ? stockOcrSumFieldStock(cardList,"value")
    : null;
  const canAutoFill = canSaveManual &&
    typeof autoValue === "number" &&
    Number.isFinite(autoValue);

  const existingSnapshot = account && validDate
    ? getAccountSnapshots(data,accountId).find(snapshot =>
        snapshot.asOfDate === targetDate
      ) || null
    : null;

  if (canSaveManual && !canAutoFill) {
    reason = "商品別評価額の合計を計算できません。";
  }

  return {
    account,
    validDate,
    cardCount:cardList.length,
    unresolvedCount,
    uncheckedCount,
    canAutoFill,
    canSaveManual,
    canSaveSnapshot:canSaveManual,
    autoValue:canAutoFill ? autoValue : null,
    existingSnapshot,
    reason
  };
}

function stockOcrBuildAccountSnapshotStock(
  data,accountId,targetDate,cards,options = {}
) {
  const state = stockOcrBuildAccountSnapshotStateStock(
    data,accountId,targetDate,cards
  );

  if (!state.canSaveSnapshot) {
    return {
      eligible:false,
      snapshot:null,
      reason:state.reason
    };
  }

  const value = options.value;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      eligible:false,
      snapshot:null,
      reason:"口座全体の評価額を確認してください。"
    };
  }

  if (typeof options.id !== "string" || !options.id ||
      typeof options.recordedAt !== "string" ||
      !options.recordedAt) {
    return {
      eligible:false,
      snapshot:null,
      reason:"snapshotのIDまたは登録日時がありません。"
    };
  }

  const effectivePrincipal = stockOcrSumFieldStock(
    cards,"costBasis"
  );
  const pnl = stockOcrSumFieldStock(cards,"pnl");

  return {
    eligible:true,
    reason:"",
    snapshot:{
      id:options.id,
      accountId,
      asOfDate:targetDate,
      recordedAt:options.recordedAt,
      value,
      cumulativeInvested:null,
      effectivePrincipal,
      pnl,
      realizedPnlTotal:null,
      realizedPnlDaily:null,
      cash:null,
      swapTotal:null,
      requiredMargin:null,
      memo:"",
      createdAt:options.recordedAt,
      updatedAt:options.recordedAt
    }
  };
}
