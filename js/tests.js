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
      let diagnostic = "";

      if (name === "S5a追補：建玉フォーム（新規）の描画" ||
          name === "S5a追補：建玉フォーム（編集）の保存値描画") {
        const descriptor = Object.getOwnPropertyDescriptor(
          globalThis,
          "appData"
        );
        const descriptorText = descriptor
          ? "configurable=" + descriptor.configurable +
            ", writable=" +
              ("writable" in descriptor ? descriptor.writable : "accessor") +
            ", valueType=" +
              ("value" in descriptor ? typeof descriptor.value : "accessor")
          : "なし";
        const runner = document.body &&
          document.body.dataset.testRunner === "true"
            ? "test.html"
            : "アプリ内";
        diagnostic = " / 診断：" + runner +
          "、typeof appData=" + typeof appData +
          "、typeof globalThis.appData=" + typeof globalThis.appData +
          "、globalThis.appData属性={" + descriptorText + "}";
      }

      results.push({
        name,
        success:false,
        message:(error && error.name ? error.name : "Error") + ": " +
          (error && error.message ? error.message : String(error)) +
          (error && error.stack ? "\n" + error.stack : "") + diagnostic
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

  const context = {
    assert,
    runTest,
    makeAccount,
    makeSnapshot
  };

  registerMigrationTests(context);
  registerSummaryTests(context);
  registerInputTests(context);
  registerBulkTests(context);
  registerBulkSwapTests(context);
  registerChartTests(context);
  registerHoldingsTests(context);
  registerFxTests(context);
  registerFxSettlementTests(context);
  registerFxSettlementSimulationTests(context);
  registerFxSwapAllocationTests(context);
  registerFxSwapEstimateTests(context);
  registerFxPositionBatchTests(context);
  registerLoanTests(context);
  registerSnapshotEditTests(context);
  registerOcrTests(context);
  registerStockOcrTests(context);
  registerStockOcrComparisonTests(context);
  registerBulkOcrRenderTests(context);
  registerContributionTests(context);
  registerContributionRenderTests(context);
  registerSaleCheckTests(context);
  registerSaleCheckRenderTests(context);

  return results;
}

function registerBulkSwapTests(context) {
  const {assert,runTest} = context;

  runTest("S12a⑩：FX累計スワップの数値入力と保存",() => {
    const data = createInitialData();
    const tsv = [
      "対象日\t口座名\t総資産\t有効元本\t評価損益\t累積確定損益\t現金\tメモ\t累計スワップ",
      "2026-11-05\tLIGHT FX\t5000000\t1000000\t-100\t200\t100000\tテスト\t12345"
    ].join("\n");

    const parsed = parseBulkImportTsv(tsv);
    assert(parsed.error === null,"FX累計スワップのTSV解析に失敗しました。");

    const rows = classifyBulkImportRows(
      parsed.rows,
      data.accounts,
      data.snapshots
    );

    assert(rows[0].status === "planned",
      "FXの累計スワップ数値が取込予定になっていません。");
    assert(rows[0].swapTotal === 12345,
      "FXの累計スワップ数値が12345として解析されていません。");

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

    const saved = saveBulkImportRows(
      data,
      rows,
      fakeStorage,
      {
        recordedAt:"2026-11-13T10:00:00.000Z",
        idFactory:() => "bulk-swap-numeric"
      }
    );

    assert(saved.addedCount === 1,"FX履歴が1件保存されていません。");

    const snapshot = saved.data.snapshots.find(
      item => item.id === "bulk-swap-numeric"
    );
    assert(snapshot.swapTotal === 12345,
      "累計スワップ12345が保存データに反映されていません。");
    validateData(saved.data);
  });

  runTest("S12a⑪：FX累計スワップの空欄",() => {
    const data = createInitialData();
    const tsv = [
      "対象日\t口座名\t総資産\t有効元本\t評価損益\t累積確定損益\t現金\tメモ\t累計スワップ",
      "2026-11-05\tLIGHT FX\t5000000\t1000000\t-100\t200\t100000\tテスト\t"
    ].join("\n");

    const parsed = parseBulkImportTsv(tsv);
    assert(parsed.error === null,"空欄のTSV解析に失敗しました。");

    const rows = classifyBulkImportRows(
      parsed.rows,
      data.accounts,
      data.snapshots
    );

    assert(rows[0].status === "planned",
      "FX累計スワップの空欄が取込予定になっていません。");
    assert(rows[0].swapTotal === null,
      "FX累計スワップの空欄がnullになっていません。");
  });

  runTest("S12a⑫：FX累計スワップの不正値",() => {
    const data = createInitialData();
    const tsv = [
      "対象日\t口座名\t総資産\t有効元本\t評価損益\t累積確定損益\t現金\tメモ\t累計スワップ",
      "2026-11-05\tLIGHT FX\t5000000\t1000000\t-100\t200\t100000\tテスト\tabc"
    ].join("\n");

    const parsed = parseBulkImportTsv(tsv);
    assert(parsed.error === null,"不正値テストのTSV解析自体が失敗しました。");

    const rows = classifyBulkImportRows(
      parsed.rows,
      data.accounts,
      data.snapshots
    );

    assert(rows[0].status === "error",
      "FX累計スワップの不正値がエラーになっていません。");
  });

  runTest("S12a⑬：銀行口座の累計スワップ入力制限",() => {
    const data = createInitialData();
    const tsv = [
      "対象日\t口座名\t総資産\t有効元本\t評価損益\t累積確定損益\t現金\tメモ\t累計スワップ",
      "2026-11-05\tUFJ1\t100000\t\t\t\t100000\tテスト\t100"
    ].join("\n");

    const parsed = parseBulkImportTsv(tsv);
    assert(parsed.error === null,"銀行口座テストのTSV解析に失敗しました。");

    const rows = classifyBulkImportRows(
      parsed.rows,
      data.accounts,
      data.snapshots
    );

    assert(rows[0].status === "error",
      "銀行口座の累計スワップ入力がエラーになっていません。");
  });

  runTest("S12a⑭：証券口座など非FX口座の累計スワップ入力制限",() => {
    const data = createInitialData();
    const account = data.accounts.find(
      item => item.name === "楽天証券"
    );

    assert(account !== undefined,"テスト対象の楽天証券口座がありません。");

    const tsv = [
      "対象日\t口座名\t総資産\t有効元本\t評価損益\t累積確定損益\t現金\tメモ\t累計スワップ",
      "2026-11-05\t楽天証券\t1000000\t800000\t200000\t\t\tテスト\t100"
    ].join("\n");

    const parsed = parseBulkImportTsv(tsv);
    assert(parsed.error === null,"証券口座テストのTSV解析に失敗しました。");

    const rows = classifyBulkImportRows(
      parsed.rows,
      data.accounts,
      data.snapshots
    );

    assert(rows[0].status === "error",
      "非FX口座の累計スワップ入力がエラーになっていません。");
  });

  runTest("S12a⑮：従来の8列TSVとの互換性",() => {
    const data = createInitialData();
    const tsv = [
      "対象日\t口座名\t総資産\t有効元本\t評価損益\t累積確定損益\t現金\tメモ",
      "2026-11-05\tLIGHT FX\t5000000\t1000000\t-100\t200\t100000\t従来形式"
    ].join("\n");

    const parsed = parseBulkImportTsv(tsv);
    assert(parsed.error === null,"従来8列TSVの解析に失敗しました。");
    assert(parsed.rows.length === 1,"従来8列TSVが1行に展開されていません。");

    const rows = classifyBulkImportRows(
      parsed.rows,
      data.accounts,
      data.snapshots
    );

    assert(rows[0].status === "planned",
      "従来8列TSVが取込予定になっていません。");
    assert(rows[0].memo === "従来形式",
      "従来8列TSVのメモが保持されていません。");
    assert(rows[0].swapTotal === null,
      "従来8列TSVの累計スワップがnullになっていません。");
  });

  runTest("S12a⑯：10列以上のTSVをエラーにする",() => {
    const tsv =
      "2026-11-05\tLIGHT FX\t5000000\t1000000\t-100\t200\t100000\tテスト\t12345\t余分";

    const parsed = parseBulkImportTsv(tsv);
    assert(parsed.error === null,
      "10列TSVの行解析自体が失敗しました。");

    const data = createInitialData();
    const rows = classifyBulkImportRows(
      parsed.rows,
      data.accounts,
      data.snapshots
    );

    assert(rows.length === 1,
      "10列TSVが1行として解析されていません。");
    assert(rows[0].status === "error",
      "10列のTSVが行単位のエラーになっていません。");
    assert(rows[0].reasons.includes("列が9列を超えています。"),
      "10列目が余分な列として検出されていません。");
  });
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
