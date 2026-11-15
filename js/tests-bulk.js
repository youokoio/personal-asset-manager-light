"use strict";

function registerBulkTests(context) {
  const {assert,runTest,makeAccount,makeSnapshot} = context;

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

    assert(summary.planned === 3,"取込予定が3件ではありません。");
    assert(summary.error === 3,"エラーが3件ではありません。");
    assert(summary.duplicate === 2,"重複が2件ではありません。");

    assert(rows[0].value === 5098791,"LIGHT FXの総資産が正しくありません。");
    assert(rows[0].effectivePrincipal === 1331457,"LIGHT FXの有効元本が正しくありません。");
    assert(rows[0].pnl === -2376320,"LIGHT FXの評価損益が正しくありません。");
    assert(rows[4].value === 1234567,"UFJ1の総資産が正しくありません。");
    assert(rows[7].realizedPnlTotal === 100,
      "LION FXの累積確定損益が100ではありません。");

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

    assert(saved.addedCount === 3,"追加件数が3件ではありません。");
    assert(saved.data.snapshots.length === 4,"履歴が1件から4件になっていません。");
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
    assert(addedFx.realizedPnlTotal === null,
      "空欄の累積確定損益がnullではありません。");

    const addedLionFx = saved.data.snapshots.find(
      snapshot => snapshot.id === "bulk-saved-3"
    );
    assert(addedLionFx.realizedPnlTotal === 100,
      "LION FXの累積確定損益100が保存されていません。");

    validateData(saved.data);
  });

  runTest("S5b追補：FX累積確定損益の数値・空欄・不正値・銀行制限・重複",() => {
    const data = createInitialData();
    const lightFx = data.accounts.find(
      account => account.name === "LIGHT FX"
    );
    const bank = data.accounts.find(
      account => account.name === "UFJ1"
    );

    data.snapshots.push(makeSnapshot(
      "realized-existing",
      lightFx.id,
      "2026-10-31",
      "2026-10-31T10:00:00.000Z",
      4000000
    ));

    const tsv = [
      "対象日\t口座名\t総資産\t有効元本\t評価損益\t累積確定損益\t現金\tメモ",
      "2026-11-05\tLIGHT FX\t5000000\t\t\t12345",
      "2026-11-06\tLIGHT FX\t5100000",
      "2026-11-07\tLIGHT FX\t5200000\t\t\tabc",
      "2026-11-08\tUFJ1\t100000\t\t\t100",
      "2026-10-31\tLIGHT FX\t4000000"
    ].join("\n");

    const parsed = parseBulkImportTsv(tsv);
    assert(parsed.error === null,"FX累積確定損益テストのTSV解析に失敗しました。");

    const rows = classifyBulkImportRows(
      parsed.rows,
      data.accounts,
      data.snapshots
    );

    assert(rows[0].status === "planned",
      "FXの累積確定損益数値が取込予定になっていません。");
    assert(rows[0].realizedPnlTotal === 12345,
      "FXの累積確定損益数値が保持されていません。");

    assert(rows[1].status === "planned",
      "FXの累積確定損益空欄が取込予定になっていません。");
    assert(rows[1].realizedPnlTotal === null,
      "FXの累積確定損益空欄がnullになっていません。");

    assert(rows[2].status === "error",
      "FXの累積確定損益abcがエラーになっていません。");

    assert(rows[3].status === "error",
      "銀行口座の累積確定損益入力がエラーになっていません。");
    assert(rows[4].status === "duplicate",
      "既存のFX履歴と同じ口座・対象日が重複になっていません。");

    const summary = summarizeBulkImportRows(rows);
    assert(summary.planned === 2,"FXの取込予定が2件ではありません。");
    assert(summary.error === 2,"エラーが2件ではありません。");
    assert(summary.duplicate === 1,"重複が1件ではありません。");

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
        idFactory:() => "realized-saved-" + (++idNumber)
      }
    );

    assert(saved.addedCount === 2,"FXの追加件数が2件ではありません。");

    const numericSnapshot = saved.data.snapshots.find(
      snapshot => snapshot.id === "realized-saved-1"
    );
    const blankSnapshot = saved.data.snapshots.find(
      snapshot => snapshot.id === "realized-saved-2"
    );

    assert(numericSnapshot.realizedPnlTotal === 12345,
      "FXの累積確定損益数値が保存されていません。");
    assert(blankSnapshot.realizedPnlTotal === null,
      "FXの累積確定損益空欄がnullで保存されていません。");

    validateData(saved.data);
  });

  runTest("S5b追補：日付時点のFX累積確定損益と基準値の選択",() => {
    const data = createInitialData();
    const account = data.accounts.find(
      item => item.name === "LIGHT FX"
    );

    data.snapshots.push({
      id:"realized-base-old",
      accountId:account.id,
      asOfDate:"2026-01-01",
      recordedAt:"2026-01-01T10:00:00.000Z",
      value:1000000,
      realizedPnlTotal:1000
    });
    data.snapshots.push({
      id:"realized-base-new",
      accountId:account.id,
      asOfDate:"2026-02-01",
      recordedAt:"2026-02-01T10:00:00.000Z",
      value:1100000,
      realizedPnlTotal:1500
    });
    data.snapshots.push({
      id:"realized-base-null",
      accountId:account.id,
      asOfDate:"2026-03-01",
      recordedAt:"2026-03-01T10:00:00.000Z",
      value:1200000,
      realizedPnlTotal:null
    });

    data.fxPositions.push(
      {
        id:"realized-settlement-before",
        accountId:account.id,
        status:"決済済",
        closeDate:"2026-01-20",
        realizedPnl:300
      },
      {
        id:"realized-settlement-on-base",
        accountId:account.id,
        status:"決済済",
        closeDate:"2026-02-01",
        realizedPnl:400
      },
      {
        id:"realized-settlement-after",
        accountId:account.id,
        status:"決済済",
        closeDate:"2026-02-10",
        realizedPnl:200
      },
      {
        id:"realized-settlement-negative",
        accountId:account.id,
        status:"決済済",
        closeDate:"2026-03-10",
        realizedPnl:-50
      },
      {
        id:"realized-settlement-future",
        accountId:account.id,
        status:"決済済",
        closeDate:"2026-03-20",
        realizedPnl:900
      }
    );

    const result = getFxRealizedAt(
      data,
      account.id,
      "2026-03-15"
    );

    assert(result !== null,"累積確定損益がnullになっています。");
    assert(result.baseAmount === 1500,"最新の有効な履歴基準値を選べていません。");
    assert(result.baseDate === "2026-02-01","履歴基準日が正しくありません。");
    assert(result.baseSource === "履歴","基準の出所が履歴になっていません。");
    assert(result.baseUnset === false,"基準額未設定の判定が正しくありません。");
    assert(result.settledPnl === 150,"基準日後の決済損益合計が150ではありません。");
    assert(result.settledCount === 2,"加算対象の決済件数が2件ではありません。");
    assert(result.value === 1650,"累積確定損益が1650ではありません。");
  });

  runTest("S5b追補：同日は口座設定を優先し、履歴の同日複数件は最新登録を選択",() => {
    const data = createInitialData();
    const account = data.accounts.find(
      item => item.name === "LIGHT FX"
    );

    data.snapshots.push({
      id:"same-date-history-old",
      accountId:account.id,
      asOfDate:"2026-04-01",
      recordedAt:"2026-04-01T09:00:00.000Z",
      realizedPnlTotal:1000
    });
    data.snapshots.push({
      id:"same-date-history-new",
      accountId:account.id,
      asOfDate:"2026-04-01",
      recordedAt:"2026-04-01T12:00:00.000Z",
      realizedPnlTotal:1200
    });

    let result = getFxRealizedAt(
      data,
      account.id,
      "2026-04-01"
    );

    assert(result.baseAmount === 1200,
      "同日の履歴で最新登録値を選べていません。");
    assert(result.baseSource === "履歴",
      "履歴の基準出所が正しくありません。");

    account.realizedBaseAmount = 2000;
    account.realizedBaseDate = "2026-04-01";

    result = getFxRealizedAt(
      data,
      account.id,
      "2026-04-01"
    );

    assert(result.baseAmount === 2000,
      "同日の口座設定が履歴より優先されていません。");
    assert(result.baseSource === "口座設定",
      "口座設定の基準出所が正しくありません。");
  });

  runTest("S5b追補：基準値がなく決済だけがある場合と、対象日以前に情報がない場合",() => {
    const data = createInitialData();
    const account = data.accounts.find(
      item => item.name === "LIGHT FX"
    );

    data.fxPositions.push({
      id:"realized-without-base",
      accountId:account.id,
      status:"決済済",
      closeDate:"2026-05-10",
      realizedPnl:70
    });

    const withSettlement = getFxRealizedAt(
      data,
      account.id,
      "2026-05-15"
    );

    assert(withSettlement !== null,
      "基準値なしで決済がある場合にnullになっています。");
    assert(withSettlement.value === 70,
      "基準値なしの決済損益合計が正しくありません。");
    assert(withSettlement.baseUnset === true,
      "基準額未設定の判定がtrueではありません。");

    const withoutSettlement = getFxRealizedAt(
      data,
      account.id,
      "2026-05-01"
    );

    assert(withoutSettlement === null,
      "基準値も対象日以前の決済もない場合にnullになっていません。");
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
}
