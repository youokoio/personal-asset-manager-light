"use strict";

/* ---------- S11b追補C：株式OCRの状態遷移 ---------- */

function stockOcrGetCandidateOptionsStateStock(card,field) {
  if (!card || card.duplicate || card.batchDuplicate) return [];

  const candidates = card[field + "Candidates"];
  if (Array.isArray(candidates)) {
    return candidates
      .filter(candidate =>
        candidate &&
        candidate.value !== null &&
        candidate.value !== undefined
      )
      .map(candidate => ({
        value:candidate.value,
        label:typeof candidate.label === "string"
          ? candidate.label
          : String(candidate.value)
      }));
  }

  if (field === "amountPair" &&
      Array.isArray(card.candidatePairs) &&
      Array.isArray(card.amountCandidates)) {
    return card.candidatePairs.map(pair => {
      const valueTokens = card.amountCandidates.filter(token =>
        token.original === pair.valueOriginal &&
        typeof token.value === "number" &&
        Number.isFinite(token.value)
      );
      const pnlTokens = card.amountCandidates.filter(token =>
        token.original === pair.pnlOriginal &&
        typeof token.value === "number" &&
        Number.isFinite(token.value)
      );

      if (valueTokens.length !== 1 || pnlTokens.length !== 1) {
        return null;
      }

      const value = valueTokens[0].value;
      const pnl = pair.signInferred
        ? pair.expectedRate < 0
          ? -Math.abs(pnlTokens[0].value)
          : Math.abs(pnlTokens[0].value)
        : pnlTokens[0].value;
      const costBasis = value - pnl;

      if (![value,pnl,costBasis].every(Number.isFinite)) {
        return null;
      }

      return {
        value:{value,pnl,costBasis},
        label:"評価額 " + formatYen(value) +
          " ／ 評価損益 " + formatSignedYen(pnl) +
          " ／ 取得額 " + formatYen(costBasis)
      };
    }).filter(Boolean);
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

function stockOcrGetCandidateIssuesStateStock(card) {
  const issues = Array.isArray(card.reasons)
    ? card.reasons.slice()
    : [];

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
      pnlField &&
      pnlField.status === "recognized") {
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
  card,field,candidateIndex
) {
  const options = stockOcrGetCandidateOptionsStateStock(
    card,field
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

  const result = stockOcrGetCandidateIssuesStateStock(next);
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

  const result = stockOcrGetCandidateIssuesStateStock(next);
  next.integrity = result.integrity;
  next.reasons = result.issues;
  next.status = "needs-confirmation";
  next.manualConfirmed = false;

  return next;
}

function stockOcrResetCandidateStateStock(card) {
  if (!card) return null;

  const next = {...card};
  delete next.candidateSelections;
  delete next.candidateOriginals;

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

  if (!state.allConfirmed || !state.allSelected) {
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
