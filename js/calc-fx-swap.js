/* ---------- 集計スワップ登録・配分・照合 ---------- */

function getLatestFxSwapRegistration(data,accountId,pair,side) {
  const registrations = (data.fxSwapLedger || []).filter(item =>
    Object.prototype.hasOwnProperty.call(item,"total") &&
    item.accountId === accountId && item.pair === pair && item.side === side
  );
  registrations.sort((a,b) => {
    const dateDifference = String(a.asOfDate).localeCompare(String(b.asOfDate));
    return dateDifference !== 0 ? dateDifference :
      String(a.recordedAt).localeCompare(String(b.recordedAt));
  });
  return registrations.length ? registrations[registrations.length - 1] : null;
}

function calculateFxSwapAdjustedBaseline(data,accountId,pair,side,previousRegistration) {
  if (!previousRegistration) return null;
  let adjustmentTotal = 0;
  for (const item of data.fxSwapLedger || []) {
    if (Object.prototype.hasOwnProperty.call(item,"amount") &&
        item.accountId === accountId && item.pair === pair && item.side === side &&
        String(item.recordedAt) > String(previousRegistration.recordedAt)) {
      adjustmentTotal += item.amount;
    }
  }
  const baseline = previousRegistration.total + adjustmentTotal;
  if (!Number.isSafeInteger(baseline)) {
    throw new Error("集計スワップの基準額が安全な整数の範囲を超えています。");
  }
  return baseline;
}

function allocateFxSwapIncrease(positions,increase) {
  if (!Number.isSafeInteger(increase)) {
    return {status:"未配分",reason:"増加額が整数ではありません",allocations:[],total:0};
  }
  if (increase === 0) {
    return {status:"配分済",reason:"",allocations:[],total:0};
  }
  if (!Array.isArray(positions) || positions.length === 0 ||
      positions.some(position => !Number.isSafeInteger(position.quantity) || position.quantity <= 0)) {
    return {status:"未配分",reason:"配分対象なし",allocations:[],total:0};
  }
  if (positions.some(position => position.swap === null || position.swap === undefined)) {
    return {status:"未配分",reason:"建玉スワップ未入力",allocations:[],total:0};
  }
  const totalQuantity = positions.reduce((sum,position) =>
    sum + BigInt(position.quantity),0n
  );
  if (totalQuantity <= 0n) {
    return {status:"未配分",reason:"配分対象なし",allocations:[],total:0};
  }

  const increaseBigInt = BigInt(increase);
  const prepared = positions.map(position => {
    const numerator = increaseBigInt * BigInt(position.quantity);
    return {
      positionId:position.id,
      amount:Number(numerator / totalQuantity),
      quantity:position.quantity,
      openDate:String(position.openDate || "")
    };
  });
  const allocated = prepared.reduce((sum,item) => sum + BigInt(item.amount),0n);
  const remainder = increaseBigInt - allocated;
  const remainderCount = Number(remainder < 0n ? -remainder : remainder);
  const direction = remainder < 0n ? -1 : 1;
  const remainderOrder = prepared.slice().sort((a,b) => {
    if (a.quantity !== b.quantity) return b.quantity - a.quantity;
    const dateDifference = a.openDate.localeCompare(b.openDate);
    return dateDifference !== 0 ? dateDifference :
      a.positionId.localeCompare(b.positionId);
  });
  for (let index = 0; index < remainderCount; index += 1) {
    const target = prepared.find(item =>
      item.positionId === remainderOrder[index].positionId
    );
    target.amount += direction;
  }

  const allocations = prepared.map(item => ({
    positionId:item.positionId,
    amount:item.amount
  }));
  const allocationTotal = allocations.reduce((sum,item) => sum + item.amount,0);
  if (!Number.isSafeInteger(allocationTotal) || allocationTotal !== increase) {
    throw new Error("集計スワップの配分合計が増加額と一致しません。");
  }
  return {status:"配分済",reason:"",allocations,total:allocationTotal};
}

