/* ---------- スワップ調整 ---------- */

function createFxSwapAdjustment(
  position,
  reason,
  amount,
  now = new Date().toISOString(),
  asOfDate = localDateString()
) {
  if (!position ||
      !Number.isFinite(amount) ||
      amount === 0) {
    return null;
  }

  return {
    id:createId(),
    accountId:position.accountId,
    pair:position.pair,
    side:position.side,
    asOfDate,
    recordedAt:now,
    amount,
    reason,
    positionId:position.id
  };
}

function splitFxPositionSwap(swap,settlementQuantity,originalQuantity) {
  if (swap === null || swap === undefined) {
    return {settledSwap:null,remainingSwap:null};
  }

  if (!Number.isSafeInteger(swap) ||
      !Number.isSafeInteger(settlementQuantity) ||
      !Number.isSafeInteger(originalQuantity) ||
      settlementQuantity <= 0 ||
      originalQuantity <= 0 ||
      settlementQuantity > originalQuantity) {
    throw new Error("累計スワップまたは決済数量が正しくありません。");
  }

  if (settlementQuantity === originalQuantity) {
    return {settledSwap:swap,remainingSwap:0};
  }

  const settledSwap = Math.trunc(
    swap * settlementQuantity / originalQuantity
  );

  return {
    settledSwap,
    remainingSwap:swap - settledSwap
  };
}

function buildFxSettlementData(
  data,
  settlements,
  closeDate,
  options = {}
) {
  if (!data ||
      !Array.isArray(data.accounts) ||
      !Array.isArray(data.fxPositions) ||
      !Array.isArray(data.fxSwapLedger)) {
    throw new Error("FXデータの形式が正しくありません。");
  }

  if (!isValidFxPositionAsOfDate(closeDate)) {
    throw new Error("決済日を正しく入力してください。");
  }

  if (!Array.isArray(settlements) || settlements.length === 0) {
    throw new Error("決済する建玉を選択してください。");
  }

  const idFactory = typeof options.idFactory === "function"
    ? options.idFactory
    : createId;
  const now = typeof options.now === "string"
    ? options.now
    : new Date().toISOString();
  const seenIds = new Set();
  const prepared = [];

  for (const settlement of settlements) {
    if (!settlement ||
        typeof settlement.positionId !== "string" ||
        seenIds.has(settlement.positionId)) {
      throw new Error("決済対象の建玉が重複または不正です。");
    }
    seenIds.add(settlement.positionId);

    const position = data.fxPositions.find(item =>
      item.id === settlement.positionId
    );
    if (!position ||
        position.status !== "保有中" ||
        !data.accounts.some(account =>
          account.id === position.accountId &&
          account.type === "fx"
        )) {
      throw new Error("決済対象の保有中建玉が見つかりません。");
    }

    if (!Number.isSafeInteger(settlement.quantity) ||
        settlement.quantity <= 0 ||
        settlement.quantity > position.quantity) {
      throw new Error("決済数量は保有数量以内の正の整数で入力してください。");
    }

    if (typeof settlement.realizedPnl !== "number" ||
        !Number.isFinite(settlement.realizedPnl)) {
      throw new Error("確定損益を数値で入力してください。");
    }

    const closeRate = settlement.closeRate === null ||
      settlement.closeRate === undefined
        ? null
        : settlement.closeRate;
    if (closeRate !== null &&
        (typeof closeRate !== "number" ||
         !Number.isFinite(closeRate) ||
         closeRate <= 0)) {
      throw new Error("決済レートは空欄、または0より大きい数値にしてください。");
    }

    if (closeDate < String(position.openDate).slice(0,10)) {
      throw new Error("決済日は約定日より前にできません。");
    }

    if (position.swap !== null &&
        position.swap !== undefined &&
        !Number.isSafeInteger(position.swap)) {
      throw new Error("累計スワップが整数の円でないため決済できません。");
    }

    const swapSplit = splitFxPositionSwap(
      position.swap,
      settlement.quantity,
      position.quantity
    );

    prepared.push({
      positionId:position.id,
      quantity:settlement.quantity,
      realizedPnl:settlement.realizedPnl,
      closeRate,
      swapSplit
    });
  }

  const nextData = JSON.parse(JSON.stringify(data));
  const existingIds = new Set(nextData.fxPositions.map(item => item.id));

  for (const settlement of prepared) {
    const position = nextData.fxPositions.find(item =>
      item.id === settlement.positionId
    );
    const isFullSettlement =
      settlement.quantity === position.quantity;
    let settledPosition;

    if (isFullSettlement) {
      position.status = "決済済";
      position.closeDate = closeDate;
      position.closeRate = settlement.closeRate;
      position.realizedPnl = settlement.realizedPnl;
      position.updatedAt = now;
      settledPosition = position;
    } else {
      const originalQuantity = position.quantity;
      position.quantity = originalQuantity - settlement.quantity;
      position.swap = settlement.swapSplit.remainingSwap;
      position.updatedAt = now;

      const settledId = idFactory();
      if (typeof settledId !== "string" ||
          !settledId ||
          existingIds.has(settledId)) {
        throw new Error("決済済み建玉のIDを作成できませんでした。");
      }
      existingIds.add(settledId);

      settledPosition = {
        ...position,
        id:settledId,
        quantity:settlement.quantity,
        swap:settlement.swapSplit.settledSwap,
        status:"決済済",
        closeDate,
        closeRate:settlement.closeRate,
        realizedPnl:settlement.realizedPnl,
        recordedAt:now,
        createdAt:now,
        updatedAt:now
      };
      nextData.fxPositions.push(settledPosition);
    }

    if (settlement.swapSplit.settledSwap !== null &&
        settlement.swapSplit.settledSwap !== 0) {
      const adjustment = createFxSwapAdjustment(
        settledPosition,
        "決済",
        -settlement.swapSplit.settledSwap,
        now,
        closeDate
      );
      if (adjustment) nextData.fxSwapLedger.push(adjustment);
    }
  }

  return nextData;
}
