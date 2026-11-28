"use strict";

function registerCashflowTests(context) {
  const {assert,runTest} = context;

  function makeRule(overrides = {}) {
    return {
      id:"cashflow-rule-test-1",
      seriesId:"cashflow-series-test-1",
      effectiveFrom:"2026-01",
      status:"有効",
      kind:"支出",
      itemName:"架空の食費",
      category:"食費",
      amount:80000,
      day:5,
      memo:"架空データ",
      createdAt:"2026-01-01T00:00:00.000Z",
      updatedAt:"2026-01-01T00:00:00.000Z",
      ...overrides
    };
  }

  function makeRecord(overrides = {}) {
    return {
      id:"cashflow-record-test-1",
      kind:"支出",
      itemName:"架空の食費",
      category:"食費",
      amount:80000,
      date:"2026-01-05",
      type:"定期",
      seriesId:"cashflow-series-test-1",
      month:"2026-01",
      cancelled:false,
      memo:"架空データ",
      createdAt:"2026-01-05T00:00:00.000Z",
      updatedAt:"2026-01-05T00:00:00.000Z",
      ...overrides
    };
  }

  function makeData(rules = [],records = []) {
    const data = createInitialData();
    data.cashflowRules = rules;
    data.cashflowRecords = records;
    return data;
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

  function countRecords(records,seriesId) {
    return records.filter(record =>
      record.seriesId === seriesId
    ).length;
  }

  runTest("S15b①：月末日と2月のうるう年処理",() => {
    const rule = makeRule({day:31});
    const data = makeData([rule]);

    const january = generateCashflowRecords("2026-01-31",data);
    const february = generateCashflowRecords("2026-02-28",data);
    const april = generateCashflowRecords("2026-04-30",data);
    const leapFebruary = generateCashflowRecords(
      "2028-02-29",
      makeData([makeRule({
        effectiveFrom:"2028-01",
        day:31
      })])
    );

    assert(
      january.find(record => record.month === "2026-01").date === "2026-01-31",
      "1月31日の発生日が正しくありません。"
    );
    assert(
      february.find(record => record.month === "2026-02").date === "2026-02-28",
      "2026年2月の発生日が28日になっていません。"
    );
    assert(
      april.find(record => record.month === "2026-04").date === "2026-04-30",
      "4月の発生日が30日になっていません。"
    );
    assert(
      leapFebruary.find(record => record.month === "2028-02").date === "2028-02-29",
      "2028年2月の発生日が29日になっていません。"
    );
  });

  runTest("S15b②：同じ月の補完を繰り返しても重複しない",() => {
    const data = makeData([makeRule()]);
    const first = generateCashflowRecords("2026-01-10",data);

    const withFirst = makeData(
      data.cashflowRules,
      data.cashflowRecords.concat(first)
    );
    const second = generateCashflowRecords("2026-01-10",withFirst);

    const withSecond = makeData(
      withFirst.cashflowRules,
      withFirst.cashflowRecords.concat(second)
    );
    const third = generateCashflowRecords("2026-01-10",withSecond);

    assert(first.length === 1,"初回の補完で1件作成されていません。");
    assert(second.length === 0,"2回目の補完で重複が発生しています。");
    assert(third.length === 0,"3回目の補完で重複が発生しています。");
  });

  runTest("S15b③：数か月分を補完し今月の未来日を作らない",() => {
    const data = makeData([makeRule({
      day:5,
      amount:80000
    })]);

    const may10 = generateCashflowRecords("2026-05-10",data);
    const may3 = generateCashflowRecords("2026-05-03",data);

    assert(may10.length === 5,
      "5月10日時点で1〜5月の5件が作成されていません。");
    assert(may3.length === 4,
      "5月3日時点で1〜4月の4件になっていません。");
    assert(
      !may3.some(record => record.month === "2026-05"),
      "発生日が未来の5月分が作成されています。"
    );
  });

  runTest("S15b④：適用開始月から金額変更を反映し過去実績を維持",() => {
    const firstRule = makeRule({
      amount:80000,
      effectiveFrom:"2026-01"
    });
    const secondRule = makeRule({
      id:"cashflow-rule-test-2",
      amount:90000,
      effectiveFrom:"2026-03"
    });
    const data = makeData([firstRule,secondRule]);

    const generated = generateCashflowRecords("2026-05-10",data);
    const january = generated.find(record => record.month === "2026-01");
    const february = generated.find(record => record.month === "2026-02");
    const march = generated.find(record => record.month === "2026-03");
    const may = generated.find(record => record.month === "2026-05");

    assert(generated.length === 5,"1〜5月の5件が作成されていません。");
    assert(january.amount === 80000,"1月の金額が80,000円ではありません。");
    assert(february.amount === 80000,"2月の金額が80,000円ではありません。");
    assert(march.amount === 90000,"3月の金額が90,000円ではありません。");
    assert(may.amount === 90000,"5月の金額が90,000円ではありません。");

    const existingJanuary = makeRecord({
      date:"2026-01-05",
      month:"2026-01",
      amount:75000
    });
    const existingData = makeData(
      [firstRule,secondRule],
      [existingJanuary]
    );
    const afterChange = generateCashflowRecords("2026-05-10",existingData);

    assert(
      !afterChange.some(record => record.month === "2026-01"),
      "作成済みの1月分が再作成されています。"
    );
    assert(
      existingData.cashflowRecords[0].amount === 75000,
      "作成済みの1月分の金額が変更されています。"
    );
  });

  runTest("S15b⑤：停止期間は作らず再開月から再作成",() => {
    const rules = [
      makeRule({
        amount:80000,
        effectiveFrom:"2026-01"
      }),
      makeRule({
        id:"cashflow-rule-test-stop",
        status:"停止",
        effectiveFrom:"2026-04"
      }),
      makeRule({
        id:"cashflow-rule-test-restart",
        amount:70000,
        status:"有効",
        effectiveFrom:"2026-07"
      })
    ];
    const data = makeData(rules);
    const generated = generateCashflowRecords("2026-07-10",data);

    assert(
      generated.filter(record => record.month <= "2026-03").length === 3,
      "停止前の1〜3月分が残っていません。"
    );
    assert(
      !generated.some(record =>
        record.month >= "2026-04" && record.month <= "2026-06"
      ),
      "停止期間の4〜6月分が作成されています。"
    );
    assert(
      generated.find(record => record.month === "2026-07").amount === 70000,
      "再開した7月分の金額が70,000円ではありません。"
    );
  });

  runTest("S15b⑥：取消済みの記録は再作成せず集計から除外",() => {
    const cancelledRecord = makeRecord({
      cancelled:true
    });
    const data = makeData(
      [makeRule()],
      [cancelledRecord]
    );

    const generated = generateCashflowRecords("2026-01-10",data);

    assert(generated.length === 0,
      "取消済みの定期実績が再作成されています。");

    const summary = calculateCashflowMonthlySummary(data,"2026-01");
    assert(
      !JSON.stringify(summary).includes("80000"),
      "取消済みの金額が月次集計に含まれています。"
    );

    const restored = makeData(
      [makeRule()],
      [makeRecord({cancelled:false})]
    );
    const restoredSummary =
      calculateCashflowMonthlySummary(restored,"2026-01");

    assert(
      JSON.stringify(restoredSummary).includes("80000"),
      "取消を解除した金額が月次集計に戻っていません。"
    );
  });

  runTest("S15b⑦：月次集計の合計と定期割合",() => {
    const records = [
      makeRecord({
        id:"monthly-income",
        kind:"収入",
        itemName:"架空の給与",
        category:"給与",
        amount:450000,
        date:"2026-01-25",
        type:"単発",
        seriesId:null,
        month:null
      }),
      makeRecord({
        id:"monthly-recurring-expense",
        amount:182000,
        date:"2026-01-05"
      }),
      makeRecord({
        id:"monthly-oneoff-expense",
        itemName:"架空の臨時支出",
        category:"その他",
        amount:188000,
        date:"2026-01-20",
        type:"単発",
        seriesId:null,
        month:null
      })
    ];
    const data = makeData([],records);
    const summary = calculateCashflowMonthlySummary(data,"2026-01");
    const serialized = JSON.stringify(summary);

    assert(serialized.includes("450000"),
      "月次集計に収入450,000円がありません。");
    assert(serialized.includes("370000"),
      "月次集計に支出370,000円がありません。");
    assert(serialized.includes("80000"),
      "月次集計に収支差額80,000円がありません。");
    assert(serialized.includes("182000"),
      "月次集計に定期支出182,000円がありません。");
    assert(serialized.includes("188000"),
      "月次集計に単発支出188,000円がありません。");
    assert(serialized.includes("49.19"),
      "定期支出の割合49.19%がありません。");
  });

  runTest("S15b⑧：項目別累積は取消を除外し収入と支出を分ける",() => {
    const records = [
      makeRecord({
        id:"food-jan",
        amount:25000,
        date:"2026-01-05",
        month:"2026-01"
      }),
      makeRecord({
        id:"food-feb",
        amount:26000,
        date:"2026-02-05",
        month:"2026-02"
      }),
      makeRecord({
        id:"food-mar",
        amount:24000,
        date:"2026-03-05",
        month:"2026-03"
      }),
      makeRecord({
        id:"food-cancelled",
        amount:10000,
        date:"2026-03-15",
        month:"2026-03",
        cancelled:true
      })
    ];
    const data = makeData([],records);
    const cumulative = calculateCashflowCumulative(data,"2026-03");
    const serialized = JSON.stringify(cumulative);

    assert(serialized.includes("75000"),
      "累積金額75,000円がありません。");
    assert(serialized.includes("3"),
      "累積件数3件がありません。");
    assert(!serialized.includes("10000"),
      "取消済みの10,000円が累積に含まれています。");
  });

  runTest("S15b⑨：項目候補は空白を除いて照合し収入・支出を分ける",() => {
    const rules = [
      makeRule({
        itemName:"架空の食費",
        amount:30000,
        category:"食費"
      })
    ];
    const records = [
      makeRecord({
        id:"candidate-space",
        itemName:" 架空の食費 ",
        amount:25000,
        date:"2026-01-05",
        month:"2026-01"
      }),
      makeRecord({
        id:"candidate-income",
        kind:"収入",
        itemName:"架空の食費",
        category:"その他収入",
        amount:50000,
        date:"2026-01-10",
        type:"単発",
        seriesId:null,
        month:null
      })
    ];
    const data = makeData(rules,records);
    const candidates = getCashflowItemCandidates(data,"2026-01");
    const serialized = JSON.stringify(candidates);

    assert(serialized.includes("架空の食費"),
      "項目名の候補に架空の食費がありません。");
    assert(serialized.includes("30000"),
      "定期登録の前回金額が候補にありません。");
    assert(serialized.includes("25000"),
      "実績の金額が候補にありません。");
    assert(serialized.includes("50000"),
      "収入側の同名項目が候補にありません。");
  });

  runTest("S15b⑩：補完は資産管理データと入力データを変更しない",() => {
    const data = makeData([makeRule()]);
    const before = JSON.stringify(data);
    const assetBefore = JSON.stringify({
      snapshots:data.snapshots,
      holdings:data.holdings,
      fxPositions:data.fxPositions,
      loans:data.loans,
      settings:data.settings
    });

    generateCashflowRecords("2026-05-10",data);

    const assetAfter = JSON.stringify({
      snapshots:data.snapshots,
      holdings:data.holdings,
      fxPositions:data.fxPositions,
      loans:data.loans,
      settings:data.settings
    });

    assert(JSON.stringify(data) === before,
      "補完の純粋関数が入力データを変更しています。");
    assert(assetAfter === assetBefore,
      "資産管理データが変更されています。");
  });

  runTest("S15b⑪：保存不要のときは書き込みを行わない",() => {
    const data = makeData([makeRule()],[
      makeRecord()
    ]);
    const storage = makeFakeStorage(JSON.stringify(data));

    const result = applyCashflowAutoCompletion(
      data,
      "2026-01-10",
      storage
    );

    assert(result.createdCount === 0,
      "補完不要なのに作成件数が0ではありません。");
    assert(storage.writes.length === 0,
      "補完不要なのに保存処理が実行されています。");
  });

  runTest("S15b⑫：補完時はバックアップ後に本体へ1回保存",() => {
    const data = makeData([makeRule()]);
    const raw = JSON.stringify(data);
    const storage = makeFakeStorage(raw);

    const result = applyCashflowAutoCompletion(
      data,
      "2026-01-10",
      storage
    );

    assert(result.createdCount === 1,
      "補完で1件作成されていません。");
    assert(storage.getItem("pam2_pre_cashflow") === raw,
      "補完前データがpam2_pre_cashflowに保存されていません。");
    assert(
      storage.writes.filter(key => key === STORAGE_KEY).length === 1,
      "本体データへの書き込みが1回ではありません。"
    );
    assert(
      JSON.parse(storage.getItem(STORAGE_KEY)).cashflowRecords.length === 1,
      "補完後の実績が本体データに保存されていません。"
    );
  });

  runTest("S15b⑬：バックアップまたは本体保存失敗時は元データを維持",() => {
    const data = makeData([makeRule()]);
    const raw = JSON.stringify(data);

    const backupFailure = makeFakeStorage(
      raw,
      "pam2_pre_cashflow"
    );

    assertThrows(() => applyCashflowAutoCompletion(
      data,
      "2026-01-10",
      backupFailure
    ),"バックアップ失敗が通知されていません。");

    assert(
      backupFailure.getItem(STORAGE_KEY) === raw,
      "バックアップ失敗時に本体データが変更されています。"
    );

    const mainFailure = makeFakeStorage(raw,STORAGE_KEY);

    assertThrows(() => applyCashflowAutoCompletion(
      data,
      "2026-01-10",
      mainFailure
    ),"本体保存失敗が通知されていません。");

    assert(
      mainFailure.getItem(STORAGE_KEY) === raw,
      "本体保存失敗時に本体データが変更されています。"
    );
  });
}
