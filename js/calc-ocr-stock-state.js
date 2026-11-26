"use strict";

/* ---------- S11b追補C：株式OCRの状態遷移 ---------- */

function stockOcrGetCandidateOptionsStateStock(card,field,rule = null) {
  if (!card || card.duplicate || card.batchDuplicate) return [];

  if (field === "name") {
    return Array.from(new Set(
      (Array.isArray(card.similarNames) ? card.similarNames : [])
        .filter(value =>
          typeof value === "string" && value.trim()
        )
    )).map(value => ({value,label:value}));
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
      const valueTokens = card.amountCandidates.filter(token =>
        token.original === pair.valueOriginal &&
        token.signed === false &&
        typeof token.value === "number" &&
        Number.isFinite(token.value)
      );
      const pnlTokens = card.amountCandidates.filter(token =>
        token.original === pair.pnlOriginal &&
        token.signed === (pair.signInferred !== true) &&
        typeof token.value === "number" &&
        Number.isFinite(token.value)
      );

      if (valueTokens.length !== 1 || pnlTokens.length !== 1 ||
          valueTokens[0] === pnlTokens[0]) continue;

      const value = valueTokens[0].value;
      const pnl = pair.signInferred
        ? pair.expectedRate < 0
          ? -Math.abs(pnlTokens[0].value)
          : Math.abs(pnlTokens[0].value)
        : pnlTokens[0].value;
      const costBasis = value - pnl;

      if (![value,pnl,costBasis].every(Number.isFinite)) continue;

      options.push({
        value:{value,pnl,costBasis},
        label:"評価額 " + formatYen(value) +
          " ／ 評価損益 " + formatSignedYen(pnl) +
          " ／ 取得額 " + formatYen(costBasis)
      });
    }

    return options.length >= 2 ? options : [];
  }

  return [];
}

function stockOcrCaptureCandidateOriginalsStateStock(card) {
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
    fields,
    reasons:Array.isArray(card.reasons)
      ? card.reasons.slice()
      : []
  };
}

function stockOcrGetCandidateIssuesStateStock(card,field) {
  const resolvedReasons = {
    name:["商品名を確定できません。"],
    wrapper:["wrapperを確定できません。"],
    amountPair:[
      "評価額と評価損益の組み合わせが複数あります。候補を確認してください。",
      "評価額と評価損益の組み合わせを検算で確定できません。候補を確認してください。",
      "評価額・取得額・評価損益・率の整合が取れません。",
      "評価額・取得額・評価損益・率の整合が取れません。内容を確認してください。",
      "評価損益を確認してください。",
      "取得額を算出できません。"
    ]
  };

  const issues = (card.reasons || []).filter(reason =>
    !(resolvedReasons[field] || []).includes(reason)
  );

  for (const [label,key] of [
    ["商品名","name"],
    ["wrapper","wrapper"],
    ["種別","kind"],
    ["評価額","value"]
  ]) {
    const item = card.fields && card.fields[key];
    if (!item || item.status !== "recognized") {
      issues.push(label + "を確定できません。");
    }
  }

  const pnlField = card.fields && card.fields.pnl;
  const costBasisField = card.fields && card.fields.costBasis;

  if (pnlField &&
      ["unreadable","multiple"].includes(pnlField.status)) {
    issues.push("評価損益を確認してください。");
  }
  if (costBasisField &&
      costBasisField.status === "missing" &&
      pnlField && pnlField.status === "recognized") {
    issues.push("取得額を算出できません。");
  }

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
    issues.push("評価額・取得額・評価損益・率の整合が取れません。");
  }

  return {
    issues:Array.from(new Set(issues)),
    integrity
  };
}

