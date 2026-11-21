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

  runTest("S5b追補：分類集計はnull履歴の前の有効な基準値を使う",() => {
    const today = localDateString();
    const baseDate = subtractCalendarDays(today,2);
    const account = makeAccount("fx-realized-summary","架空FX口座","fx","fx");
    const data = {
      accounts:[account],
      snapshots:[
        makeSnapshot(
          "fx-realized-base",
          account.id,
          baseDate,
          baseDate + "T10:00:00.000Z",
          1000000,
          {
            effectivePrincipal:800000,
            pnl:100000,
            realizedPnlTotal:1000
          }
        ),
        makeSnapshot(
          "fx-realized-null",
          account.id,
          today,
          today + "T10:00:00.000Z",
          1100000,
          {
            effectivePrincipal:850000,
            pnl:150000,
            realizedPnlTotal:null
          }
        )
      ],
      fxPositions:[]
    };

    const totals = calculateCategoryTotals(data);

    assert(totals.fx.realizedPnlTotal === 1000,
      "最新履歴がnullでも、過去の有効な基準値1,000円が集計されていません。");
    assert(totals.fx.totalPnl === 1000,
      "FX通算損益に累積確定損益1,000円が反映されていません。");
    assert(totals.fx.counts.realizedPnlTotal === 1,
      "累積確定損益の集計対象口座数が正しくありません。");
  });

  runTest("S5e A1・A6：日次確定損益を優先し、決済損益との差を警告",() => {
    const account = makeAccount("fx-daily-a1","架空FX口座A","fx","fx");
    const data = {
      accounts:[account],
      snapshots:[
        makeSnapshot(
          "daily-base",
          account.id,
          "2026-10-31",
          "2026-10-31T10:00:00.000Z",
          0,
          {realizedPnlTotal:1000000}
        ),
        makeSnapshot(
          "daily-1120",
          account.id,
          "2026-11-20",
          "2026-11-20T10:00:00.000Z",
          0,
          {realizedPnlDaily:-25000}
        )
      ],
      fxPositions:[
        {
          accountId:account.id,status:"決済済",
          closeDate:"2026-10-31",realizedPnl:50000
        },
        {
          accountId:account.id,status:"決済済",
          closeDate:"2026-11-10",realizedPnl:80000
        },
        {
          accountId:account.id,status:"決済済",
          closeDate:"2026-11-20",realizedPnl:-30000
        },
        {
          accountId:account.id,status:"決済済",
          closeDate:"2026-12-05",realizedPnl:10000
        }
      ]
    };

    const resultAt1120 = getFxRealizedAt(data,account.id,"2026-11-20");
    const resultAt1130 = getFxRealizedAt(data,account.id,"2026-11-30");

    assert(resultAt1120.value === 1055000,
      "1,000,000＋80,000−25,000＝1,055,000円ではありません。");
    assert(resultAt1130.value === 1055000,
      "11月30日の累積確定損益が1,055,000円ではありません。");
    assert(resultAt1120.warnings.length === 1,
      "同日の決済損益との差の警告が1件ありません。");
    assert(resultAt1120.warnings[0].difference === 5000,
      "日次−25,000円と決済合計−30,000円の差が5,000円ではありません。");
  });

  runTest("S5e A2：日次確定損益がない日は決済損益を採用",() => {
    const account = makeAccount("fx-daily-a2","架空FX口座A","fx","fx");
    const data = {
      accounts:[account],
      snapshots:[
        makeSnapshot(
          "daily-base-a2",
          account.id,
          "2026-10-31",
          "2026-10-31T10:00:00.000Z",
          0,
          {realizedPnlTotal:1000000}
        )
      ],
      fxPositions:[
        {
          accountId:account.id,status:"決済済",
          closeDate:"2026-11-10",realizedPnl:80000
        }
      ]
    };

    const result = getFxRealizedAt(data,account.id,"2026-11-15");

    assert(result.value === 1080000,
      "1,000,000＋80,000＝1,080,000円ではありません。");
  });

  runTest("S5e A3：基準日と同日の確定損益は加算しない",() => {
    const account = makeAccount("fx-daily-a3","架空FX口座A","fx","fx");
    const data = {
      accounts:[account],
      snapshots:[
        makeSnapshot(
          "daily-base-a3",
          account.id,
          "2026-10-31",
          "2026-10-31T10:00:00.000Z",
          0,
          {
            realizedPnlTotal:1000000,
            realizedPnlDaily:20000
          }
        )
      ],
      fxPositions:[]
    };

    const result = getFxRealizedAt(data,account.id,"2026-10-31");

    assert(result.value === 1000000,
      "基準日と同日の20,000円を加算せず、1,000,000円である必要があります。");
  });

  runTest("S5e A4：決済のない日の日次確定損益を加算",() => {
    const account = makeAccount("fx-daily-a4","架空FX口座A","fx","fx");
    const data = {
      accounts:[account],
      snapshots:[
        makeSnapshot(
          "daily-base-a4",
          account.id,
          "2026-10-31",
          "2026-10-31T10:00:00.000Z",
          0,
          {realizedPnlTotal:1000000}
        ),
        makeSnapshot(
          "daily-1112",
          account.id,
          "2026-11-12",
          "2026-11-12T10:00:00.000Z",
          0,
          {realizedPnlDaily:10000}
        )
      ],
      fxPositions:[
        {
          accountId:account.id,status:"決済済",
          closeDate:"2026-11-10",realizedPnl:80000
        }
      ]
    };

    const result = getFxRealizedAt(data,account.id,"2026-11-12");

    assert(result.value === 1090000,
      "1,000,000＋80,000＋10,000＝1,090,000円ではありません。");
  });

  runTest("S5e A5：日次確定損益のnullと0を区別",() => {
    const account = makeAccount("fx-daily-a5","架空FX口座A","fx","fx");

    function createData(dailyValue) {
      return {
        accounts:[account],
        snapshots:[
          makeSnapshot(
            "daily-base-a5",
            account.id,
            "2026-10-31",
            "2026-10-31T10:00:00.000Z",
            0,
            {realizedPnlTotal:1000000}
          ),
          makeSnapshot(
            "daily-1110-a5",
            account.id,
            "2026-11-10",
            "2026-11-10T10:00:00.000Z",
            0,
            {realizedPnlDaily:dailyValue}
          )
        ],
        fxPositions:[
          {
            accountId:account.id,status:"決済済",
            closeDate:"2026-11-10",realizedPnl:80000
          }
        ]
      };
    }

    const nullResult = getFxRealizedAt(
      createData(null),
      account.id,
      "2026-11-15"
    );
    const zeroResult = getFxRealizedAt(
      createData(0),
      account.id,
      "2026-11-15"
    );

    assert(nullResult.value === 1080000,
      "日次がnullなら決済損益80,000円を加算する必要があります。");
    assert(zeroResult.value === 1000000,
      "日次が0なら決済損益80,000円を加算しない必要があります。");
  });

  runTest("S5e A7：FX通算損益に日次確定損益を反映",() => {
    const today = localDateString();
    const baseDate = subtractCalendarDays(today,3);
    const settlementDate = subtractCalendarDays(today,2);
    const dailyDate = subtractCalendarDays(today,1);
    const account = makeAccount("fx-daily-total","架空FX口座A","fx","fx");

    const data = {
      accounts:[account],
      snapshots:[
        makeSnapshot(
          "daily-total-base",
          account.id,
          baseDate,
          baseDate + "T10:00:00.000Z",
          0,
          {realizedPnlTotal:1000000}
        ),
        makeSnapshot(
          "daily-total-current",
          account.id,
          dailyDate,
          dailyDate + "T10:00:00.000Z",
          0,
          {
            pnl:-150000,
            swapTotal:320000,
            realizedPnlDaily:-25000
          }
        )
      ],
      fxPositions:[
        {
          id:"daily-total-p2",
          accountId:account.id,
          pair:"USD/JPY",
          side:"買",
          quantity:10000,
          openDate:baseDate,
          openRate:150,
          swap:0,
          status:"決済済",
          closeDate:settlementDate,
          realizedPnl:80000
        },
        {
          id:"daily-total-p3",
          accountId:account.id,
          pair:"USD/JPY",
          side:"買",
          quantity:10000,
          openDate:baseDate,
          openRate:150,
          swap:0,
          status:"決済済",
          closeDate:dailyDate,
          realizedPnl:-30000
        },
        {
          id:"daily-total-open",
          accountId:account.id,
          pair:"USD/JPY",
          side:"買",
          quantity:100000,
          openDate:baseDate,
          openRate:151.5,
          swap:320000,
          status:"保有中",
          closeDate:null,
          realizedPnl:null
        }
      ],
      fxRates:[
        {
          id:"daily-total-rate",
          accountId:account.id,
          pair:"USD/JPY",
          rate:150,
          asOfDate:today
        }
      ]
    };

    const totals = calculateCategoryTotals(data);

    assert(totals.fx.realizedPnlTotal === 1055000,
      "累積確定損益が1,055,000円ではありません。");
    assert(totals.fx.totalPnl === 1225000,
      "−150,000＋320,000＋1,055,000＝1,225,000円ではありません。");
  });

  runTest("S5e A8：基準なしでも日次確定損益があれば算出",() => {
    const account = makeAccount("fx-daily-a8","架空FX口座A","fx","fx");
    const data = {
      accounts:[account],
      snapshots:[
        makeSnapshot(
          "daily-only-a8",
          account.id,
          "2026-11-12",
          "2026-11-12T10:00:00.000Z",
          0,
          {realizedPnlDaily:10000}
        )
      ],
      fxPositions:[]
    };

    const result = getFxRealizedAt(data,account.id,"2026-11-12");

    assert(result.value === 10000,
      "基準なしの日次確定損益10,000円が算出されていません。");
    assert(result.baseUnset === true,
      "基準額未設定の状態が返されていません。");
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

  runTest("S2b：自己診断7項目が架空データで正常",() => {
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
    assert(report.items.length === 7,"診断項目が7件ではありません。");
    assert(report.items.find(item => item.name === "積立・売却確認の整合").status === "ok",
      "S13aの積立・売却確認の整合が正常判定になりません。");
    assert(report.ngCount === 0,"正常データで診断NGが発生しました。");
    assert(report.items.find(item => item.name === "版情報").status === "info",
      "版情報がOK/NG判定から分離されていません。");
  });
}
