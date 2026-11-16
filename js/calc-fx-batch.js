/* ---------- FX建玉の表形式一括編集 ---------- */

function parseFxBatchNumericValue(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/,/g,"").trim();
  if (normalized === "") return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : NaN;
}

function validateFxPositionBatchRows(
  data,
  accountId,
  pair,
  side,
  rows,
  deletedIds = []
) {
  const errors = [];
  const addError = (rowKey,field,message) => {
    errors.push({rowKey,field,message});
  };

  if (!data ||
      !Array.isArray(data.accounts) ||
      !Array.isArray(data.fxPositions) ||
      !Array.isArray(data.fxRates) ||
      !Array.isArray(data.fxSwapLedger) ||
      !Array.isArray(rows) ||
      !Array.isArray(deletedIds)) {
    addError(null,null,"FXデータまたは編集行の形式が正しくありません。");
    return {valid:false,errors};
  }

  const account = data.accounts.find(item =>
    item.id === accountId && item.type === "fx"
  );
  if (!account) {
    addError(null,null,"FX口座が見つかりません。");
    return {valid:false,errors};
  }

  const originalOpenPositions = data.fxPositions.filter(position =>
    position.accountId === accountId &&
    position.pair === pair &&
    position.side === side &&
    position.status === "保有中"
  );
  const originalById = new Map(
    originalOpenPositions.map(position => [position.id,position])
  );
  const seenIds = new Set();
  const deletedSet = new Set();

  for (let index = 0; index < deletedIds.length; index += 1) {
    const id = deletedIds[index];
    if (typeof id !== "string" || !id || deletedSet.has(id)) {
      addError("deleted-" + index,"delete","削除対象が重複または不正です。");
      continue;
    }
    deletedSet.add(id);
    const original = originalById.get(id);
    if (!original) {
      addError("deleted-" + index,"delete","削除対象の保有中建玉が見つかりません。");
    } else if (original.swap !== null &&
               original.swap !== undefined &&
               original.swap !== 0 &&
               !Number.isSafeInteger(original.swap)) {
      addError(id,"swap","削除調整を記録するため、累計スワップは整数の円で入力してください。");
    }
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowKey = row && (
      row._rowKey || row.id || "new-" + (index + 1)
    );

    if (!row || typeof row !== "object") {
      addError(rowKey,null,"建玉の行が正しくありません。");
      continue;
    }

    if (row.readOnly) continue;

    let original = null;
    if (row.id) {
      if (seenIds.has(row.id)) {
        addError(rowKey,"id","建玉IDが重複しています。");
      }
      seenIds.add(row.id);
      original = originalById.get(row.id) || null;
      if (!original) {
        addError(rowKey,"id","編集対象の保有中建玉が見つかりません。");
      }
      if (deletedSet.has(row.id)) {
        addError(rowKey,"id","同じ建玉を編集と削除の両方に指定できません。");
      }
    }

    const openDate = String(row.openDate || "").trim();
    if (!isValidFxPositionDate(openDate)) {
      addError(rowKey,"openDate","約定日が実在する日付ではありません。");
    }

    const rowPair = String(row.pair || "").trim();
    if (!/^[A-Z]{3}\/JPY$/.test(rowPair)) {
      addError(rowKey,"pair","通貨ペアは英大文字3字/JPYで入力してください。");
    }

    if (!["買","売"].includes(row.side)) {
      addError(rowKey,"side","売買方向は「買」または「売」にしてください。");
    }

    const quantityText = String(row.quantity ?? "").replace(/,/g,"").trim();
    const quantity = quantityText === "" ? NaN : Number(quantityText);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      addError(rowKey,"quantity","数量は正の整数で入力してください。");
    }

    const openRate = parseFxBatchNumericValue(row.openRate);
    if (openRate === null || Number.isNaN(openRate) || openRate <= 0) {
      addError(rowKey,"openRate","約定レートは0より大きい数値で入力してください。");
    }

    const swap = parseFxBatchNumericValue(row.swap);
    if (Number.isNaN(swap)) {
      addError(rowKey,"swap","累計スワップは数値または空欄にしてください。");
    }

    const changesAggregate = original &&
      (original.pair !== rowPair || original.side !== row.side);
    const needsAdjustment = row.id
      ? Boolean(changesAggregate && original.swap !== null &&
          original.swap !== undefined && original.swap !== 0)
      : swap !== null && swap !== 0;

    if (needsAdjustment &&
        !Number.isSafeInteger(row.id ? original.swap : swap)) {
      addError(rowKey,"swap","集計単位の移動・追加調整には整数の円が必要です。");
    }
  }

  for (const original of originalOpenPositions) {
    if (!seenIds.has(original.id) && !deletedSet.has(original.id)) {
      addError(original.id,"id","既存の保有中建玉が編集対象から抜けています。");
    }
  }

  return {
    valid:errors.length === 0,
    errors
  };
}