function stockOcrSelectCandidateStateStock(
  card,field,candidateIndex,rule = null
) {
  const options = stockOcrGetCandidateOptionsStateStock(
    card,field,rule
  );

  if (!Number.isInteger(candidateIndex) ||
      candidateIndex < 0 ||
      candidateIndex >= options.length) return null;

  const option = options[candidateIndex];
  const next = {
    ...card,
    fields:{...(card.fields || {})},
    candidateSelections:{...(card.candidateSelections || {})},
    candidateOriginals:card.candidateOriginals ||
      stockOcrCaptureCandidateOriginalsStateStock(card)
  };

  if (field === "amountPair") {
    next.value = option.value.value;
    next.pnl = option.value.pnl;
    next.costBasis = option.value.costBasis;
    next.costBasisSource = "value-minus-pnl";

    next.fields.value = {
      ...(next.fields.value || {}),
      value:next.value,
      status:"recognized",
      source:"candidate"
    };
    next.fields.pnl = {
      ...(next.fields.pnl || {}),
      value:next.pnl,
      status:"recognized",
      source:"candidate"
    };
    next.fields.costBasis = {
      ...(next.fields.costBasis || {}),
      value:next.costBasis,
      status:"calculated",
      source:"value-minus-pnl"
    };
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

  const result = stockOcrGetCandidateIssuesStateStock(next,field);
  next.integrity = result.integrity;
  next.reasons = result.issues;
  next.status = result.issues.length === 0
    ? "recognized"
    : "needs-confirmation";
  next.manualConfirmed = next.status === "recognized";

  return next;
}

function stockOcrClearCandidateStateStock(card,field) {
  if (!card || !card.candidateSelections ||
      !Object.prototype.hasOwnProperty.call(
        card.candidateSelections,field
      )) return null;

  const original = card.candidateOriginals ||
    stockOcrCaptureCandidateOriginalsStateStock(card);
  const next = {
    ...card,
    name:original.name,
    wrapper:original.wrapper,
    value:original.value,
    pnl:original.pnl,
    costBasis:original.costBasis,
    costBasisSource:original.costBasisSource,
    fields:{...original.fields},
    candidateSelections:{...card.candidateSelections},
    reasons:original.reasons.slice()
  };

  delete next.candidateSelections[field];
  next.status = "needs-confirmation";
  next.manualConfirmed = false;
  next.reasons.push("候補選択を解除しました。内容を確認してください。");

  return next;
}

/* ---------- 口座全体snapshot ---------- */

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

  const allConfirmed = cardList.length > 0 &&
    cardList.every(card =>
      card &&
      card.status === "recognized" &&
      card.batchDuplicate !== true
    );
  const allSelected = cardList.length > 0 &&
    cardList.every(card =>
      card &&
      card.selected !== false &&
      card.duplicate !== true
    );

  const canAutoFill = Boolean(
    account && validDate && allConfirmed && allSelected
  );

  const autoValue = canAutoFill
    ? stockOcrSumFieldStock(cardList,"value")
    : null;

  const existingSnapshot = account && validDate
    ? getAccountSnapshots(data,accountId).find(snapshot =>
        snapshot.asOfDate === targetDate
      ) || null
    : null;

  let reason = "";
  if (!account) {
    reason = "対象の株式口座を確認してください。";
  } else if (!validDate) {
    reason = "対象日を入力してください。";
  } else if (!allConfirmed) {
    reason = "未確定の商品カードがあります。確定後に反映します。";
  } else if (!allSelected) {
    reason = "保存対象から外した商品カードがあります。";
  } else if (autoValue === null) {
    reason = "商品別評価額の合計を計算できません。";
  }

  return {
    account,
    validDate,
    allConfirmed,
    allSelected,
    canAutoFill:canAutoFill && autoValue !== null,
    autoValue,
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

  if (!state.account || !state.validDate) {
    return {
      eligible:false,
      snapshot:null,
      reason:state.reason
    };
  }

  const value = options.value === undefined ||
    options.value === null
      ? state.canAutoFill
        ? state.autoValue
        : null
      : options.value;

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      eligible:false,
      snapshot:null,
      reason:"口座全体の評価額を入力してください。"
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

  const effectivePrincipal = state.canAutoFill
    ? stockOcrSumFieldStock(cards,"costBasis")
    : null;
  const pnl = state.canAutoFill
    ? stockOcrSumFieldStock(cards,"pnl")
    : null;

  return {
    eligible:true,
    reason:"",
    snapshot:{
      id:options.id,
      accountId,
      asOfDate:targetDate,
      recordedAt:options.recordedAt,
      value,
      cash:null,
      pnl,
      principal:null,
      cumulativeInvested:null,
      effectivePrincipal,
      realizedPnlTotal:null,
      realizedPnlDaily:null,
      swapTotal:null,
      requiredMargin:null,
      memo:""
    }
  };
}
