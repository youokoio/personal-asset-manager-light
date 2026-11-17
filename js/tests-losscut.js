"use strict";

function registerLosscutTests(context) {
  const {assert,runTest,makeAccount,makeSnapshot} = context;

  function makeLossCutData(options = {}) {
    const account = makeAccount(
      options.accountId || "fx-losscut",
      options.accountName || "架空FX口座",
      "fx",
      "fx"
    );
    account.marginRatePct = options.marginRatePct === undefined
      ? 4
      : options.marginRatePct;
    account.lossCutRatio = options.lossCutRatio === undefined
      ? 100
      : options.lossCutRatio;
    const snapshot = makeSnapshot(
      "loss-cut-snapshot",
      account.id,
      options.snapshotDate || "2026-11-17",
      "2026-11-17T00:00:00.000Z",
      options.effectiveEquity === undefined ? 1000000 : options.effectiveEquity,
      {requiredMargin:options.requiredMargin === undefined
        ? null
        : options.requiredMargin}
    );
    return {
      accounts:[account],
      snapshots:options.snapshots || [snapshot],
      fxPositions:options.positions || [{
        id:"loss-cut-position",
        accountId:account.id,
        pair:"USD/JPY",
        side:"買",
        quantity:100000,
        openRate:150,
        swap:0,
        status:"保有中"
      }],
      fxRates:options.rates || [{
        id:"loss-cut-rate",
        accountId:account.id,
        pair:"USD/JPY",
        rate:150,
        asOfDate:"2026-11-17"
      }],
      fxSwapLedger:[],
      settings:{targetRatio:options.targetRatio === undefined
        ? 150
        : options.targetRatio}
    };
  }

  function assertNear(actual,expected,tolerance,message) {
    assert(Number.isFinite(actual) &&
      Math.abs(actual - expected) <= tolerance,
      message + "（実際=" + actual + "、期待=" + expected + "）");
  }

  runTest("S6② 1：基本の維持率・余裕額・不足額",() => {
    const data = makeLossCutData();
    const result = calculateFxLossCut(data,"fx-losscut");
    assert(result.canCalculate,"基本条件で計算できる必要があります。");
    assert(result.metrics.requiredMargin === 600000,
      "必要証拠金は600,000円である必要があります。");
    assertNear(result.metrics.maintenanceRatio,166.6666666667,0.000001,
      "維持率は166.67%である必要があります。");
    assert(result.metrics.isLossCut === false,"ロスカット判定なしが必要です。");
    assert(result.metrics.headroom === 400000,"余裕額は400,000円である必要があります。");
    assert(result.metrics.targetShortfall === -100000,
      "150%基準の不足額は−100,000円である必要があります。");
    assert(result.metrics.lossCutShortfall === -400000,
      "100%基準の不足額は−400,000円である必要があります。");
  });

  runTest("S6② 2：シナリオレート140",() => {
    const result = calculateFxLossCut(
      makeLossCutData(),
      "fx-losscut",
      {scenarioRates:{"USD/JPY":140}}
    );
    assert(result.metrics.scenarioProfit === -1000000,
      "シナリオ評価損益は−1,000,000円である必要があります。");
    assert(result.metrics.effectiveEquity === 0,
      "シナリオ有効証拠金は0円である必要があります。");
    assert(result.metrics.requiredMargin === 560000,
      "必要証拠金は560,000円である必要があります。");
    assert(result.metrics.maintenanceRatio === 0 &&
      result.metrics.isLossCut === true,
      "維持率0%・ロスカット判定ありが必要です。");
    assert(result.metrics.headroom === -560000 &&
      result.metrics.lossCutShortfall === 560000 &&
      result.metrics.targetShortfall === 840000,
      "余裕額・不足額が仕様値と一致する必要があります。");
  });

  runTest("S6② 3：単一ペアのロスカットレートと出力d",() => {
    const result = calculateFxLossCut(makeLossCutData(),"fx-losscut");
    const root = result.pairRates[0].roots.find(item => item.direction === "下落");
    assert(root && root.status === "算出","下落方向のレートを算出する必要があります。");
    assertNear(root.rate,145.8333333333,0.0001,"ロスカットレートが一致する必要があります。");
    assertNear(result.lossCutAtDetail.exchangeProfit,-416666.6667,0.01,
      "ロスカット時点の評価損益が一致する必要があります。");
    assertNear(result.lossCutAtDetail.effectiveEquity,583333.3333,0.01,
      "ロスカット時点の有効証拠金が一致する必要があります。");
  });

  runTest("S6② 4：複数建玉と集計単位の計算一致",() => {
    const positions = [
      {id:"p1",accountId:"fx-losscut",pair:"USD/JPY",side:"買",quantity:100000,openRate:150,status:"保有中"},
      {id:"p2",accountId:"fx-losscut",pair:"USD/JPY",side:"買",quantity:100000,openRate:152,status:"保有中"}
    ];
    const data = makeLossCutData({
      effectiveEquity:3000000,
      positions,
      rates:[{accountId:"fx-losscut",pair:"USD/JPY",rate:155,asOfDate:"2026-11-17"}]
    });
    const separate = calculateFxLossCut(data,"fx-losscut");
    const groupedData = makeLossCutData({
      effectiveEquity:3000000,
      positions:[{id:"group",accountId:"fx-losscut",pair:"USD/JPY",side:"買",quantity:200000,openRate:151,status:"保有中"}],
      rates:[{accountId:"fx-losscut",pair:"USD/JPY",rate:155,asOfDate:"2026-11-17"}]
    });
    const grouped = calculateFxLossCut(groupedData,"fx-losscut");
    assert(separate.metrics.requiredMargin === 1240000 &&
      grouped.metrics.requiredMargin === 1240000,
      "必要証拠金は両方式で1,240,000円である必要があります。");
    assertNear(separate.metrics.maintenanceRatio,241.935483871,0.000001,
      "維持率は241.94%である必要があります。");
    assertNear(separate.pairRates[0].roots[0].rate,145.8333333333,0.0001,
      "複数建玉のロスカットレートが一致する必要があります。");
    assertNear(separate.pairRates[0].roots[0].rate,
      grouped.pairRates[0].roots[0].rate,0.0000001,
      "建玉ごとの計算と集計単位の計算が一致する必要があります。");
  });

  runTest("S6② 5：全ペア一律シナリオとx逆算",() => {
    const data = makeLossCutData();
    const scenario = calculateFxLossCut(data,"fx-losscut",{
      uniformChangePct:-10
    });
    assert(scenario.uniformScenario.scenarioProfit === -1500000 &&
      scenario.uniformScenario.effectiveEquity === -500000 &&
      scenario.uniformScenario.requiredMargin === 540000,
      "−10%シナリオの評価損益・有効証拠金・必要証拠金が一致する必要があります。");
    assertNear(scenario.uniformScenario.maintenanceRatio,-92.59259259,0.000001,
      "−10%シナリオの維持率が一致する必要があります。");
    assertNear(scenario.uniformRoots.down.percent,-2.7777777778,0.0001,
      "一律変動率の逆算が−2.7778%である必要があります。");
  });

  runTest("S6② 6：2通貨ペアの個別・一律逆算",() => {
    const data = makeLossCutData({
      effectiveEquity:1500000,
      positions:[
        {id:"usd",accountId:"fx-losscut",pair:"USD/JPY",side:"買",quantity:100000,openRate:150,status:"保有中"},
        {id:"eur",accountId:"fx-losscut",pair:"EUR/JPY",side:"買",quantity:50000,openRate:160,status:"保有中"}
      ],
      rates:[
        {accountId:"fx-losscut",pair:"USD/JPY",rate:150,asOfDate:"2026-11-17"},
        {accountId:"fx-losscut",pair:"EUR/JPY",rate:160,asOfDate:"2026-11-17"}
      ]
    });
    const result = calculateFxLossCut(data,"fx-losscut");
    assert(result.metrics.requiredMargin === 920000,
      "必要証拠金は920,000円である必要があります。");
    assertNear(result.metrics.maintenanceRatio,163.04347826,0.000001,
      "維持率は163.04%である必要があります。");
    const usd = result.pairRates.find(item => item.pair === "USD/JPY").roots[0];
    const eur = result.pairRates.find(item => item.pair === "EUR/JPY").roots[0];
    assertNear(usd.rate,143.9583333333,0.0001,"USD/JPYの逆算値が一致する必要があります。");
    assertNear(eur.rate,147.9166666667,0.0001,"EUR/JPYの逆算値が一致する必要があります。");
    assertNear(result.uniformRoots.down.percent,-2.6268115942,0.0001,
      "全ペア一律の逆算値が一致する必要があります。");
  });

  runTest("S6② 7：売り建玉は上昇方向のみ",() => {
    const data = makeLossCutData({
      positions:[{id:"sell",accountId:"fx-losscut",pair:"USD/JPY",side:"売",quantity:100000,openRate:150,status:"保有中"}]
    });
    const result = calculateFxLossCut(data,"fx-losscut");
    const roots = result.pairRates[0].roots;
    assert(roots.length === 1 && roots[0].direction === "上昇",
      "売りだけの場合は上昇方向だけを探索する必要があります。");
    assertNear(roots[0].rate,153.8461538462,0.0001,
      "売り建玉のロスカットレートが一致する必要があります。");
  });

  runTest("S6② 8：requiredMarginの補正係数",() => {
    const data = makeLossCutData({requiredMargin:660000});
    const result = calculateFxLossCut(data,"fx-losscut",{
      scenarioRates:{"USD/JPY":148}
    });
    assertNear(result.correctionFactor,1.1,0.0000001,
      "補正係数は1.1である必要があります。");
    assert(result.correctionDate === "2026-11-17",
      "補正実績の対象日を返す必要があります。");
    assert(result.metrics.requiredMargin === 651200,
      "補正後必要証拠金は651,200円である必要があります。");
    assertNear(result.metrics.maintenanceRatio,122.85012285,0.000001,
      "補正後維持率が一致する必要があります。");
    const root = result.pairRates[0].roots[0];
    assertNear(root.rate,146.4435146444,0.0001,
      "補正後ロスカットレートが一致する必要があります。");
  });

  runTest("S6② 9：現在すでにロスカット水準",() => {
    const result = calculateFxLossCut(
      makeLossCutData({effectiveEquity:500000}),
      "fx-losscut"
    );
    assertNear(result.metrics.maintenanceRatio,83.3333333333,0.000001,
      "現在維持率は83.33%である必要があります。");
    assert(result.metrics.isLossCut === true,
      "現在ロスカット判定ありである必要があります。");
    assert(result.pairRates[0].roots[0].status === "現在すでにロスカット水準",
      "逆算結果は現在すでにロスカット水準である必要があります。");
  });

  runTest("S6② 10：到達しない場合は該当なし",() => {
    const result = calculateFxLossCut(
      makeLossCutData({effectiveEquity:20000000}),
      "fx-losscut"
    );
    assert(result.pairRates[0].roots[0].status === "該当なし",
      "探索範囲内で到達しない場合は該当なしである必要があります。");
  });

  runTest("S6② 11：不足項目・建玉なし",() => {
    const missingRate = makeLossCutData({
      rates:[{accountId:"fx-losscut",pair:"USD/JPY",rate:null,asOfDate:null}]
    });
    const rateResult = calculateFxLossCut(missingRate,"fx-losscut");
    assert(!rateResult.canCalculate && rateResult.metrics === null &&
      rateResult.missing.includes("評価レート（USD/JPY）"),
      "評価レート未入力時に値を出さず、不足項目を返す必要があります。");

    const noPositions = makeLossCutData({positions:[]});
    const noPositionResult = calculateFxLossCut(noPositions,"fx-losscut");
    assert(!noPositionResult.canCalculate &&
      noPositionResult.missing.includes("保有中の建玉"),
      "建玉なしでは算出不可とする必要があります。");

    const noLossCutRatio = makeLossCutData();
    noLossCutRatio.accounts[0].lossCutRatio = null;
    const ratioResult = calculateFxLossCut(noLossCutRatio,"fx-losscut");
    assert(!ratioResult.canCalculate &&
      ratioResult.missing.includes("ロスカット維持率"),
      "ロスカット維持率未設定時に不足項目を返す必要があります。");

    const noMarginRate = makeLossCutData();
    noMarginRate.accounts[0].marginRatePct = null;
    const marginResult = calculateFxLossCut(noMarginRate,"fx-losscut");
    assert(!marginResult.canCalculate &&
      marginResult.missing.includes("必要証拠金率"),
      "必要証拠金率未設定時に不足項目を返す必要があります。");

    const noEquity = makeLossCutData();
    noEquity.snapshots[0].value = null;
    const equityResult = calculateFxLossCut(noEquity,"fx-losscut");
    assert(!equityResult.canCalculate &&
      equityResult.missing.includes("有効証拠金"),
      "有効証拠金未入力時に不足項目を返す必要があります。");
  });

  runTest("S6② 12：円建て以外を警告して除外",() => {
    const data = makeLossCutData({
      positions:[
        {id:"yen",accountId:"fx-losscut",pair:"USD/JPY",side:"買",quantity:100000,openRate:150,status:"保有中"},
        {id:"non-yen",accountId:"fx-losscut",pair:"EUR/USD",side:"買",quantity:100000,openRate:1.1,status:"保有中"}
      ]
    });
    const result = calculateFxLossCut(data,"fx-losscut");
    assert(result.canCalculate && result.positions.length === 1 &&
      result.excludedPositionCount === 1,
      "円建て以外の建玉は計算対象から除外する必要があります。");
    assert(result.warnings.some(item => item.includes("EUR/USD")),
      "除外した通貨ペアの警告が必要です。");
  });


  runTest("S6② 14：買い・売り混在は両方向を探索",() => {
    const data = makeLossCutData({
      effectiveEquity:2000000,
      positions:[
        {id:"buy",accountId:"fx-losscut",pair:"USD/JPY",side:"買",quantity:100000,openRate:150,status:"保有中"},
        {id:"sell",accountId:"fx-losscut",pair:"USD/JPY",side:"売",quantity:100000,openRate:150,status:"保有中"}
      ]
    });
    const result = calculateFxLossCut(data,"fx-losscut");
    const roots = result.pairRates[0].roots;
    assert(roots.length === 2 &&
      roots.some(item => item.direction === "下落" && item.status === "該当なし") &&
      roots.some(item => item.direction === "上昇" && item.status === "算出"),
      "買い・売り混在では両方向を探索し、該当しない方向も表示する必要があります。");
    const upward = roots.find(item => item.direction === "上昇");
    assertNear(upward.rate,250,0.0001,
      "上昇方向のロスカットレートは250である必要があります。");
  });

  runTest("S6② 15：日付不一致と補正なし",() => {
    const data = makeLossCutData({
      rates:[{accountId:"fx-losscut",pair:"USD/JPY",rate:150,asOfDate:"2026-11-16"}]
    });
    data.settings = {};
    const result = calculateFxLossCut(data,"fx-losscut");
    assert(result.targetRatio === 150,
      "目安維持率が未設定なら150%を使う必要があります。");
    assert(result.correctionFactor === 1 && result.correctionDate === null,
      "実績がなければ補正係数1・補正なしである必要があります。");
    assert(result.warnings.some(item => item.includes("日付が違います")),
      "有効証拠金と評価レートの日付不一致を警告する必要があります。");
  });

  runTest("S6② 13：計算関数は入力データを変更しない",() => {
    const data = makeLossCutData({requiredMargin:660000});
    const before = JSON.stringify(data);
    calculateFxLossCut(data,"fx-losscut",{
      scenarioRates:{"USD/JPY":140},
      uniformChangePct:-10
    });
    assert(JSON.stringify(data) === before,
      "計算前後で入力データが変わってはいけません。");
  });

  runTest("S6② 画面：4口座のロスカット計算カード描画",() => {
    const hasLexicalAppData = typeof appData !== "undefined";
    const originalAppData = hasLexicalAppData ? appData : globalThis.appData;
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "appData"
    );

    const fixtures = [
      makeLossCutData({
        accountId:"fx-render-normal",
        accountName:"架空口座A"
      }),
      makeLossCutData({
        accountId:"fx-render-no-rate",
        accountName:"架空口座B",
        rates:[{
          accountId:"fx-render-no-rate",
          pair:"USD/JPY",
          rate:null,
          asOfDate:null
        }]
      }),
      makeLossCutData({
        accountId:"fx-render-no-position",
        accountName:"架空口座C",
        positions:[],
        rates:[]
      }),
      makeLossCutData({
        accountId:"fx-render-no-history",
        accountName:"架空口座D",
        snapshots:[],
        requiredMargin:null
      })
    ];

    try {
      for (const fixture of fixtures) {
        if (hasLexicalAppData) appData = fixture;
        else globalThis.appData = fixture;

        const account = fixture.accounts[0];
        const card = renderFxLossCutCard(account.id);

        assert(card && card.tagName === "SECTION",
          account.name + "のロスカット計算カードが描画されていません。");
        assert(card.textContent.trim().length > 0,
          account.name + "のカード本文が空です。");
        assert(card.textContent.includes(account.name),
          account.name + "の口座名が表示されていません。");
        assert(card.textContent.includes("ロスカット計算"),
          account.name + "の見出しが表示されていません。");
      }
    } finally {
      if (hasLexicalAppData) appData = originalAppData;
      else if (originalDescriptor) {
        Object.defineProperty(globalThis,"appData",originalDescriptor);
      } else {
        Reflect.deleteProperty(globalThis,"appData");
      }
    }
  });
}

const registerFxTestsBeforeLossCut = registerFxTests;

registerFxTests = function(context) {
  registerFxTestsBeforeLossCut(context);
  registerLosscutTests(context);
};