function calculateFxSwapRegistrationPreview(data,accountId,pair,side,total,asOfDate) {
  if (!data || !Array.isArray(data.accounts) ||
      !Array.isArray(data.fxPositions) || !Array.isArray(data.fxSwapLedger)) {
    throw new Error("FXデータの形式が正しくありません。");
  }
  if (!data.accounts.some(account => account.id === accountId && account.type === "fx")) {
    throw new Error("FX口座が見つかりません。");
  }
  if (typeof pair !== "string" || !/^[A-Z]{3}\/JPY$/.test(pair) ||
      !["買","売"].includes(side)) {
    throw new Error("集計単位が正しくありません。");
  }
  if (!Number.isSafeInteger(total)) {
    throw new Error("累計スワップは整数の円で入力してください。");
  }
  if (!isValidFxPositionAsOfDate(asOfDate)) {
    throw new Error("登録日を正しく入力してください。");
  }

  const previous = getLatestFxSwapRegistration(data,accountId,pair,side);
  if (previous && asOfDate < previous.asOfDate) {
    throw new Error("前回の登録日より前の日付は登録できません。");
  }
  if (!previous) {
    return {
      accountId,pair,side,total,asOfDate,
      baseline:total,increase:0,status:"基準",reason:"",allocations:[]
    };
  }

  const baseline = calculateFxSwapAdjustedBaseline(
    data,accountId,pair,side,previous
  );
  const increase = total - baseline;
  if (!Number.isSafeInteger(increase)) {
    return {
      accountId,pair,side,total,asOfDate,baseline,increase,
      status:"未配分",reason:"増加額が整数ではありません",allocations:[]
    };
  }
  const positions = getFxOpenPositions(data,accountId).filter(position =>
    position.pair === pair && position.side === side
  );
  const result = allocateFxSwapIncrease(positions,increase);
  return {
    accountId,pair,side,total,asOfDate,baseline,increase,
    status:result.status,reason:result.reason,allocations:result.allocations
  };
}

function buildFxSwapRegistrationData(data,preview,options = {}) {
  if (!preview || typeof preview.accountId !== "string" ||
      typeof preview.pair !== "string" || !["買","売"].includes(preview.side)) {
    throw new Error("集計スワップのプレビューが正しくありません。");
  }
  const freshPreview = calculateFxSwapRegistrationPreview(
    data,preview.accountId,preview.pair,preview.side,preview.total,preview.asOfDate
  );
  if (JSON.stringify(freshPreview) !== JSON.stringify(preview)) {
    throw new Error("プレビュー後にデータが変わりました。もう一度試算してください。");
  }
  const idFactory = typeof options.idFactory === "function" ? options.idFactory : createId;
  const now = typeof options.now === "string" ? options.now : new Date().toISOString();
  const nextData = JSON.parse(JSON.stringify(data));
  const existingIds = new Set(nextData.fxSwapLedger.map(item => item.id));

  if (preview.status === "配分済") {
    for (const allocation of preview.allocations) {
      const position = nextData.fxPositions.find(item =>
        item.id === allocation.positionId && item.accountId === preview.accountId &&
        item.pair === preview.pair && item.side === preview.side &&
        item.status === "保有中"
      );
      if (!position || !Number.isSafeInteger(position.swap) ||
          !Number.isSafeInteger(position.swap + allocation.amount)) {
        throw new Error("配分対象の建玉が変更されたか、スワップが整数ではありません。");
      }
      position.swap += allocation.amount;
      position.updatedAt = now;
    }
  }

  const id = idFactory();
  if (typeof id !== "string" || !id || existingIds.has(id)) {
    throw new Error("集計スワップ登録のIDを作成できませんでした。");
  }
  nextData.fxSwapLedger.push({
    id,accountId:preview.accountId,pair:preview.pair,side:preview.side,
    asOfDate:preview.asOfDate,recordedAt:now,total:preview.total,
    baseline:preview.baseline,increase:preview.increase,status:preview.status,
    reason:preview.reason || "",
    allocations:preview.allocations.map(item => ({
      positionId:item.positionId,amount:item.amount
    }))
  });
  return nextData;
}

