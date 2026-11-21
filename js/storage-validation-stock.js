"use strict";

/* ---------- 積立・売却確認データ検証 ---------- */

function isValidContributionMonthForStorage(value) {
  return typeof value === "string" &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
    Number(value.slice(0,4)) > 0;
}

function isNonNegativeStockAmount(value) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0;
}

function isValidStockTrackingTimestamp(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function collectStockTrackingValidationErrors(data) {
  const errors = [];

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return ["保存データの形式が正しくありません。"];
  }

  const accounts = Array.isArray(data.accounts)
    ? data.accounts.filter(account => account && typeof account === "object")
    : [];
  const accountById = new Map(accounts.map(account => [account.id,account]));

  const collectionNames = [
    "contributionPlans",
    "contributions",
    "saleChecks"
  ];

  for (const name of collectionNames) {
    if (!Array.isArray(data[name])) {
      errors.push(name + " のデータが正しくありません。");
    }
  }

  if (errors.length > 0) return errors;

  function checkAccount(item,label) {
    const account = accountById.get(item.accountId);
    if (!account || account.category !== "stock") {
      errors.push(label + " " + item.id +
        " の口座参照先が株式口座ではありません。");
    }
  }

  function checkProductWrapper(item,label) {
    if (item.productName === null) {
      if (item.wrapper !== null) {
        errors.push(label + " " + item.id +
          " は口座全体の記録なので wrapper は null が必要です。");
      }
      return;
    }

    if (typeof item.productName !== "string" ||
        !item.productName.trim() ||
        !HOLDING_WRAPPERS.includes(item.wrapper)) {
      errors.push(label + " " + item.id +
        " の商品名・wrapper が正しくありません。");
    }
  }

  function checkCommon(item,label) {
    if (!item ||
        typeof item.id !== "string" ||
        !item.id ||
        typeof item.accountId !== "string" ||
        typeof item.memo !== "string" ||
        !isValidStockTrackingTimestamp(item.createdAt) ||
        !isValidStockTrackingTimestamp(item.updatedAt)) {
      errors.push(label + " に必須項目の欠落または不正があります。");
      return false;
    }
    checkAccount(item,label);
    return true;
  }

  const planIds = new Set();
  for (const plan of data.contributionPlans) {
    if (!checkCommon(plan,"積立予定")) continue;

    if (planIds.has(plan.id)) {
      errors.push("積立予定IDが重複しています。");
    }
    planIds.add(plan.id);

    checkProductWrapper(plan,"積立予定");

    if (!isValidContributionMonthForStorage(plan.effectiveFrom)) {
      errors.push("積立予定 " + plan.id + " の適用開始月が正しくありません。");
    }

    if (!["積立中","停止"].includes(plan.status)) {
      errors.push("積立予定 " + plan.id + " の状態が正しくありません。");
    }

    if (plan.status === "積立中" &&
        !isNonNegativeStockAmount(plan.plannedCash)) {
      errors.push("積立予定 " + plan.id + " の予定現金分が正しくありません。");
    } else if (plan.plannedCash !== null &&
               plan.plannedCash !== undefined &&
               !isNonNegativeStockAmount(plan.plannedCash)) {
      errors.push("積立予定 " + plan.id + " の予定現金分が正しくありません。");
    }

    if (plan.plannedPoint !== null &&
        plan.plannedPoint !== undefined &&
        !isNonNegativeStockAmount(plan.plannedPoint)) {
      errors.push("積立予定 " + plan.id + " の予定ポイント分が正しくありません。");
    }
  }

  const contributionIds = new Set();
  const currentMonth = localDateString().slice(0,7);

  for (const contribution of data.contributions) {
    if (!checkCommon(contribution,"積立実績")) continue;

    if (contributionIds.has(contribution.id)) {
      errors.push("積立実績IDが重複しています。");
    }
    contributionIds.add(contribution.id);

    checkProductWrapper(contribution,"積立実績");

    if (!isValidContributionMonthForStorage(contribution.fromMonth) ||
        !isValidContributionMonthForStorage(contribution.toMonth)) {
      errors.push("積立実績 " + contribution.id + " の対象月が正しくありません。");
    } else {
      if (contribution.toMonth < contribution.fromMonth) {
        errors.push("積立実績 " + contribution.id +
          " の終了月が開始月より前です。");
      }
      if (contribution.toMonth > currentMonth) {
        errors.push("積立実績 " + contribution.id +
          " に未来の月は指定できません。");
      }
    }

    if (!["実行","未実行"].includes(contribution.status)) {
      errors.push("積立実績 " + contribution.id + " の状態が正しくありません。");
    }

    if (!isNonNegativeStockAmount(contribution.cashAmount) ||
        !isNonNegativeStockAmount(contribution.pointAmount)) {
      errors.push("積立実績 " + contribution.id +
        " の現金分・ポイント分は0以上の数値が必要です。");
    } else if (contribution.status === "実行" &&
               contribution.cashAmount + contribution.pointAmount <= 0) {
      errors.push("実行の積立実績は現金分とポイント分の合計が0より大きい必要があります。");
    } else if (contribution.status === "未実行" &&
               (contribution.fromMonth !== contribution.toMonth ||
                contribution.cashAmount !== 0 ||
                contribution.pointAmount !== 0)) {
      errors.push("未実行の積立実績は月次で、現金分・ポイント分が0である必要があります。");
    }

    if (!isValidStockTrackingTimestamp(contribution.recordedAt)) {
      errors.push("積立実績 " + contribution.id + " の記録日時が正しくありません。");
    }
  }

  const overlaps = findContributionMonthOverlaps(data.contributions);
  for (const overlap of overlaps) {
    const unitLabel = overlap.productName === null
      ? "口座全体"
      : overlap.productName + "（" + overlap.wrapper + "）";
    errors.push(
      "積立実績の月範囲が重複しています（口座 " +
      overlap.accountId + "、" + unitLabel + "、" +
      overlap.fromMonth + "〜" + overlap.toMonth + "）。"
    );
  }

  const saleCheckIds = new Set();
  const dismissReasons = [
    "資金移動",
    "商品の入れ替え",
    "入力の訂正",
    "売却ではない",
    "その他"
  ];
  const saleSources = [
    "取引履歴",
    "実現損益の画面",
    "その他の書類"
  ];

  for (const check of data.saleChecks) {
    if (!checkCommon(check,"売却確認")) continue;

    if (saleCheckIds.has(check.id)) {
      errors.push("売却確認IDが重複しています。");
    }
    saleCheckIds.add(check.id);

    if (!["口座全体","商品別"].includes(check.level)) {
      errors.push("売却確認 " + check.id + " の対象単位が正しくありません。");
    }

    if (check.level === "商品別" &&
        (typeof check.productName !== "string" ||
         !check.productName.trim() ||
         !HOLDING_WRAPPERS.includes(check.wrapper))) {
      errors.push("売却確認 " + check.id + " の商品名・wrapper が正しくありません。");
    }

    if (!isValidFxDateForStorage(check.toDate) ||
        (check.fromDate !== null &&
         !isValidFxDateForStorage(check.fromDate))) {
      errors.push("売却確認 " + check.id + " の対象日が正しくありません。");
    }

    if (typeof check.manual !== "boolean") {
      errors.push("売却確認 " + check.id + " の manual が正しくありません。");
    } else if (check.manual) {
      if (check.fromDate !== null ||
          check.status !== "利確確認済み" ||
          check.saleDate !== check.toDate) {
        errors.push("候補なしの売却確認は、fromDate が null で売却日と toDate が同じ必要があります。");
      }
    } else if (!isValidFxDateForStorage(check.fromDate) ||
               check.fromDate >= check.toDate) {
      errors.push("売却確認 " + check.id + " の比較元の日付が正しくありません。");
    }

    if (!["解除","利確確認済み"].includes(check.status)) {
      errors.push("売却確認 " + check.id + " の状態が正しくありません。");
    } else if (check.status === "解除") {
      if (!dismissReasons.includes(check.dismissReason)) {
        errors.push("解除の売却確認 " + check.id + " に解除理由が必要です。");
      }
    } else {
      if (!isValidFxDateForStorage(check.saleDate) ||
          typeof check.realizedPnl !== "number" ||
          !Number.isFinite(check.realizedPnl) ||
          !saleSources.includes(check.source)) {
        errors.push("利確確認済みの売却確認 " + check.id +
          " に売却日・確定損益・情報源が必要です。");
      }
    }

    if (check.proceeds !== null &&
        check.proceeds !== undefined &&
        !isNonNegativeStockAmount(check.proceeds)) {
      errors.push("売却確認 " + check.id + " の売却金額が正しくありません。");
    }
  }

  return errors;
}

function validateStockTrackingData(data) {
  const errors = collectStockTrackingValidationErrors(data);
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }
}
