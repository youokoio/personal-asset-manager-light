"use strict";

function registerHistoryEditTests(context) {
  const {runTest,assert,makeAccount,makeSnapshot} = context;

  function makeHistoryEditData() {
    const account = makeAccount(
      "history-edit-fx",
      "LIGHT FX",
      "fx",
      "fx"
    );

    account.realizedBaseAmount = null;
    account.realizedBaseDate = null;

    const data = {
      schemaVersion:SCHEMA_VERSION,
      accounts:[account],
      snapshots:[
        makeSnapshot(
          "H0",
          account.id,
          "2026-10-31",
          "2026-10-31T01:00:00.000Z",
          4900000,
          {
            effectivePrincipal:1000000,
            pnl:-2100000,
            swapTotal:6000000,
            requiredMargin:null,
            realizedPnlTotal:1000000,
            realizedPnlDaily:null,
            rates:null,
            memo:""
          }
        ),
        makeSnapshot(
          "H1",
          account.id,
          "2026-11-05",
          "2026-11-05T01:00:00.000Z",
          5000000,
          {
            effectivePrincipal:1000000,
            pnl:-2000000,
            swapTotal:6000000,
            requiredMargin:480000,
            realizedPnlTotal:1000000,
            realizedPnlDaily:null,
            rates:{"TRY/JPY":3.100},
            memo:""
          }
        ),
        makeSnapshot(
          "H2",
          account.id,
          "2026-11-10",
          "2026-11-10T01:00:00.000Z",
          5100000,
          {
            effectivePrincipal:1000000,
            pnl:-1900000,
            swapTotal:6000000,
            requiredMargin:null,
            realizedPnlTotal:1000000,
            realizedPnlDaily:10000,
            rates:{"TRY/JPY":3.120},
            memo:""
          }
        ),
        makeSnapshot(
          "H3",
          account.id,
          "2026-11-12",
          "2026-11-12T01:00:00.000Z",
          5050000,
          {
            effectivePrincipal:1000000,
            pnl:-1950000,
            swapTotal:6000000,
            requiredMargin:null,
            realizedPnlTotal:1000000,
            realizedPnlDaily:null,
            rates:{"TRY/JPY":3.110},
            memo:""
          }
        )
      ],
      holdings:[],
      fxPositions:[],
      fxRates:[{accountId:account.id,pair:"TRY/JPY",rate:3.120}],
      fxSwapLedger:[],
      loans:[],
      loanSnapshots:[],
      settings:{
        taxRatePct:20.315,
        fxYtdRealized:0,
        fxLossCarry:0,
        targetRatio:150
      }
    };

    return {account,data};
  }

  function makeFakeStorage(data,options = {}) {
    const values = new Map([
      ["pam2",JSON.stringify(data)]
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

        if (options.failKey === key) {
          throw new Error("保存失敗テスト");
        }

        values.set(key,String(value));
      }
    };
  }

  function save(data,edits,storage,options = {}) {
    return saveHistoryEditsS11a(
      data,
      edits,
      storage,
      {savedAt:"2026-11-19T00:00:00.000Z",...options}
    );
  }

  runTest("S11a-1：1セルだけを変更",() => {
    const {data} = makeHistoryEditData();
    const original = JSON.parse(JSON.stringify(data));
    const storage = makeFakeStorage(data);

    save(data,[{
      snapshotId:"H2",
      changes:{value:"5,200,000"}
    }],storage);

    assert(data.snapshots[2].value === 5100000,
      "元データを直接変更してはいけません。");

    const saved = JSON.parse(storage.values.get("pam2"));

    assert(saved.snapshots[2].value === 5200000,
      "H2の総資産を5,200,000円にする必要があります。");
    assert(saved.snapshots[2].pnl === original.snapshots[2].pnl &&
      saved.snapshots[2].swapTotal === original.snapshots[2].swapTotal,
      "変更していない項目を保持する必要があります。");
    assert(saved.snapshots[0].value === original.snapshots[0].value &&
      saved.snapshots[1].value === original.snapshots[1].value &&
      saved.snapshots[3].value === original.snapshots[3].value,
      "ほかの履歴を変更してはいけません。");
  });

  runTest("S11a-2：複数行・複数項目を変更",() => {
    const {data} = makeHistoryEditData();
    const storage = makeFakeStorage(data);

    save(data,[
      {
        snapshotId:"H1",
        changes:{pnl:"-2,100,000"}
      },
      {
        snapshotId:"H2",
        changes:{
          swapTotal:"6,050,000",
          rates:{"TRY/JPY":"3.125"}
        }
      }
    ],storage);

    const saved = JSON.parse(storage.values.get("pam2"));
    const backup = JSON.parse(
      storage.values.get("pam2_pre_histedit")
    );

    assert(saved.snapshots[1].pnl === -2100000,
      "H1の評価損益を更新する必要があります。");
    assert(saved.snapshots[2].swapTotal === 6050000 &&
      saved.snapshots[2].rates["TRY/JPY"] === 3.125,
      "H2の累計スワップと評価レートを更新する必要があります。");
    assert(storage.writes.filter(item =>
      item.key === "pam2"
    ).length === 1,
      "pam2への書き込みは1回である必要があります。");
    assert(backup.snapshots[2].swapTotal === 6000000 &&
      backup.snapshots[2].rates["TRY/JPY"] === 3.120,
      "バックアップに保存前の値を残す必要があります。");
  });

  runTest("S11a-3：空欄と0を区別",() => {
    const {data} = makeHistoryEditData();
    const storage = makeFakeStorage(data);

    save(data,[
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
    ],storage);

    const saved = JSON.parse(storage.values.get("pam2"));

    assert(saved.snapshots[1].requiredMargin === null,
      "空欄はnullにする必要があります。");
    assert(saved.snapshots[2].requiredMargin === null,
      "既存nullの空欄はnullのままにする必要があります。");
    assert(saved.snapshots[2].realizedPnlDaily === null,
      "日次確定損益の空欄はnullにする必要があります。");

    const zeroStorage = makeFakeStorage(data);

    save(data,[{
      snapshotId:"H2",
      changes:{realizedPnlDaily:"0"}
    }],zeroStorage);

    const zeroSaved = JSON.parse(
      zeroStorage.values.get("pam2")
    );

    assert(zeroSaved.snapshots[2].realizedPnlDaily === 0,
      "文字列0は数値0にする必要があります。");
  });

  runTest("S11a-4：評価レートを空欄にする",() => {
    const {data} = makeHistoryEditData();
    const storage = makeFakeStorage(data);

    save(data,[{
      snapshotId:"H2",
      changes:{rates:{"TRY/JPY":""}}
    }],storage);

    const saved = JSON.parse(storage.values.get("pam2"));

    assert(saved.snapshots[2].rates === null,
      "最後の評価レートを空欄にするとratesをnullにする必要があります。");

    const sameStorage = makeFakeStorage(data);

    save(data,[{
      snapshotId:"H3",
      changes:{rates:{"TRY/JPY":"3.1100"}}
    }],sameStorage);

    const sameSaved = JSON.parse(
      sameStorage.values.get("pam2")
    );

    assert(sameSaved.snapshots[3].rates["TRY/JPY"] === 3.11,
      "3.1100は数値として3.11にする必要があります。");
  });

  runTest("S11a-5：数値の正規化",() => {
    assert(
      normalizeHistoryEditNumberS11a("5,200,000").value === 5200000,
      "カンマを除去する必要があります。"
    );
    assert(
      normalizeHistoryEditNumberS11a("５２００００").value === 520000,
      "全角数字を半角にする必要があります。"
    );
    assert(
      normalizeHistoryEditNumberS11a("−100").value === -100,
      "Unicodeマイナスを数値化する必要があります。"
    );
    assert(
      normalizeHistoryEditNumberS11a("+50").value === 50,
      "先頭のプラスを除去する必要があります。"
    );

    for (const value of ["▲100","(100)","abc"]) {
      assert(
        normalizeHistoryEditNumberS11a(value).error !== null,
        value + "は数値形式エラーにする必要があります。"
      );
    }
  });

  runTest("S11a-6：必須・範囲の検証",() => {
    const {data} = makeHistoryEditData();

    const emptyTotal = validateHistoryEditsS11a(data,[{
      snapshotId:"H1",
      changes:{value:""}
    }]);

    assert(emptyTotal.errors.length === 1,
      "総資産の空欄はエラーにする必要があります。");

    const zeroRate = validateHistoryEditsS11a(data,[{
      snapshotId:"H2",
      changes:{rates:{"TRY/JPY":"0"}}
    }]);

    assert(zeroRate.errors.length === 1,
      "評価レート0はエラーにする必要があります。");

    const negativeMargin = validateHistoryEditsS11a(data,[{
      snapshotId:"H3",
      changes:{requiredMargin:"-1"}
    }]);

    assert(negativeMargin.errors.length === 1,
      "必要証拠金−1はエラーにする必要があります。");
  });

  runTest("S11a-7：1件のエラーで全件保存を中止",() => {
    const {data} = makeHistoryEditData();
    const storage = makeFakeStorage(data);
    const beforePam2 = storage.values.get("pam2");
    const beforeBackup = storage.values.get("pam2_pre_histedit");

    let failed = false;

    try {
      save(data,[
        {
          snapshotId:"H1",
          changes:{pnl:"-2100000"}
        },
        {
          snapshotId:"H2",
          changes:{rates:{"TRY/JPY":"0"}}
        }
      ],storage);
    } catch (error) {
      failed = true;
      assert(Array.isArray(error.errors) &&
        error.errors.length === 1,
        "エラー内容を返す必要があります。");
    }

    assert(failed,"エラーがある場合は保存を中止する必要があります。");
    assert(storage.values.get("pam2") === beforePam2,
      "pam2を変更してはいけません。");
    assert(storage.values.get("pam2_pre_histedit") === beforeBackup,
      "検証エラー時はバックアップにも触れてはいけません。");
    assert(storage.writes.length === 0,
      "検証エラー時は書き込みを行ってはいけません。");
  });

  runTest("S11a-8：バックアップ失敗時は保存を中止",() => {
    const {data} = makeHistoryEditData();
    const storage = makeFakeStorage(data,{
      failKey:"pam2_pre_histedit"
    });
    const beforePam2 = storage.values.get("pam2");

    let failed = false;

    try {
      save(data,[{
        snapshotId:"H2",
        changes:{value:"5200000"}
      }],storage);
    } catch (error) {
      failed = true;
    }

    assert(failed,"バックアップ失敗を検出する必要があります。");
    assert(storage.values.get("pam2") === beforePam2,
      "バックアップ失敗時にpam2を変更してはいけません。");
  });

  runTest("S11a-9：pam2保存失敗時は元データを保持",() => {
    const {data} = makeHistoryEditData();
    const storage = makeFakeStorage(data,{
      failKey:"pam2"
    });
    const beforePam2 = storage.values.get("pam2");

    let failed = false;

    try {
      save(data,[{
        snapshotId:"H2",
        changes:{value:"5200000"}
      }],storage);
    } catch (error) {
      failed = true;
    }

    assert(failed,"pam2保存失敗を検出する必要があります。");
    assert(storage.values.get("pam2") === beforePam2,
      "保存失敗時にpam2を変更してはいけません。");
  });

  runTest("S11a-10：日次確定損益の変更値",() => {
    const {data} = makeHistoryEditData();
    const storage = makeFakeStorage(data);

    save(data,[{
      snapshotId:"H2",
      changes:{realizedPnlDaily:"20000"}
    }],storage);

    const saved = JSON.parse(storage.values.get("pam2"));

    assert(saved.snapshots[2].realizedPnlDaily === 20000,
      "日次確定損益を20,000円にする必要があります。");

    const zeroStorage = makeFakeStorage(data);

    save(data,[{
      snapshotId:"H2",
      changes:{realizedPnlDaily:"0"}
    }],zeroStorage);

    const zeroSaved = JSON.parse(
      zeroStorage.values.get("pam2")
    );

    assert(zeroSaved.snapshots[2].realizedPnlDaily === 0,
      "日次確定損益0円を保存する必要があります。");

    const nullStorage = makeFakeStorage(data);

    save(data,[{
      snapshotId:"H2",
      changes:{realizedPnlDaily:""}
    }],nullStorage);

    const nullSaved = JSON.parse(
      nullStorage.values.get("pam2")
    );

    assert(nullSaved.snapshots[2].realizedPnlDaily === null,
      "日次確定損益の空欄をnullにする必要があります。");
  });

  runTest("S11a-11：ほかの口座・fxRates・建玉・設定を保持",() => {
    const {data} = makeHistoryEditData();
    const otherAccount = makeAccount(
      "other-account",
      "架空株式口座",
      "securities",
      "stock"
    );
    data.accounts.push(otherAccount);

    const otherSnapshot = makeSnapshot(
      "other-snapshot",
      otherAccount.id,
      "2026-11-12",
      "2026-11-12T01:00:00.000Z",
      12345
    );
    data.snapshots.push(otherSnapshot);

    const original = JSON.parse(JSON.stringify(data));
    const storage = makeFakeStorage(data);

    save(data,[{
      snapshotId:"H2",
      changes:{value:"5200000"}
    }],storage);

    const saved = JSON.parse(storage.values.get("pam2"));

    assert(
      JSON.stringify(saved.accounts[1]) ===
      JSON.stringify(original.accounts[1]),
      "ほかの口座を変更してはいけません。"
    );
    assert(
      JSON.stringify(saved.snapshots[4]) ===
      JSON.stringify(original.snapshots[4]),
      "ほかの口座の履歴を変更してはいけません。"
    );
    assert(
      JSON.stringify(saved.fxRates) ===
      JSON.stringify(original.fxRates),
      "fxRatesを変更してはいけません。"
    );
    assert(
      JSON.stringify(saved.fxPositions) ===
      JSON.stringify(original.fxPositions),
      "fxPositionsを変更してはいけません。"
    );
    assert(
      JSON.stringify(saved.settings) ===
      JSON.stringify(original.settings),
      "settingsを変更してはいけません。"
    );
  });

  runTest("S11a-12：保存時刻とrecordedAt",() => {
    const {account,data} = makeHistoryEditData();
    const beforeRecordedAt = data.snapshots[2].recordedAt;
    const storage = makeFakeStorage(data);

    save(data,[{
      snapshotId:"H2",
      changes:{value:"5200000"}
    }],storage);

    const saved = JSON.parse(storage.values.get("pam2"));
    const updated = saved.snapshots[2];

    assert(updated.recordedAt === beforeRecordedAt,
      "recordedAtを変更してはいけません。");
    assert(updated.updatedAt === "2026-11-19T00:00:00.000Z",
      "履歴のupdatedAtを保存時刻にする必要があります。");
    assert(saved.accounts[0].updatedAt === "2026-11-19T00:00:00.000Z",
      "口座のupdatedAtを保存時刻にする必要があります。");
    assert(account.updatedAt !== saved.accounts[0].updatedAt,
      "元のメモリ上データを直接変更してはいけません。");
  });

  runTest("S11a-13：変更なしの保存を拒否",() => {
    const {data} = makeHistoryEditData();
    const storage = makeFakeStorage(data);

    let failed = false;

    try {
      save(data,[{
        snapshotId:"H2",
        changes:{value:"5100000"}
      }],storage);
    } catch (error) {
      failed = true;
    }

    assert(failed,"変更がない場合は保存を行わない必要があります。");
    assert(storage.writes.length === 0,
      "変更がない場合は書き込みを行ってはいけません。");
  });

  runTest("S11a-14：編集対象の履歴だけを更新",() => {
    const {data} = makeHistoryEditData();
    const original = JSON.parse(JSON.stringify(data));
    const storage = makeFakeStorage(data);

    save(data,[{
      snapshotId:"H2",
      changes:{value:"5200000"}
    }],storage);

    const saved = JSON.parse(storage.values.get("pam2"));

    for (let index = 0; index < saved.snapshots.length; index += 1) {
      if (index === 2) continue;

      assert(
        JSON.stringify(saved.snapshots[index]) ===
        JSON.stringify(original.snapshots[index]),
        "編集対象以外の履歴を変更してはいけません。"
      );
    }
  });

  runTest("S11a-15：rates・日次損益・未知項目を保持",() => {
    const {data} = makeHistoryEditData();
    data.snapshots[2].futureField = "x";

    const storage = makeFakeStorage(data);

    save(data,[{
      snapshotId:"H2",
      changes:{value:"5200000"}
    }],storage);

    const saved = JSON.parse(storage.values.get("pam2"));
    const updated = saved.snapshots[2];

    assert(updated.rates["TRY/JPY"] === 3.120,
      "ratesを保持する必要があります。");
    assert(updated.realizedPnlDaily === 10000,
      "realizedPnlDailyを保持する必要があります。");
    assert(updated.requiredMargin === null,
      "requiredMarginを保持する必要があります。");
    assert(updated.futureField === "x",
      "未知の項目を保持する必要があります。");

    const secondStorage = makeFakeStorage(data);

    save(data,[{
      snapshotId:"H2",
      changes:{realizedPnlDaily:"20000"}
    }],secondStorage);

    const secondSaved = JSON.parse(
      secondStorage.values.get("pam2")
    );

    assert(secondSaved.snapshots[2].rates["TRY/JPY"] === 3.120,
      "日次確定損益の編集でratesを変更してはいけません。");
  });

  runTest("S11a-16：同日履歴の採用順を変えない",() => {
    const {account,data} = makeHistoryEditData();

    data.snapshots.push(
      makeSnapshot(
        "same-day-A",
        account.id,
        "2026-11-12",
        "2026-11-12T02:00:00.000Z",
        1000
      ),
      makeSnapshot(
        "same-day-B",
        account.id,
        "2026-11-12",
        "2026-11-12T03:00:00.000Z",
        2000
      )
    );

    assert(
      getLatestSnapshot(data,account.id).id === "same-day-B",
      "編集前はrecordedAtが新しいBを採用する必要があります。"
    );

    const storage = makeFakeStorage(data);

    save(data,[{
      snapshotId:"same-day-A",
      changes:{value:"1500"}
    }],storage);

    const saved = JSON.parse(storage.values.get("pam2"));

    assert(
      getLatestSnapshot(saved,account.id).id === "same-day-B",
      "Aを編集しても採用記録はBのままにする必要があります。"
    );
  });

  runTest("S11a-17：行内フォームと共通保存処理",() => {
    const {data} = makeHistoryEditData();
    const storage = makeFakeStorage(data);

    const result = save(data,[{
      snapshotId:"H2",
      changes:{
        value:"5200000",
        memo:"行内フォームからの訂正"
      }
    }],storage);

    const saved = JSON.parse(storage.values.get("pam2"));

    assert(result.updatedCount === 1,
      "更新した履歴数を1件とする必要があります。");
    assert(saved.snapshots[2].value === 5200000 &&
      saved.snapshots[2].memo === "行内フォームからの訂正",
      "行内フォームの変更を共通保存処理で保存する必要があります。");
    assert(saved.snapshots[2].rates["TRY/JPY"] === 3.120,
      "行内フォームでもratesを保持する必要があります。");
  });
}
