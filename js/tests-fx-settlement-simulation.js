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
