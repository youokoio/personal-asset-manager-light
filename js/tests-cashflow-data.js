"use strict";

function registerCashflowDataTests(context) {
  const {assert,runTest} = context;

  function makeV4Data() {
    const data = createInitialData();
    data.schemaVersion = 4;
    delete data.cashflowRules;
    delete data.cashflowRecords;
    return data;
  }

  function makeRule(overrides = {}) {
    return {
      id:"rule-test-1",
      seriesId:"series-test-1",
      effectiveFrom:"2026-01",
      status:"有効",
      kind:"支出",
      itemName:"テスト食費",
      category:"食費",
      amount:10000,
      day:31,
      memo:"架空データ",
      createdAt:"2026-01-01T00:00:00.000Z",
      updatedAt:"2026-01-01T00:00:00.000Z",
      ...overrides
    };
  }

  function makeRecord(overrides = {}) {
    return {
      id:"record-test-1",
      kind:"支出",
      itemName:"テスト食費",
      category:"食費",
      amount:10000,
      date:"2026-01-31",
      type:"定期",
      seriesId:"series-test-1",
      month:"2026-01",
      cancelled:false,
      memo:"架空データ",
      createdAt:"2026-01-31T00:00:00.000Z",
      updatedAt:"2026-01-31T00:00:00.000Z",
      ...overrides
    };
  }

  function makeFakeStorage(initialRaw,failKey = null) {
    const values = new Map([[STORAGE_KEY,initialRaw]]);
    const writes = [];

    return {
      values,
      writes,
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key,value) {
        writes.push(key);
        if (key === failKey) {
          throw new Error("テスト用の保存失敗");
        }
        values.set(key,String(value));
      }
    };
  }

  function assertThrows(callback,message) {
    let thrown = false;

    try {
      callback();
    } catch (error) {
      thrown = true;
    }

    assert(thrown,message);
  }

  runTest("S15a：初期データに収支コレクションを追加",() => {
    const data = createInitialData();

    assert(data.schemaVersion === 5,"初期データのschemaVersionが5ではありません。");
    assert(Array.isArray(data.cashflowRules),"cashflowRulesが配列ではありません。");
    assert(Array.isArray(data.cashflowRecords),"cashflowRecordsが配列ではありません。");
    assert(data.cashflowRules.length === 0,"初期cashflowRulesが空ではありません。");
    assert(data.cashflowRecords.length === 0,"初期cashflowRecordsが空ではありません。");
    validateData(data);
  });

  runTest("S15a：v4からv5への移行は既存値を保持",() => {
    const v4 = makeV4Data();
    const expected = JSON.parse(JSON.stringify(v4));
    expected.schemaVersion = 5;
    expected.cashflowRules = [];
    expected.cashflowRecords = [];

    const migrated = migrateDataV4ToV5(v4);

    assert(
      JSON.stringify(migrated) === JSON.stringify(expected),
      "v4→v5移行で既存データが変化しています。"
    );
    assert(v4.schemaVersion === 4,"移行元データが変更されています。");
    assert(!Object.prototype.hasOwnProperty.call(v4,"cashflowRules"),
      "移行元にcashflowRulesが追加されています。");
  });

  runTest("S15a：v4の起動時移行と移行前バックアップ",() => {
    const v4 = makeV4Data();
    const rawV4 = JSON.stringify(v4);
    const storage = makeFakeStorage(rawV4);

    const migrated = loadData(storage);

    assert(migrated.schemaVersion === 5,"起動時にv5へ移行されていません。");
    assert(storage.getItem("pam2_pre_v5") === rawV4,
      "移行前のv4データがpam2_pre_v5に保存されていません。");
    assert(JSON.parse(storage.getItem(STORAGE_KEY)).schemaVersion === 5,
      "本体データがv5で保存されていません。");
    validateData(migrated);
  });

  runTest("S15a：v2からv5まで連続移行",() => {
    const v2 = makeV4Data();
    v2.schemaVersion = 2;
    const storage = makeFakeStorage(JSON.stringify(v2));

    const migrated = loadData(storage);

    assert(migrated.schemaVersion === 5,"v2からv5まで移行されていません。");
    assert(Array.isArray(migrated.cashflowRules),"v2移行後のcashflowRulesがありません。");
    assert(Array.isArray(migrated.cashflowRecords),"v2移行後のcashflowRecordsがありません。");
    validateData(migrated);
  });

  runTest("S15a：v3からv5まで連続移行",() => {
    const v3 = makeV4Data();
    v3.schemaVersion = 3;
    const storage = makeFakeStorage(JSON.stringify(v3));

    const migrated = loadData(storage);

    assert(migrated.schemaVersion === 5,"v3からv5まで移行されていません。");
    assert(Array.isArray(migrated.cashflowRules),"v3移行後のcashflowRulesがありません。");
    assert(Array.isArray(migrated.cashflowRecords),"v3移行後のcashflowRecordsがありません。");
    validateData(migrated);
  });

  runTest("S15a：JSON v4読み込みは移行してから検証",() => {
    const imported = prepareImportedData(makeV4Data());

    assert(imported.schemaVersion === 5,"JSON v4がv5へ移行されていません。");
    assert(imported.cashflowRules.length === 0,"JSON移行後のcashflowRulesが空ではありません。");
    assert(imported.cashflowRecords.length === 0,"JSON移行後のcashflowRecordsが空ではありません。");
    validateData(imported);
  });

  runTest("S15a：収支の日付・月・分類の固定判定",() => {
    assert(isValidCashflowMonth("2026-01"),"正しい月が無効になっています。");
    assert(!isValidCashflowMonth("2026-13"),"13月が有効になっています。");
    assert(!isValidCashflowMonth("2026-1"),"ゼロ埋めなしの月が有効になっています。");
    assert(isValidCashflowDate("2028-02-29"),"うるう日の判定に失敗しました。");
    assert(!isValidCashflowDate("2027-02-29"),"存在しない日付が有効になっています。");
    assert(getCashflowMonthFromDate("2026-04-30") === "2026-04",
      "日付から月を取り出せません。");
    assert(getCashflowMonthFromDate("2026-04-31") === null,
      "不正な日付から月が取り出されています。");
    assert(isValidCashflowKindCategory("収入","給与"),
      "収入の給与分類が有効になっていません。");
    assert(!isValidCashflowKindCategory("支出","給与"),
      "支出の給与分類が有効になっています。");
  });

  runTest("S15a：正しい定期登録・収支実績を検証",() => {
    const data = createInitialData();
    data.cashflowRules.push(makeRule());
    data.cashflowRecords.push(makeRecord());

    assert(getCashflowRuleUniqueKey(makeRule()) !== null,
      "定期登録の一意キーを作成できません。");
    assert(getCashflowRecordUniqueKey(makeRecord()) !== null,
      "定期実績の一意キーを作成できません。");
    validateData(data);
  });

  runTest("S15a：金額・日付・月・必須項目の不正を拒否",() => {
    const invalidRules = [
      makeRule({amount:-1}),
      makeRule({amount:1.5}),
      makeRule({day:0}),
      makeRule({day:32}),
      makeRule({effectiveFrom:"2026-13"}),
      makeRule({status:"無効"})
    ];

    for (const rule of invalidRules) {
      const data = createInitialData();
      data.cashflowRules.push(rule);
      assertThrows(() => validateData(data),
        "不正な定期登録を検証で拒否できません。");
    }

    const invalidRecords = [
      makeRecord({amount:-1}),
      makeRecord({amount:1.5}),
      makeRecord({date:"2026-02-30"}),
      makeRecord({month:"2026-13"}),
      makeRecord({type:"その他"})
    ];

    for (const record of invalidRecords) {
      const data = createInitialData();
      data.cashflowRecords.push(record);
      assertThrows(() => validateData(data),
        "不正な収支実績を検証で拒否できません。");
    }
  });

  runTest("S15a：kindとcategoryの不一致を拒否",() => {
    const ruleData = createInitialData();
    ruleData.cashflowRules.push(makeRule({
      kind:"支出",
      category:"給与"
    }));
    assertThrows(() => validateData(ruleData),
      "支出に給与分類を指定した定期登録が拒否されません。");

    const recordData = createInitialData();
    recordData.cashflowRecords.push(makeRecord({
      kind:"支出",
      category:"給与"
    }));
    assertThrows(() => validateData(recordData),
      "支出に給与分類を指定した実績が拒否されません。");
  });

  runTest("S15a：定期と単発のseriesId・month条件",() => {
    const invalidRecurring = createInitialData();
    invalidRecurring.cashflowRecords.push(makeRecord({
      seriesId:null
    }));
    assertThrows(() => validateData(invalidRecurring),
      "seriesIdのない定期実績が拒否されません。");

    const invalidSingle = createInitialData();
    invalidSingle.cashflowRecords.push(makeRecord({
      type:"単発",
      seriesId:"series-test-1",
      month:"2026-01"
    }));
    assertThrows(() => validateData(invalidSingle),
      "seriesIdが設定された単発実績が拒否されません。");

    const invalidMonth = createInitialData();
    invalidMonth.cashflowRecords.push(makeRecord({
      month:"2026-02"
    }));
    assertThrows(() => validateData(invalidMonth),
      "dateとmonthの不一致が拒否されません。");
  });

  runTest("S15a：取消済みを含む定期実績の重複を拒否",() => {
    const data = createInitialData();
    data.cashflowRecords.push(makeRecord());
    data.cashflowRecords.push(makeRecord({
      id:"record-test-2",
      cancelled:true
    }));

    assertThrows(() => validateData(data),
      "取消済みを含むseriesId＋monthの重複が拒否されません。");
  });

  runTest("S15a：自己診断は登録のないseriesIdを注意表示",() => {
    const data = createInitialData();
    data.cashflowRecords.push(makeRecord());

    const result = runCashflowDataSelfDiagnosis(data);

    assert(result.errors.length === 0,"正常な実績が自己診断エラーになっています。");
    assert(result.warnings.length === 1,"登録のないseriesIdが注意表示されません。");
  });

  runTest("S15a：収支共通保存はバックアップ後に本体へ1回書き込む",() => {
    const data = createInitialData();
    const raw = JSON.stringify(data);
    const storage = makeFakeStorage(raw);

    const saved = saveCashflowData(nextData => {
      nextData.cashflowRules.push(makeRule());
    },storage);

    assert(storage.getItem("pam2_pre_cashflow") === raw,
      "収支保存前のバックアップが一致しません。");
    assert(storage.writes.filter(key => key === STORAGE_KEY).length === 1,
      "本体データへの書き込みが1回ではありません。");
    assert(storage.writes[0] === "pam2_pre_cashflow",
      "本体データより先にバックアップが作成されていません。");
    assert(saved.cashflowRules.length === 1,"保存結果に定期登録がありません。");
    validateData(saved);
  });

  runTest("S15a：バックアップ保存失敗時は本体を書き換えない",() => {
    const raw = JSON.stringify(createInitialData());
    const storage = makeFakeStorage(raw,"pam2_pre_cashflow");

    assertThrows(() => saveCashflowData(nextData => {
      nextData.cashflowRules.push(makeRule());
    },storage),"バックアップ保存失敗が例外になりません。");

    assert(storage.getItem(STORAGE_KEY) === raw,
      "バックアップ失敗時に本体データが変わっています。");
    assert(storage.writes.filter(key => key === STORAGE_KEY).length === 0,
      "バックアップ失敗後に本体へ書き込みました。");
  });

  runTest("S15a：本体保存失敗時は元データを保持",() => {
    const raw = JSON.stringify(createInitialData());
    const storage = makeFakeStorage(raw,STORAGE_KEY);

    assertThrows(() => saveCashflowData(nextData => {
      nextData.cashflowRules.push(makeRule());
    },storage),"本体保存失敗が例外になりません。");

    assert(storage.getItem(STORAGE_KEY) === raw,
      "本体保存失敗時に元データが変わっています。");
    assert(storage.getItem("pam2_pre_cashflow") === raw,
      "本体保存失敗時にバックアップが残っていません。");
  });
}
