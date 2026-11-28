"use strict";

function isNullableNumber(value) {
  return value === null || value === undefined ||
    (typeof value === "number" && Number.isFinite(value));
}

function isValidFxPairForStorage(value) {
  return typeof value === "string" &&
    /^[A-Z]{3}\/JPY$/.test(value);
}

function isValidFxDateForStorage(value) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(value + "T00:00:00");

  return Number.isFinite(date.getTime()) &&
    date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2,"0") + "-" +
    String(date.getDate()).padStart(2,"0") === value;
}

function isValidFxDateTimeForStorage(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  const normalized = value.replace(" ","T");

  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/.test(normalized)) {
    return false;
  }

  const datePart = normalized.slice(0,10);

  if (!isValidFxDateForStorage(datePart)) {
    return false;
  }

  if (normalized.length === 10) {
    return true;
  }

  const timePart = normalized.slice(11).split(":").map(Number);

  return timePart.length >= 2 &&
    timePart.length <= 3 &&
    Number.isInteger(timePart[0]) &&
    timePart[0] >= 0 &&
    timePart[0] <= 23 &&
    Number.isInteger(timePart[1]) &&
    timePart[1] >= 0 &&
    timePart[1] <= 59 &&
    (timePart.length === 2 ||
      (Number.isInteger(timePart[2]) &&
       timePart[2] >= 0 &&
       timePart[2] <= 59));
}

