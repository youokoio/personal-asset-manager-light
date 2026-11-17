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

  runTest("S6② 画面：4口座×3種類のデータでロスカットブロック描画",() => {
    const accounts = [
      {id:"fx-render-light",name:"LIGHT FX",marginRatePct:4,lossCutRatio:100},
      {id:"fx-render-central",name:"セントラル短資FX",marginRatePct:5,lossCutRatio:100},
      {id:"fx-render-click",name:"クリック365",marginRatePct:4,lossCutRatio:50},
      {id:"fx-render-lion",name:"LION FX",marginRatePct:4,lossCutRatio:100}
    ];
    const cases = [
      {
        label:"通常データ",
        build:account => makeLossCutData({
          accountId:account.id,
          accountName:account.name,
          marginRatePct:account.marginRatePct,
          lossCutRatio:account.lossCutRatio
        })
      },
      {
        label:"初期データ（建玉なし）",
        build:account => makeLossCutData({
          accountId:account.id,
          accountName:account.name,
          marginRatePct:account.marginRatePct,
          lossCutRatio:account.lossCutRatio,
          positions:[],
          rates:[],
          snapshots:[]
        })
      },
      {
        label:"欠けの多いデータ",
        build:account => makeLossCutData({
          accountId:account.id,
          accountName:account.name,
          marginRatePct:null,
          lossCutRatio:null,
          positions:[{
            id:"position-" + account.id,
            accountId:account.id,
            pair:"USD/JPY",
            side:"買",
            quantity:100000,
            openRate:150,
            swap:null,
            status:"保有中"
          }],
          rates:[{
            id:"rate-" + account.id,
            accountId:account.id,
            pair:"USD/JPY",
            rate:null,
            asOfDate:null
          }],
          snapshots:[]
        })
      }
    ];

    for (const account of accounts) {
      for (const testCase of cases) {
        const fixture = testCase.build(account);
        const before = JSON.stringify(fixture);
        const block = renderFxLossCutBlock(fixture,account.id);
        const label = account.name + "・" + testCase.label;

        assert(block && block.tagName === "SECTION",
          label + "のロスカットブロックが描画されていません。");
        assert(block.textContent.trim().length > 0,
          label + "のブロック本文が空です。");
        assert(block.textContent.includes("ロスカット値"),
          label + "の見出しが表示されていません。");
        assert(block.textContent.includes("目安"),
          label + "の目安表示がありません。");
        assert(block.querySelector("details"),
          label + "の折りたたみ詳細がありません。");

        if (testCase.label === "初期データ（建玉なし）") {
          assert(block.textContent.includes("建玉なし"),
            label + "で「建玉なし」が表示されていません。");
          assert(block.textContent.includes("算出不可"),
            label + "で維持率を推測せず算出不可とする必要があります。");
        }

        if (testCase.label === "欠けの多いデータ") {
          assert(block.textContent.includes("評価レート（USD/JPY）") &&
            block.textContent.includes("必要証拠金率") &&
            block.textContent.includes("ロスカット維持率") &&
            block.textContent.includes("有効証拠金"),
            label + "で不足項目をすべて表示する必要があります。");
          assert(!block.textContent.includes("¥0"),
            label + "で未入力値を0円として表示してはいけません。");
        }

        assert(JSON.stringify(fixture) === before,
          label + "の描画で元データが変更されています。");
      }
    }
  });

  runTest("S6② 画面：シナリオ入力で結果を再計算",() => {
    const data = makeLossCutData();
    const before = JSON.stringify(data);
    const block = renderFxLossCutBlock(data,"fx-losscut");
    const inputs = block.querySelectorAll(".fx-losscut-input");

    assert(inputs.length === 3,
      "有効証拠金・通貨ペアレート・一律変動率の3入力が必要です。");

    const resultArea = block.querySelector(".fx-losscut-detail-results");
    assert(resultArea && resultArea.textContent.includes("シナリオ結果"),
      "初期シナリオ結果が表示されていません。");

    inputs[0].value = "900000";
    inputs[0].dispatchEvent(new Event("input",{bubbles:true}));

    assert(resultArea.textContent.includes("シナリオ結果"),
      "入力変更後のシナリオ結果が表示されていません。");
    assert(JSON.stringify(data) === before,
      "シナリオ入力で元データが変更されてはいけません。");
  });

  runTest("S5g：通貨ペア別・保有中・決済済の区分表示",() => {
    const previousData = appData;
    const account = makeAccount(
      "fx-s5g-test",
      "架空S5gテスト口座",
      "fx",
      "fx"
    );
    const fixture = makeLossCutData({
      accountId:account.id,
      accountName:account.name,
      positions:[
        {
          id:"s5g-open-1",
          accountId:account.id,
          pair:"USD/JPY",
          side:"買",
          quantity:100000,
          openRate:150,
          swap:1000,
          openDate:"2026-10-01",
          asOfDate:"2026-11-17",
          status:"保有中"
        },
        {
          id:"s5g-open-2",
          accountId:account.id,
          pair:"USD/JPY",
          side:"買",
          quantity:50000,
          openRate:152,
          swap:500,
          openDate:"2026-10-10",
          asOfDate:"2026-11-17",
          status:"保有中"
        },
        {
          id:"s5g-closed-1",
          accountId:account.id,
          pair:"EUR/JPY",
          side:"売",
          quantity:30000,
          openRate:160,
          swap:200,
          openDate:"2026-09-01",
          closeDate:"2026-10-01",
          realizedPnl:12000,
          status:"決済済"
        }
      ],
      rates:[{
        id:"s5g-rate",
        accountId:account.id,
        pair:"USD/JPY",
        rate:155,
        asOfDate:"2026-11-17"
      }]
    });
    fixture.accounts = [account];
    fixture.fxSwapLedger = [];
    const before = JSON.stringify(fixture);

    try {
      appData = fixture;

      const pairSection = renderFxAccountPairSectionS5g(account);
      assert(pairSection.textContent.includes("USD/JPY"),
        "通貨ペア別にUSD/JPYを表示する必要があります。");
      assert(pairSection.textContent.includes("150.666667") ||
        pairSection.textContent.includes("150.666666"),
        "数量加重平均約定レートを表示する必要があります。");

      const openSection = renderFxAccountOpenPositionsS5g(account);
      assert(openSection.querySelectorAll("details.fx-account-position").length === 2,
        "保有中建玉を2件表示する必要があります。");
      assert(openSection.textContent.includes("USD/JPY"),
        "保有中建玉の通貨ペアを表示する必要があります。");

      const settledSection = renderFxAccountSettledPositionsS5g(account);
      assert(settledSection.textContent.includes("決済済建玉"),
        "決済済建玉の区分見出しが必要です。");
      assert(settledSection.textContent.includes("¥12,000") ||
        settledSection.textContent.includes("+¥12,000"),
        "決済損益を表示する必要があります。");

      assert(JSON.stringify(fixture) === before,
        "区分表示の描画で保存データを変更してはいけません。");
    } finally {
      appData = previousData;
    }
  });

}

const registerFxTestsBeforeLossCut = registerFxTests;

registerFxTests = function(context) {
  registerFxTestsBeforeLossCut(context);
  registerLosscutTests(context);
};