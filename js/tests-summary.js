"use strict";

function registerSummaryTests(context) {
  const {assert,runTest,makeAccount,makeSnapshot} = context;

  runTest("分類別集計と銀行の30日前差",() => {
    const data = {
      accounts:[
        makeAccount("fx1","架空FX口座","fx","fx"),
        makeAccount("stock1","架空証券口座","securities","stock"),
        makeAccount("bank1","架空銀行口座","bank","bank")
      ],
      snapshots:[
        makeSnapshot("fx-old","fx1","2026-10-01","2026-10-01T10:00:00.000Z",900),
        makeSnapshot("fx-new","fx1","2026-11-10","2026-11-10T10:00:00.000Z",1000,{
          cumulativeInvested:700,effectivePrincipal:800,pnl:100
        }),
        makeSnapshot("stock-new","stock1","2026-11-10","2026-11-10T10:00:00.000Z",2000,{
          effectivePrincipal:1500,pnl:-50,realizedPnlTotal:10
        }),
        makeSnapshot("bank-old","bank1","2026-10-01","2026-10-01T10:00:00.000Z",450),
        makeSnapshot("bank-new","bank1","2026-11-10","2026-11-10T10:00:00.000Z",500)
      ]
    };

    const totals = calculateCategoryTotals(data);

    assert(totals.fx.totalAssets === 1000,"FX総資産の合計が正しくありません。");
    assert(!Object.prototype.hasOwnProperty.call(totals.fx,"cumulativeInvested"),
      "分類別集計に累計投資元本が残っています。");
    assert(totals.fx.effectivePrincipal === 800,"FX有効元本の合計が正しくありません。");
    assert(totals.fx.pnl === 100,"FX評価損益の合計が正しくありません。");
    assert(totals.stock.totalAssets === 2000,"株式総資産の合計が正しくありません。");
    assert(totals.stock.effectivePrincipal === 1500,"株式有効元本の合計が正しくありません。");
    assert(totals.bank.bankBalance === 500,"銀行残高の合計が正しくありません。");
    assert(totals.bank.bankChange === 50,"銀行の30日前差が正しくありません。");
    assert(totals.bank.bankComparedAccountCount === 1,"銀行の比較対象口座数が正しくありません。");
  });

  runTest("30日前比較：10月1日と10月20日から11月10日",() => {
    const data = {
      accounts:[makeAccount("a","架空口座A","fx","fx")],
      snapshots:[
        makeSnapshot("a1","a","2026-10-01","2026-10-01T10:00:00.000Z",1000000),
        makeSnapshot("a2","a","2026-10-20","2026-10-20T10:00:00.000Z",1100000),
        makeSnapshot("a3","a","2026-11-10","2026-11-10T10:00:00.000Z",1200000)
      ]
    };

    const result = calculateDiff30(data);
    const accountResult = result.accounts[0];

    assert(accountResult.baseDate === "2026-10-11","基準日が10月11日ではありません。");
    assert(accountResult.comparisonDate === "2026-10-01","比較値の対象日が10月1日ではありません。");
    assert(accountResult.difference === 200000,"差額が+200,000円ではありません。");
    assert(result.difference === 200000,"合計差額が正しくありません。");
    assert(result.comparedAccountCount === 1,"比較口座数が正しくありません。");
  });

  runTest("30日前比較：基準日以前の記録がない口座は対象外",() => {
    const data = {
      accounts:[makeAccount("b","架空口座B","bank","bank")],
      snapshots:[
        makeSnapshot("b1","b","2026-11-05","2026-11-05T10:00:00.000Z",100),
        makeSnapshot("b2","b","2026-11-10","2026-11-10T10:00:00.000Z",120)
      ]
    };

    const result = calculateDiff30(data);

    assert(result.comparedAccountCount === 0,"比較対象外になっていません。");
    assert(result.excludedAccountCount === 1,"対象外口座数が正しくありません。");
    assert(result.difference === null,"比較できないのに差額が0扱いされています。");
    assert(result.accounts[0].comparable === false,"口座別の比較対象判定が正しくありません。");
  });

  runTest("30日前比較：同一対象日はrecordedAtが新しい値を採用",() => {
    const data = {
      accounts:[makeAccount("c","架空口座C","fx","fx")],
      snapshots:[
        makeSnapshot("c-old","c","2026-10-01","2026-10-01T09:00:00.000Z",100),
        makeSnapshot("c-new","c","2026-10-01","2026-10-01T12:00:00.000Z",150),
        makeSnapshot("c-current","c","2026-11-10","2026-11-10T10:00:00.000Z",300)
      ]
    };

    const result = calculateDiff30(data);

    assert(result.accounts[0].comparisonSnapshot.id === "c-new",
      "比較値にrecordedAtが新しい記録が採用されていません。");
    assert(result.accounts[0].difference === 150,
      "新しい比較値を使った差額が正しくありません。");
  });

  runTest("30日前比較：全口座が対象外なら算出不可",() => {
    const data = {
      accounts:[
        makeAccount("d1","架空口座D1","fx","fx"),
        makeAccount("d2","架空口座D2","bank","bank")
      ],
      snapshots:[
        makeSnapshot("d1-current","d1","2026-11-10","2026-11-10T10:00:00.000Z",100),
        makeSnapshot("d2-current","d2","2026-11-10","2026-11-10T10:00:00.000Z",200)
      ]
    };

    const result = calculateDiff30(data);
    const dashboard = calculateDashboard(data);

    assert(result.isUnavailable === true,"算出不可の判定が正しくありません。");
    assert(result.difference === null,"差額が0になっています。");
    assert(result.comparedAccountCount === 0,"比較対象口座数が0ではありません。");
    assert(result.excludedAccountCount === 2,"対象外口座数が正しくありません。");
    assert(dashboard.difference30.isUnavailable === true,
      "ホーム側で算出不可になっていません。");
  });

  runTest("30日前比較：月またぎで2026-03-01から30日を引く",() => {
    assert(
      subtractCalendarDays("2026-03-01",30) === "2026-01-30",
      "月またぎの基準日が2026-01-30ではありません。"
    );
  });

  runTest("日付に正しい曜日を付ける",() => {
    assert(
      formatDateWithWeekday("2026-11-10") === "2026-11-10（火）",
      "日付の曜日表示が正しくありません。"
    );
    assert(
      formatDateWithWeekday(null) === "未入力",
      "未入力日付の表示が正しくありません。"
    );
  });

  runTest("S2b：自己診断6項目が架空データで正常",() => {
    const data = createInitialData();
    const account = data.accounts[0];
    data.snapshots.push({
      id:"diagnostic-snapshot",
      accountId:account.id,
      asOfDate:"2026-01-01",
      recordedAt:"2026-01-01T10:00:00.000Z",
      value:12345,
      cumulativeInvested:null,
      effectivePrincipal:null,
      pnl:null,
      realizedPnlTotal:null,
      cash:null,
      swapTotal:null,
      requiredMargin:null,
      memo:"架空データ"
    });

    const report = runDataSelfDiagnosis(data,true);
    assert(report.items.length === 6,"診断項目が6件ではありません。");
    assert(report.ngCount === 0,"正常データで診断NGが発生しました。");
    assert(report.items.find(item => item.name === "版情報").status === "info",
      "版情報がOK/NG判定から分離されていません。");
  });
}