function validateData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("保存データの形式が正しくありません。");
  }

  if (data.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("対応していないデータ形式です。");
  }

  const collectionNames = [
    "accounts",
    "snapshots",
    "holdings",
    "fxPositions",
    "fxRates",
    "fxSwapLedger",
    "loans",
    "loanSnapshots",
    "contributionPlans",
    "contributions",
    "saleChecks",
    "cashflowRules",
    "cashflowRecords"
  ];

  for (const name of collectionNames) {
    if (!Array.isArray(data[name])) {
      throw new Error(`${name} のデータが正しくありません。`);
    }
  }

  if (!data.settings || typeof data.settings !== "object" ||
      Array.isArray(data.settings)) {
    throw new Error("settings のデータが正しくありません。");
  }

  const accountTypes = Object.keys(TYPE_LABELS);
  const categories = Object.keys(CATEGORY_LABELS);

  for (const account of data.accounts) {
    if (!account ||
        typeof account.id !== "string" ||
        typeof account.name !== "string" ||
        !accountTypes.includes(account.type) ||
        !categories.includes(account.category) ||
        !Number.isFinite(account.sortOrder)) {
      throw new Error("口座データに不正な項目があります。");
    }

    if (!isNullableNumber(account.lossCutRatio) ||
        !isNullableNumber(account.marginRatePct)) {
      throw new Error("FX口座設定の数値が正しくありません。");
    }

    if (!account.fieldLabels ||
        typeof account.fieldLabels !== "object" ||
        Array.isArray(account.fieldLabels)) {
      throw new Error("口座の fieldLabels が正しくありません。");
    }

    for (const field of [
      "value","effectivePrincipal","pnl","swapTotal"
    ]) {
      if (account.fieldLabels[field] !== null &&
          typeof account.fieldLabels[field] !== "string") {
        throw new Error("口座の fieldLabels." + field + " が正しくありません。");
      }
    }

    if (![null,"swap","principal"].includes(account.autoCalc)) {
      throw new Error("口座の autoCalc が正しくありません。");
    }

    const hasRealizedBaseAmount =
      account.realizedBaseAmount !== null &&
      account.realizedBaseAmount !== undefined;
    const hasRealizedBaseDate =
      account.realizedBaseDate !== null &&
      account.realizedBaseDate !== undefined;

    if (account.type === "fx") {
      if (!isNullableNumber(account.realizedBaseAmount) ||
          (hasRealizedBaseDate &&
           !isValidFxDateForStorage(account.realizedBaseDate)) ||
          hasRealizedBaseAmount !== hasRealizedBaseDate) {
        throw new Error("FX口座の累積確定損益の基準額・基準日が正しくありません。");
      }
    } else if (hasRealizedBaseAmount || hasRealizedBaseDate) {
      throw new Error("累積確定損益の基準額・基準日はFX口座だけに設定できます。");
    }
  }

  const snapshotNumberFields = [
    "cumulativeInvested",
    "effectivePrincipal",
    "pnl",
    "realizedPnlTotal",
    "realizedPnlDaily",
    "cash",
    "swapTotal",
    "requiredMargin",
    "principal"
  ];

  for (const snapshot of data.snapshots) {
    if (!snapshot ||
        typeof snapshot.id !== "string" ||
        typeof snapshot.accountId !== "string" ||
        typeof snapshot.asOfDate !== "string" ||
        typeof snapshot.recordedAt !== "string" ||
        !Number.isFinite(snapshot.value)) {
      throw new Error("履歴データに不正な項目があります。");
    }

    if (!data.accounts.some(account =>
      account.id === snapshot.accountId
    )) {
      throw new Error("履歴の口座参照先がありません。");
    }

    if (typeof snapshot.memo !== "string") {
      throw new Error("履歴メモの形式が正しくありません。");
    }

    for (const field of snapshotNumberFields) {
      if (!isNullableNumber(snapshot[field])) {
        throw new Error(`履歴の ${field} が正しくありません。`);
      }
    }
  }

  for (const holding of data.holdings) {
    if (!holding ||
        typeof holding.id !== "string" ||
        typeof holding.accountId !== "string" ||
        typeof holding.name !== "string" ||
        !holding.name.trim() ||
        !HOLDING_WRAPPERS.includes(holding.wrapper) ||
        !HOLDING_KINDS.includes(holding.kind) ||
        typeof holding.asOfDate !== "string" ||
        formatDateWithWeekday(holding.asOfDate) === holding.asOfDate ||
        typeof holding.recordedAt !== "string" ||
        !Number.isFinite(holding.value) ||
        typeof holding.memo !== "string" ||
        typeof holding.createdAt !== "string" ||
        typeof holding.updatedAt !== "string") {
      throw new Error("商品別保有データに不正な項目があります。");
    }

    const account = data.accounts.find(item =>
      item.id === holding.accountId
    );
    if (!isHoldingsAccount(account)) {
      throw new Error("商品別保有の口座参照先が正しくありません。");
    }

    for (const field of ["quantity","costBasis","pnl"]) {
      if (!isNullableNumber(holding[field])) {
        throw new Error("商品別保有の " + field + " が正しくありません。");
      }
    }
  }

  /* ---------- FX建玉検証 ---------- */

  const fxPositionIds = new Set();

  for (const position of data.fxPositions) {
    if (!position ||
        typeof position.id !== "string" ||
        !position.id ||
        typeof position.accountId !== "string" ||
        !isValidFxPairForStorage(position.pair) ||
        !["買","売"].includes(position.side) ||
        !isValidFxDateTimeForStorage(position.openDate) ||
        (position.asOfDate !== null &&
         position.asOfDate !== undefined &&
         !isValidFxDateForStorage(position.asOfDate)) ||
        !Number.isSafeInteger(position.quantity) ||
        position.quantity <= 0 ||
        typeof position.openRate !== "number" ||
        !Number.isFinite(position.openRate) ||
        position.openRate <= 0 ||
        !isNullableNumber(position.swap) ||
        !["保有中","決済済"].includes(position.status) ||
        typeof position.recordedAt !== "string") {
      throw new Error("FX建玉データに不正な項目があります。");
    }

    if (fxPositionIds.has(position.id)) {
      throw new Error("FX建玉IDが重複しています。");
    }
    fxPositionIds.add(position.id);

    const account = data.accounts.find(item =>
      item.id === position.accountId
    );

    if (!account || account.type !== "fx") {
      throw new Error("FX建玉の口座参照先が正しくありません。");
    }

    if (position.status === "保有中") {
      if (position.closeDate !== null &&
          position.closeDate !== undefined &&
          position.closeDate !== "") {
        throw new Error("保有中の建玉に決済日を設定できません。");
      }

      if (position.closeRate !== null &&
          position.closeRate !== undefined) {
        throw new Error("保有中の建玉に決済レートを設定できません。");
      }

      if (position.realizedPnl !== null &&
          position.realizedPnl !== undefined) {
        throw new Error("保有中の建玉に確定損益を設定できません。");
      }
    } else {
      if (!isValidFxDateForStorage(position.closeDate) ||
          typeof position.realizedPnl !== "number" ||
          !Number.isFinite(position.realizedPnl)) {
        throw new Error("決済済み建玉の決済日または確定損益が正しくありません。");
      }

      if (position.closeRate !== null &&
          position.closeRate !== undefined &&
          (typeof position.closeRate !== "number" ||
           !Number.isFinite(position.closeRate) ||
           position.closeRate <= 0)) {
        throw new Error("決済済み建玉の決済レートが正しくありません。");
      }
    }
  }

  /* ---------- FX評価レート検証 ---------- */

  const fxRateKeys = new Set();

  for (const rate of data.fxRates) {
    if (!rate ||
        typeof rate.id !== "string" ||
        typeof rate.accountId !== "string" ||
        !isValidFxPairForStorage(rate.pair) ||
        !isNullableNumber(rate.rate) ||
        (rate.rate !== null &&
         rate.rate !== undefined &&
         rate.rate <= 0) ||
        (rate.asOfDate !== null &&
         rate.asOfDate !== undefined &&
         !isValidFxDateForStorage(rate.asOfDate)) ||
        typeof rate.createdAt !== "string" ||
        typeof rate.updatedAt !== "string") {
      throw new Error("FX評価レートに不正な項目があります。");
    }

    const account = data.accounts.find(item =>
      item.id === rate.accountId
    );

    if (!account || account.type !== "fx") {
      throw new Error("FX評価レートの口座参照先が正しくありません。");
    }

    const key = JSON.stringify([rate.accountId,rate.pair]);

    if (fxRateKeys.has(key)) {
      throw new Error("同じFX口座・通貨ペアの評価レートが重複しています。");
    }

    fxRateKeys.add(key);
  }

  /* ---------- FXスワップ履歴検証 ---------- */

  for (const ledger of data.fxSwapLedger) {
    if (!ledger ||
        typeof ledger.id !== "string" ||
        typeof ledger.accountId !== "string" ||
        !isValidFxPairForStorage(ledger.pair) ||
        !["買","売"].includes(ledger.side) ||
        !isValidFxDateForStorage(ledger.asOfDate) ||
        typeof ledger.recordedAt !== "string") {
      throw new Error("FXスワップ履歴の共通項目が正しくありません。");
    }

    const account = data.accounts.find(item =>
      item.id === ledger.accountId
    );

    if (!account || account.type !== "fx") {
      throw new Error("FXスワップ履歴の口座参照先が正しくありません。");
    }

    if (Object.prototype.hasOwnProperty.call(ledger,"total")) {
      if (!Number.isSafeInteger(ledger.total) ||
          !Number.isSafeInteger(ledger.baseline) ||
          !Number.isSafeInteger(ledger.increase) ||
          !["基準","配分済","未配分"].includes(ledger.status) ||
          typeof ledger.reason !== "string" ||
          !Array.isArray(ledger.allocations)) {
        throw new Error("FX集計スワップ登録の内容が正しくありません。");
      }

      const allocationIds = new Set();
      let allocationTotal = 0;

      for (const allocation of ledger.allocations) {
        if (!allocation ||
            typeof allocation.positionId !== "string" ||
            !allocation.positionId ||
            !Number.isSafeInteger(allocation.amount) ||
            allocationIds.has(allocation.positionId)) {
          throw new Error("FXスワップ配分の内容が正しくありません。");
        }
        allocationIds.add(allocation.positionId);
        allocationTotal += allocation.amount;
      }

      if (!Number.isSafeInteger(ledger.baseline + ledger.increase) ||
          ledger.total !== ledger.baseline + ledger.increase ||
          (ledger.status === "基準" &&
           (ledger.increase !== 0 ||
            ledger.baseline !== ledger.total ||
            ledger.allocations.length !== 0)) ||
          (ledger.status === "配分済" &&
           (!Number.isSafeInteger(allocationTotal) ||
            allocationTotal !== ledger.increase)) ||
          (ledger.status === "未配分" &&
           ledger.allocations.length !== 0)) {
        throw new Error("FXスワップ登録の配分合計または状態が正しくありません。");
      }
    } else if (Object.prototype.hasOwnProperty.call(ledger,"amount")) {
      if (!Number.isSafeInteger(ledger.amount) ||
          !["決済","削除","追加","移動"].includes(ledger.reason) ||
          typeof ledger.positionId !== "string") {
        throw new Error("FXスワップ調整の内容が正しくありません。");
      }
    } else {
      throw new Error("FXスワップ履歴の種別を判定できません。");
    }
  }

  /* ---------- 住宅ローン検証 ---------- */

  const loanIds = new Set();

  for (const loan of data.loans) {
    if (!loan ||
        typeof loan.id !== "string" ||
        !loan.id ||
        typeof loan.name !== "string" ||
        !loan.name.trim() ||
        !isValidFxDateForStorage(loan.startDate) ||
        typeof loan.startAmount !== "number" ||
        !Number.isFinite(loan.startAmount) ||
        loan.startAmount <= 0 ||
        !["変動","固定"].includes(loan.rateType) ||
        !isValidFxDateForStorage(loan.finalDueDate) ||
        !Number.isInteger(loan.repayDay) ||
        loan.repayDay < 1 ||
        loan.repayDay > 31 ||
        !isNullableNumber(loan.monthlyPayment) ||
        (loan.monthlyPayment !== null &&
         loan.monthlyPayment !== undefined &&
         loan.monthlyPayment < 0) ||
        !isValidFxDateForStorage(loan.reviewDate) ||
        typeof loan.rule5y !== "boolean" ||
        typeof loan.rule125 !== "boolean" ||
        typeof loan.memo !== "string") {
      throw new Error("住宅ローンデータに不正な項目があります。");
    }

    if (loanIds.has(loan.id)) {
      throw new Error("住宅ローンIDが重複しています。");
    }
    loanIds.add(loan.id);
  }

  const loanSnapshotIds = new Set();

  for (const snapshot of data.loanSnapshots) {
    if (!snapshot ||
        typeof snapshot.id !== "string" ||
        !snapshot.id ||
        typeof snapshot.loanId !== "string" ||
        !isValidFxDateForStorage(snapshot.asOfDate) ||
        typeof snapshot.recordedAt !== "string" ||
        typeof snapshot.balance !== "number" ||
        !Number.isFinite(snapshot.balance) ||
        snapshot.balance < 0 ||
        typeof snapshot.rate !== "number" ||
        !Number.isFinite(snapshot.rate) ||
        snapshot.rate < 0) {
      throw new Error("住宅ローン履歴データに不正な項目があります。");
    }

    if (loanSnapshotIds.has(snapshot.id)) {
      throw new Error("住宅ローン履歴IDが重複しています。");
    }
    loanSnapshotIds.add(snapshot.id);

    if (!loanIds.has(snapshot.loanId)) {
      throw new Error("住宅ローン履歴の参照先がありません。");
    }
  }

  const settingNumberFields = [
    "taxRatePct",
    "fxYtdRealized",
    "fxLossCarry",
    "targetRatio"
  ];

  for (const field of settingNumberFields) {
    if (!Number.isFinite(data.settings[field])) {
      throw new Error(`設定の ${field} が正しくありません。`);
    }
  }

  if (data.settings.chartPrefs !== undefined &&
      (data.settings.chartPrefs === null ||
       typeof data.settings.chartPrefs !== "object" ||
       Array.isArray(data.settings.chartPrefs))) {
    throw new Error("グラフ設定の形式が正しくありません。");
  }

  validateStockTrackingData(data);
  validateCashflowData(data);
}
