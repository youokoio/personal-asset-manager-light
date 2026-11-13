"use strict";

function registerFxTests(context) {
  const {assert,runTest,makeAccount} = context;

  function makePosition(
    id,accountId,pair,side,quantity,openRate,swap,
    status = "保有中"
  ) {
    return {
      id,
      accountId,
      pair,
      side,
      quantity,
      openRate,
      swap,
      status
    };
  }

  function makeRate(accountId,pair,rate,asOfDate = "2026-11-05") {
    return {
      id:"rate-" + accountId + "-" + pair,
      accountId,
      pair,
      rate,
      asOfDate
    };
  }

  function makeData(positions,rates = []) {
    const accounts = [
      makeAccount("fx-a","架空FX口座A","fx","fx"),
      makeAccount("fx-b","架空FX口座B","fx","fx")
    ];

    return {
      accounts,
      fxPositions:positions,
      fxRates:rates
    };
  }

  runTest("S5a：FX集計の数量・平均約定レート・評価損益",() => {
    const accountId = "fx-a";

    const data = makeData([
      makePosition(
        "position-a",
        accountId,
        "TRY/JPY",
        "買",
        200000,
        150,
        1000
      ),
      makePosition(
        "position-b",
        accountId,
        "TRY/JPY",
        "買",
        200000,
        151,
        2000
      ),
      makePosition(
        "position-c",
        accountId,
        "TRY/JPY",
        "買",
        100000,
        152,
        500
      )
    ],[
      makeRate(accountId,"TRY/JPY",153)
    ]);

    const rows = calculateFxAggregateRows(data);

    assert(rows.length === 1,
      "同じ口座・通貨ペア・売買方向が1集計にまとまっていません。");

    const result = rows[0];

    assert(result.quantity === 500000,
      "建玉数量の合計が500,000通貨ではありません。");
    assert(result.positionCount === 3,
      "建玉件数が3件ではありません。");
    assert(Math.abs(result.averageOpenRate - 150.8) < 0.0000001,
      "加重平均約定レートが150.8ではありません。");
    assert(result.evaluationRate === 153,
      "評価レートが153ではありません。");
    assert(result.exchangeProfit === 1100000,
      "為替差損益が1,100,000円ではありません。");
    assert(result.swapTotal === 3500,
      "スワップ合計が3,500円ではありません。");
    assert(result.evaluationPnl === 1103500,
      "評価損益が1,103,500円ではありません。");
  });

  runTest("S5a：売り建玉の為替差損益",() => {
    const accountId = "fx-a";

    const data = makeData([
      makePosition(
        "position-sell",
        accountId,
        "USD/JPY",
        "売",
        10000,
        150,
        0
      )
    ],[
      makeRate(accountId,"USD/JPY",148)
    ]);

    const rows = calculateFxAggregateRows(data);

    assert(rows.length === 1,
      "売り建玉の集計が作成されていません。");
    assert(rows[0].exchangeProfit === 20000,
      "売り建玉の為替差益が20,000円ではありません。");
  });

  runTest("S5a：評価レート未入力は損益を未計算にする",() => {
    const accountId = "fx-a";

    const data = makeData([
      makePosition(
        "position-no-rate",
        accountId,
        "TRY/JPY",
        "買",
        10000,
        150,
        100
      )
    ]);

    const rows = calculateFxAggregateRows(data);

    assert(rows.length === 1,
      "評価レート未入力の建玉集計がありません。");
    assert(rows[0].evaluationRate === null,
      "評価レート未入力がnullになっていません。");
    assert(rows[0].exchangeProfit === null,
      "評価レート未入力なのに為替差損益が計算されています。");
    assert(rows[0].evaluationPnl === null,
      "評価レート未入力なのに評価損益が計算されています。");
  });

  runTest("S5a：一部スワップ未入力はスワップ合計を未入力にする",() => {
    const accountId = "fx-a";

    const data = makeData([
      makePosition(
        "position-swap-a",
        accountId,
        "TRY/JPY",
        "買",
        10000,
        150,
        100
      ),
      makePosition(
        "position-swap-b",
        accountId,
        "TRY/JPY",
        "買",
        10000,
        151,
        null
      )
    ],[
      makeRate(accountId,"TRY/JPY",152)
    ]);

    const rows = calculateFxAggregateRows(data);

    assert(rows.length === 1,
      "スワップ未入力の建玉集計がありません。");
    assert(rows[0].exchangeProfit === 30000,
      "為替差損益が30,000円ではありません。");
    assert(rows[0].swapTotal === null,
      "一部スワップ未入力なのにスワップ合計が数値になっています。");
    assert(rows[0].evaluationPnl === null,
      "スワップ未入力なのに評価損益が計算されています。");
  });

  runTest("S5a：決済済み建玉は集計対象外",() => {
    const accountId = "fx-a";

    const data = makeData([
      makePosition(
        "position-open",
        accountId,
        "TRY/JPY",
        "買",
        10000,
        150,
        100
      ),
      makePosition(
        "position-closed",
        accountId,
        "TRY/JPY",
        "買",
        20000,
        149,
        200,
        "決済済"
      )
    ],[
      makeRate(accountId,"TRY/JPY",151)
    ]);

    const rows = calculateFxAggregateRows(data);

    assert(rows.length === 1,
      "保有中建玉の集計が1件ではありません。");
    assert(rows[0].quantity === 10000,
      "決済済み建玉が数量に含まれています。");
    assert(rows[0].positionCount === 1,
      "決済済み建玉が件数に含まれています。");
    assert(rows[0].exchangeProfit === 10000,
      "保有中建玉だけの為替差損益が10,000円ではありません。");
  });

  runTest("S5a：口座別集計は対象口座だけを合算",() => {
    const data = makeData([
      makePosition(
        "position-account-a",
        "fx-a",
        "TRY/JPY",
        "買",
        10000,
        150,
        100
      ),
      makePosition(
        "position-account-b",
        "fx-b",
        "TRY/JPY",
        "買",
        20000,
        150,
        200
      )
    ],[
      makeRate("fx-a","TRY/JPY",151),
      makeRate("fx-b","TRY/JPY",152)
    ]);

    const result = calculateFxAccountAggregateSummary(data,"fx-a");

    assert(result.aggregateCount === 1,
      "口座Aの集計件数が1件ではありません。");
    assert(result.exchangeProfit === 10000,
      "口座Aの為替差損益が10,000円ではありません。");
    assert(result.status === "計算済",
      "口座Aの計算状態が「計算済」ではありません。");
  });
}
