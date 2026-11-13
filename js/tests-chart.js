"use strict";

function registerChartTests(context) {
  const {assert,runTest,makeAccount,makeSnapshot} = context;

  /* ---------- S8b 年利換算テスト ---------- */

  runTest("S8b：仕様書11-5の年利換算",() => {
    const account = makeAccount(
      "chart-stock",
      "架空証券口座",
      "securities",
      "stock"
    );
    const data = {
      accounts:[account],
      snapshots:[
        makeSnapshot(
          "chart-start",
          account.id,
          "2026-01-01",
          "2026-01-01T10:00:00.000Z",
          1000000,
          {
            effectivePrincipal:1000000,
            pnl:0,
            realizedPnlTotal:0
          }
        ),
        makeSnapshot(
          "chart-middle",
          account.id,
          "2026-04-01",
          "2026-04-01T10:00:00.000Z",
          1050000,
          {
            effectivePrincipal:1000000,
            pnl:25000,
            realizedPnlTotal:0
          }
        ),
        makeSnapshot(
          "chart-end",
          account.id,
          "2026-07-02",
          "2026-07-02T10:00:00.000Z",
          1100000,
          {
            effectivePrincipal:1000000,
            pnl:50000,
            realizedPnlTotal:0
          }
        )
      ]
    };

    const result = calculateChartAnnualizedReturn(
      data,
      "account:" + account.id,
      {
        startDate:"2026-01-01",
        endDate:"2026-07-02"
      }
    );

    const expectedSimple = 0.05 * 365 / 182;
    const expectedCompound = Math.pow(1.05,365 / 182) - 1;

    assert(result.available === true,"年利換算が算出可能になっていません。");
    assert(result.days === 182,"期間日数が182日ではありません。");
    assert(result.periodProfit === 50000,"期間損益が50,000円ではありません。");
    assert(result.baseAverage === 1000000,"有効元本平均が1,000,000円ではありません。");
    assert(Math.abs(result.simpleAnnualRate - expectedSimple) < 1e-12,
      "単純年利が仕様書11-5の値と一致しません。");
    assert(Math.abs(result.compoundAnnualRate - expectedCompound) < 1e-12,
      "複利年利が仕様書11-5の値と一致しません。");
    assert(Math.abs(result.totalAssetsRate - 10) < 1e-12,
      "入出金を含む総資産増減率が10%ではありません。");
  });

  runTest("S8b：30日未満は参考値フラグを付ける",() => {
    const account = makeAccount(
      "chart-short",
      "架空証券口座",
      "securities",
      "stock"
    );
    const data = {
      accounts:[account],
      snapshots:[
        makeSnapshot(
          "chart-short-start",
          account.id,
          "2026-01-01",
          "2026-01-01T10:00:00.000Z",
          1000000,
          {
            effectivePrincipal:1000000,
            pnl:0,
            realizedPnlTotal:0
          }
        ),
        makeSnapshot(
          "chart-short-end",
          account.id,
          "2026-01-15",
          "2026-01-15T10:00:00.000Z",
          1010000,
          {
            effectivePrincipal:1000000,
            pnl:10000,
            realizedPnlTotal:0
          }
        )
      ]
    };

    const result = calculateChartAnnualizedReturn(
      data,
      "account:" + account.id,
      {
        startDate:"2026-01-01",
        endDate:"2026-01-15"
      }
    );

    assert(result.available === true,"14日間の年利換算が算出されていません。");
    assert(result.days === 14,"期間日数が14日ではありません。");
    assert(result.shortPeriod === true,"30日未満の参考値フラグがありません。");
  });

  runTest("S8b：始点または終点の有効元本が未入力なら算出不可",() => {
    const account = makeAccount(
      "chart-missing",
      "架空証券口座",
      "securities",
      "stock"
    );
    const data = {
      accounts:[account],
      snapshots:[
        makeSnapshot(
          "chart-missing-start",
          account.id,
          "2026-01-01",
          "2026-01-01T10:00:00.000Z",
          1000000,
          {
            effectivePrincipal:1000000,
            pnl:0,
            realizedPnlTotal:0
          }
        ),
        makeSnapshot(
          "chart-missing-end",
          account.id,
          "2026-07-02",
          "2026-07-02T10:00:00.000Z",
          1050000,
          {
            effectivePrincipal:null,
            pnl:50000,
            realizedPnlTotal:0
          }
        )
      ]
    };

    const result = calculateChartAnnualizedReturn(
      data,
      "account:" + account.id,
      {
        startDate:"2026-01-01",
        endDate:"2026-07-02"
      }
    );

    assert(result.available === false,"有効元本未入力なのに算出可能になっています。");
    assert(result.reason.includes("有効元本"),
      "算出不可の理由が有効元本の未入力になっていません。");
  });

  runTest("S8b：銀行口座とFX履歴は年利換算の対象外",() => {
    const bank = makeAccount(
      "chart-bank",
      "架空銀行口座",
      "bank",
      "bank"
    );
    const fx = makeAccount(
      "chart-fx",
      "架空FX口座",
      "fx",
      "fx"
    );
    const bankData = {
      accounts:[bank],
      snapshots:[
        makeSnapshot(
          "chart-bank-start",
          bank.id,
          "2026-01-01",
          "2026-01-01T10:00:00.000Z",
          100000
        ),
        makeSnapshot(
          "chart-bank-end",
          bank.id,
          "2026-07-02",
          "2026-07-02T10:00:00.000Z",
          110000
        )
      ]
    };
    const fxData = {
      accounts:[fx],
      snapshots:[
        makeSnapshot(
          "chart-fx-start",
          fx.id,
          "2026-01-01",
          "2026-01-01T10:00:00.000Z",
          1000000,
          {
            effectivePrincipal:800000,
            pnl:100000,
            swapTotal:100000
          }
        ),
        makeSnapshot(
          "chart-fx-end",
          fx.id,
          "2026-07-02",
          "2026-07-02T10:00:00.000Z",
          1100000,
          {
            effectivePrincipal:800000,
            pnl:200000,
            swapTotal:100000
          }
        )
      ]
    };

    const bankResult = calculateChartAnnualizedReturn(
      bankData,
      "account:" + bank.id,
      {startDate:"2026-01-01",endDate:"2026-07-02"}
    );
    const fxResult = calculateChartAnnualizedReturn(
      fxData,
      "account:" + fx.id,
      {startDate:"2026-01-01",endDate:"2026-07-02"}
    );

    assert(bankResult.available === false,"銀行口座が年利換算の対象になっています。");
    assert(bankResult.reason.includes("銀行"),"銀行口座の算出不可理由がありません。");
    assert(fxResult.available === false,"FXの累積確定損益未対応なのに年利換算されています。");
    assert(fxResult.reason.includes("FX"),"FXの算出不可理由がありません。");
    assert(fxResult.totalAssetsRate === 10,
      "FXの総資産増減率（入出金を含む）が表示できません。");
  });

  /* ---------- S8b② 近似式・将来予測テスト ---------- */

  runTest("S8b：仕様書11-5の線形近似と1年予測",() => {
    const result = calculateChartApproximation([
      {date:"2026-01-01",value:1000},
      {date:"2026-01-31",value:1300},
      {date:"2026-03-02",value:1600}
    ],"linear","1y");

    assert(result.available === true,"線形近似が算出できません。");
    assert(Math.abs(result.model.a - 10) < 1e-10,
      "線形近似の傾きが10ではありません。");
    assert(Math.abs(result.model.b - 1000) < 1e-10,
      "線形近似の切片が1,000ではありません。");
    assert(result.rSquared === 1,"線形近似のR²が1ではありません。");
    assert(result.forecastEndDate === "2027-03-02",
      "1年予測の終了日が正しくありません。");
    assert(Math.abs(result.predictedValue - 5250) < 1e-8,
      "x=425日の予測値が5,250ではありません。");
  });

  runTest("S8b：仕様書11-5の指数近似と年率",() => {
    const result = calculateChartApproximation([
      {date:"2026-01-01",value:100},
      {date:"2027-01-01",value:110}
    ],"exponential","1y");

    assert(result.available === true,"指数近似が算出できません。");
    assert(Math.abs(result.model.a - 100) < 1e-10,
      "指数近似の係数aが100ではありません。");
    assert(Math.abs(Math.exp(result.model.b * 365) - 1 - 0.1) < 1e-10,
      "指数近似の年率が10%ではありません。");
    assert(result.rSquared === 1,"指数近似のR²が1ではありません。");
    assert(Math.abs(result.interpretation.value - 0.1) < 1e-10,
      "表示用の年率が10%ではありません。");
  });

  runTest("S8b：仕様書11-5の2次多項式",() => {
    const result = calculateChartApproximation([
      {date:"2026-01-01",value:0},
      {date:"2027-01-01",value:1},
      {date:"2028-01-01",value:4}
    ],"quadratic","3m");

    assert(result.available === true,"2次多項式を算出できません。");
    assert(Math.abs(result.model.a - 1) < 1e-10,
      "2次多項式の係数aが1ではありません。");
    assert(Math.abs(result.model.b) < 1e-10,
      "2次多項式の係数bが0ではありません。");
    assert(Math.abs(result.model.c) < 1e-10,
      "2次多項式の係数cが0ではありません。");
    assert(result.rSquared === 1,"2次多項式のR²が1ではありません。");
  });

  runTest("S8b：線形近似は2点でも算出できる",() => {
    const result = calculateChartApproximation([
      {date:"2026-01-01",value:100},
      {date:"2026-02-01",value:110}
    ],"linear","3m");

    assert(result.available === true,"2点の線形近似が算出できません。");
    assert(result.pointCount === 2,"記録点数が2点ではありません。");
  });
}
