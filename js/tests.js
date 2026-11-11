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

  runTest("v1からv3への移行と新項目追加",() => {
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

    const migratedV2 = migrateDataV1ToV2(oldData);
    const migrated = migrateDataV2ToV3(migratedV2);

    assert(migrated.schemaVersion === 3,"schemaVersionが3ではありません。");
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
    assert(Array.isArray(migrated.fxSwapLedger),"fxSwapLedgerが追加されていません。");
    assert(migrated.accounts[0].fieldLabels.value === "純資産額",
      "FX口座のfieldLabels初期値が正しくありません。");
    assert(migrated.accounts[0].autoCalc === "swap",
      "FX口座のautoCalc初期値が正しくありません。");
    assert(migrated.settings.targetRatio === 150,"設定の初期値が正しくありません。");

    validateData(migrated);
  });

  runTest("v2からv3への移行は追加のみで繰り返しても同じ",() => {
    const oldData = createInitialData();
    oldData.schemaVersion = 2;
    delete oldData.fxSwapLedger;

    for (const account of oldData.accounts) {
      delete account.fieldLabels;
      delete account.autoCalc;
    }

    const fx = oldData.accounts.find(account => account.name === "LIGHT FX");
    fx.lossCutRatio = 77;
    fx.fieldLabels = {value:"独自の総資産名"};
    fx.autoCalc = null;

    const stock = oldData.accounts.find(account => account.name === "楽天証券");
    const sourceJson = JSON.stringify(oldData);

    const first = migrateDataV2ToV3(oldData);
    const second = migrateDataV2ToV3(oldData);

    assert(JSON.stringify(first) === JSON.stringify(second),
      "同じv2データからの移行結果が一致しません。");
    assert(first.schemaVersion === 3,"schemaVersionが3ではありません。");
    assert(first.accounts.find(account => account.name === "LIGHT FX").lossCutRatio === 77,
      "既存のFX設定が変更されています。");
    assert(first.accounts.find(account => account.name === "LIGHT FX").fieldLabels.value === "独自の総資産名",
      "既存のfieldLabelsが上書きされています。");
    assert(first.accounts.find(account => account.name === "LIGHT FX").fieldLabels.pnl === "建玉評価損益",
      "未設定のfieldLabelsが補完されていません。");
    assert(first.accounts.find(account => account.name === "LIGHT FX").autoCalc === null,
      "既存のautoCalcが上書きされています。");
    assert(first.accounts.find(account => account.id === stock.id).autoCalc === "principal",
      "株式口座のautoCalc初期値が正しくありません。");
    assert(Array.isArray(first.fxSwapLedger),"fxSwapLedgerが追加されていません。");
    assert(JSON.stringify(oldData) === sourceJson,
      "移行処理が元データを変更しています。");
    validateData(first);
  });

  runTest("FXデータの読み替え対象と複写",() => {
    const data = createInitialData();
    const fx = data.accounts.find(account => account.type === "fx");
    const stock = data.accounts.find(account => account.type === "securities");

    data.snapshots.push(
      {
        id:"map-target",
        accountId:fx.id,
        asOfDate:"2026-11-01",
        recordedAt:"2026-11-01T10:00:00.000Z",
        value:1000,
        effectivePrincipal:null,
        cash:800,
        memo:"架空データ"
      },
      {
        id:"map-zero",
        accountId:fx.id,
        asOfDate:"2026-11-02",
        recordedAt:"2026-11-02T10:00:00.000Z",
        value:1000,
        effectivePrincipal:null,
        cash:0,
        memo:"架空データ"
      },
      {
        id:"map-existing",
        accountId:fx.id,
        asOfDate:"2026-11-03",
        recordedAt:"2026-11-03T10:00:00.000Z",
        value:1000,
        effectivePrincipal:700,
        cash:900,
        memo:"架空データ"
      },
      {
        id:"map-stock",
        accountId:stock.id,
        asOfDate:"2026-11-01",
        recordedAt:"2026-11-01T10:00:00.000Z",
        value:1000,
        effectivePrincipal:null,
        cash:600,
        memo:"架空データ"
      }
    );

    const targets = getFxDataMappingTargets(data);
    assert(targets.length === 2,"FX読み替え対象が2件ではありません。");
    assert(targets.some(item => item.cash === 0),"現金0円の履歴が対象外です。");

    const mapped = applyFxDataMapping(data,targets);
    assert(mapped.snapshots.find(item => item.id === "map-target").effectivePrincipal === 800,
      "現金から有効元本への複写が正しくありません。");
    assert(mapped.snapshots.find(item => item.id === "map-zero").effectivePrincipal === 0,
      "0円の複写が正しくありません。");
    assert(mapped.snapshots.find(item => item.id === "map-target").cash === 800,
      "元のcashが保持されていません。");
    assert(data.snapshots.find(item => item.id === "map-target").effectivePrincipal === null,
      "元データが変更されています。");
    assert(getFxDataMappingTargets(mapped).length === 0,
      "2回目の読み替え対象が残っています。");
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
    assert(report.ngCount === 0,"正常データで自己診断NGが発生しました。");
    assert(report.items.find(item => item.name === "版情報").status === "info",
      "版情報がOK/NG判定から分離されていません。");
  });

  return results;
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
