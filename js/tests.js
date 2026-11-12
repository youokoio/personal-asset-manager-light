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

  /* ---------- S1g 入力補助テスト ---------- */

  runTest("S1g：株式の有効元本自動計算3例",() => {
    const account = makeAccount("stock-auto","架空証券口座","securities","stock");
    account.autoCalc = "principal";

    const cases = [
      {value:243723,pnl:33564,expected:210159},
      {value:5746195,pnl:2712811,expected:3033384},
      {value:4903591,pnl:2183640,expected:2719951}
    ];

    for (const item of cases) {
      const actual = calculateAutoCalcValue(account,item);
      assert(actual === item.expected,
        `有効元本の計算不一致：${item.value}−${item.pnl}=${actual}`);
    }
  });

  runTest("S1g：FX累計スワップ自動計算3口座",() => {
    const cases = [
      {
        name:"LIGHT FX",
        value:5098791,
        effectivePrincipal:1331457,
        pnl:-2376320,
        expected:6143654
      },
      {
        name:"クリック365",
        value:2584077,
        effectivePrincipal:276239,
        pnl:896000,
        expected:1411838
      },
      {
        name:"LION FX",
        value:2526224,
        effectivePrincipal:711119,
        pnl:924600,
        expected:890505
      }
    ];

    for (const item of cases) {
      const account = makeAccount(item.name,item.name,"fx","fx");
      account.autoCalc = "swap";
      const actual = calculateAutoCalcValue(account,item);
      assert(actual === item.expected,
        `${item.name}の累計スワップ計算が一致しません。`);
    }
  });

  runTest("S1g：口座分類ごとに自動計算の選択肢を制限",() => {
    const fx = makeAccount("fx","LIGHT FX","fx","fx");
    const central = makeAccount(
      "central","セントラル短資FX","fx","fx"
    );
    const stock = makeAccount(
      "stock","架空証券口座","securities","stock"
    );
    const crypto = makeAccount(
      "crypto","架空暗号資産口座","crypto","crypto"
    );
    const bank = makeAccount(
      "bank","架空銀行","bank","bank"
    );

    assert(
      JSON.stringify(getAllowedAutoCalcValues(fx)) ===
        JSON.stringify(["","swap"]),
      "通常のFX口座は「なし／swap」のみ選択できません。"
    );
    assert(
      JSON.stringify(getAllowedAutoCalcValues(central)) ===
        JSON.stringify([""]),
      "セントラル短資FXに自動計算の選択肢があります。"
    );
    assert(
      JSON.stringify(getAllowedAutoCalcValues(stock)) ===
        JSON.stringify(["","principal"]),
      "株式口座は「なし／principal」のみ選択できません。"
    );
    assert(
      JSON.stringify(getAllowedAutoCalcValues(crypto)) ===
        JSON.stringify([""]),
      "暗号資産口座に自動計算の選択肢があります。"
    );
    assert(
      JSON.stringify(getAllowedAutoCalcValues(bank)) ===
        JSON.stringify([""]),
      "銀行口座に自動計算の選択肢があります。"
    );
  });

  runTest("S1g：セントラル短資FXは自動計算しない",() => {
    const account = makeAccount(
      "central","セントラル短資FX","fx","fx"
    );
    account.autoCalc = null;

    const actual = calculateAutoCalcValue(account,{
      value:1000000,
      effectivePrincipal:500000,
      pnl:100000
    });

    assert(actual === null,
      "自動計算なしの口座で計算値が返されています。");
  });

  runTest("S1g：前回値は対象日より前の最新記録",() => {
    const data = {
      snapshots:[
        makeSnapshot(
          "oct31","a","2026-10-31",
          "2026-10-31T10:00:00.000Z",100
        ),
        makeSnapshot(
          "nov05","a","2026-11-05",
          "2026-11-05T10:00:00.000Z",200
        )
      ]
    };

    const onNov05 = getPreviousSnapshotForInput(
      data,"a","2026-11-05"
    );
    const onNov06 = getPreviousSnapshotForInput(
      data,"a","2026-11-06"
    );
    const editingNov05 = getPreviousSnapshotForInput(
      data,"a","2026-11-05","nov05"
    );
    const beforeOct31 = getPreviousSnapshotForInput(
      data,"a","2026-10-30"
    );

    assert(onNov05 && onNov05.id === "oct31",
      "11月5日の新規入力で10月31日の記録が前回になっていません。");
    assert(onNov06 && onNov06.id === "nov05",
      "11月6日の前回値に11月5日の記録が選ばれていません。");
    assert(editingNov05 && editingNov05.id === "oct31",
      "11月5日の編集中に10月31日の記録が選ばれていません。");
    assert(beforeOct31 === null,
      "対象日より前に記録がないのに前回値が返されています。");
  });

  runTest("S1g：対象日の初期値は端末日付",() => {
    const deviceDate = new Date(2026,10,11);
    assert(
      localDateString(deviceDate) === "2026-11-11",
      "端末日付から対象日を正しく作成できていません。"
    );
  });

  runTest("S1g：数値の3桁区切りとカンマ除去",() => {
    assert(
      formatInputNumber(1234567.89) === "1,234,567.89",
      "入力欄の3桁区切りが正しくありません。"
    );
    assert(
      toNumberOrNull("1,234,567.89") === 1234567.89,
      "カンマ付き入力を数値に戻せていません。"
    );
    assert(
      toNumberOrNull("-1,234.5") === -1234.5,
      "マイナス・小数の入力を正しく読み取れていません。"
    );
  });

  /* ---------- S3b 履歴一括入力テスト ---------- */

  runTest("S3b：仕様書12-6の8行と保存結果",() => {
    const data = createInitialData();
    const lightFx = data.accounts.find(
      account => account.name === "LIGHT FX"
    );

    data.snapshots.push(makeSnapshot(
      "bulk-existing",
      lightFx.id,
      "2026-10-31",
      "2026-10-31T10:00:00.000Z",
      4000000
    ));

    const tsv = [
      "対象日\t口座名\t総資産\t有効元本\t評価損益\t累積確定損益\t現金\tメモ",
      "2026-11-05\tLIGHT FX\t5,098,791\t1,331,457\t-2,376,320",
      "2026-11-05\tXYZ銀行\t100",
      "2026-11-05\tGMOコイン\tabc",
      "2026-10-31\tLIGHT FX\t4000000",
      "2026-11-05\tUFJ1\t1,234,567円",
      "2026-11-05\tUFJ1\t1,300,000",
      "2026-11-05\tUFJ2\t500000\t\t100",
      "2026-11-05\tLION FX\t2526224\t\t\t100"
    ].join("\n");

    const parsed = parseBulkImportTsv(tsv);
    assert(parsed.error === null,"TSVの解析でエラーが発生しました。");
    assert(parsed.rows.length === 8,"8行に展開されていません。");

    const rows = classifyBulkImportRows(
      parsed.rows,
      data.accounts,
      data.snapshots
    );
    const summary = summarizeBulkImportRows(rows);

    assert(summary.planned === 2,"取込予定が2件ではありません。");
    assert(summary.error === 4,"エラーが4件ではありません。");
    assert(summary.duplicate === 2,"重複が2件ではありません。");

    assert(rows[0].value === 5098791,"LIGHT FXの総資産が正しくありません。");
    assert(rows[0].effectivePrincipal === 1331457,"LIGHT FXの有効元本が正しくありません。");
    assert(rows[0].pnl === -2376320,"LIGHT FXの評価損益が正しくありません。");
    assert(rows[4].value === 1234567,"UFJ1の総資産が正しくありません。");

    const rawBefore = JSON.stringify(data);
    const storageMap = new Map([[STORAGE_KEY,rawBefore]]);
    const fakeStorage = {
      getItem(key) {
        return storageMap.has(key) ? storageMap.get(key) : null;
      },
      setItem(key,value) {
        storageMap.set(key,String(value));
      }
    };

    let idNumber = 0;
    const saved = saveBulkImportRows(
      data,
      rows,
      fakeStorage,
      {
        recordedAt:"2026-11-13T10:00:00.000Z",
        idFactory:() => "bulk-saved-" + (++idNumber)
      }
    );

    assert(saved.addedCount === 2,"追加件数が2件ではありません。");
    assert(saved.data.snapshots.length === 3,"履歴が1件から3件になっていません。");
    assert(storageMap.get("pam2_pre_bulk") === rawBefore,
      "pam2_pre_bulkに取込前データが保存されていません。");
    assert(storageMap.get(STORAGE_KEY) === JSON.stringify(saved.data),
      "新しいデータが本体キーに保存されていません。");
    assert(data.snapshots.length === 1,"元データが変更されています。");

    const addedFx = saved.data.snapshots.find(
      snapshot => snapshot.id === "bulk-saved-1"
    );
    assert(addedFx.swapTotal === null,"累計スワップがnullではありません。");
    assert(addedFx.requiredMargin === null,"必要証拠金がnullではありません。");
    assert(addedFx.principal === null,"旧principalがnullではありません。");
    assert(addedFx.cumulativeInvested === null,
      "累計投資元本がnullではありません。");

    validateData(saved.data);
  });

  runTest("S3b：日付の正規化と実在日付の検証",() => {
    assert(
      normalizeBulkDate("2026-11-05").value === "2026-11-05",
      "ハイフン形式の日付を正規化できません。"
    );
    assert(
      normalizeBulkDate("2026/11/5").value === "2026-11-05",
      "スラッシュ形式の日付を正規化できません。"
    );
    assert(
      normalizeBulkDate("2026年11月5日").value === "2026-11-05",
      "年月日形式の日付を正規化できません。"
    );
    assert(
      normalizeBulkDate("2026-02-30").error !== null,
      "実在しない日付が許可されています。"
    );
  });

  runTest("S3b：全角数字・通貨記号・マイナスの数値正規化",() => {
    assert(
      normalizeBulkNumber("１２３，４５６").error !== null,
      "仕様にない全角カンマを変換していません。"
    );
    assert(
      normalizeBulkNumber("１２３４５６").value === 123456,
      "全角数字を半角数値に変換できません。"
    );
    assert(
      normalizeBulkNumber("1,234,567円").value === 1234567,
      "カンマ・円付き数値を変換できません。"
    );
    assert(
      normalizeBulkNumber("−12,345").value === -12345,
      "U+2212のマイナスを変換できません。"
    );
    assert(
      normalizeBulkNumber("▲100").error !== null,
      "▲表記を数値として誤変換しています。"
    );
    assert(
      normalizeBulkNumber("(100)").error !== null,
      "括弧表記を数値として誤変換しています。"
    );
  });

  runTest("S3b：列不足は空欄・列超過はエラー・500行上限",() => {
    const shortRow = parseBulkImportTsv(
      "2026-11-05\tGMOコイン\t100"
    );
    assert(shortRow.rows.length === 1,"列不足の行を解析できません。");
    assert(shortRow.rows[0].effectivePrincipal === null,
      "不足列がnullになっていません。");
    assert(shortRow.rows[0].memo === "",
      "不足したメモ列が空欄になっていません。");

    const longRow = parseBulkImportTsv(
      "2026-11-05\tGMOコイン\t100\t\t\t\t\t\t余分"
    );
    const account = createInitialData().accounts;
    const classified = classifyBulkImportRows(
      longRow.rows,
      account,
      []
    );
    assert(classified[0].status === "error",
      "9列の行がエラーになっていません。");

    const tooManyRows = Array.from(
      {length:501},
      () => "2026-11-05\tGMOコイン\t100"
    ).join("\n");
    assert(
      parseBulkImportTsv(tooManyRows).error !== null,
      "501行の貼り付けが拒否されていません。"
    );
  });

  runTest("S3b：セル編集で行の状態を再判定",() => {
    const data = createInitialData();
    const parsed = parseBulkImportTsv(
      "2026-11-05\t存在しない口座\t100"
    );
    let rows = classifyBulkImportRows(
      parsed.rows,
      data.accounts,
      data.snapshots
    );

    assert(rows[0].status === "error",
      "存在しない口座名がエラーになっていません。");

    rows = updateBulkImportRow(
      rows,
      rows[0].id,
      "accountName",
      "GMOコイン"
    );
    rows = classifyBulkImportRows(
      rows,
      data.accounts,
      data.snapshots
    );

    assert(rows[0].status === "planned",
      "口座名の編集後に取込予定へ再判定されていません。");
  });

  runTest("S3b：行の追加と削除",() => {
    let rows = [];
    rows = addBulkImportRow(rows);
    rows = addBulkImportRow(rows);

    assert(rows.length === 2,"行を2件追加できません。");
    assert(rows[0].rowNumber === 1 && rows[1].rowNumber === 2,
      "行番号が正しくありません。");

    rows = deleteBulkImportRow(rows,rows[0].id);

    assert(rows.length === 1,"行を削除できません。");
    assert(rows[0].rowNumber === 1,"削除後の行番号が詰められていません。");
  });

  runTest("S3b：保存関数を呼ぶ前は保存先を変更しない",() => {
    const data = createInitialData();
    const raw = JSON.stringify(data);
    const storageMap = new Map([[STORAGE_KEY,raw]]);
    let writeCount = 0;

    const fakeStorage = {
      getItem(key) {
        return storageMap.has(key) ? storageMap.get(key) : null;
      },
      setItem(key,value) {
        writeCount += 1;
        storageMap.set(key,String(value));
      }
    };

    const parsed = parseBulkImportTsv(
      "2026-11-05\tGMOコイン\t100"
    );
    const rows = classifyBulkImportRows(
      parsed.rows,
      data.accounts,
      data.snapshots
    );

    assert(rows[0].status === "planned",
      "確認用の行が取込予定になっていません。");
    assert(writeCount === 0,
      "保存関数を呼ぶ前に保存先へ書き込まれています。");
    assert(storageMap.get(STORAGE_KEY) === raw,
      "承認前に本体データが変更されています。");
    assert(!storageMap.has("pam2_pre_bulk"),
      "承認前に一時バックアップが作られています。");
  });

  runTest("S3b：本体書き込み失敗時に既存データを保持",() => {
    const data = createInitialData();
    const raw = JSON.stringify(data);
    const storageMap = new Map([[STORAGE_KEY,raw]]);

    const fakeStorage = {
      getItem(key) {
        return storageMap.has(key) ? storageMap.get(key) : null;
      },
      setItem(key,value) {
        if (key === STORAGE_KEY) {
          throw new Error("テスト用の書き込み失敗");
        }
        storageMap.set(key,String(value));
      }
    };

    const parsed = parseBulkImportTsv(
      "2026-11-05\tGMOコイン\t100"
    );
    const rows = classifyBulkImportRows(
      parsed.rows,
      data.accounts,
      data.snapshots
    );

    let failed = false;
    try {
      saveBulkImportRows(
        data,
        rows,
        fakeStorage,
        {
          recordedAt:"2026-11-13T10:00:00.000Z",
          idFactory:() => "bulk-failed"
        }
      );
    } catch (error) {
      failed = true;
    }

    assert(failed,"本体データの書き込み失敗が検出されていません。");
    assert(storageMap.get(STORAGE_KEY) === raw,
      "書き込み失敗で既存データが変わっています。");
    assert(storageMap.get("pam2_pre_bulk") === raw,
      "書き込み失敗時の一時バックアップがありません。");
    assert(data.snapshots.length === 0,
      "元データが変更されています。");
  });

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
