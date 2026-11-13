"use strict";

function registerMigrationTests(context) {
  const {assert,runTest,makeAccount,makeSnapshot} = context;

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
      "既存のFX設定が上書きされています。");
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

}
