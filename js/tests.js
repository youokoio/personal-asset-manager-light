"use strict";

function runAllTests() {
  const results = [];

  function assert(condition,message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function runTest(name,testFunction) {
    try {
      testFunction();
      results.push({name,success:true,message:"合格"});
    } catch (error) {
      let diagnostic = "";

      if (name === "S5a追補：建玉フォーム（新規）の描画" ||
          name === "S5a追補：建玉フォーム（編集）の保存値描画") {
        const descriptor = Object.getOwnPropertyDescriptor(
          globalThis,
          "appData"
        );
        const descriptorText = descriptor
          ? "configurable=" + descriptor.configurable +
            ", writable=" +
              ("writable" in descriptor ? descriptor.writable : "accessor") +
            ", valueType=" +
              ("value" in descriptor ? typeof descriptor.value : "accessor")
          : "なし";
        const runner = document.body &&
          document.body.dataset.testRunner === "true"
            ? "test.html"
            : "アプリ内";
        diagnostic = " / 診断：" + runner +
          "、typeof appData=" + typeof appData +
          "、typeof globalThis.appData=" + typeof globalThis.appData +
          "、globalThis.appData属性={" + descriptorText + "}";
      }

      results.push({
        name,
        success:false,
        message:(error && error.name ? error.name : "Error") + ": " +
          (error && error.message ? error.message : String(error)) +
          (error && error.stack ? "\n" + error.stack : "") + diagnostic
      });
    }
  }

  function makeAccount(id,name,type,category) {
    return {
      id,
      name,
      type,
      category,
      sortOrder:0,
      memo:"",
      lossCutRatio:null,
      marginRatePct:null,
      fieldLabels:{
        value:null,
        effectivePrincipal:null,
        pnl:null,
        swapTotal:null
      },
      autoCalc:null,
      createdAt:"2026-01-01T00:00:00.000Z",
      updatedAt:"2026-01-01T00:00:00.000Z"
    };
  }

  function makeSnapshot(
    id,accountId,asOfDate,recordedAt,value,extra = {}
  ) {
    return {
      id,
      accountId,
      asOfDate,
      recordedAt,
      value,
      cumulativeInvested:null,
      effectivePrincipal:null,
      pnl:null,
      realizedPnlTotal:null,
      memo:"",
      ...extra
    };
  }

  const context = {
    assert,
    runTest,
    makeAccount,
    makeSnapshot
  };

  registerMigrationTests(context);
  registerSummaryTests(context);
  registerInputTests(context);
  registerBulkTests(context);
  registerChartTests(context);
  registerHoldingsTests(context);
  registerFxTests(context);
  registerFxSettlementTests(context);
  registerFxSettlementSimulationTests(context);
  registerFxSwapAllocationTests(context);
  registerFxSwapEstimateTests(context);
  registerFxPositionBatchTests(context);

  return results;
}

function registerFxSettlementTests(context) {
  const {runTest,assert,makeAccount} = context;

  runTest("FX一部決済のスワップ按分",() => {
    const result = splitFxPositionSwap(7467,50000,200000);
    assert(result.settledSwap === 1866,
      "決済分のスワップは1,866円である必要があります。");
    assert(result.remainingSwap === 5601,
      "残りのスワップは5,601円である必要があります。");
  });

  runTest("FX一部決済の建玉分割と決済調整",() => {
    const account = makeAccount("fx-1","LIGHT FX","fx","fx");
    const position = {
      id:"L1",
      accountId:account.id,
      pair:"TRY/JPY",
      side:"買",
      quantity:200000,
      openDate:"2026-09-01",
      asOfDate:"2026-11-05",
      swap:7467,
      status:"保有中",
      realizedPnl:null,
      createdAt:"2026-09-01T00:00:00.000Z",
      recordedAt:"2026-09-01T00:00:00.000Z",
      updatedAt:"2026-11-05T00:00:00.000Z"
    };
    const data = {
      accounts:[account],
      fxPositions:[position],
      fxSwapLedger:[]
    };
    const next = buildFxSettlementData(
      data,
      [{
        positionId:"L1",
        quantity:50000,
        realizedPnl:1200,
        closeRate:3.25
      }],
      "2026-11-14",
      {
        idFactory:() => "L1-settled",
        now:"2026-11-14T00:00:00.000Z"
      }
    );
    const remaining = next.fxPositions.find(item => item.id === "L1");
    const settled = next.fxPositions.find(item =>
      item.id === "L1-settled"
    );
    assert(remaining.quantity === 150000 && remaining.swap === 5601,
      "保有中建玉は数量150,000・swap 5,601である必要があります。");
    assert(settled.quantity === 50000 && settled.swap === 1866,
      "決済済み建玉は数量50,000・swap 1,866である必要があります。");
    assert(settled.status === "決済済" &&
      settled.closeDate === "2026-11-14" &&
      settled.realizedPnl === 1200,
      "決済済み建玉に決済情報が保存される必要があります。");
    assert(next.fxSwapLedger.length === 1 &&
      next.fxSwapLedger[0].reason === "決済" &&
      next.fxSwapLedger[0].amount === -1866,
      "決済調整−1,866円が記録される必要があります。");
    assert(position.quantity === 200000 && position.swap === 7467 &&
      data.fxSwapLedger.length === 0,
      "元データは変更されてはいけません。");
  });

  runTest("FX累積確定損益の基準日",() => {
    const account = makeAccount("fx-2","LIGHT FX","fx","fx");
    account.realizedBaseAmount = 10000;
    account.realizedBaseDate = "2026-10-01";
    const data = {
      accounts:[account],
      fxPositions:[
        {
          accountId:account.id,
          status:"決済済",
          closeDate:"2026-10-02",
          realizedPnl:1200
        },
        {
          accountId:account.id,
          status:"決済済",
          closeDate:"2026-09-30",
          realizedPnl:500
        },
        {
          accountId:account.id,
          status:"保有中",
          closeDate:null,
          realizedPnl:null
        }
      ]
    };
    const result = calculateFxAccountRealizedPnl(data,account.id);
    assert(result.value === 11200,
      "基準額10,000円＋基準日後の確定損益1,200円＝11,200円である必要があります。");
    assert(result.settledCount === 1,
      "基準日後の決済済み建玉だけを集計する必要があります。");
  });

  runTest("FX累積確定損益グラフは基準日・決済日ごとに累計",() => {
    const account = makeAccount("fx-chart","架空FX口座","fx","fx");
    account.realizedBaseAmount = 10000;
    account.realizedBaseDate = "2026-10-01";
    const data = {
      accounts:[account],
      snapshots:[],
      fxPositions:[
        {
          accountId:account.id,
          status:"決済済",
          closeDate:"2026-10-02",
          realizedPnl:1200
        },
        {
          accountId:account.id,
          status:"決済済",
          closeDate:"2026-09-30",
          realizedPnl:500
        },
        {
          accountId:account.id,
          status:"保有中",
          closeDate:null,
          realizedPnl:null
        }
      ]
    };
    const result = createChartSeries(
      data,
      "account:" + account.id,
      "realizedPnlTotal"
    );
    assert(result.points.length === 2,
      "基準日と基準日後の決済日の2点が必要です。");
    assert(result.points[0].date === "2026-10-01" &&
      result.points[0].value === 10000,
      "基準日の累積確定損益は基準額10,000円である必要があります。");
    assert(result.points[1].date === "2026-10-02" &&
      result.points[1].value === 11200,
      "決済日後は基準額10,000円＋確定損益1,200円＝11,200円である必要があります。");
  });

  runTest("FX決済入力エラー時の元データ保護",() => {
    const account = makeAccount("fx-3","LIGHT FX","fx","fx");
    const position = {
      id:"L-invalid",
      accountId:account.id,
      pair:"TRY/JPY",
      side:"買",
      quantity:200000,
      openDate:"2026-09-01",
      swap:7467,
      status:"保有中"
    };
    const data = {
      accounts:[account],
      fxPositions:[position],
      fxSwapLedger:[]
    };
    let failed = false;
    try {
      buildFxSettlementData(
        data,
        [{
          positionId:"L-invalid",
          quantity:250000,
          realizedPnl:100
        }],
        "2026-11-14"
      );
    } catch (error) {
      failed = true;
    }
    assert(failed,"保有数量を超える決済はエラーになる必要があります。");
    assert(data.fxPositions.length === 1 &&
      data.fxPositions[0].quantity === 200000 &&
      data.fxPositions[0].swap === 7467 &&
      data.fxSwapLedger.length === 0,
      "エラー時に元データは変更されてはいけません。");
  });
}

function registerFxSettlementSimulationTests(context) {
  const {runTest,assert,makeAccount,makeSnapshot} = context;

  function makeSimulationData() {
    const account = makeAccount("S7-account","架空FX口座","fx","fx");
    account.marginRatePct = 4;
    account.lossCutRatio = 100;
    return {
      accounts:[account],
      snapshots:[
        makeSnapshot(
          "S7-snapshot",
          account.id,
          "2026-11-18",
          "2026-11-18T00:00:00.000Z",
          3000000,
          {requiredMargin:1240000}
        )
      ],
      fxPositions:[
        {
          id:"S7-A",accountId:account.id,pair:"USD/JPY",side:"買",
          quantity:100000,openDate:"2026-01-01",openRate:150,
          swap:10000,status:"保有中"
        },
        {
          id:"S7-B",accountId:account.id,pair:"USD/JPY",side:"買",
          quantity:100000,openDate:"2026-01-01",openRate:152,
          swap:5000,status:"保有中"
        }
      ],
      fxRates:[{
        accountId:account.id,pair:"USD/JPY",rate:155,asOfDate:"2026-11-18"
      }],
      fxSwapLedger:[],
      settings:{
        targetRatio:150,taxRatePct:20.315,fxYtdRealized:0,fxLossCarry:0
      }
    };
  }

  runTest("S7 6-4：決済損益・税金・決済後ロスカット・目安維持",() => {
    const data = makeSimulationData();
    const original = JSON.stringify(data);
    const before = calculateFxLossCut(data,"S7-account");
    const targetRate = before.lossCutAtDetails[0].rate;
    const result = calculateFxSettlementSimulation(
      data,"S7-account",["S7-A"],{"USD/JPY":155},{"S7-A":10000},
      {targetPair:"USD/JPY",targetRate}
    );

    assert(result.selectedCount === 1,
      "建玉Aだけが決済対象になる必要があります。");
    assert(result.settlementPnl === 510000,
      "(155−150)×100,000＋10,000＝510,000円である必要があります。");
    assert(result.estimatedTax === 103606,
      "510,000×20.315%＝103,606.5円を切り捨て、103,606円である必要があります。");
    assert(result.afterTaxProfit === 406394,
      "510,000−103,606＝406,394円である必要があります。");
    assert(
      Math.abs(result.beforeLossCut.metrics.requiredMargin - 1240000) < 0.01 &&
      Math.abs(result.beforeLossCut.metrics.maintenanceRatio - 241.93548387096774) < 0.000001,
      "決済前は必要証拠金1,240,000円・維持率241.94%である必要があります。"
    );
    assert(
      Math.abs(result.afterLossCut.metrics.requiredMargin - 620000) < 0.01 &&
      Math.abs(result.afterLossCut.metrics.maintenanceRatio - 483.8709677419355) < 0.000001,
      "決済後は必要証拠金620,000円・維持率483.87%である必要があります。"
    );
    assert(
      result.targetMaintenance.canCalculate &&
      Math.abs(result.targetMaintenance.requiredEffectiveEquity - 1500000) < 1 &&
      Math.abs(result.targetMaintenance.difference + 1500000) < 1,
      "目安ロスカットレート維持の必要額1,500,000円、差額−1,500,000円である必要があります。"
    );
    assert(
      result.afterEquity === 3000000 && result.deductTax === false,
      "初期状態では税金目安を差し引かず、有効証拠金3,000,000円を維持する必要があります。"
    );
    assert(JSON.stringify(data) === original,
      "シミュレーションで元データを変更してはいけません。");
  });

  runTest("S7 6-4：決済損益がマイナスなら税金目安0円",() => {
    const data = makeSimulationData();
    const result = calculateFxSettlementSimulation(
      data,"S7-account",["S7-A"],{"USD/JPY":145},{"S7-A":0}
    );
    assert(result.settlementPnl === -500000,
      "(145−150)×100,000＋0＝−500,000円である必要があります。");
    assert(result.estimatedTax === 0,
      "決済損益がマイナスのとき税金目安は0円である必要があります。");
  });

  runTest("S7 6-3：複数建玉選択・税金控除切替",() => {
    const data = makeSimulationData();
    const result = calculateFxSettlementSimulation(
      data,"S7-account",["S7-A","S7-B"],{"USD/JPY":155},
      {"S7-A":10000,"S7-B":5000},{deductTax:true}
    );
    assert(result.selectedCount === 2 && result.settlementPnl === 815000,
      "2建玉の決済損益は510,000＋305,000＝815,000円である必要があります。");
    assert(result.estimatedTax === 165567,
      "815,000×20.315%＝165,567.25円を切り捨て、165,567円である必要があります。");
    assert(result.afterEquity === 2834433,
      "税金目安控除後の有効証拠金は3,000,000−165,567＝2,834,433円である必要があります。");
  });
}

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

function registerFxPositionBatchTests(context) {
  const {runTest,assert,makeAccount} = context;

  function makePosition(
    id,pair = "TRY/JPY",side = "買",quantity = 100000,swap = 1000
  ) {
    return {
      id,
      accountId:"fx-batch-test",
      pair,
      side,
      openDate:"2026-10-01",
      asOfDate:"2026-11-05",
      quantity,
      openRate:3.2,
      swap,
      status:"保有中",
      closeDate:null,
      closeRate:null,
      realizedPnl:null,
      recordedAt:"2026-10-01T00:00:00.000Z",
      createdAt:"2026-10-01T00:00:00.000Z",
      updatedAt:"2026-11-05T00:00:00.000Z"
    };
  }

  function makeData(positions = [makePosition("L1")]) {
    return {
      accounts:[makeAccount("fx-batch-test","架空FX口座","fx","fx")],
      fxPositions:positions,
      fxRates:[],
      fxSwapLedger:[]
    };
  }

  function makeRow(position,overrides = {}) {
    return {
      id:position.id,
      _rowKey:"row-" + position.id,
      openDate:position.openDate,
      pair:position.pair,
      side:position.side,
      quantity:String(position.quantity),
      openRate:String(position.openRate),
      swap:position.swap === null ? "" : String(position.swap),
      ...overrides
    };
  }

  runTest("14-5 建玉一括編集の正常行検証",() => {
    const data = makeData();
    const result = validateFxPositionBatchRows(
      data,"fx-batch-test","TRY/JPY","買",
      [makeRow(data.fxPositions[0])]
    );
    assert(result.valid && result.errors.length === 0,
      "正しい建玉行はエラーなしで検証を通過する必要があります。");
  });

  runTest("14-5 建玉一括編集の入力エラー検出",() => {
    const data = makeData();
    const invalid = makeRow(data.fxPositions[0],{
      openDate:"2026-02-30",
      pair:"try/jpy",
      side:"保有",
      quantity:"0",
      openRate:"0",
      swap:"abc"
    });
    const result = validateFxPositionBatchRows(
      data,"fx-batch-test","TRY/JPY","買",[invalid]
    );
    const fields = new Set(result.errors.map(item => item.field));
    assert(!result.valid &&
      ["openDate","pair","side","quantity","openRate","swap"]
        .every(field => fields.has(field)),
      "約定日・通貨ペア・売買方向・数量・約定レート・スワップの各エラーを検出する必要があります。");
  });

  runTest("14-5 既存建玉の複数項目編集と手動スワップ修正",() => {
    const original = makePosition("L1");
    const data = makeData([original]);
    const next = buildFxPositionBatchData(
      data,"fx-batch-test","TRY/JPY","買",
      [makeRow(original,{
        openDate:"2026-10-02",
        quantity:"150000",
        openRate:"3.25",
        swap:"1250"
      })],[],{
        now:"2026-11-15T00:00:00.000Z",
        asOfDate:"2026-11-15",
        idFactory:() => "unused-id"
      }
    );
    const updated = next.fxPositions[0];
    assert(updated.openDate === "2026-10-02" &&
      updated.quantity === 150000 &&
      updated.openRate === 3.25 &&
      updated.swap === 1250,
      "編集した約定日・数量・約定レート・累計スワップを反映する必要があります。");
    assert(next.fxSwapLedger.length === 0,
      "累計スワップの手動修正だけでは調整を記録してはいけません。");
    assert(original.openDate === "2026-10-01" &&
      original.quantity === 100000 && original.swap === 1000,
      "変更前の元データを変更してはいけません。");
  });

  runTest("14-5 建玉の追加・削除とスワップ調整",() => {
    const first = makePosition("L1","TRY/JPY","買",100000,1000);
    const second = makePosition("L2","TRY/JPY","買",50000,700);
    const data = makeData([first,second]);
    const next = buildFxPositionBatchData(
      data,"fx-batch-test","TRY/JPY","買",
      [
        makeRow(first),
        {
          _rowKey:"new-row-1",
          openDate:"2026-11-10",
          pair:"USD/JPY",
          side:"買",
          quantity:"20000",
          openRate:"155.5",
          swap:"500"
        }
      ],["L2"],{
        now:"2026-11-15T00:00:00.000Z",
        asOfDate:"2026-11-15",
        idFactory:(() => {
          let index = 0;
          return () => "batch-id-" + (++index);
        })()
      }
    );
    const added = next.fxPositions.find(item => item.id === "batch-id-2");
    const deletedAdjustment = next.fxSwapLedger.find(item =>
      item.reason === "削除"
    );
    const addedAdjustment = next.fxSwapLedger.find(item =>
      item.reason === "追加"
    );
    assert(next.fxPositions.length === 2 &&
      !next.fxPositions.some(item => item.id === "L2") &&
      added && added.pair === "USD/JPY" && added.quantity === 20000,
      "削除した建玉を除き、新規建玉を1件追加する必要があります。");
    assert(deletedAdjustment && deletedAdjustment.amount === -700 &&
      deletedAdjustment.pair === "TRY/JPY" &&
      addedAdjustment && addedAdjustment.amount === 500 &&
      addedAdjustment.pair === "USD/JPY",
      "削除−700円、新規追加＋500円の調整を記録する必要があります。");
    assert(next.fxRates.some(item =>
      item.accountId === "fx-batch-test" &&
      item.pair === "USD/JPY" && item.rate === null
    ),"新しい通貨ペアの評価レートをnullで追加する必要があります。");
    assert(data.fxPositions.length === 2 && data.fxSwapLedger.length === 0,
      "追加・削除時も元データを変更してはいけません。");
  });

  runTest("14-5 通貨ペア・売買方向の移動調整",() => {
    const original = makePosition("L1","TRY/JPY","買",100000,900);
    const data = makeData([original]);
    const next = buildFxPositionBatchData(
      data,"fx-batch-test","TRY/JPY","買",
      [makeRow(original,{pair:"USD/JPY",side:"売"})],[],{
        now:"2026-11-15T00:00:00.000Z",
        asOfDate:"2026-11-15",
        idFactory:(() => {
          let index = 0;
          return () => "move-id-" + (++index);
        })()
      }
    );
    const oldAdjustment = next.fxSwapLedger.find(item =>
      item.pair === "TRY/JPY"
    );
    const newAdjustment = next.fxSwapLedger.find(item =>
      item.pair === "USD/JPY"
    );
    assert(next.fxPositions[0].pair === "USD/JPY" &&
      next.fxPositions[0].side === "売",
      "建玉の通貨ペア・売買方向を変更する必要があります。");
    assert(oldAdjustment && oldAdjustment.amount === -900 &&
      newAdjustment && newAdjustment.amount === 900 &&
      oldAdjustment.reason === "移動" &&
      newAdjustment.reason === "移動",
      "移動元−900円・移動先＋900円の調整を記録する必要があります。");
    assert(next.fxRates.some(item => item.pair === "USD/JPY"),
      "移動先の通貨ペアを評価レート一覧に追加する必要があります。");
  });

  runTest("14-5 一括保存の検証失敗時に元データを保護",() => {
    const original = makePosition("L1");
    const data = makeData([original]);
    let failed = false;
    try {
      buildFxPositionBatchData(
        data,"fx-batch-test","TRY/JPY","買",
        [makeRow(original,{quantity:"-1",swap:"2500"})],[],{
          idFactory:() => "must-not-be-used"
        }
      );
    } catch (error) {
      failed = true;
    }
    assert(failed,"不正な数量を含む一括編集は保存用データを作成せずエラーにする必要があります。");
    assert(data.fxPositions.length === 1 &&
      data.fxPositions[0].quantity === 100000 &&
      data.fxPositions[0].swap === 1000 &&
      data.fxSwapLedger.length === 0 &&
      data.fxRates.length === 0,
      "検証失敗時に元データを変更してはいけません。");
  });

  runTest("14-5 決済済みの読み取り専用行を変更しない",() => {
    const open = makePosition("L1");
    const settled = {
      ...makePosition("L2"),
      status:"決済済",
      closeDate:"2026-11-01",
      closeRate:3.3,
      realizedPnl:500
    };
    const data = makeData([open,settled]);
    const next = buildFxPositionBatchData(
      data,"fx-batch-test","TRY/JPY","買",
      [
        makeRow(open),
        {
          ...makeRow(settled),
          readOnly:true,
          quantity:"999999",
          swap:"999999"
        }
      ],[],{
        now:"2026-11-15T00:00:00.000Z",
        asOfDate:"2026-11-15",
        idFactory:() => "unused-id"
      }
    );
    const result = next.fxPositions.find(item => item.id === "L2");
    assert(result.quantity === 100000 && result.swap === 1000 &&
      result.status === "決済済" && result.realizedPnl === 500,
      "決済済みの読み取り専用行は変更せず保持する必要があります。");
  });
}

if (document.body && document.body.dataset.testRunner === "true") {
  const results = runAllTests();
  const resultsElement = document.getElementById("test-results");
  const summaryElement = document.getElementById("test-summary");

  for (const result of results) {
    const item = document.createElement("li");
    item.textContent = `${result.success ? "合格" : "不合格"}：${result.name} — ${result.message}`;
    resultsElement.appendChild(item);
  }

  const passed = results.filter(result => result.success).length;
  const failed = results.length - passed;
  summaryElement.textContent = `${passed}件合格 / ${failed}件不合格（全${results.length}件）`;
}