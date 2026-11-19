function registerFxSwapAllocationTests(context) {
  const {runTest,assert,makeAccount,makeSnapshot} = context;

  function makePosition(id,quantity,swap,openDate = "2026-09-01") {
    return {
      id,accountId:"fx-swap-test",pair:"TRY/JPY",side:"買",
      quantity,openDate,asOfDate:"2026-11-05",openRate:3.2,swap,
      status:"保有中",realizedPnl:null,closeDate:null,closeRate:null,
      createdAt:openDate + "T00:00:00.000Z",
      recordedAt:openDate + "T00:00:00.000Z",
      updatedAt:"2026-11-05T00:00:00.000Z"
    };
  }

  function makeData(positions = []) {
    return {
      accounts:[makeAccount("fx-swap-test","架空FX口座","fx","fx")],
      snapshots:[],fxPositions:positions,fxSwapLedger:[],fxRates:[],
      fxCashFlows:[],fxRealizedPnlBases:[]
    };
  }

  let sequence = 0;
  function build(data,total,date) {
    const preview = calculateFxSwapRegistrationPreview(
      data,"fx-swap-test","TRY/JPY","買",total,date
    );
    return buildFxSwapRegistrationData(data,preview,{
      idFactory:() => "swap-ledger-" + (++sequence),
      now:date + "T12:00:00.000Z"
    });
  }

  runTest("14-6-1 初回登録は基準額として保存",() => {
    const data = makeData([makePosition("L1",200000,1000)]);
    const next = build(data,3500,"2026-10-31");
    const ledger = next.fxSwapLedger[0];
    assert(ledger.status === "基準" && ledger.total === 3500 &&
      ledger.baseline === 3500 && ledger.increase === 0 &&
      ledger.allocations.length === 0,
      "初回登録は基準額3,500円・増加額0円・配分なしである必要があります。");
    assert(next.fxPositions[0].swap === 1000,
      "初回登録では建玉スワップを変更してはいけません。");
  });

  runTest("14-6-2 2回目登録は増加額を数量比例で配分",() => {
    let data = makeData([
      makePosition("L1",200000,1000,"2026-09-01"),
      makePosition("L2",200000,2000,"2026-09-02"),
      makePosition("L3",100000,500,"2026-09-03")
    ]);
    data = build(data,3500,"2026-10-31");
    const next = build(data,13500,"2026-11-05");
    const byId = Object.fromEntries(next.fxPositions.map(item => [item.id,item]));
    const ledger = next.fxSwapLedger[1];
    assert(ledger.baseline === 3500 && ledger.increase === 10000,
      "基準額3,500円、増加額10,000円である必要があります。");
    assert(byId.L1.swap === 5000 && byId.L2.swap === 6000 &&
      byId.L3.swap === 2500,
      "配分は4,000円・4,000円・2,000円である必要があります。");
    assert(ledger.allocations.reduce((sum,item) => sum + item.amount,0) === 10000,
      "配分合計は増加額10,000円と一致する必要があります。");
  });

  runTest("14-6-3 新規建玉を含めて次回増加額を配分",() => {
    let data = makeData([
      makePosition("L1",200000,1000,"2026-09-01"),
      makePosition("L2",200000,2000,"2026-09-02"),
      makePosition("L3",100000,500,"2026-09-03")
    ]);
    data = build(data,3500,"2026-10-31");
    data = build(data,13500,"2026-11-05");
    data.fxPositions.push(makePosition("L4",100000,0,"2026-11-06"));
    const next = build(data,18500,"2026-11-07");
    const byId = Object.fromEntries(next.fxPositions.map(item => [item.id,item]));
    assert(byId.L1.swap === 6667 && byId.L2.swap === 7667 &&
      byId.L3.swap === 3333 && byId.L4.swap === 833,
      "端数2円は数量の大きいL1・L2へ各1円配分し、既存スワップへ累積加算する必要があります。");
    assert(next.fxSwapLedger[2].allocations.reduce((sum,item) => sum + item.amount,0) === 5000,
      "今回増加額5,000円の配分合計が一致する必要があります。");
  });

  runTest("14-6-4 正負の増加額と端数配分",() => {
    const positions = [
      makePosition("L1",200000,0,"2026-09-01"),
      makePosition("L2",200000,0,"2026-09-02"),
      makePosition("L3",100000,0,"2026-09-03")
    ];
    const positive = allocateFxSwapIncrease(positions,10001);
    const negative = allocateFxSwapIncrease(positions,-10001);
    const p = Object.fromEntries(positive.allocations.map(item => [item.positionId,item.amount]));
    const n = Object.fromEntries(negative.allocations.map(item => [item.positionId,item.amount]));
    assert(p.L1 === 4001 && p.L2 === 4000 && p.L3 === 2000,
      "正の増加額10,001円は4,001円・4,000円・2,000円である必要があります。");
    assert(n.L1 === -4001 && n.L2 === -4000 && n.L3 === -2000,
      "負の増加額−10,001円は−4,001円・−4,000円・−2,000円である必要があります。");
  });

  runTest("14-6-5 決済調整を次回基準額へ反映",() => {
    let data = makeData([
      makePosition("L1",200000,1000,"2026-09-01"),
      makePosition("L2",200000,2000,"2026-09-02"),
      makePosition("L3",100000,500,"2026-09-03"),
    ]);
    data = build(data,3500,"2026-10-31");
    data = build(data,13500,"2026-11-05");
    data.fxPositions.push(makePosition("L4",100000,0,"2026-11-06"));
    data = build(data,18500,"2026-11-07");
    const settled = buildFxSettlementData(data,[{
      positionId:"L3",quantity:100000,realizedPnl:0,closeRate:3.2
    }],"2026-11-08",{
      idFactory:() => "L3-closed",now:"2026-11-08T12:00:00.000Z"
    });
    const next = build(settled,16167,"2026-11-09");
    const byId = Object.fromEntries(next.fxPositions.map(item => [item.id,item]));
    const registrations = next.fxSwapLedger.filter(item =>
      Object.prototype.hasOwnProperty.call(item,"total")
    );
    const latest = registrations[registrations.length - 1];
    assert(latest.baseline === 15167 && latest.increase === 1000,
      "18,500円−決済調整3,333円＝基準額15,167円、増加額1,000円である必要があります。");
    assert(byId.L1.swap === 7067 && byId.L2.swap === 8067 &&
      byId.L4.swap === 1033,
      "残存建玉へ400円・400円・200円を加算する必要があります。");
  });

  runTest("14-6-6 手動修正差額は警告し自動補正しない",() => {
    let data = makeData([
      makePosition("L1",200000,1000,"2026-09-01"),
      makePosition("L2",200000,2000,"2026-09-02"),
      makePosition("L3",100000,500,"2026-09-03"),
    ]);
    data = build(data,3500,"2026-10-31");
    data = build(data,13500,"2026-11-05");
    data.fxPositions.push(makePosition("L4",100000,0,"2026-11-06"));
    data = build(data,18500,"2026-11-07");
    data = buildFxSettlementData(data,[{
      positionId:"L3",quantity:100000,realizedPnl:0,closeRate:3.2
    }],"2026-11-08",{
      idFactory:() => "L3-closed",now:"2026-11-08T12:00:00.000Z"
    });
    data = build(data,16167,"2026-11-09");
    data.fxPositions.find(item => item.id === "L2").swap = 8167;
    const before = calculateFxSwapGroupReconciliation(data,"fx-swap-test","TRY/JPY","買");
    assert(before.warning && before.difference === 100,
      "手動修正後は100円の照合警告が必要です。");
    const next = build(data,17167,"2026-11-10");
    const byId = Object.fromEntries(next.fxPositions.map(item => [item.id,item]));
    const after = calculateFxSwapGroupReconciliation(next,"fx-swap-test","TRY/JPY","買");
    assert(byId.L1.swap === 7467 && byId.L2.swap === 8567 &&
      byId.L4.swap === 1233,
      "今回増加額1,000円を400円・400円・200円加算する必要があります。");
    assert(after.warning && after.difference === 100,
      "既存の100円差は自動補正されず警告として残る必要があります。");
  });

  runTest("14-6-7 一部決済のスワップ調整",() => {
    const data = makeData([makePosition("L1",200000,7467)]);
    const result = buildFxSettlementData(data,[{
      positionId:"L1",quantity:50000,realizedPnl:0,closeRate:3.2
    }],"2026-11-10",{
      idFactory:() => "L1-partial",now:"2026-11-10T12:00:00.000Z"
    });
    const remaining = result.fxPositions.find(item => item.id === "L1");
    const adjustment = result.fxSwapLedger[0];
    assert(remaining.quantity === 150000 && remaining.swap === 5601,
      "残存数量150,000・スワップ5,601円である必要があります。");
    assert(adjustment.reason === "決済" && adjustment.amount === -1866,
      "決済調整は−1,866円である必要があります。");
    assert(splitFxPositionSwap(7467,50000,200000).settledSwap === 1866,
      "7,467×50,000÷200,000＝1,866.75円を切り捨てる必要があります。");
  });

  runTest("14-6-8 配分不能状態を保存",() => {
    let empty = makeData([]);
    empty = build(empty,0,"2026-10-31");
    const noPositions = calculateFxSwapRegistrationPreview(
      empty,"fx-swap-test","TRY/JPY","買",100,"2026-11-05"
    );
    assert(noPositions.status === "未配分" &&
      noPositions.reason === "配分対象なし",
      "配分対象がない場合は未配分・配分対象なしである必要があります。");
    const savedEmpty = build(empty,100,"2026-11-05");
    assert(savedEmpty.fxSwapLedger[1].status === "未配分" &&
      savedEmpty.fxSwapLedger[1].reason === "配分対象なし" &&
      savedEmpty.fxSwapLedger[1].total === 100,
      "配分対象がない場合も累計額100円を未配分として保存する必要があります。");

    let nullSwap = makeData([makePosition("L-null",100000,null)]);
    nullSwap = build(nullSwap,0,"2026-10-31");
    const missing = calculateFxSwapRegistrationPreview(
      nullSwap,"fx-swap-test","TRY/JPY","買",100,"2026-11-05"
    );
    assert(missing.status === "未配分" &&
      missing.reason === "建玉スワップ未入力",
      "建玉スワップ未入力なら未配分にする必要があります。");
    const next = build(nullSwap,100,"2026-11-05");
    assert(next.fxSwapLedger[1].status === "未配分" &&
      next.fxSwapLedger[1].reason === "建玉スワップ未入力" &&
      next.fxSwapLedger[1].total === 100,
      "未配分でも今回の累計額を登録し、次回基準にする必要があります。");
  });

  runTest("14-6-9 過去日付の登録を拒否",() => {
    let data = makeData([makePosition("L1",100000,0)]);
    data = build(data,100,"2026-11-05");
    let failed = false;
    try {
      calculateFxSwapRegistrationPreview(
        data,"fx-swap-test","TRY/JPY","買",200,"2026-11-04"
      );
    } catch (error) {
      failed = true;
    }
    assert(failed,"前回登録日より前の日付はエラーになる必要があります。");
    assert(data.fxSwapLedger.length === 1 && data.fxSwapLedger[0].total === 100,
      "エラー時に登録済みデータは変更されてはいけません。");
  });

  runTest("14-6-10 口座スワップと通貨ペア集計の照合",() => {
    let data = makeData([makePosition("L1",100000,17167)]);
    data = build(data,17167,"2026-11-05");
    data.snapshots.push(makeSnapshot(
      "fx-snapshot","fx-swap-test","2026-11-05",
      "2026-11-05T12:00:00.000Z",100000,{swapTotal:17267}
    ));
    const result = calculateFxSwapAccountReconciliation(data,"fx-swap-test");
    assert(result.warning && result.difference === 100,
      "口座スワップ17,267円−通貨ペア集計17,167円＝＋100円の警告が必要です。");
  });
}
