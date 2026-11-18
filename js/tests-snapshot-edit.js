"use strict";

function registerSnapshotEditTests(context) {
  const {runTest,assert,makeAccount,makeSnapshot} = context;

  function submitSnapshotForTest(data,accountId,snapshotId,formValues) {
    const form = document.createElement("form");
    const fields = [
      "asOfDate",
      "value",
      "cash",
      "pnl",
      "effectivePrincipal",
      "realizedPnlTotal",
      "realizedPnlDaily",
      "swapTotal",
      "requiredMargin",
      "memo"
    ];

    for (const field of fields) {
      const input = field === "memo"
        ? document.createElement("textarea")
        : document.createElement("input");
      input.name = field;
      input.value = formValues[field] === undefined
        ? ""
        : String(formValues[field]);
      form.appendChild(input);
    }

    document.body.appendChild(form);

    const previous = {
      appData,
      selectedAccountId,
      editingSnapshotId,
      saveData:globalThis.saveData,
      render:globalThis.render,
      showMessage:globalThis.showMessage,
      hadRender:Object.prototype.hasOwnProperty.call(globalThis,"render")
    };
    const saved = {called:false,data:null};

    try {
      appData = data;
      selectedAccountId = accountId;
      editingSnapshotId = snapshotId;
      globalThis.saveData = nextData => {
        saved.called = true;
        saved.data = nextData;
      };
      globalThis.render = () => {};
      globalThis.showMessage = () => {};

      handleSnapshotSubmit({
        preventDefault() {},
        currentTarget:form
      });

      return saved;
    } finally {
      appData = previous.appData;
      selectedAccountId = previous.selectedAccountId;
      editingSnapshotId = previous.editingSnapshotId;
      globalThis.saveData = previous.saveData;
      globalThis.showMessage = previous.showMessage;
      if (previous.hadRender) {
        globalThis.render = previous.render;
      } else {
        delete globalThis.render;
      }
      form.remove();
    }
  }

  function makeFormValues(overrides = {}) {
    return {
      asOfDate:"2026-11-18",
      value:"2000",
      cash:"",
      pnl:"",
      effectivePrincipal:"",
      realizedPnlTotal:"",
      realizedPnlDaily:"",
      swapTotal:"",
      requiredMargin:"",
      memo:"",
      ...overrides
    };
  }

  function makeFxData(accountId,snapshots) {
    const account = makeAccount(
      accountId,
      "架空FX口座",
      "fx",
      "fx"
    );
    return {
      account,
      data:{
        schemaVersion:SCHEMA_VERSION,
        accounts:[account],
        snapshots
      }
    };
  }

  runTest("S11a-0-1：編集後も評価レートを保持",() => {
    const {account,data} = makeFxData("snapshot-edit-fx-1",[
      makeSnapshot(
        "snapshot-edit-1",
        "snapshot-edit-fx-1",
        "2026-11-18",
        "2026-11-18T01:00:00.000Z",
        1000,
        {rates:{"TRY/JPY":3.120},cash:500}
      )
    ]);
    const saved = submitSnapshotForTest(
      data,account.id,"snapshot-edit-1",makeFormValues()
    );
    const updated = data.snapshots[0];

    assert(saved.called,"保存処理を呼び出す必要があります。");
    assert(updated.value === 2000,"総資産を2,000円に更新する必要があります。");
    assert(updated.rates &&
      updated.rates["TRY/JPY"] === 3.120,
      "評価レート TRY/JPY＝3.120 を保持する必要があります。");
  });

  runTest("S11a-0-2：編集後も未知の項目を保持",() => {
    const {account,data} = makeFxData("snapshot-edit-fx-2",[
      makeSnapshot(
        "snapshot-edit-2",
        "snapshot-edit-fx-2",
        "2026-11-18",
        "2026-11-18T01:00:00.000Z",
        1000,
        {futureField:"x"}
      )
    ]);
    const saved = submitSnapshotForTest(
      data,account.id,"snapshot-edit-2",makeFormValues()
    );

    assert(saved.called,"保存処理を呼び出す必要があります。");
    assert(data.snapshots[0].value === 2000,
      "編集した総資産を2,000円に更新する必要があります。");
    assert(data.snapshots[0].futureField === "x",
      "未知の項目 futureField＝x を保持する必要があります。");
  });

  runTest("S11a-0-3：recordedAtを保持しupdatedAtを更新",() => {
    const {account,data} = makeFxData("snapshot-edit-fx-3",[
      makeSnapshot(
        "snapshot-edit-3",
        "snapshot-edit-fx-3",
        "2026-11-18",
        "2026-11-18T01:00:00.000Z",
        1000
      )
    ]);
    const beforeRecordedAt = data.snapshots[0].recordedAt;
    const beforeAccountUpdatedAt = account.updatedAt;

    submitSnapshotForTest(
      data,account.id,"snapshot-edit-3",makeFormValues()
    );

    assert(data.snapshots[0].recordedAt === beforeRecordedAt,
      "recordedAtを変更してはいけません。");
    assert(typeof data.snapshots[0].updatedAt === "string" &&
      data.snapshots[0].updatedAt === account.updatedAt,
      "履歴と口座のupdatedAtを同じ保存時刻にする必要があります。");
    assert(account.updatedAt !== beforeAccountUpdatedAt,
      "口座のupdatedAtを更新する必要があります。");
  });

  runTest("S11a-0-4：同日履歴の採用記録を編集で入れ替えない",() => {
    const {account,data} = makeFxData("snapshot-edit-fx-4",[
      makeSnapshot(
        "snapshot-edit-A",
        "snapshot-edit-fx-4",
        "2026-11-18",
        "2026-11-18T01:00:00.000Z",
        1000
      ),
      makeSnapshot(
        "snapshot-edit-B",
        "snapshot-edit-fx-4",
        "2026-11-18",
        "2026-11-18T02:00:00.000Z",
        1500
      )
    ]);
    assert(getLatestSnapshot(data,account.id).id === "snapshot-edit-B",
      "編集前はrecordedAtが新しいBを採用する必要があります。");

    const saved = submitSnapshotForTest(
      data,account.id,"snapshot-edit-A",makeFormValues()
    );

    assert(saved.called,"保存処理を呼び出す必要があります。");
    assert(data.snapshots[0].value === 2000,
      "編集対象Aの総資産を2,000円に更新する必要があります。");
    assert(getLatestSnapshot(data,account.id).id === "snapshot-edit-B",
      "Aを編集しても採用記録はBのままである必要があります。");
  });

  runTest("S11a-0-5：新規追加の日時とratesの扱いを維持",() => {
    const {account,data} = makeFxData("snapshot-edit-fx-5",[]);
    const saved = submitSnapshotForTest(
      data,account.id,null,makeFormValues({value:"3000"})
    );
    const added = data.snapshots[0];

    assert(saved.called && data.snapshots.length === 1,
      "新しい履歴を1件追加する必要があります。");
    assert(added.recordedAt === account.updatedAt,
      "新規追加のrecordedAtは口座更新時刻と同じ現在時刻にする必要があります。");
    assert(added.rates == null,
      "評価レートを入力しない新規履歴のratesはnull相当である必要があります。");
  });

  runTest("S11a-0-6：フォーム項目の空欄は従来どおりnull",() => {
    const account = makeAccount(
      "snapshot-edit-stock-6",
      "架空株式口座",
      "securities",
      "stock"
    );
    const snapshot = makeSnapshot(
      "snapshot-edit-6",
      account.id,
      "2026-11-18",
      "2026-11-18T01:00:00.000Z",
      1000,
      {pnl:250}
    );
    const data = {
      schemaVersion:SCHEMA_VERSION,
      accounts:[account],
      snapshots:[snapshot]
    };

    const saved = submitSnapshotForTest(
      data,account.id,"snapshot-edit-6",makeFormValues({pnl:""})
    );

    assert(saved.called,"保存処理を呼び出す必要があります。");
    assert(data.snapshots[0].pnl === null,
      "空欄にした評価損益は従来どおりnullにする必要があります。");
  });
}