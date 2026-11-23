"use strict";

/* ---------- 売却・利確確認の入力検査 ---------- */

function validateSaleCheckConfirmation(data,candidate,input) {
  const errors = [];
  const warnings = [];
  const values = input && typeof input === "object"
    ? input
    : {};
  const target = candidate && typeof candidate === "object"
    ? candidate
    : null;
  const manual = Boolean(target && target.manual === true);

  if (!data || !Array.isArray(data.accounts) || !target) {
    errors.push("確認対象が正しくありません。");
  }

  const account = data && Array.isArray(data.accounts) && target
    ? data.accounts.find(item => item.id === target.accountId)
    : null;

  if (!account || getCategory(account) !== "stock") {
    errors.push("株式分類の口座を指定してください。");
  }

  if (target && !["口座全体","商品別"].includes(target.level)) {
    errors.push("確認対象の単位が正しくありません。");
  }

  if (target && target.level === "口座全体" &&
      (target.productName !== null || target.wrapper !== null)) {
    errors.push("口座全体の記録では商品名とwrapperをnullにしてください。");
  }

  if (target && target.level === "商品別" &&
      (typeof target.productName !== "string" ||
       !target.productName.trim() ||
       !HOLDING_WRAPPERS.includes(target.wrapper))) {
    errors.push("商品名またはwrapperが正しくありません。");
  }

  if (!isValidSaleCheckDate(values.saleDate)) {
    errors.push("売却日を正しく入力してください。");
  }

  if (!isFiniteMetricValue(values.realizedPnl)) {
    errors.push("確定損益を数値で入力してください。");
  }

  if (!SALECHECK_SOURCES.includes(values.source)) {
    errors.push("情報源を選択してください。");
  }

  let proceeds = null;

  if (values.proceeds !== null &&
      values.proceeds !== undefined &&
      values.proceeds !== "") {
    if (!isFiniteMetricValue(values.proceeds) ||
        values.proceeds < 0) {
      errors.push("売却金額は0以上の数値で入力してください。");
    } else {
      proceeds = values.proceeds;
    }
  }

  if (values.memo !== undefined &&
      values.memo !== null &&
      typeof values.memo !== "string") {
    errors.push("メモの形式が正しくありません。");
  }

  if (target && !manual) {
    if (!isValidSaleCheckDate(target.fromDate) ||
        !isValidSaleCheckDate(target.toDate) ||
        target.fromDate > target.toDate) {
      errors.push("候補の対象期間が正しくありません。");
    } else if (isValidSaleCheckDate(values.saleDate) &&
        (values.saleDate < target.fromDate ||
         values.saleDate > target.toDate)) {
      warnings.push("売却日が候補の対象期間外です。");
    }
  }

  if (target && target.level === "口座全体" &&
      Array.isArray(data.saleChecks) &&
      isValidSaleCheckDate(
        manual ? values.saleDate : target.toDate
      )) {
    const targetDate = manual
      ? values.saleDate
      : target.toDate;

    const hasProductConfirmation = data.saleChecks.some(item =>
      item.accountId === target.accountId &&
      item.level === "商品別" &&
      item.status === "利確確認済み" &&
      item.toDate === targetDate
    );

    if (hasProductConfirmation) {
      warnings.push(
        "同じ口座・同じ対象日に商品別の利確確認済み記録があります。二重計上の可能性があります。"
      );
    }
  }

  const valid = errors.length === 0;
  const record = valid
    ? {
        accountId:target.accountId,
        level:target.level,
        productName:target.level === "口座全体"
          ? null
          : target.productName,
        wrapper:target.level === "口座全体"
          ? null
          : target.wrapper,
        toDate:manual ? values.saleDate : target.toDate,
        fromDate:manual ? null : target.fromDate,
        status:"利確確認済み",
        saleDate:values.saleDate,
        realizedPnl:values.realizedPnl,
        proceeds,
        source:values.source,
        manual,
        memo:typeof values.memo === "string"
          ? values.memo
          : ""
      }
    : null;

  return {
    valid,
    errors,
    warnings,
    record
  };
}

/* ---------- 確認済み確定損益（参考）の集計 ---------- */

function calculateSaleCheckReferenceTotals(saleChecks,accountId) {
  if (!Array.isArray(saleChecks) ||
      typeof accountId !== "string" ||
      !accountId) {
    throw new Error("確認済み損益の集計対象が正しくありません。");
  }

  const productRecords = [];
  const accountRecords = [];
  let productTotal = 0;
  let accountTotal = 0;

  for (const item of saleChecks) {
    if (item.accountId !== accountId ||
        item.status !== "利確確認済み" ||
        !isFiniteMetricValue(item.realizedPnl)) {
      continue;
    }

    if (item.level === "商品別") {
      productRecords.push(item);
      productTotal += item.realizedPnl;
    } else if (item.level === "口座全体") {
      accountRecords.push(item);
      accountTotal += item.realizedPnl;
    }
  }

  return {
    productTotal,
    productCount:productRecords.length,
    productRecords,
    accountTotal,
    accountCount:accountRecords.length,
    accountRecords
  };
}
