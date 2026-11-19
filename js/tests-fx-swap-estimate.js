function registerFxSwapEstimateTests(context) {
  const {runTest,assert,makeAccount,makeSnapshot} = context;

  function makePosition(id,quantity,swap,openDate,options = {}) {
    return {
      id,
      accountId:"fx-estimate-test",
      pair:"TRY/JPY",
      side:"買",
      quantity,
      openDate,
      asOfDate:"2026-11-05",
      openRate:3.2,
      swap,
      status:options.status || "保有中",
      realizedPnl:options.realizedPnl ?? null,
      closeDate:options.closeDate ?? null,
      closeRate:options.closeRate ?? null,
      createdAt:openDate + "T00:00:00.000Z",
      recordedAt:openDate + "T00:00:00.000Z",
      updatedAt:"2026-11-05T00:00:00.000Z"
    };
  }

  function makeData(positions,accountSwapTotal = 100000,baseDate = "2026-11-05") {
    const account = makeAccount(
      "fx-estimate-test",
      "架空FX口座",
      "fx",
      "fx"
    );
    const snapshot = makeSnapshot(
      "snapshot-estimate",
      account.id,
      baseDate,
      baseDate + "T12:00:00.000Z",
      0,
      {swapTotal:accountSwapTotal}
    );
    return {
      accounts:[account],
      snapshots:[snapshot],
      fxPositions:positions,
      fxSwapLedger:[],
      fxRates:[],
      fxCashFlows:[],
      fxRealizedPnlBases:[]
    };
  }

  runTest("S6a 口座との差額を数量×保有日数で未入力建玉へ配分",() => {
    const data = makeData([
      makePosition("known",100000,20000,"2026-09-01"),
      makePosition("missing-1",200000,null,"2026-09-06"),
      makePosition("missing-2",100000,null,"2026-10-06")
    ]);
    const result = calculateFxSwapEstimates(
      data,
      "fx-estimate-test",
      "2026-11-05"
    );
    const byId = Object.fromEntries(
      result.positions.map(item => [item.positionId,item])
    );
    assert(result.status === "計算済",
      "有効な口座スナップショットがあれば計算済みになる必要があります。");
    assert(result.accountTotal === 100000 &&
      result.positionInputTotal === 20000 &&
      result.accountDifference === 80000,
      "口座累計100,000円−入力済み20,000円＝差額80,000円である必要があります。");
    assert(byId["missing-1"].holdingDays === 60 &&
      byId["missing-2"].holdingDays === 30,
      "基準日までの保有日数はそれぞれ60日・30日である必要があります。");
    assert(byId["missing-1"].currentSwap === 64000 &&
      byId["missing-2"].currentSwap === 16000,
      "重み12,000,000対3,000,000により64,000円・16,000円を配分する必要があります。");
    assert(result.unallocatedDifference === 0 &&
      result.estimatedPositionTotal === 100000,
      "配分合計は口座累計スワップ100,000円と一致する必要があります。");
  });

  runTest("S6a 指定日への按分と約定日前ゼロ",() => {
    const data = makeData([
      makePosition("known",100000,20000,"2026-09-01"),
      makePosition("missing-1",200000,null,"2026-09-06"),
      makePosition("missing-2",100000,null,"2026-10-06")
    ]);
    const result = calculateFxSwapEstimates(
      data,
      "fx-estimate-test",
      "2026-10-06"
    );
    const byId = Object.fromEntries(
      result.positions.map(item => [item.positionId,item])
    );
    assert(byId["missing-1"].targetSwap === 32000,
      "64,000円×30日÷60日＝32,000円である必要があります。");
    assert(byId["missing-2"].targetSwap === 0,
      "約定日当日の推定スワップは0円である必要があります。");

    const beforeOpen = calculateFxSwapEstimates(
      data,
      "fx-estimate-test",
      "2026-09-05"
    );
    const beforeById = Object.fromEntries(
      beforeOpen.positions.map(item => [item.positionId,item])
    );
    assert(beforeById["missing-1"].targetSwap === 0 &&
      beforeById["missing-2"].targetSwap === 0,
      "約定日前の推定スワップは0円である必要があります。");
  });

  runTest("S6a 決済済み建玉の配分重みは決済日まで",() => {
    const data = makeData([
      makePosition(
        "settled",
        200000,
        null,
        "2026-09-06",
        {status:"決済済",closeDate:"2026-10-06",realizedPnl:500}
      ),
      makePosition("open",100000,null,"2026-10-06")
    ],9000);
    const result = calculateFxSwapEstimates(
      data,
      "fx-estimate-test",
      "2026-11-05"
    );
    const byId = Object.fromEntries(
      result.positions.map(item => [item.positionId,item])
    );
    assert(byId.settled.holdingDays === 30 &&
      byId.open.holdingDays === 30,
      "決済済みは約定日から決済日まで、保有中は基準日までの各30日を使う必要があります。");
    assert(byId.settled.currentSwap === 6000 &&
      byId.open.currentSwap === 3000,
      "重み6,000,000対3,000,000により6,000円・3,000円を配分する必要があります。");
  });

  runTest("S6a 配分対象がなければ差額を未配分として残す",() => {
    const data = makeData([
      makePosition("zero-days",100000,null,"2026-11-05")
    ],5000);
    const result = calculateFxSwapEstimates(
      data,
      "fx-estimate-test",
      "2026-11-05"
    );
    assert(result.accountDifference === 5000 &&
      result.unallocatedDifference === 5000,
      "配分重みが0なら口座との差額5,000円を未配分として残す必要があります。");
    assert(result.positions[0].currentSwap === null &&
      result.totalAtDate === null,
      "配分できない建玉の推定値はnullとし、推定合計を算出しない必要があります。");
  });

  runTest("S6a 未入力建玉がなければ口座との差額を再配分しない",() => {
    const data = makeData([
      makePosition("known",100000,20000,"2026-09-01")
    ],25000);
    const result = calculateFxSwapEstimates(
      data,
      "fx-estimate-test",
      "2026-11-05"
    );
    assert(result.accountDifference === 5000 &&
      result.unallocatedDifference === 0,
      "入力済み建玉だけの場合、差額5,000円を未配分差額として扱わない必要があります。");
    assert(result.positions[0].currentSwap === 20000 &&
      result.estimatedPositionTotal === 20000,
      "入力済み建玉スワップを変更せず、口座との差額を加算しない必要があります。");
  });

  runTest("S6a 不正な推定日は入力エラー",() => {
    const data = makeData([
      makePosition("known",100000,20000,"2026-09-01")
    ]);
    const result = calculateFxSwapEstimates(
      data,
      "fx-estimate-test",
      "2026-02-30"
    );
    assert(result.status === "入力エラー",
      "存在しない日付は入力エラーになる必要があります。");
  });
}