function calculateFxSwapGroupReconciliation(data,accountId,pair,side) {
  const positions = getFxOpenPositions(data,accountId).filter(position =>
    position.pair === pair && position.side === side
  );
  const latest = getLatestFxSwapRegistration(data,accountId,pair,side);
  if (!latest || positions.some(position => !Number.isSafeInteger(position.swap))) {
    return {
      warning:false,difference:null,positionTotal:null,
      aggregateTotal:latest ? latest.total : null
    };
  }
  const positionTotal = positions.reduce((sum,position) => sum + position.swap,0);
  const difference = positionTotal - latest.total;
  return {
    warning:difference !== 0,difference,positionTotal,aggregateTotal:latest.total
  };
}

function calculateFxSwapAccountReconciliation(data,accountId) {
  const snapshots = (data.snapshots || []).filter(snapshot =>
    snapshot.accountId === accountId
  ).sort((a,b) => {
    const dateDifference = String(a.asOfDate).localeCompare(String(b.asOfDate));
    return dateDifference !== 0 ? dateDifference :
      String(a.recordedAt).localeCompare(String(b.recordedAt));
  });
  if (!snapshots.length || !Number.isSafeInteger(snapshots[snapshots.length - 1].swapTotal)) {
    return {warning:false,difference:null,accountTotal:null,aggregateTotal:null};
  }

  const latestByGroup = new Map();
  for (const registration of (data.fxSwapLedger || []).filter(item =>
    Object.prototype.hasOwnProperty.call(item,"total") && item.accountId === accountId
  )) {
    const key = JSON.stringify([registration.pair,registration.side]);
    const previous = latestByGroup.get(key);
    if (!previous ||
        String(registration.asOfDate) > String(previous.asOfDate) ||
        (registration.asOfDate === previous.asOfDate &&
         String(registration.recordedAt) > String(previous.recordedAt))) {
      latestByGroup.set(key,registration);
    }
  }
  if (!latestByGroup.size) {
    return {
      warning:false,difference:null,
      accountTotal:snapshots[snapshots.length - 1].swapTotal,
      aggregateTotal:null
    };
  }
  const aggregateTotal = [...latestByGroup.values()].reduce((sum,item) => sum + item.total,0);
  const accountTotal = snapshots[snapshots.length - 1].swapTotal;
  const difference = accountTotal - aggregateTotal;
  return {warning:difference !== 0,difference,accountTotal,aggregateTotal};
}


function getFxCalendarDayDifference(startDate,endDate) {
  if (!isValidFxPositionAsOfDate(startDate) ||
      !isValidFxPositionAsOfDate(endDate)) {
    return null;
  }
  const start = startDate.split("-").map(Number);
  const end = endDate.split("-").map(Number);
  const startTime = Date.UTC(start[0],start[1] - 1,start[2]);
  const endTime = Date.UTC(end[0],end[1] - 1,end[2]);
  return Math.round((endTime - startTime) / 86400000);
}

