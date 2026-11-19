"use strict";

function registerHistoryEditTests(context) {
  const {runTest,assert,makeAccount,makeSnapshot} = context;

  function makeHistoryData() {
    const account = makeAccount(
      "history-edit-account",
      "架空LIGHT FX口座",
      "fx",
      "fx"
    );

    const snapshots = [
      makeSnapshot(
        "H0",
        account.id,
        "2026-10-31",
        "2026-10-31T12:00:00.000Z",
        4900000,
        {
          effectivePrincipal:1000000,
          pnl:-2100000,
          swapTotal:6000000,
          requiredMargin:null,
          realizedPnlTotal:1000000,
          realizedPnlDaily:null,
          rates:null
        }
      ),
      makeSnapshot(
        "H1",
        account.id,
        "2026-11-05",
        "2026-11-05T12:00:00.000Z",
        5000000,
        {
          effectivePrincipal:1000000,
          pnl:-2000000,
          swapTotal:6000000,
          requiredMargin:480000,
          realizedPnlTotal:null,
          realizedPnlDaily:null,
          rates:{"TRY/JPY":3.100}
        }
      ),
      makeSnapshot(
        "H2",
        account.id,
        "2026-11-10",
        "2026-11-10T12:00:00.000Z",
        5100000,
        {
          effectivePrincipal:1000000,
          pnl:-1900000,
          swapTotal:6000000,
          requiredMargin:null,
          realizedPnlTotal:null,
          realizedPnlDaily:10000,
          rates:{"TRY/JPY":3.120},
          futureField:"x"
        }
      ),
      makeSnapshot(
        "H3",
        account.id,
        "2026-11-12",
        "2026-11-12T12:00:00.000Z",
        5050000,
        {
          effectivePrincipal:1000000,
          pnl:-1950000,
          swapTotal:6000000,
          requiredMargin:null,
          realizedPnlTotal:null,
          realizedPnlDaily:null,
          rates:{"TRY/JPY":3.110}
        }
      )
    ];

    return {
      schemaVersion:SCHEMA_VERSION,
      accounts:[account],
      snapshots,
      holdings:[],
      fxPositions:[],
      fxRates:[],
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
  }

  function makeFakeStorage(data,options = {}) {
    const values = new Map();
    const initialRaw = JSON.stringify(data);
    values.set("pam2",initialRaw);

    const calls = [];

    return {
      values,
      calls,
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key,value) {
        calls.push({key,value});

        if (options.failBackup &&
            key === "pam2_pre_histedit") {
          throw new Error("バックアップ書き込み失敗");
        }

        if (options.failSave && key === "pam2") {
          throw new Error("保存書き込み失敗");
        }

        values.set(key,String(value));
      }
    };
  }

  function save(data,changes,options = {}) {
    const storage = makeFakeStorage(data,options);
    const result = saveHistoryEditsS11a(
      data,
      changes,
      storage,
      "2026-11-19T03:00:00.000Z"
    );

    return {storage,result};
  }

  function change(snapshotId,fields) {
    return {snapshotId,fields};
  }

  runTest("S11a 17-7-1：1セルの編集",() => {
    const data = makeHistoryData();
    const originalH1 = JSON.stringify(data.snapshots[1]);
    const originalH3 = JSON.stringify(data.snapshots[3]);

    const {result} = save(data,[
      change("H2",{value:"5,200,000"})
    ]);

    assert(result.ok,"総資産の編集を保存できる必要があります。");

    const updated = result.data.snapshots.find(item => item.id === "H2");

    assert(updated.value === 5200000,
      "H2の総資産は5,200,000円になる必要があります。");
    assert(JSON.stringify(result.data.snapshots[1]) === originalH1,
      "H1は変更してはいけません。");
    assert(JSON.stringify(result.data.snapshots[3]) === originalH3,
      "H3は変更してはいけません。");
    assert(updated.pnl === -1900000 &&
      updated.swapTotal === 6000000 &&
      updated.effectivePrincipal === 1000000,
      "H2の変更していない項目を保持する必要があります。");
  });

  runTest("S11a 17-7-2：複数行・複数項目を1回で保存",() => {
    const data = makeHistoryData();
    const storage = makeFakeStorage(data);

    const result = saveHistoryEditsS11a(
      data,
      [
        change("H1",{pnl:"−2,100,000"}),
        change("H2",{
          swapTotal:"6,050,000",
          rates:{"TRY/JPY":"3.125"}
        })
      ],
      storage,
      "2026-11-19T03:00:00.000Z"
    );

    assert(result.ok,"複数行の編集を保存できる必要があります。");

    const h1 = result.data.snapshots.find(item => item.id === "H1");
    const h2 = result.data.snapshots.find(item => item.id === "H2");

    assert(h1.pnl === -2100000,
      "H1の評価損益は−2,100,000円になる必要があります。");
    assert(h2.swapTotal === 6050000 &&
      h2.rates["TRY/JPY"] === 3.125,
      "H2の累計スワップと評価レートを更新する必要があります。");

    assert(storage.calls.filter(item => item.key === "pam2").length === 1,
      "pam2への書き込みは1回だけである必要があります。");
    assert(storage.getItem("pam2_pre_histedit") ===
      JSON.stringify(data),
      "バックアップには保存前のデータが残る必要があります。");
  });

  runTest("S11a 17-7-3：空欄と0を区別",() => {
    const data = makeHistoryData();

    const {result} = save(data,[
      change("H1",{requiredMargin:""}),
      change("H2",{
        requiredMargin:"",
        realizedPnlDaily:"0"
      })
    ]);

    assert(result.ok,"空欄と0を保存できる必要があります。");

    const h1 = result.data.snapshots.find(item => item.id === "H1");
    const h2 = result.data.snapshots.find(item => item.id === "H2");

    assert(h1.requiredMargin === null,
      "H1の必要証拠金を空欄にするとnullになる必要があります。");
    assert(h2.requiredMargin === null,
      "既存nullの必要証拠金を空欄のまま保存してもnullになる必要があります。");
    assert(h2.realizedPnlDaily === 0,
      "文字列0は数値の0として保存する必要があります。");
  });

  runTest("S11a 17-7-4：評価レートの空欄と数値の正規化",() => {
    const data = makeHistoryData();

    const {result} = save(data,[
      change("H2",{rates:{"TRY/JPY":""}}),
      change("H3",{rates:{"TRY/JPY":"3.1100"}})
    ]);

    assert(result.ok,"評価レートの編集を保存できる必要があります。");

    const h2 = result.data.snapshots.find(item => item.id === "H2");
    const h3 = result.data.snapshots.find(item => item.id === "H3");

    assert(h2.rates === null,
      "すべての評価レートを空欄にするとratesはnullになる必要があります。");
    assert(h3.rates["TRY/JPY"] === 3.11,
      "3.1100は数値として3.11になる必要があります。");
  });

  runTest("S11a 17-7-5：数値の正規化",() => {
    const cases = [
      ["5,200,000",5200000],
      ["５２００００",520000],
      ["−100",-100],
      ["+50",50],
      ["  ¥５,０００ 円  ",5000]
    ];

    for (const [input,expected] of cases) {
      const result = normalizeHistoryEditNumberS11a(input);
      assert(!result.error && result.value === expected,
        "入力「" + input + "」は" + expected + "になる必要があります。");
    }

    for (const input of ["▲100","(100)","abc"]) {
      const result = normalizeHistoryEditNumberS11a(input);
      assert(Boolean(result.error),
        "入力「" + input + "」は数値形式のエラーになる必要があります。");
    }
  });

  runTest("S11a 17-7-6：総資産・評価レート・必要証拠金の検証",() => {
    const data = makeHistoryData();

    const cases = [
      change("H1",{value:""}),
      change("H2",{rates:{"TRY/JPY":"0"}}),
      change("H3",{requiredMargin:"-1"})
    ];

    for (const item of cases) {
      const result = validateHistoryEditsS11a(data,[item]);
      assert(result.errors.length > 0,
        "不正な値は保存前にエラーになる必要があります。");
    }
  });

  runTest("S11a 17-7-7：1件のエラーで全件保存を中止",() => {
    const data = makeHistoryData();
    const storage = makeFakeStorage(data);
    const beforeRaw = storage.getItem("pam2");

    const invalidResult = saveHistoryEditsS11a(
      data,
      [
        change("H1",{pnl:"-2100000"}),
        change("H2",{rates:{"TRY/JPY":"0"}})
      ],
      storage,
      "2026-11-19T03:00:00.000Z"
    );

    assert(!invalidResult.ok,
      "1件でもエラーがあれば保存を中止する必要があります。");
    assert(storage.getItem("pam2") === beforeRaw,
      "検証エラー時にpam2を変更してはいけません。");
    assert(storage.getItem("pam2_pre_histedit") === null,
      "検証エラー時に一時バックアップを作ってはいけません。");
    assert(storage.calls.length === 0,
      "検証エラー時は保存先への書き込みを行ってはいけません。");

    const correctedResult = saveHistoryEditsS11a(
      data,
      [
        change("H1",{pnl:"-2100000"}),
        change("H2",{rates:{"TRY/JPY":"3.125"}})
      ],
      storage,
      "2026-11-19T03:00:00.000Z"
    );

    assert(correctedResult.ok,
      "エラーを修正すれば再度保存できる必要があります。");
    assert(correctedResult.data.snapshots.find(item =>
      item.id === "H1"
    ).pnl === -2100000,
      "修正後はH1の変更が保存される必要があります。");
    assert(correctedResult.data.snapshots.find(item =>
      item.id === "H2"
    ).rates["TRY/JPY"] === 3.125,
      "修正後はH2の変更が保存される必要があります。");
  });

  runTest("S11a 17-7-8：バックアップの書き込み失敗",() => {
    const data = makeHistoryData();
    const storage = makeFakeStorage(data,{failBackup:true});
    const beforeRaw = storage.getItem("pam2");

    const result = saveHistoryEditsS11a(
      data,
      [change("H2",{value:"5200000"})],
      storage,
      "2026-11-19T03:00:00.000Z"
    );

    assert(!result.ok,
      "バックアップに失敗した場合は保存を中止する必要があります。");
    assert(storage.getItem("pam2") === beforeRaw,
      "バックアップ失敗時にpam2を変更してはいけません。");
    assert(storage.getItem("pam2_pre_histedit") === null,
      "失敗したバックアップを保存済みとして扱ってはいけません。");
  });

  runTest("S11a 17-7-9：pam2の書き込み失敗",() => {
    const data = makeHistoryData();
    const storage = makeFakeStorage(data,{failSave:true});
    const beforeRaw = storage.getItem("pam2");

    const result = saveHistoryEditsS11a(
      data,
      [change("H2",{value:"5200000"})],
      storage,
      "2026-11-19T03:00:00.000Z"
    );

    assert(!result.ok,
      "pam2への書き込みに失敗した場合はエラーになる必要があります。");
    assert(storage.getItem("pam2") === beforeRaw,
      "保存失敗時にpam2を変更してはいけません。");
    assert(storage.getItem("pam2_pre_histedit") === beforeRaw,
      "保存失敗時も保存前データのバックアップを保持する必要があります。");
  });

  runTest("S11a 17-7-10：累積確定損益への反映",() => {
    const data = makeHistoryData();

    const before = getFxRealizedAt(
      data,
      "history-edit-account",
      "2026-11-12"
    );

    assert(before.value === 1010000,
      "基準1,000,000円＋H2の日次10,000円＝1,010,000円である必要があります。");

    const edited = save(data,[
      change("H2",{realizedPnlDaily:"20000"})
    ]);

    assert(edited.result.ok,"日次確定損益を編集できる必要があります。");

    const after = getFxRealizedAt(
      edited.result.data,
      "history-edit-account",
      "2026-11-12"
    );

    assert(after.value === 1020000,
      "基準1,000,000円＋日次20,000円＝1,020,000円である必要があります。");

    const zero = save(data,[
      change("H2",{realizedPnlDaily:"0"})
    ]);

    assert(zero.result.ok,"日次確定損益を0円にできる必要があります。");
    assert(getFxRealizedAt(
      zero.result.data,
      "history-edit-account",
      "2026-11-12"
    ).value === 1000000,
      "日次0円の場合は基準値1,000,000円になる必要があります。");

    const blank = save(data,[
      change("H2",{realizedPnlDaily:""})
    ]);

    assert(blank.result.ok,"日次確定損益を空欄にできる必要があります。");
    assert(getFxRealizedAt(
      blank.result.data,
      "history-edit-account",
      "2026-11-12"
    ).value === 1000000,
      "日次nullの場合は基準値1,000,000円になる必要があります。");
  });

  runTest("S11a 17-7-11：ほかのデータを変更しない",() => {
    const data = makeHistoryData();

    const otherAccount = makeAccount(
      "history-edit-other",
      "架空株式口座",
      "securities",
      "stock"
    );

    data.accounts.push(otherAccount);
    data.snapshots.push(makeSnapshot(
      "other-snapshot",
      otherAccount.id,
      "2026-11-10",
      "2026-11-10T12:00:00.000Z",
      123456
    ));
    data.fxRates.push({
      id:"rate-other",
      accountId:"history-edit-account",
      pair:"TRY/JPY",
      rate:3.15,
      asOfDate:"2026-11-19",
      createdAt:"2026-11-19T00:00:00.000Z",
      updatedAt:"2026-11-19T00:00:00.000Z"
    });
    data.fxPositions.push({
      id:"position-other",
      accountId:"history-edit-account",
      pair:"TRY/JPY",
      side:"買",
      quantity:10000,
      openDate:"2026-01-01T00:00:00.000Z",
      asOfDate:"2026-11-19",
      openRate:3.1,
      swap:100,
      status:"保有中",
      realizedPnl:null,
      closeDate:null,
      closeRate:null,
      recordedAt:"2026-01-01T00:00:00.000Z"
    });

    const beforeOtherAccount = JSON.stringify(otherAccount);
    const beforeOtherSnapshot = JSON.stringify(
      data.snapshots.find(item => item.id === "other-snapshot")
    );
    const beforeRates = JSON.stringify(data.fxRates);
    const beforePositions = JSON.stringify(data.fxPositions);
    const beforeSettings = JSON.stringify(data.settings);

    const {result} = save(data,[
      change("H2",{value:"5200000"})
    ]);

    assert(result.ok,"履歴の編集を保存できる必要があります。");
    assert(JSON.stringify(result.data.accounts.find(item =>
      item.id === otherAccount.id
    )) === beforeOtherAccount,
      "ほかの口座を変更してはいけません。");
    assert(JSON.stringify(result.data.snapshots.find(item =>
      item.id === "other-snapshot"
    )) === beforeOtherSnapshot,
      "ほかの口座の履歴を変更してはいけません。");
    assert(JSON.stringify(result.data.fxRates) === beforeRates,
      "fxRatesを変更してはいけません。");
    assert(JSON.stringify(result.data.fxPositions) === beforePositions,
      "fxPositionsを変更してはいけません。");
    assert(JSON.stringify(result.data.settings) === beforeSettings,
      "settingsを変更してはいけません。");
  });

  runTest("S11a 17-7-12：行内フォームの展開・制御",() => {
    const originalData = appData;
    const originalChildren = Array.from(app.childNodes);
    const originalEditState = fxHistoryEditStateS11a;
    const originalEditingSnapshotId = editingSnapshotId;

    try {
      const data = makeHistoryData();
      const account = data.accounts[0];
      appData = data;

      resetFxHistoryEditStateS11a(account.id);
      renderFxHistoryPageS5h(account);

      fxHistoryEditStateS11a.changes.set("H1",{
        value:"5000001"
      });

      const h2DateCell = Array.from(
        app.querySelectorAll(".fx-history-date-cell")
      ).find(cell =>
        cell.textContent.includes("2026-11-10")
      );

      assert(h2DateCell !== undefined,
        "H2の対象日セルを表示する必要があります。");

      h2DateCell.click();

      assert(fxHistoryEditStateS11a.openSnapshotId === null,
        "未保存のセル編集がある間は行内フォームを開いてはいけません。");
      assert(app.textContent.includes(
        "先に『まとめて保存』か『変更を破棄』をしてください"
      ),"未保存のセル編集がある場合は指定のメッセージを表示する必要があります。");

      fxHistoryEditStateS11a.changes.clear();
      fxHistoryEditStateS11a.message = "";
      renderFxHistoryPageS5h(account);

      const h2DateCellAfterClear = Array.from(
        app.querySelectorAll(".fx-history-date-cell")
      ).find(cell =>
        cell.textContent.includes("2026-11-10")
      );

      h2DateCellAfterClear.click();

      assert(fxHistoryEditStateS11a.openSnapshotId === "H2",
        "H2の行内フォームを開く必要があります。");

      let inlineForms = app.querySelectorAll(
        ".fx-history-inline-form"
      );

      assert(inlineForms.length === 1,
        "行内フォームは同時に1つだけ表示する必要があります。");

      const h1DateCell = Array.from(
        app.querySelectorAll(".fx-history-date-cell")
      ).find(cell =>
        cell.textContent.includes("2026-11-05")
      );

      h1DateCell.click();

      assert(fxHistoryEditStateS11a.openSnapshotId === "H1",
        "別の行を選ぶと、その行のフォームに切り替わる必要があります。");

      inlineForms = app.querySelectorAll(
        ".fx-history-inline-form"
      );

      assert(inlineForms.length === 1,
        "切り替え後も行内フォームは1つだけである必要があります。");

      const valueCell = app.querySelector(
        '.fx-history-table [data-snapshot-id="H1"][data-field="value"]'
      );

      assert(valueCell !== null,
        "フォーム表示中も数値セルを描画する必要があります。");

      valueCell.click();

      assert(valueCell.querySelector("input") === null,
        "行内フォームを開いている間はセルを編集できない必要があります。");

      const close = app.querySelector(
        '[data-action="close-fx-history-inline-form"]'
      );

      assert(close !== null,
        "行内フォームに閉じる操作を表示する必要があります。");

      close.click();

      assert(fxHistoryEditStateS11a.openSnapshotId === null,
        "閉じる操作で行内フォームを閉じる必要があります。");
      assert(app.querySelector(".fx-history-inline-form") === null,
        "閉じた後は行内フォームを表示しない必要があります。");
    } finally {
      appData = originalData;
      fxHistoryEditStateS11a = originalEditState;
      editingSnapshotId = originalEditingSnapshotId;
      app.replaceChildren(...originalChildren);
    }
  });

  runTest("S11a 17-7-13：変更なしではまとめて保存できない",() => {
    const originalData = appData;
    const originalChildren = Array.from(app.childNodes);
    const originalEditState = fxHistoryEditStateS11a;

    try {
      const data = makeHistoryData();
      const account = data.accounts[0];
      appData = data;

      resetFxHistoryEditStateS11a(account.id);
      renderFxHistoryPageS5h(account);

      let saveButton = app.querySelector(
        '[data-action="save-fx-history-edits"]'
      );

      assert(saveButton !== null,
        "まとめて保存ボタンを表示する必要があります。");
      assert(saveButton.disabled,
        "変更がないときはまとめて保存ボタンを無効にする必要があります。");

      fxHistoryEditStateS11a.changes.set("H2",{
        value:"5200000"
      });
      renderFxHistoryPageS5h(account);

      saveButton = app.querySelector(
        '[data-action="save-fx-history-edits"]'
      );

      assert(saveButton !== null && !saveButton.disabled,
        "変更があるときはまとめて保存ボタンを有効にする必要があります。");
      assert(saveButton.textContent === "まとめて保存（1件）",
        "変更セル数をボタンに表示する必要があります。");
    } finally {
      appData = originalData;
      fxHistoryEditStateS11a = originalEditState;
      app.replaceChildren(...originalChildren);
    }
  });

  runTest("S11a 17-7-14：FX履歴ページと編集状態の描画",() => {
    const originalData = appData;
    const originalChildren = Array.from(app.childNodes);
    const originalEditState = fxHistoryEditStateS11a;
    const originalEditingSnapshotId = editingSnapshotId;
    const originalHistoryAccountId = selectedFxHistoryAccountIdS5h;

    try {
      const emptyAccount = makeAccount(
        "history-edit-empty",
        "架空FX口座",
        "fx",
        "fx"
      );

      appData = {
        accounts:[emptyAccount],
        snapshots:[],
        fxPositions:[],
        fxRates:[],
        fxSwapLedger:[]
      };

      resetFxHistoryEditStateS11a(emptyAccount.id);
      renderFxHistoryPageS5h(emptyAccount);

      assert(app.textContent.includes("累積確定損益"),
        "履歴がなくても累積確定損益の見出しを表示する必要があります。");
      assert(app.textContent.includes("履歴はまだありません。"),
        "履歴がない場合は空表示を行う必要があります。");
      assert(app.querySelector(".fx-history-table") === null,
        "履歴がない場合に空の表を表示しない必要があります。");

      const data = makeHistoryData();
      const account = data.accounts[0];
      appData = data;

      resetFxHistoryEditStateS11a(account.id);

      const before = JSON.stringify(appData);
      renderFxHistoryPageS5h(account);

      const table = app.querySelector(".fx-history-table");

      assert(table !== null,
        "履歴がある場合は表を描画する必要があります。");
      assert(table.querySelectorAll("tbody tr").length === 4,
        "4件の履歴を描画する必要があります。");

      const h0RateCell = table.querySelector(
        '[data-snapshot-id="H0"][data-field="rates"]'
      );

      assert(h0RateCell === null,
        "ratesがnullの履歴では通貨ペアの編集セルを生成しない必要があります。");

      const h2ValueCell = table.querySelector(
        '[data-snapshot-id="H2"][data-field="value"]'
      );

      assert(h2ValueCell !== null,
        "総資産の数値セルを描画する必要があります。");

      h2ValueCell.click();

      const input = h2ValueCell.querySelector("input");

      assert(input !== null,
        "数値セルをタップすると直接編集欄を表示する必要があります。");

      input.dispatchEvent(new KeyboardEvent("keydown",{
        key:"Escape",
        bubbles:true
      }));

      assert(!hasFxHistoryPendingChangesS11a(),
        "Escapeキーでセル編集を取り消し、未保存変更を残さない必要があります。");

      assert(JSON.stringify(appData) === before,
        "履歴ページの描画とセル編集で保存データを変更してはいけません。");

      const h2DateCell = Array.from(
        app.querySelectorAll(".fx-history-date-cell")
      ).find(cell =>
        cell.textContent.includes("2026-11-10")
      );

      h2DateCell.click();

      assert(app.querySelector(".fx-history-inline-form") !== null,
        "対象日のタップで行内フォームを描画する必要があります。");
    } finally {
      appData = originalData;
      fxHistoryEditStateS11a = originalEditState;
      editingSnapshotId = originalEditingSnapshotId;
      selectedFxHistoryAccountIdS5h = originalHistoryAccountId;
      app.replaceChildren(...originalChildren);
    }
  });

  runTest("S11a 17-7-15：rates・未知の項目を含む既存項目の保持",() => {
    const data = makeHistoryData();
    const beforeH2 = JSON.parse(JSON.stringify(
      data.snapshots.find(item => item.id === "H2")
    ));

    const totalResult = save(data,[
      change("H2",{value:"5200000"})
    ]);

    assert(totalResult.result.ok,"総資産を編集できる必要があります。");

    const totalUpdated = totalResult.result.data.snapshots.find(
      item => item.id === "H2"
    );

    assert(JSON.stringify(totalUpdated.rates) ===
      JSON.stringify(beforeH2.rates),
      "総資産の編集でratesを変更してはいけません。");
    assert(totalUpdated.realizedPnlDaily ===
      beforeH2.realizedPnlDaily &&
      totalUpdated.requiredMargin === beforeH2.requiredMargin,
      "総資産の編集で日次確定損益・必要証拠金を変更してはいけません。");
    assert(totalUpdated.futureField === "x",
      "未知の項目 futureField を保持する必要があります。");

    const dailyResult = save(data,[
      change("H2",{realizedPnlDaily:"20000"})
    ]);

    assert(dailyResult.result.ok,"日次確定損益を編集できる必要があります。");
    assert(JSON.stringify(
      dailyResult.result.data.snapshots.find(item => item.id === "H2").rates
    ) === JSON.stringify(beforeH2.rates),
      "日次確定損益の編集でratesを変更してはいけません。");
  });

  runTest("S11a 17-7-16：recordedAt・updatedAtと同日履歴の採用",() => {
    const data = makeHistoryData();
    const account = data.accounts[0];
    const beforeRecordedAt = data.snapshots[2].recordedAt;
    const saveTime = "2026-11-19T03:00:00.000Z";

    const {result} = save(data,[
      change("H2",{value:"5200000"})
    ]);

    assert(result.ok,"履歴を編集できる必要があります。");

    const updated = result.data.snapshots.find(item => item.id === "H2");
    const updatedAccount = result.data.accounts.find(item =>
      item.id === account.id
    );

    assert(updated.recordedAt === beforeRecordedAt,
      "recordedAtを変更してはいけません。");
    assert(updated.updatedAt === saveTime,
      "編集した履歴のupdatedAtを保存時刻にする必要があります。");
    assert(updatedAccount.updatedAt === saveTime,
      "口座のupdatedAtを保存時刻にする必要があります。");

    const sameDateData = makeHistoryData();
    const older = makeSnapshot(
      "same-date-A",
      account.id,
      "2026-11-10",
      "2026-11-10T01:00:00.000Z",
      1000
    );
    const newer = makeSnapshot(
      "same-date-B",
      account.id,
      "2026-11-10",
      "2026-11-10T02:00:00.000Z",
      2000
    );
    sameDateData.snapshots.push(older,newer);

    assert(getLatestSnapshot(sameDateData,account.id).id === "same-date-B",
      "編集前はrecordedAtが新しいBを採用する必要があります。");

    const sameDateResult = save(sameDateData,[
      change("same-date-A",{value:"1500"})
    ]);

    assert(sameDateResult.result.ok,
      "同日の古い履歴Aを編集できる必要があります。");
    assert(getLatestSnapshot(
      sameDateResult.result.data,
      account.id
    ).id === "same-date-B",
      "古いAを編集しても採用される履歴はBのままである必要があります。");
  });

  runTest("S11a 17-7-17：行内フォームと同じ専用保存処理で項目を保持",() => {
    const data = makeHistoryData();
    const before = data.snapshots.find(item => item.id === "H2");
    const beforeRates = JSON.stringify(before.rates);
    const beforeDaily = before.realizedPnlDaily;
    const beforeMargin = before.requiredMargin;
    const beforeUnknown = before.futureField;

    const {result} = save(data,[
      change("H2",{
        value:"5200000",
        memo:"行内フォームからの編集"
      })
    ]);

    assert(result.ok,"行内フォーム相当の編集を保存できる必要があります。");

    const updated = result.data.snapshots.find(item => item.id === "H2");

    assert(updated.value === 5200000 &&
      updated.memo === "行内フォームからの編集",
      "変更した項目を保存する必要があります。");
    assert(JSON.stringify(updated.rates) === beforeRates &&
      updated.realizedPnlDaily === beforeDaily &&
      updated.requiredMargin === beforeMargin &&
      updated.futureField === beforeUnknown,
      "変更していない項目を保持する必要があります。");
    assert(updated.recordedAt === before.recordedAt,
      "行内フォームの保存でもrecordedAtを変更してはいけません。");
  });
}
