
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
      results.push({
        name,
        success:false,
        message:error.message
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