function buildFxPositionBatchData(
  data,
  accountId,
  pair,
  side,
  rows,
  deletedIds = [],
  options = {}
) {
  const validation = validateFxPositionBatchRows(
    data,accountId,pair,side,rows,deletedIds
  );
  if (!validation.valid) {
    throw new Error(
      "建玉の入力にエラーがあります：" +
      validation.errors.map(item => item.message).join("／")
    );
  }

  const idFactory = typeof options.idFactory === "function"
    ? options.idFactory
    : createId;
  const now = typeof options.now === "string"
    ? options.now
    : new Date().toISOString();
  const adjustmentDate = isValidFxPositionAsOfDate(options.asOfDate)
    ? options.asOfDate
    : localDateString();
  const nextData = JSON.parse(JSON.stringify(data));
  const originalById = new Map(
    data.fxPositions.map(position => [position.id,position])
  );
  const usedIds = new Set([
    ...nextData.accounts.map(item => item.id),
    ...nextData.fxPositions.map(item => item.id),
    ...nextData.fxRates.map(item => item.id),
    ...nextData.fxSwapLedger.map(item => item.id)
  ]);

  function nextUniqueId() {
    const id = idFactory();
    if (typeof id !== "string" || !id || usedIds.has(id)) {
      throw new Error("一括編集用のIDを作成できませんでした。");
    }
    usedIds.add(id);
    return id;
  }

  function addAdjustment(position,reason,amount) {
    if (amount === null || amount === undefined || amount === 0) return;
    nextData.fxSwapLedger.push({
      id:nextUniqueId(),
      accountId:position.accountId,
      pair:position.pair,
      side:position.side,
      asOfDate:adjustmentDate,
      recordedAt:now,
      amount,
      reason,
      positionId:position.id
    });
  }

  function ensurePairRate(targetPair) {
    const exists = nextData.fxRates.some(rate =>
      rate.accountId === accountId && rate.pair === targetPair
    );
    if (exists) return;
    nextData.fxRates.push({
      id:nextUniqueId(),
      accountId,
      pair:targetPair,
      rate:null,
      asOfDate:null,
      createdAt:now,
      updatedAt:now
    });
  }

  const deletedSet = new Set(deletedIds);
  for (const id of deletedSet) {
    const original = originalById.get(id);
    if (original.swap !== null &&
        original.swap !== undefined &&
        original.swap !== 0) {
      addAdjustment(original,"削除",-original.swap);
    }
  }

  nextData.fxPositions = nextData.fxPositions.filter(position =>
    !deletedSet.has(position.id)
  );

  for (const row of rows) {
    if (row.readOnly) continue;

    const rowPair = String(row.pair).trim();
    const quantity = Number(
      String(row.quantity).replace(/,/g,"").trim()
    );
    const openRate = parseFxBatchNumericValue(row.openRate);
    const swap = parseFxBatchNumericValue(row.swap);
    const values = {
      openDate:String(row.openDate).trim(),
      pair:rowPair,
      side:row.side,
      quantity,
      openRate,
      swap
    };

    if (row.id) {
      const original = originalById.get(row.id);
      const target = nextData.fxPositions.find(position =>
        position.id === row.id
      );
      const moved = original.pair !== rowPair ||
        original.side !== row.side;
      const changed = original.openDate !== values.openDate ||
        original.pair !== values.pair ||
        original.side !== values.side ||
        original.quantity !== values.quantity ||
        original.openRate !== values.openRate ||
        original.swap !== values.swap;

      Object.assign(target,values);
      if (changed) target.updatedAt = now;

      if (moved && original.swap !== null &&
          original.swap !== undefined && original.swap !== 0) {
        addAdjustment(original,"移動",-original.swap);
        addAdjustment({
          ...original,
          pair:rowPair,
          side:row.side
        },"移動",original.swap);
      }
      if (moved) ensurePairRate(rowPair);
    } else {
      const id = nextUniqueId();
      const position = {
        id,
        accountId,
        pair:rowPair,
        side:row.side,
        openDate:values.openDate,
        asOfDate:null,
        quantity,
        openRate,
        swap,
        status:"保有中",
        closeDate:null,
        closeRate:null,
        realizedPnl:null,
        recordedAt:now,
        createdAt:now,
        updatedAt:now
      };
      nextData.fxPositions.push(position);
      if (swap !== null && swap !== 0) {
        addAdjustment(position,"追加",swap);
      }
      ensurePairRate(rowPair);
    }
  }

  return nextData;
}
