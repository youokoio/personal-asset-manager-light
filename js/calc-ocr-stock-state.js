"use strict";

/* ---------- S11b追補C：株式OCRの状態遷移 ---------- */

function stockOcrGetCandidateOptionsStateStock(card,field) {
  if (!card || card.duplicate || card.batchDuplicate) return [];

  const candidates = card[field + "Candidates"];
  if (Array.isArray(candidates)) {
    return candidates
      .filter(candidate =>
        typeof candidate === "string" ||
        typeof candidate === "number" ||
        candidate &&
        candidate.value !== null &&
        candidate.value !== undefined
      )
      .map(candidate => {
        const value = candidate &&
          typeof candidate === "object"
            ? candidate.value
            : candidate;
        return {
          value,
          label:candidate &&
            typeof candidate === "object" &&
            typeof candidate.label === "string"
              ? candidate.label
              : String(value)
        };
      });
  }

  if (field === "amountPair" &&
      Array.isArray(card.candidatePairs) &&
      Array.isArray(card.amountCandidates)) {
    return card.candidatePairs.map(pair => {
      const valueTokens = card.amountCandidates.filter(token =>
        pair.valueLineNumber !== undefined
          ? token.lineNumber === pair.valueLineNumber
          : token.original === pair.valueOriginal &&
            typeof token.value === "number" &&
            Number.isFinite(token.value)
      );
      const pnlTokens = card.amountCandidates.filter(token =>
        pair.pnlLineNumber !== undefined
          ? token.lineNumber === pair.pnlLineNumber
          : token.original === pair.pnlOriginal &&
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
          " ／ 取得額 " + formatYen(costBasis) +
          (typeof pair.difference === "number"
            ? " ／ 率の差 " + pair.difference.toFixed(2) + "ポイント"
            : "")
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
  const selections = card.candidateSelections || {};
  const candidateReasons = new Set([
    "金額候補を読み取れないため、確認してください。",
    "金額の符号を判別できないため、評価額と評価損益を確認してください。",
    "評価額と評価損益の組み合わせが複数あります。候補を確認してください。",
    "評価損益率がないため、検算できません。金額を確認してください。",
    "評価額と評価損益の組み合わせを検算で確定できません。候補を確認してください。",
    "評価損益を確認してください。",
    "評価額・取得額・評価損益・率の整合が取れません。"
  ]);
  const issues = (Array.isArray(card.reasons) ? card.reasons : [])
    .filter(reason => {
      if (selections.name && reason === "商品名を確定できません。") {
        return false;
      }
      if (selections.wrapper && reason === "wrapperを確定できません。") {
        return false;
      }
      if (selections.kind && reason === "種別を確定できません。") {
        return false;
      }
      if (selections.value && reason === "評価額を確定できません。") {
        return false;
      }
      if (selections.pnl && reason === "評価損益を確認してください。") {
        return false;
      }
      if (selections.amountPair && candidateReasons.has(reason)) {
        return false;
      }
      return true;
    });

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
    fields:{...(card.fields || {})},
    candidateSelections:{...card.candidateSelections}
  };

  if (field === "amountPair") {
    next.value = original.value;
    next.pnl = original.pnl;
    next.costBasis = original.costBasis;
    next.costBasisSource = original.costBasisSource;
    for (const key of ["value","pnl","costBasis"]) {
      if (Object.prototype.hasOwnProperty.call(original.fields,key)) {
        next.fields[key] = original.fields[key];
      } else {
        delete next.fields[key];
      }
    }
  } else {
    next[field] = original[field];
    if (Object.prototype.hasOwnProperty.call(original.fields,field)) {
      next.fields[field] = original.fields[field];
    } else {
      delete next.fields[field];
    }
  }

  delete next.candidateSelections[field];
  if (Object.keys(next.candidateSelections).length === 0) {
    delete next.candidateSelections;
    delete next.candidateOriginals;
  }

  const result = stockOcrGetCandidateIssuesStateStock(next);
  next.integrity = result.integrity;
  next.reasons = result.issues;
  next.status = result.issues.length === 0
    ? "recognized"
    : "needs-confirmation";
  next.manualConfirmed = next.status === "recognized";

  return next;
}

function stockOcrResetCandidateStateStock(card) {
  if (!card) return null;

  const original = card.candidateOriginals;
  if (!original) return {...card};

  const next = {
    ...card,
    name:original.name,
    wrapper:original.wrapper,
    value:original.value,
    pnl:original.pnl,
    costBasis:original.costBasis,
    costBasisSource:original.costBasisSource,
    fields:{...original.fields},
    reasons:original.reasons.slice()
  };
  delete next.candidateSelections;
  delete next.candidateOriginals;

  const result = stockOcrGetCandidateIssuesStateStock(next);
  next.integrity = result.integrity;
  next.reasons = result.issues;
  next.status = result.issues.length === 0
    ? "recognized"
    : "needs-confirmation";
  next.manualConfirmed = next.status === "recognized";

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
      (card.duplicate === true || card.selected !== false) &&
      card.excludedByUser !== true
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
    reason = "未確定の商品カードまたは同一OCR内の重複カードがあります。確定後に反映します。";
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

  const hasManualValue = typeof options.value === "number" &&
    Number.isFinite(options.value);
  const value = hasManualValue
    ? options.value
    : state.canAutoFill
      ? state.autoValue
      : null;

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      eligible:false,
      snapshot:null,
      reason:state.reason ||
        "口座全体の評価額を入力してください。"
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