function calculateFxSwapEstimates(data,accountId,targetDate = null) {
  if (!data ||
      !Array.isArray(data.accounts) ||
      !Array.isArray(data.snapshots) ||
      !Array.isArray(data.fxPositions)) {
    return {status:"未計算",reason:"FXデータの形式が正しくありません。"};
  }

  const account = data.accounts.find(item =>
    item.id === accountId && item.type === "fx"
  );
  if (!account) {
    return {status:"未計算",reason:"FX口座が見つかりません。"};
  }

  const snapshots = data.snapshots.filter(snapshot =>
    snapshot.accountId === accountId &&
    isValidFxPositionAsOfDate(snapshot.asOfDate)
  ).slice().sort((a,b) => {
    const dateDifference = String(b.asOfDate).localeCompare(String(a.asOfDate));
    return dateDifference !== 0
      ? dateDifference
      : String(b.recordedAt || "").localeCompare(String(a.recordedAt || ""));
  });
  const latestSnapshot = snapshots[0] || null;
  if (!latestSnapshot ||
      typeof latestSnapshot.swapTotal !== "number" ||
      !Number.isFinite(latestSnapshot.swapTotal)) {
    return {
      status:"未計算",
      reason:"口座の最新スワップが入力されていません。",
      baseDate:latestSnapshot ? latestSnapshot.asOfDate : null
    };
  }

  const baseDate = latestSnapshot.asOfDate;
  const estimateDate = targetDate === null || targetDate === ""
    ? baseDate
    : targetDate;
  if (!isValidFxPositionAsOfDate(estimateDate)) {
    return {
      status:"入力エラー",
      reason:"推定日を正しく入力してください。",
      baseDate
    };
  }

  const positions = data.fxPositions.filter(position =>
    position.accountId === accountId &&
    ["保有中","決済済"].includes(position.status) &&
    isValidFxPositionAsOfDate(position.openDate)
  );

  const knownSwapTotal = positions.reduce((sum,position) =>
    typeof position.swap === "number" && Number.isFinite(position.swap)
      ? sum + position.swap
      : sum,
    0
  );
  const accountDifference = latestSnapshot.swapTotal - knownSwapTotal;
  const missingPositions = positions.filter(position =>
    position.swap === null || position.swap === undefined
  );

  const weightedPositions = missingPositions.map(position => {
    const endDate = position.status === "決済済" &&
      isValidFxPositionAsOfDate(position.closeDate)
        ? position.closeDate
        : baseDate;
    const holdingDays = Math.max(
      0,
      getFxCalendarDayDifference(position.openDate,endDate) ?? 0
    );
    const weight = Number.isFinite(position.quantity) && position.quantity > 0
      ? position.quantity * holdingDays
      : 0;
    return {position,holdingDays,weight};
  });
  const totalWeight = weightedPositions.reduce(
    (sum,item) => sum + item.weight,
    0
  );

  const estimatedById = new Map();
  for (const item of weightedPositions) {
    estimatedById.set(
      item.position.id,
      totalWeight > 0
        ? accountDifference * item.weight / totalWeight
        : null
    );
  }

  const estimatedPositions = positions.map(position => {
    const isEstimated = position.swap === null ||
      position.swap === undefined;
    const currentSwap = isEstimated
      ? estimatedById.get(position.id) ?? null
      : position.swap;
    const elapsedDays = getFxCalendarDayDifference(
      position.openDate,
      estimateDate
    );
    const baseDays = getFxCalendarDayDifference(
      position.openDate,
      baseDate
    );
    let targetSwap = null;

    if (currentSwap !== null && elapsedDays !== null && baseDays !== null) {
      if (elapsedDays < 0) {
        targetSwap = 0;
      } else if (baseDays <= 0) {
        targetSwap = currentSwap;
      } else {
        targetSwap = currentSwap * elapsedDays / baseDays;
      }
    }

    const endDate = position.status === "決済済" &&
      isValidFxPositionAsOfDate(position.closeDate)
        ? position.closeDate
        : baseDate;
    return {
      positionId:position.id,
      pair:position.pair,
      side:position.side,
      status:position.status,
      quantity:position.quantity,
      openDate:position.openDate,
      closeDate:position.closeDate ?? null,
      holdingDays:Math.max(
        0,
        getFxCalendarDayDifference(position.openDate,endDate) ?? 0
      ),
      isEstimated,
      currentSwap,
      targetSwap
    };
  });

  const totalAtDate = estimatedPositions.every(item =>
    item.targetSwap !== null && Number.isFinite(item.targetSwap)
  )
    ? estimatedPositions.reduce((sum,item) => sum + item.targetSwap,0)
    : null;

  return {
    status:"計算済",
    accountId,
    accountName:account.name,
    baseDate,
    targetDate:estimateDate,
    accountTotal:latestSnapshot.swapTotal,
    positionInputTotal:knownSwapTotal,
    accountDifference,
    estimatedPositionTotal:estimatedPositions.every(item =>
      item.currentSwap !== null && Number.isFinite(item.currentSwap)
    )
      ? estimatedPositions.reduce((sum,item) => sum + item.currentSwap,0)
      : null,
    unallocatedDifference:missingPositions.length > 0 && totalWeight <= 0
      ? accountDifference
      : 0,
    positions:estimatedPositions,
    totalAtDate
  };
}
