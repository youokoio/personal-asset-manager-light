"use strict";

/* ---------- S11a FX履歴編集テスト ---------- */

function registerHistoryEditTests(context) {
  const {assert,runTest,makeAccount,makeSnapshot} = context;

  const savedAt = "2026-11-19T00:00:00.000Z";

  function cloneHistoryEditDataS11a(data) {
    return JSON.parse(JSON.stringify(data));
  }

  function makeHistoryEditFixtureS11a() {
    const data = createInitialData();
    const account = data.accounts.find(item =>
      item.name === "LIGHT FX"
    );

    account.realizedBaseAmount = null;
    account.realizedBaseDate = null;

    const otherAccount = data.accounts.find(item =>
      item.name === "楽天銀行"
    );

    const makeFxSnapshot = (
      id,date,value,effectivePrincipal,pnl,swapTotal,extra = {}
    ) => {
      const snapshot = makeSnapshot(
        id,
        account.id,
        date,
        date + "T12:00:00.000Z",
        value,
        {
          effectivePrincipal,
          pnl,
          swapTotal,
          cumulativeInvested:null,
          realizedPnlTotal:null,
          realizedPnlDaily:null,
          cash:null,
          requiredMargin:null,
          principal:null,
          updatedAt:date + "T12:00:00.000Z",
          ...extra
        }
      );
      return snapshot;
    };

    data.snapshots = [
      makeFxSnapshot(
        "H0",
        "2026-10-31",
        4900000,
        1000000,
        -2100000,
        6000000,
        {
          requiredMargin:null,
          realizedPnlTotal:1000000,
          realizedPnlDaily:null,
          rates:null
        }
      ),
      makeFxSnapshot(
        "H1",
        "2026-11-05",
        5000000,
        1000000,
        -2000000,
        6000000,
        {
          requiredMargin:480000,
          realizedPnlDaily:null,
          rates:{"TRY/JPY":3.100}
        }
      ),
      makeFxSnapshot(
        "H2",
        "2026-11-10",
        5100000,
        1000000,
        -1900000,
        6000000,
        {
          requiredMargin:null,
          realizedPnlDaily:10000,
          rates:{"TRY/JPY":3.120}
        }
      ),
      makeFxSnapshot(
        "H3",
        "2026-11-12",
        5050000,
        1000000,
        -1950000,
        6000000,
        {
          requiredMargin:null,
          realizedPnlDaily:null,
          rates:{"TRY/JPY":3.110}
        }
      ),
      makeSnapshot(
        "BANK-H0",
        otherAccount.id,
        "2026-10-31",
        "2026-10-31T12:00:00.000Z",
        800000,
        {
          memo:"架空の銀行履歴",
          updatedAt:"2026-10-31T12:00:00.000Z"
        }
      )
    ];

    return data;
  }

  function makeHistoryEditStorageS11a(data,failKey = null) {
    const values = new Map([
      ["pam2",JSON.stringify(data)],
      ["pam2_pre_histedit","existing-backup"]
    ]);
    const writes = [];

    return {
      values,
      writes,
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key,value) {
        writes.push({key,value});
        if (key === failKey) {
          throw new Error("テスト用の保存失敗");
        }
        values.set(key,String(value));
      }
    };
  }

  function getHistoryEditSnapshotS11a(data,id) {
    return data.snapshots.find(item => item.id === id);
  }

  function saveHistoryEditFixtureS11a(data,edits,storage) {
    return saveHistoryEditsS11a(
      data,
      edits,
      storage,
      {savedAt}
    );
  }

  function assertHistoryEditErrorS11a(
    callback,messagePart
  ) {
    let caught = null;
    try {
      callback();
    } catch (error) {
      caught = error;
    }

    assert(caught !== null,"エラーが発生していません。");
    assert(
      String(caught.message).includes(messagePart),
      "想定したエラーではありません：" + caught.message
    );
    return caught;
  }

  runTest("S11a-17-7-1：1セルだけを編集",() => {
    const data = makeHistoryEditFixtureS11a();
    const before = cloneHistoryEditDataS11a(data);
    const storage = makeHistoryEditStorageS11a(data);

    const result = saveHistoryEditFixtureS11a(
      data,
      [{
        snapshotId:"H2",
        changes:{value:"5,200,000"}
      }],
      storage
    );

    const h2 = getHistoryEditSnapshotS11a(result.data,"H2");
    assert(h2.value === 5200000,
      "H2の総資産が5,200,000になっていません。");

    for (const field of [
      "effectivePrincipal",
      "pnl",
      "swapTotal",
      "requiredMargin",
      "realizedPnlDaily",
      "rates",
      "recordedAt"
    ]) {
      assert(
        JSON.stringify(h2[field]) ===
          JSON.stringify(before.snapshots.find(item =>
            item.id === "H2"
          )[field]),
        "変更対象外のH2." + field + "が変わっています。"
      );
    }

    for (const id of ["H0","H1","H3","BANK-H0"]) {
      assert(
        JSON.stringify(
          getHistoryEditSnapshotS11a(result.data,id)
        ) === JSON.stringify(
          getHistoryEditSnapshotS11a(before,id)
        ),
        id + "が変更されています。"
      );
    }

    assert(result.updatedCount === 1,
      "更新件数が1件ではありません。");
  });

  runTest("S11a-17-7-2：複数行・複数項目をまとめて保存",() => {
    const data = makeHistoryEditFixtureS11a();
    const storage = makeHistoryEditStorageS11a(data);

    const result = saveHistoryEditFixtureS11a(
      data,
      [
        {
          snapshotId:"H1",
          changes:{pnl:-2100000}
        },
        {
          snapshotId:"H2",
          changes:{
            swapTotal:6050000,
            rates:{"TRY/JPY":3.125}
          }
        }
      ],
      storage
    );

    const h1 = getHistoryEditSnapshotS11a(result.data,"H1");
    const h2 = getHistoryEditSnapshotS11a(result.data,"H2");

    assert(h1.pnl === -2100000,
      "H1の評価損益が変更されていません。");
    assert(h2.swapTotal === 6050000,
      "H2の累計スワップが変更されていません。");
    assert(h2.rates["TRY/JPY"] === 3.125,
      "H2の評価レートが変更されていません。");

    assert(
      storage.writes.filter(item => item.key === "pam2").length === 1,
      "pam2への書き込みが1回ではありません。"
    );

    assert(
      storage.getItem("pam2_pre_histedit") ===
        JSON.stringify(data),
      "保存前のデータが一時バックアップに残っていません。"
    );

    assert(result.updatedCount === 2,
      "更新記録数が2件ではありません。");
  });

  runTest("S11a-17-7-3：空欄と0を区別",() => {
    const data = makeHistoryEditFixtureS11a();
    const storage = makeHistoryEditStorageS11a(data);

    const result = saveHistoryEditFixtureS11a(
      data,
      [
        {
          snapshotId:"H1",
          changes:{requiredMargin:""}
        },
        {
          snapshotId:"H2",
          changes:{
            requiredMargin:"",
            realizedPnlDaily:""
          }
        }
      ],
      storage
    );

    const h1 = getHistoryEditSnapshotS11a(result.data,"H1");
    const h2 = getHistoryEditSnapshotS11a(result.data,"H2");

    assert(h1.requiredMargin === null,
      "H1の必要証拠金がnullになっていません。");
    assert(h2.requiredMargin === null,
      "H2の必要証拠金がnullのままではありません。");
    assert(h2.realizedPnlDaily === null,
      "H2の日次確定損益がnullになっていません。");

    const zeroData = makeHistoryEditFixtureS11a();
    const zeroStorage = makeHistoryEditStorageS11a(zeroData);

    const zeroResult = saveHistoryEditFixtureS11a(
      zeroData,
      [{
        snapshotId:"H2",
        changes:{realizedPnlDaily:"0"}
      }],
      zeroStorage
    );

    assert(
      getHistoryEditSnapshotS11a(
        zeroResult.data,"H2"
      ).realizedPnlDaily === 0,
      "文字列の0が数値の0になっていません。"
    );
  });

  runTest("S11a-17-7-4：評価レートの空欄と同値",() => {
    const data = makeHistoryEditFixtureS11a();
    const storage = makeHistoryEditStorageS11a(data);

    const result = saveHistoryEditFixtureS11a(
      data,
      [{
        snapshotId:"H2",
        changes:{rates:{"TRY/JPY":""}}
      }],
      storage
    );

    assert(
      getHistoryEditSnapshotS11a(
        result.data,"H2"
      ).rates === null,
      "すべての評価レートを空欄にしたときratesがnullになっていません。"
    );

    const normalized = normalizeHistoryEditNumberS11a("3.1100");
    assert(normalized.error === null,
      "3.1100が数値として認識されていません。");
    assert(normalized.value === 3.11,
      "3.1100が3.11に正規化されていません。");

    const sameData = makeHistoryEditFixtureS11a();
    const validation = validateHistoryEditsS11a(
      sameData,
      [{
        snapshotId:"H3",
        changes:{rates:{"TRY/JPY":"3.1100"}}
      }]
    );

    assert(validation.errors.length === 0,
      "同じ数値の評価レートがエラーになっています。");
    assert(validation.changedCount === 0,
      "数値として同じ評価レートを変更扱いにしています。");
  });

  runTest("S11a-17-7-5：数値入力の正規化",() => {
    const cases = [
      ["5,200,000",5200000],
      ["５２００００",520000],
      ["−100",-100],
      ["+50",50]
    ];

    for (const [input,expected] of cases) {
      const result = normalizeHistoryEditNumberS11a(input);
      assert(result.error === null,
        input + "がエラーになっています。");
      assert(result.value === expected,
        input + "の正規化結果が一致しません。");
    }

    for (const input of ["▲100","(100)","abc"]) {
      const result = normalizeHistoryEditNumberS11a(input);
      assert(result.error !== null,
        input + "が数値形式エラーになっていません。");
    }
  });

  runTest("S11a-17-7-6：入力値の検証エラー",() => {
    const cases = [
      {
        snapshotId:"H1",
        changes:{value:""},
        message:"総資産は空欄にできません"
      },
      {
        snapshotId:"H2",
        changes:{rates:{"TRY/JPY":"0"}},
        message:"評価レートは正の数"
      },
      {
        snapshotId:"H3",
        changes:{requiredMargin:"-1"},
        message:"必要証拠金は0以上"
      }
    ];

    for (const item of cases) {
      const validation = validateHistoryEditsS11a(
        makeHistoryEditFixtureS11a(),
        [{
          snapshotId:item.snapshotId,
          changes:item.changes
        }]
      );

      assert(validation.errors.length > 0,
        item.snapshotId + "の不正値がエラーになっていません。");
      assert(
        validation.errors.some(error =>
          error.message.includes(item.message)
        ),
        item.snapshotId + "のエラー理由が正しくありません。"
      );
    }
  });

  runTest("S11a-17-7-7：1件のエラーで全件保存を中止",() => {
    const data = makeHistoryEditFixtureS11a();
    const storage = makeHistoryEditStorageS11a(data);
    const beforePam2 = storage.getItem("pam2");
    const beforeBackup = storage.getItem("pam2_pre_histedit");

    const error = assertHistoryEditErrorS11a(
      () => saveHistoryEditFixtureS11a(
        data,
        [
          {
            snapshotId:"H1",
            changes:{pnl:-2100000}
          },
          {
            snapshotId:"H2",
            changes:{rates:{"TRY/JPY":"0"}}
          }
        ],
        storage
      ),
      "評価レートは正の数"
    );

    assert(Array.isArray(error.errors),
      "エラーの詳細が取得できません。");
    assert(error.errors.some(item =>
      item.snapshotId === "H2" &&
      item.field === "rates" &&
      item.pair === "TRY/JPY"
    ),"エラー対象のセルが特定できません。");

    assert(storage.getItem("pam2") === beforePam2,
      "検証エラー時にpam2が変更されています。");
    assert(storage.getItem("pam2_pre_histedit") === beforeBackup,
      "検証エラー時に一時バックアップが変更されています。");
    assert(storage.writes.length === 0,
      "検証エラー時に保存先へ書き込んでいます。");

    const corrected = saveHistoryEditFixtureS11a(
      data,
      [
        {
          snapshotId:"H1",
          changes:{pnl:-2100000}
        },
        {
          snapshotId:"H2",
          changes:{rates:{"TRY/JPY":"3.125"}}
        }
      ],
      storage
    );

    assert(
      getHistoryEditSnapshotS11a(
        corrected.data,"H1"
      ).pnl === -2100000,
      "修正後にH1が保存されていません。"
    );
    assert(
      getHistoryEditSnapshotS11a(
        corrected.data,"H2"
      ).rates["TRY/JPY"] === 3.125,
      "修正後にH2が保存されていません。"
    );
  });

  runTest("S11a-17-7-8：一時バックアップの失敗",() => {
    const data = makeHistoryEditFixtureS11a();
    const storage = makeHistoryEditStorageS11a(
      data,
      "pam2_pre_histedit"
    );
    const beforePam2 = storage.getItem("pam2");

    assertHistoryEditErrorS11a(
      () => saveHistoryEditFixtureS11a(
        data,
        [{
          snapshotId:"H2",
          changes:{value:5200000}
        }],
        storage
      ),
      "一時バックアップを保存できない"
    );

    assert(storage.getItem("pam2") === beforePam2,
      "バックアップ失敗時にpam2が変更されています。");
    assert(
      storage.writes.filter(item => item.key === "pam2").length === 0,
      "バックアップ失敗後にpam2へ書き込んでいます。"
    );
  });

  runTest("S11a-17-7-9：pam2への保存失敗",() => {
    const data = makeHistoryEditFixtureS11a();
    const storage = makeHistoryEditStorageS11a(data,"pam2");
    const beforePam2 = storage.getItem("pam2");

    assertHistoryEditErrorS11a(
      () => saveHistoryEditFixtureS11a(
        data,
        [{
          snapshotId:"H2",
          changes:{value:5200000}
        }],
        storage
      ),
      "保存に失敗しました"
    );

    assert(storage.getItem("pam2") === beforePam2,
      "保存失敗時にpam2が変更されています。");
  });

  runTest("S11a-17-7-10：日次確定損益の累積反映",() => {
    const data = makeHistoryEditFixtureS11a();

    const initial = getFxRealizedAt(
      data,
      data.accounts.find(item =>
        item.name === "LIGHT FX"
      ).id,
      "2026-11-12"
    );

    assert(initial && initial.value === 1010000,
      "初期累積確定損益が1,010,000円ではありません。");

    const accountId = data.accounts.find(item =>
      item.name === "LIGHT FX"
    ).id;

    const saveAndCalculate = value => {
      const source = makeHistoryEditFixtureS11a();
      const storage = makeHistoryEditStorageS11a(source);

      const result = saveHistoryEditFixtureS11a(
        source,
        [{
          snapshotId:"H2",
          changes:{realizedPnlDaily:value}
        }],
        storage
      );

      return getFxRealizedAt(
        result.data,
        accountId,
        "2026-11-12"
      );
    };

    const twentyThousand = saveAndCalculate("20000");
    assert(twentyThousand.value === 1020000,
      "日次20,000円の累積値が1,020,000円ではありません。");

    const zero = saveAndCalculate("0");
    assert(zero.value === 1000000,
      "日次0円の累積値が1,000,000円ではありません。");

    const blank = saveAndCalculate("");
    assert(blank.value === 1000000,
      "日次nullの累積値が基準値1,000,000円ではありません。");
  });

  runTest("S11a-17-7-11：ほかのデータへの影響なし",() => {
    const data = makeHistoryEditFixtureS11a();
    const before = cloneHistoryEditDataS11a(data);
    const storage = makeHistoryEditStorageS11a(data);

    const result = saveHistoryEditFixtureS11a(
      data,
      [{
        snapshotId:"H2",
        changes:{value:5200000}
      }],
      storage
    );

    assert(
      JSON.stringify(result.data.fxRates) ===
        JSON.stringify(before.fxRates),
      "fxRatesが変更されています。"
    );
    assert(
      JSON.stringify(result.data.fxPositions) ===
        JSON.stringify(before.fxPositions),
      "fxPositionsが変更されています。"
    );
    assert(
      JSON.stringify(result.data.settings) ===
        JSON.stringify(before.settings),
      "settingsが変更されています。"
    );

    assert(
      JSON.stringify(
        getHistoryEditSnapshotS11a(result.data,"BANK-H0")
      ) === JSON.stringify(
        getHistoryEditSnapshotS11a(before,"BANK-H0")
      ),
      "ほかの口座の履歴が変更されています。"
    );

    const beforeFxAccount = before.accounts.find(item =>
      item.name === "LIGHT FX"
    );
    const afterFxAccount = result.data.accounts.find(item =>
      item.name === "LIGHT FX"
    );

    for (const account of before.accounts) {
      if (account.id === beforeFxAccount.id) continue;
      const after = result.data.accounts.find(item =>
        item.id === account.id
      );
      assert(
        JSON.stringify(after) === JSON.stringify(account),
        "編集対象以外の口座が変更されています。"
      );
    }

    assert(afterFxAccount.updatedAt === savedAt,
      "編集対象口座のupdatedAtが更新されていません。");
  });

  runTest("S11a-17-7-13：変更なしでは保存しない",() => {
    const data = makeHistoryEditFixtureS11a();

    const validation = validateHistoryEditsS11a(
      data,
      [{
        snapshotId:"H2",
        changes:{value:"5,100,000"}
      }]
    );

    assert(validation.errors.length === 0,
      "同じ値がエラーになっています。");
    assert(validation.changedCount === 0,
      "同じ値を変更ありとして扱っています。");

    const storage = makeHistoryEditStorageS11a(data);
    assertHistoryEditErrorS11a(
      () => saveHistoryEditFixtureS11a(
        data,
        [{
          snapshotId:"H2",
          changes:{value:"5,100,000"}
        }],
        storage
      ),
      "変更された項目がありません"
    );

    assert(storage.writes.length === 0,
      "変更がないのに保存先へ書き込んでいます。");
  });

  runTest("S11a-17-7-15：既存項目と未知の項目を保持",() => {
    const data = makeHistoryEditFixtureS11a();
    const h2 = getHistoryEditSnapshotS11a(data,"H2");

    h2.futureField = "x";
    const beforeRates = cloneHistoryEditDataS11a(h2.rates);
    const beforeDaily = h2.realizedPnlDaily;
    const beforeMargin = h2.requiredMargin;

    const storage = makeHistoryEditStorageS11a(data);
    const result = saveHistoryEditFixtureS11a(
      data,
      [{
        snapshotId:"H2",
        changes:{value:5200000}
      }],
      storage
    );

    const savedH2 = getHistoryEditSnapshotS11a(
      result.data,"H2"
    );

    assert(
      JSON.stringify(savedH2.rates) ===
        JSON.stringify(beforeRates),
      "総資産の編集でratesが変わっています。"
    );
    assert(savedH2.realizedPnlDaily === beforeDaily,
      "総資産の編集でrealizedPnlDailyが変わっています。");
    assert(savedH2.requiredMargin === beforeMargin,
      "総資産の編集で必要証拠金が変わっています。");
    assert(savedH2.futureField === "x",
      "未知の項目が保持されていません。");

    const dailyData = makeHistoryEditFixtureS11a();
    const dailyH2 = getHistoryEditSnapshotS11a(dailyData,"H2");
    const dailyRates = cloneHistoryEditDataS11a(dailyH2.rates);
    const dailyStorage = makeHistoryEditStorageS11a(dailyData);

    const dailyResult = saveHistoryEditFixtureS11a(
      dailyData,
      [{
        snapshotId:"H2",
        changes:{realizedPnlDaily:20000}
      }],
      dailyStorage
    );

    assert(
      JSON.stringify(
        getHistoryEditSnapshotS11a(
          dailyResult.data,"H2"
        ).rates
      ) === JSON.stringify(dailyRates),
      "日次確定損益の編集でratesが変わっています。"
    );
  });

  runTest("S11a-17-7-16：日時の意味と同日履歴の採用順",() => {
    const data = makeHistoryEditFixtureS11a();
    const h2 = getHistoryEditSnapshotS11a(data,"H2");
    const originalRecordedAt = h2.recordedAt;
    const storage = makeHistoryEditStorageS11a(data);

    const result = saveHistoryEditFixtureS11a(
      data,
      [{
        snapshotId:"H2",
        changes:{value:5200000}
      }],
      storage
    );

    const savedH2 = getHistoryEditSnapshotS11a(
      result.data,"H2"
    );
    const savedAccount = result.data.accounts.find(item =>
      item.name === "LIGHT FX"
    );

    assert(savedH2.recordedAt === originalRecordedAt,
      "recordedAtが変更されています。");
    assert(savedH2.updatedAt === savedAt,
      "履歴のupdatedAtが保存時刻になっていません。");
    assert(savedAccount.updatedAt === savedAt,
      "口座のupdatedAtが保存時刻になっていません。");

    const duplicateData = makeHistoryEditFixtureS11a();
    const account = duplicateData.accounts.find(item =>
      item.name === "LIGHT FX"
    );

    const older = makeSnapshot(
      "SAME-A",
      account.id,
      "2026-11-12",
      "2026-11-12T09:00:00.000Z",
      5000000,
      {
        effectivePrincipal:1000000,
        pnl:-2000000,
        swapTotal:6000000,
        realizedPnlTotal:null,
        realizedPnlDaily:5000,
        requiredMargin:null,
        rates:{"TRY/JPY":3.1},
        updatedAt:"2026-11-12T09:00:00.000Z"
      }
    );

    const newer = makeSnapshot(
      "SAME-B",
      account.id,
      "2026-11-12",
      "2026-11-12T10:00:00.000Z",
      5100000,
      {
        effectivePrincipal:1000000,
        pnl:-1900000,
        swapTotal:6000000,
        realizedPnlTotal:null,
        realizedPnlDaily:10000,
        requiredMargin:null,
        rates:{"TRY/JPY":3.12},
        updatedAt:"2026-11-12T10:00:00.000Z"
      }
    );

    duplicateData.snapshots.push(older,newer);

    const duplicateStorage = makeHistoryEditStorageS11a(
      duplicateData
    );

    const duplicateResult = saveHistoryEditFixtureS11a(
      duplicateData,
      [{
        snapshotId:"SAME-A",
        changes:{value:5050000}
      }],
      duplicateStorage
    );

    const adopted = getFxRealizedAt(
      duplicateResult.data,
      account.id,
      "2026-11-12"
    );

    assert(adopted.value === 1010000,
      "同日の新しい記録が採用されていません。");
    assert(
      getHistoryEditSnapshotS11a(
        duplicateResult.data,"SAME-B"
      ).recordedAt === newer.recordedAt,
      "同日の新しい記録のrecordedAtが変わっています。"
    );
  });

  runTest("S11a-17-7-17：行内フォームも専用保存処理を使う",() => {
    const data = makeHistoryEditFixtureS11a();
    const h2 = getHistoryEditSnapshotS11a(data,"H2");
    h2.futureField = "x";

    const beforeRates = cloneHistoryEditDataS11a(h2.rates);
    const beforeRecordedAt = h2.recordedAt;
    const storage = makeHistoryEditStorageS11a(data);

    const result = saveHistoryEditFixtureS11a(
      data,
      [{
        snapshotId:"H2",
        changes:{
          memo:"行内フォームからの訂正"
        }
      }],
      storage
    );

    const savedH2 = getHistoryEditSnapshotS11a(
      result.data,"H2"
    );

    assert(savedH2.memo === "行内フォームからの訂正",
      "行内フォームの変更内容が保存されていません。");
    assert(
      JSON.stringify(savedH2.rates) ===
        JSON.stringify(beforeRates),
      "行内フォームの保存でratesが変わっています。"
    );
    assert(savedH2.futureField === "x",
      "行内フォームの保存で未知の項目が消えています。");
    assert(savedH2.recordedAt === beforeRecordedAt,
      "行内フォームの保存でrecordedAtが変更されています。");
    assert(savedH2.updatedAt === savedAt,
      "行内フォームの保存でupdatedAtが更新されていません。");
  });
}
