"use strict";

(function runTests() {
  const resultsElement = document.getElementById("test-results");
  const summaryElement = document.getElementById("test-summary");

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

  runTest("v1からv2への移行と新項目追加",() => {
    const oldData = {
      schemaVersion:1,
      accounts:[
        {
          id:"account-fx",
          name:"LIGHT FX",
          type:"fx",
          memo:"",
          lossCutRatio:123,
          marginRatePct:null,
          createdAt:"2026-01-01T00:00:00.000Z",
          updatedAt:"2026-01-01T00:00:00.000Z"
        },
        {
          id:"account-crypto",
          name:"暗号資産取引所",
          type:"crypto",
          memo:"",
          createdAt:"2026-01-01T00:00:00.000Z",
          updatedAt:"2026-01-01T00:00:00.000Z"
        }
      ],
      snapshots:[
        {
          id:"snapshot-1",
          accountId:"account-fx",
          asOfDate:"2026-11-01",
          recordedAt:"2026-11-01T10:00:00.000Z",
          value:100000,
          principal:80000,
          memo:"架空データ"
        }
      ]
    };

    const migrated = migrateDataV1ToV2(oldData);

    assert(migrated.schemaVersion === 2,"schemaVersionが2ではありません。");
    assert(migrated.accounts[0].id === "account-fx","既存口座IDが変わっています。");
    assert(migrated.accounts[0].category === "fx","FX分類が正しくありません。");
    assert(migrated.accounts[0].lossCutRatio === 123,"既存のロスカット設定が上書きされています。");
    assert(migrated.accounts[0].marginRatePct === 4,"未設定の必要証拠金率が補完されていません。");

    const crypto = migrated.accounts.find(
      account => account.id === "account-crypto"
    );

    assert(crypto.name === "GMOコイン","暗号資産口座名が変更されていません。");
    assert(crypto.category === "crypto","暗号資産分類が正しくありません。");

    const snapshot = migrated.snapshots[0];

    assert(snapshot.principal === 80000,"旧principalが保持されていません。");
    assert(snapshot.effectivePrincipal === 80000,"有効元本への複写が正しくありません。");
    assert(snapshot.cumulativeInvested === null,"累計投資元本の初期値が正しくありません。");
    assert(snapshot.pnl === null,"評価損益の初期値が正しくありません。");

    assert(Array.isArray(migrated.holdings),"holdingsが追加されていません。");
    assert(Array.isArray(migrated.fxPositions),"fxPositionsが追加されていません。");
    assert(Array.isArray(migrated.fxRates),"fxRatesが追加されていません。");
    assert(Array.isArray(migrated.loans),"loansが追加されていません。");
    assert(Array.isArray(migrated.loanSnapshots),"loanSnapshotsが追加されていません。");
    assert(migrated.settings.targetRatio === 150,"設定の初期値が正しくありません。");

    validateData(migrated);
  });

  runTest("初期口座の追加を繰り返しても重複しない",() => {
    const accounts = [
      makeAccount("a1","LIGHT FX","fx","fx")
    ];

    addMissingInitialAccounts(accounts);
    const firstCount = accounts.length;

    addMissingInitialAccounts(accounts);
    const secondCount = accounts.length;

    assert(firstCount === INITIAL_ACCOUNTS.length,"初回の口座追加数が正しくありません。");
    assert(secondCount === firstCount,"2回目の実行で口座が重複しています。");

    for (const item of INITIAL_ACCOUNTS) {
      assert(
        accounts.filter(account => account.name === item.name).length === 1,
        `${item.name} が重複または不足しています。`
      );
    }
  });

  runTest("FX設定は未設定項目だけ初期値を入れる",() => {
    const data = {
      accounts:[
        {
          name:"LIGHT FX",
          type:"fx",
          lossCutRatio:123,
          marginRatePct:null
        },
        {
          name:"セントラル短資FX",
          type:"fx",
          lossCutRatio:null,
          marginRatePct:7
        }
      ]
    };

    migrateFxAccountSettings(data);

    assert(data.accounts[0].lossCutRatio === 123,"既存のロスカット設定が上書きされています。");
    assert(data.accounts[0].marginRatePct === 4,"未設定の必要証拠金率が補完されていません。");
    assert(data.accounts[1].lossCutRatio === 100,"未設定のロスカット設定が補完されていません。");
    assert(data.accounts[1].marginRatePct === 7,"既存の必要証拠金率が上書きされています。");
  });

  runTest("同一対象日はrecordedAtが最新の記録を採用する",() => {
    const data = {
      accounts:[
        makeAccount("a1","架空FX口座","fx","fx")
      ],
      snapshots:[
        makeSnapshot(
          "old","a1","2026-11-01",
          "2026-11-01T09:00:00.000Z",100
        ),
        makeSnapshot(
          "new","a1","2026-11-01",
          "2026-11-01T12:00:00.000Z",150
        ),
        makeSnapshot(
          "previous","a1","2026-10-01",
          "2026-10-01T12:00:00.000Z",90
        )
      ]
    };

    assert(getLatestSnapshot(data,"a1").id === "new",
      "最新記録の採用が正しくありません。");

    const snapshots = getAccountSnapshots(data,"a1");
    assert(snapshots.length === 2,
      "同一対象日の重複が除外されていません。");
  });

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
    assert(totals.fx.cumulativeInvested === 700,"FX累計投資元本の合計が正しくありません。");
    assert(totals.fx.effectivePrincipal === 800,"FX有効元本の合計が正しくありません。");
    assert(totals.fx.pnl === 100,"FX評価損益の合計が正しくありません。");
    assert(totals.stock.totalAssets === 2000,"株式総資産の合計が正しくありません。");
    assert(totals.stock.cumulativeInvested === null,"未入力の累計投資元本が0扱いされています。");
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

  for (const result of results) {
    const item = document.createElement("li");
    item.textContent = `${result.success ? "合格" : "不合格"}：${result.name} — ${result.message}`;
    resultsElement.appendChild(item);
  }

  const passed = results.filter(result => result.success).length;
  const failed = results.length - passed;

  summaryElement.textContent =
    `${passed}件合格 / ${failed}件不合格（全${results.length}件）`;
})();
