"use strict";

function registerFxDailyTests(context) {
  const {assert,runTest,makeAccount} = context;

  function makeDailyData(options = {}) {
    const account = makeAccount(
      options.accountId || "fx-daily-test",
      "架空FX口座",
      "fx",
      "fx"
    );

    const position = options.position || {
      id:"daily-position",
      accountId:account.id,
      pair:"TRY/JPY",
      side:"買",
      quantity:1000000,
      openRate:3.167,
      swap:0,
      status:"保有中"
    };

    return {
      accounts:[account],
      snapshots:options.snapshots || [],
      fxPositions:options.positions === undefined
        ? [position]
        : options.positions,
      fxRates:options.rates || [],
      fxSwapLedger:[]
    };
  }

  function makeRate(accountId,rate,asOfDate) {
    return {
      id:"daily-rate",
      accountId,
      pair:"TRY/JPY",
      rate,
      asOfDate
    };
  }

  function assertNear(actual,expected,message) {
    assert(
      Number.isFinite(actual) &&
      Math.abs(actual - expected) < 0.0000001,
      message
    );
  }

  runTest("S5f B：LIGHT FXの総資産の目安",() => {
    const accountId = "fx-daily-test";
    const data = makeDailyData({
      position:{
        id:"light-position",
        accountId,
        pair:"TRY/JPY",
        side:"買",
        quantity:1000000,
        openRate:3.167,
        swap:0,
        status:"保有中"
      },
      rates:[makeRate(accountId,0.79068,"2026-11-16")]
    });

    const result = calculateFxDailyEstimatedTotal(
      data,
      accountId,
      1331457,
      6143654
    );

    assertNear(result.exchangeProfit,-2376320,
      "為替差益は-2,376,320円である必要があります。");
    assertNear(result.value,5098791,
      "総資産の目安は5,098,791円である必要があります。");
  });

  runTest("S5f B：クリック365の総資産の目安",() => {
    const accountId = "fx-daily-test";
    const data = makeDailyData({
      position:{
        id:"click-position",
        accountId,
        pair:"TRY/JPY",
        side:"買",
        quantity:1000000,
        openRate:3,
        swap:0,
        status:"保有中"
      },
      rates:[makeRate(accountId,3.896,"2026-11-16")]
    });

    const result = calculateFxDailyEstimatedTotal(
      data,
      accountId,
      276239,
      1411838
    );

    assertNear(result.exchangeProfit,896000,
      "為替差益は896,000円である必要があります。");
    assertNear(result.value,2584077,
      "総資産の目安は2,584,077円である必要があります。");
  });

  runTest("S5f B：LION FXの総資産の目安",() => {
    const accountId = "fx-daily-test";
    const data = makeDailyData({
      position:{
        id:"lion-position",
        accountId,
        pair:"TRY/JPY",
        side:"買",
        quantity:1000000,
        openRate:3,
        swap:0,
        status:"保有中"
      },
      rates:[makeRate(accountId,3.9246,"2026-11-16")]
    });

    const result = calculateFxDailyEstimatedTotal(
      data,
      accountId,
      711119,
      890505
    );

    assertNear(result.exchangeProfit,924600,
      "為替差益は924,600円である必要があります。");
    assertNear(result.value,2526224,
      "総資産の目安は2,526,224円である必要があります。");
  });

  runTest("S5f B：評価レート未入力は総資産を算出しない",() => {
    const accountId = "fx-daily-test";
    const data = makeDailyData({
      rates:[]
    });

    const result = calculateFxDailyEstimatedTotal(
      data,
      accountId,
      1331457,
      6143654
    );

    assert(result.value === null,
      "評価レート未入力の場合、総資産の目安はnullである必要があります。");
    assert(result.missing.some(item =>
      item.includes("評価レート")
    ),"不足項目に評価レートを含める必要があります。");
  });

  runTest("S5f：有効元本または累計スワップが未入力なら算出しない",() => {
    const accountId = "fx-daily-test";
    const data = makeDailyData({
      rates:[makeRate(accountId,3.2,"2026-11-16")]
    });

    const result = calculateFxDailyEstimatedTotal(
      data,
      accountId,
      null,
      1000
    );

    assert(result.value === null,
      "有効元本が未入力の場合は総資産を算出してはいけません。");
    assert(result.missing.includes("有効元本"),
      "不足項目に有効元本を含める必要があります。");
  });

  runTest("S5f：履歴ratesの形式検証",() => {
    const valid = {
      snapshots:[{
        id:"snapshot-valid",
        rates:{"TRY/JPY":3.167}
      }]
    };

    validateFxSnapshotRates(valid);

    const nullRates = {
      snapshots:[{
        id:"snapshot-null",
        rates:null
      }]
    };

    validateFxSnapshotRates(nullRates);

    const absentRates = {
      snapshots:[{
        id:"snapshot-absent"
      }]
    };

    validateFxSnapshotRates(absentRates);

    let invalidRejected = false;

    try {
      validateFxSnapshotRates({
        snapshots:[{
          id:"snapshot-invalid",
          rates:{"TRY/JPY":0}
        }]
      });
    } catch (error) {
      invalidRejected = true;
    }

    assert(invalidRejected,
      "0以下の評価レートを拒否する必要があります。");

    invalidRejected = false;

    try {
      validateFxSnapshotRates({
        snapshots:[{
          id:"snapshot-invalid-type",
          rates:[3.167]
        }]
      });
    } catch (error) {
      invalidRejected = true;
    }

    assert(invalidRejected,
      "配列形式のratesを拒否する必要があります。");
  });

  runTest("S5f D：過去の日付ではfxRatesを更新しない",() => {
    const accountId = "fx-daily-test";
    const data = makeDailyData({
      snapshots:[{
        id:"snapshot-latest",
        accountId,
        asOfDate:"2026-11-13",
        recordedAt:"2026-11-13T10:00:00.000Z"
      }],
      rates:[makeRate(accountId,3.167,"2026-11-13")]
    });

    assert(
      canUpdateFxDailyRate(
        data,
        accountId,
        "TRY/JPY",
        "2026-11-10"
      ) === false,
      "11月10日の入力では最新レートを更新してはいけません。"
    );
  });

  runTest("S5f D：最新日以降の日付ではfxRatesを更新できる",() => {
    const accountId = "fx-daily-test";
    const data = makeDailyData({
      snapshots:[{
        id:"snapshot-latest",
        accountId,
        asOfDate:"2026-11-13",
        recordedAt:"2026-11-13T10:00:00.000Z"
      }],
      rates:[makeRate(accountId,3.167,"2026-11-13")]
    });

    assert(
      canUpdateFxDailyRate(
        data,
        accountId,
        "TRY/JPY",
        "2026-11-16"
      ) === true,
      "11月16日の入力では最新レートを更新できる必要があります。"
    );

    assert(
      canUpdateFxDailyRate(
        data,
        accountId,
        "TRY/JPY",
        "2026-11-13"
      ) === true,
      "最新日と同日の入力でも更新できる必要があります。"
    );
  });

  runTest("S5f D：fxRatesのasOfDateより前なら更新しない",() => {
    const accountId = "fx-daily-test";
    const data = makeDailyData({
      snapshots:[{
        id:"snapshot-latest",
        accountId,
        asOfDate:"2026-11-10",
        recordedAt:"2026-11-10T10:00:00.000Z"
      }],
      rates:[makeRate(accountId,3.167,"2026-11-13")]
    });

    assert(
      canUpdateFxDailyRate(
        data,
        accountId,
        "TRY/JPY",
        "2026-11-12"
      ) === false,
      "fxRatesのasOfDateより前の日付では更新してはいけません。"
    );

    assert(
      canUpdateFxDailyRate(
        data,
        accountId,
        "TRY/JPY",
        "2026-11-13"
      ) === true,
      "fxRatesのasOfDateと同日の入力では更新できる必要があります。"
    );
  });
}

const registerFxTestsBeforeDaily = registerFxTests;

registerFxTests = function(context) {
  registerFxTestsBeforeDaily(context);
  registerFxDailyTests(context);
};