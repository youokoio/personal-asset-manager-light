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
}
