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
        {
          id:"old",
          accountId:"a1",
          asOfDate:"2026-11-01",
          recordedAt:"2026-11-01T09:00:00.000Z",
          value:100,
          memo:""
        },
        {
          id:"new",
          accountId:"a1",
          asOfDate:"2026-11-01",
          recordedAt:"2026-11-01T12:00:00.000Z",
          value:150,
          memo:""
        },
        {
          id:"previous",
          accountId:"a1",
          asOfDate:"2026-10-31",
          recordedAt:"2026-10-31T12:00:00.000Z",
          value:90,
          memo:""
        }
      ]
    };

    assert(getLatestSnapshot(data,"a1").id === "new","最新記録の採用が正しくありません。");
    assert(getPreviousSnapshot(data,"a1").id === "previous","前回記録の採用が正しくありません。");

    const snapshots = getAccountSnapshots(data,"a1");
    assert(snapshots.length === 2,"同一対象日の重複が除外されていません。");
  });

  runTest("分類別集計と銀行の前回比",() => {
    const data = {
      accounts:[
        makeAccount("fx1","架空FX口座","fx","fx"),
        makeAccount("stock1","架空証券口座","securities","stock"),
        makeAccount("bank1","架空銀行口座","bank","bank")
      ],
      snapshots:[
        {
          id:"fx-old",
          accountId:"fx1",
          asOfDate:"2026-11-09",
          recordedAt:"2026-11-09T10:00:00.000Z",
          value:900,
          cumulativeInvested:600,
          effectivePrincipal:700,
          pnl:80,
          realizedPnlTotal:null,
          memo:""
        },
        {
          id:"fx-new",
          accountId:"fx1",
          asOfDate:"2026-11-10",
          recordedAt:"2026-11-10T10:00:00.000Z",
          value:1000,
          cumulativeInvested:700,
          effectivePrincipal:800,
          pnl:100,
          realizedPnlTotal:null,
          memo:""
        },
        {
          id:"stock-new",
          accountId:"stock1",
          asOfDate:"2026-11-10",
          recordedAt:"2026-11-10T10:00:00.000Z",
          value:2000,
          cumulativeInvested:null,
          effectivePrincipal:1500,
          pnl:-50,
          realizedPnlTotal:10,
          memo:""
        },
        {
          id:"bank-old",
          accountId:"bank1",
          asOfDate:"2026-11-09",
          recordedAt:"2026-11-09T10:00:00.000Z",
          value:450,
          memo:""
        },
        {
          id:"bank-new",
          accountId:"bank1",
          asOfDate:"2026-11-10",
          recordedAt:"2026-11-10T10:00:00.000Z",
          value:500,
          memo:""
        }
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
    assert(totals.bank.bankChange === 50,"銀行の前回比が正しくありません。");
    assert(totals.fx.inputAccountCount === 1,"FXの入力済み口座数が正しくありません。");
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
