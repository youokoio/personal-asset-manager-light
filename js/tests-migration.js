"use strict";

function registerMigrationTests(context) {
  const {assert,runTest,makeAccount,makeSnapshot} = context;

  function makeValidStockTrackingData() {
    const data = createInitialData();
    const stockAccount = data.accounts.find(account =>
      account.category === "stock"
    );
    const now = "2026-11-21T00:00:00.000Z";

    data.contributionPlans.push({
      id:"plan-test-1",
      accountId:stockAccount.id,
      productName:"テスト投信A",
      wrapper:"NISAつみたて",
      effectiveFrom:"2026-01",
      status:"積立中",
      plannedCash:10000,
      plannedPoint:0,
      memo:"架空データ",
      createdAt:now,
      updatedAt:now
    });

    data.contributions.push({
      id:"contribution-test-1",
      accountId:stockAccount.id,
      productName:"テスト投信A",
      wrapper:"NISAつみたて",
      fromMonth:"2026-01",
      toMonth:"2026-01",
      status:"実行",
      cashAmount:10000,
      pointAmount:0,
      memo:"架空データ",
      recordedAt:now,
      createdAt:now,
      updatedAt:now
    });

    data.saleChecks.push({
      id:"salecheck-test-1",
      accountId:stockAccount.id,
      level:"商品別",
      productName:"テスト投信A",
      wrapper:"NISAつみたて",
      toDate:"2026-04-30",
      fromDate:"2026-03-31",
      status:"利確確認済み",
      dismissReason:null,
      saleDate:"2026-04-15",
      realizedPnl:5000,
      proceeds:105000,
      source:"取引履歴",
      manual:false,
      memo:"架空データ",
      createdAt:now,
      updatedAt:now
    });

    return data;
  }

  function makeFakeStorage(raw,failMainWrite = false) {
    const values = new Map([[STORAGE_KEY,raw]]);
    return {
      values,
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key,value) {
        if (failMainWrite && key === STORAGE_KEY) {
          throw new Error("架空の保存失敗");
        }
        values.set(key,String(value));
      }
    };
  }

  function cloneTestData(data) {
    return JSON.parse(JSON.stringify(data));
  }

  runTest("v1からv4への連続移行と新項目追加",() => {
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
    const migratedV3 = migrateDataV2ToV3(migratedV2);
    const migrated = migrateDataV3ToV4(migratedV3);

    assert(migrated.schemaVersion === 4,"schemaVersionが4ではありません。");
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
    assert(Array.isArray(migrated.contributionPlans),"contributionPlansが追加されていません。");
    assert(Array.isArray(migrated.contributions),"contributionsが追加されていません。");
    assert(Array.isArray(migrated.saleChecks),"saleChecksが追加されていません。");
    assert(migrated.accounts[0].fieldLabels.value === "純資産額",
      "FX口座のfieldLabels初期値が正しくありません。");
    assert(migrated.accounts[0].autoCalc === "swap",
      "FX口座のautoCalc初期値が正しくありません。");
    assert(migrated.settings.targetRatio === 150,"設定の初期値が正しくありません。");

    validateData(migrated);
  });

  runTest("v2からv4への連続移行は追加のみで繰り返しても同じ",() => {
    const oldData = createInitialData();
    oldData.schemaVersion = 2;
    delete oldData.fxSwapLedger;
    delete oldData.contributionPlans;
    delete oldData.contributions;
    delete oldData.saleChecks;

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

    const first = migrateDataV3ToV4(migrateDataV2ToV3(oldData));
    const second = migrateDataV3ToV4(migrateDataV2ToV3(oldData));

    assert(JSON.stringify(first) === JSON.stringify(second),
      "同じv2データからの移行結果が一致しません。");
    assert(first.schemaVersion === 4,"schemaVersionが4ではありません。");
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


  runTest("S13a M1：v3からv4への移行と既存データ・バックアップ保持",() => {
    const oldData = createInitialData();
    oldData.schemaVersion = 3;
    delete oldData.contributionPlans;
    delete oldData.contributions;
    delete oldData.saleChecks;

    const stock = oldData.accounts.find(account =>
      account.category === "stock"
    );
    oldData.snapshots.push(makeSnapshot(
      "snapshot-m1",
      stock.id,
      "2026-10-31",
      "2026-10-31T10:00:00.000Z",
      123456,
      {cumulativeInvested:765432,principal:654321}
    ));

    const originalRaw = JSON.stringify(oldData);
    const storage = makeFakeStorage(originalRaw);
    const migrated = loadData(storage);

    assert(migrated.schemaVersion === 4,"v3データがv4になっていません。");
    assert(Array.isArray(migrated.contributionPlans) &&
      migrated.contributionPlans.length === 0,
      "contributionPlans が空配列で追加されていません。");
    assert(Array.isArray(migrated.contributions) &&
      migrated.contributions.length === 0,
      "contributions が空配列で追加されていません。");
    assert(Array.isArray(migrated.saleChecks) &&
      migrated.saleChecks.length === 0,
      "saleChecks が空配列で追加されていません。");
    assert(migrated.snapshots[0].cumulativeInvested === 765432,
      "cumulativeInvested が保持されていません。");
    assert(migrated.snapshots[0].principal === 654321,
      "旧principal が保持されていません。");
    assert(storage.getItem("pam2_pre_v4") === originalRaw,
      "移行前データの pam2_pre_v4 バックアップがありません。");

    const restored = cloneTestData(migrated);
    restored.schemaVersion = 3;
    delete restored.contributionPlans;
    delete restored.contributions;
    delete restored.saleChecks;
    assert(JSON.stringify(restored) === originalRaw,
      "新コレクション以外の既存データが変わっています。");
  });

  runTest("S13a：v2データはv3を経由してv4へ移行する",() => {
    const oldData = createInitialData();
    oldData.schemaVersion = 2;
    delete oldData.fxSwapLedger;
    delete oldData.contributionPlans;
    delete oldData.contributions;
    delete oldData.saleChecks;

    for (const account of oldData.accounts) {
      delete account.fieldLabels;
      delete account.autoCalc;
    }

    const originalRaw = JSON.stringify(oldData);
    const storage = makeFakeStorage(originalRaw);
    const migrated = loadData(storage);
    const beforeV4 = JSON.parse(storage.getItem("pam2_pre_v4"));

    assert(migrated.schemaVersion === 4,"v2データがv4になっていません。");
    assert(beforeV4.schemaVersion === 3,
      "v2からv3を経由した移行前バックアップがありません。");
    assert(Array.isArray(beforeV4.fxSwapLedger),
      "v2からv3への移行が実行されていません。");
    assert(storage.getItem("pam2_pre_v3") === originalRaw,
      "v2移行前の pam2_pre_v3 が保持されていません。");
  });

  runTest("S13a M2：v4 JSON往復とv3 JSONの読み込み",() => {
    const currentData = makeValidStockTrackingData();
    const exported = JSON.stringify(currentData);
    const imported = prepareImportedData(JSON.parse(exported));

    assert(JSON.stringify(imported) === exported,
      "v4 JSONの書き出し・読み込みで内容が変わっています。");

    const oldV3 = cloneTestData(currentData);
    oldV3.schemaVersion = 3;
    delete oldV3.contributionPlans;
    delete oldV3.contributions;
    delete oldV3.saleChecks;

    const restoredV3 = prepareImportedData(oldV3);
    assert(restoredV3.schemaVersion === 4,
      "v3 JSONがv4に移行されていません。");
    assert(restoredV3.contributionPlans.length === 0 &&
      restoredV3.contributions.length === 0 &&
      restoredV3.saleChecks.length === 0,
      "v3 JSONから新コレクションが空配列で追加されていません。");
  });

  runTest("S13a M3：積立・売却確認の検証エラー",() => {
    const base = makeValidStockTrackingData();

    function assertRejected(data,message) {
      let rejected = false;
      try {
        validateData(data);
      } catch (error) {
        rejected = true;
      }
      assert(rejected,message);
    }

    validateData(base);

    let invalid = cloneTestData(base);
    invalid.contributions[0].cashAmount = -1;
    assertRejected(invalid,"マイナスの積立金額が検出されません。");

    invalid = cloneTestData(base);
    invalid.contributions[0].fromMonth = "2026-13";
    assertRejected(invalid,"不正な月が検出されません。");

    invalid = cloneTestData(base);
    invalid.contributions[0].fromMonth = "2026-03";
    invalid.contributions[0].toMonth = "2026-02";
    assertRejected(invalid,"終了月が開始月より前の記録が検出されません。");

    invalid = cloneTestData(base);
    invalid.contributions[0].accountId = invalid.accounts.find(account =>
      account.category !== "stock"
    ).id;
    assertRejected(invalid,"株式以外の口座を指す記録が検出されません。");

    invalid = cloneTestData(base);
    invalid.saleChecks[0].realizedPnl = null;
    assertRejected(invalid,"利確確認済みで確定損益がない記録が検出されません。");

    invalid = cloneTestData(base);
    invalid.contributions.push({
      ...invalid.contributions[0],
      id:"contribution-overlap",
      fromMonth:"2025-12",
      toMonth:"2026-02"
    });
    assertRejected(invalid,"月範囲が重なる記録が検出されません。");

    invalid = cloneTestData(base);
    invalid.contributions[0].productName = null;
    invalid.contributions[0].wrapper = "特定";
    assertRejected(invalid,"口座全体の wrapper 不整合が検出されません。");

    invalid = cloneTestData(base);
    invalid.contributions[0].wrapper = null;
    assertRejected(invalid,"商品別記録の wrapper 欠落が検出されません。");

    invalid = cloneTestData(base);
    invalid.contributionPlans[0].productName = null;
    invalid.contributionPlans[0].wrapper = "特定";
    assertRejected(invalid,"積立予定の口座全体 wrapper 不整合が検出されません。");
  });

  runTest("S13a：月範囲の重なりは同一単位と口座全体・商品別で判定する",() => {
    const records = [
      {
        id:"a",
        accountId:"stock-1",
        productName:"テスト投信A",
        wrapper:"NISAつみたて",
        fromMonth:"2026-01",
        toMonth:"2026-03"
      },
      {
        id:"b",
        accountId:"stock-1",
        productName:"テスト投信B",
        wrapper:"NISAつみたて",
        fromMonth:"2026-02",
        toMonth:"2026-04"
      },
      {
        id:"c",
        accountId:"stock-1",
        productName:"テスト投信A",
        wrapper:"特定",
        fromMonth:"2026-02",
        toMonth:"2026-04"
      },
      {
        id:"d",
        accountId:"stock-1",
        productName:null,
        wrapper:null,
        fromMonth:"2026-03",
        toMonth:"2026-03"
      }
    ];

    const overlaps = findContributionMonthOverlaps(records);
    assert(overlaps.length === 3,
      "口座全体と商品別の重なり、同一商品の同一wrapperの重なりを正しく判定していません。");
    assert(overlaps.every(item => item.fromMonth === "2026-03" &&
      item.toMonth === "2026-03"),
      "重複している月の範囲が正しくありません。");
  });

  runTest("S13a M4：自己診断の項目9と注意表示",() => {
    const data = makeValidStockTrackingData();
    const diagnosis = runDataSelfDiagnosis(data,true);
    const item = diagnosis.items.find(result =>
      result.name === "積立・売却確認の整合"
    );

    assert(item && item.status === "ok",
      "正常データで自己診断の項目9がOKになりません。");

    const warningData = cloneTestData(data);
    warningData.contributions.push({
      ...warningData.contributions[0],
      id:"contribution-unlisted-product",
      productName:"保有・予定にない架空商品",
      wrapper:"特定",
      fromMonth:"2026-02",
      toMonth:"2026-02"
    });
    const warningDiagnosis = runDataSelfDiagnosis(warningData,true);
    const warningItem = warningDiagnosis.items.find(result =>
      result.name === "積立・売却確認の整合"
    );
    assert(warningItem.status === "ok" &&
      warningItem.detail.includes("保有商品・積立予定にありません"),
      "商品名の注意表示がOK/NG判定と分けて表示されません。");

    const invalidData = cloneTestData(data);
    invalidData.contributions.push({
      ...invalidData.contributions[0],
      id:"contribution-overlap-diagnosis",
      fromMonth:"2026-01",
      toMonth:"2026-02"
    });
    const invalidDiagnosis = runDataSelfDiagnosis(invalidData,true);
    const invalidItem = invalidDiagnosis.items.find(result =>
      result.name === "積立・売却確認の整合"
    );
    assert(invalidItem.status === "ng" &&
      invalidItem.detail.includes("月範囲が重複"),
      "重複した月範囲が自己診断のNGとして表示されません。");
  });

  runTest("S13a：保存共通関数は一時複製後に検証し、失敗時は本体を保持する",() => {
    const base = makeValidStockTrackingData();
    const originalRaw = JSON.stringify(base);
    const storage = makeFakeStorage(originalRaw);

    const saved = saveStockTrackingData(
      "contribution",
      draft => {
        draft.contributions.push({
          ...draft.contributions[0],
          id:"contribution-save-test",
          fromMonth:"2026-02",
          toMonth:"2026-02"
        });
      },
      storage
    );

    assert(storage.getItem("pam2_pre_contrib") === originalRaw,
      "積立の保存前バックアップが作られていません。");
    assert(saved.contributions.length === 2,
      "積立の変更内容が返されていません。");
    assert(JSON.parse(storage.getItem(STORAGE_KEY)).contributions.length === 2,
      "積立の変更内容が1回の保存で反映されていません。");

    const failingStorage = makeFakeStorage(originalRaw,true);
    let writeFailed = false;
    try {
      saveStockTrackingData(
        "saleCheck",
        draft => {
          draft.saleChecks[0].memo = "変更後";
        },
        failingStorage
      );
    } catch (error) {
      writeFailed = true;
    }

    assert(writeFailed,"偽の保存先の書き込み失敗が検出されません。");
    assert(failingStorage.getItem(STORAGE_KEY) === originalRaw,
      "保存失敗で本体データが変更されています。");
    assert(failingStorage.getItem("pam2_pre_salecheck") === originalRaw,
      "売却確認の保存前バックアップが作られていません。");

    const invalidStorage = makeFakeStorage(originalRaw);
    let validationFailed = false;
    try {
      saveStockTrackingData(
        "contribution",
        draft => {
          draft.contributions[0].cashAmount = -1;
        },
        invalidStorage
      );
    } catch (error) {
      validationFailed = true;
    }

    assert(validationFailed,"保存前の検証エラーが検出されません。");
    assert(invalidStorage.getItem(STORAGE_KEY) === originalRaw,
      "検証失敗で本体データが変更されています。");
    assert(invalidStorage.getItem("pam2_pre_contrib") === originalRaw,
      "検証失敗時の積立バックアップがありません。");
  });
}
