"use strict";

function registerFxDailyTests(context) {
  const {assert,runTest,makeAccount} = context;

  function makeDailyData(options = {}) {
    const account = makeAccount(
      options.accountId || "fx-daily-test",
      "架空FX口座",
      "fx",
      "fx"
    );

    const position = options.position || {
      id:"daily-position",
      accountId:account.id,
      pair:"TRY/JPY",
      side:"買",
      quantity:1000000,
      openRate:3.167,
      swap:0,
      status:"保有中"
    };

    return {
      accounts:[account],
      snapshots:options.snapshots || [],
      fxPositions:options.positions === undefined
        ? [position]
        : options.positions,
      fxRates:options.rates || [],
      fxSwapLedger:[]
    };
  }

  function makeRate(accountId,rate,asOfDate) {
    return {
      id:"daily-rate",
      accountId,
      pair:"TRY/JPY",
      rate,
      asOfDate
    };
  }

  function assertNear(actual,expected,message) {
    assert(
      Number.isFinite(actual) &&
      Math.abs(actual - expected) < 0.0000001,
      message
    );
  }

  runTest("S5f B：LIGHT FXの総資産の目安",() => {
    const accountId = "fx-daily-test";
    const data = makeDailyData({
      position:{
        id:"light-position",
        accountId,
        pair:"TRY/JPY",
        side:"買",
        quantity:1000000,
        openRate:3.167,
        swap:0,
        status:"保有中"
      },
      rates:[makeRate(accountId,0.79068,"2026-11-16")]
    });

    const result = calculateFxDailyEstimatedTotal(
      data,
      accountId,
      1331457,
      6143654
    );

    assertNear(result.exchangeProfit,-2376320,
      "為替差益は-2,376,320円である必要があります。");
    assertNear(result.value,5098791,
      "総資産の目安は5,098,791円である必要があります。");
  });

  runTest("S5f B：クリック365の総資産の目安",() => {
    const accountId = "fx-daily-test";
    const data = makeDailyData({
      position:{
        id:"click-position",
        accountId,
        pair:"TRY/JPY",
        side:"買",
        quantity:1000000,
        openRate:3,
        swap:0,
        status:"保有中"
      },
      rates:[makeRate(accountId,3.896,"2026-11-16")]
    });

    const result = calculateFxDailyEstimatedTotal(
      data,
      accountId,
      276239,
      1411838
    );

    assertNear(result.exchangeProfit,896000,
      "為替差益は896,000円である必要があります。");
    assertNear(result.value,2584077,
      "総資産の目安は2,584,077円である必要があります。");
  });

  runTest("S5f B：LION FXの総資産の目安",() => {
    const accountId = "fx-daily-test";
    const data = makeDailyData({
      position:{
        id:"lion-position",
        accountId,
        pair:"TRY/JPY",
        side:"買",
        quantity:1000000,
        openRate:3,
        swap:0,
        status:"保有中"
      },
      rates:[makeRate(accountId,3.9246,"2026-11-16")]
    });

    const result = calculateFxDailyEstimatedTotal(
      data,
      accountId,
      711119,
      890505
    );

    assertNear(result.exchangeProfit,924600,
      "為替差益は924,600円である必要があります。");
    assertNear(result.value,2526224,
      "総資産の目安は2,526,224円である必要があります。");
  });

  runTest("S5f B：評価レート未入力は総資産を算出しない",() => {
    const accountId = "fx-daily-test";
    const data = makeDailyData({
      rates:[]
    });

    const result = calculateFxDailyEstimatedTotal(
      data,
      accountId,
      1331457,
      6143654
    );

    assert(result.value === null,
      "評価レート未入力の場合、総資産の目安はnullである必要があります。");
    assert(result.missing.some(item =>
      item.includes("評価レート")
    ),"不足項目に評価レートを含める必要があります。");
  });

  runTest("S5f：有効元本または累計スワップが未入力なら算出しない",() => {
    const accountId = "fx-daily-test";
    const data = makeDailyData({
      rates:[makeRate(accountId,3.2,"2026-11-16")]
    });

    const result = calculateFxDailyEstimatedTotal(
      data,
      accountId,
      null,
      1000
    );

    assert(result.value === null,
      "有効元本が未入力の場合は総資産を算出してはいけません。");
    assert(result.missing.includes("有効元本"),
      "不足項目に有効元本を含める必要があります。");
  });

  runTest("S5f：履歴ratesの形式検証",() => {
    const valid = {
      snapshots:[{
        id:"snapshot-valid",
        rates:{"TRY/JPY":3.167}
      }]
    };

    validateFxSnapshotRates(valid);

    const nullRates = {
      snapshots:[{
        id:"snapshot-null",
        rates:null
      }]
    };

    validateFxSnapshotRates(nullRates);

    const absentRates = {
      snapshots:[{
        id:"snapshot-absent"
      }]
    };

    validateFxSnapshotRates(absentRates);

    let invalidRejected = false;

    try {
      validateFxSnapshotRates({
        snapshots:[{
          id:"snapshot-invalid",
          rates:{"TRY/JPY":0}
        }]
      });
    } catch (error) {
      invalidRejected = true;
    }

    assert(invalidRejected,
      "0以下の評価レートを拒否する必要があります。");

    invalidRejected = false;

    try {
      validateFxSnapshotRates({
        snapshots:[{
          id:"snapshot-invalid-type",
          rates:[3.167]
        }]
      });
    } catch (error) {
      invalidRejected = true;
    }

    assert(invalidRejected,
      "配列形式のratesを拒否する必要があります。");
  });

  runTest("S5f 13-3：FX日次入力・履歴フォーム描画",() => {
    const originalData = appData;
    const originalEditingId = editingSnapshotId;

    try {
      const accountId = "fx-daily-render";
      const account = makeAccount(
        accountId,
        "架空FX口座",
        "fx",
        "fx"
      );
      const existingSnapshot = {
        id:"fx-daily-render-snapshot",
        accountId,
        asOfDate:"2026-11-13",
        recordedAt:"2026-11-13T10:00:00.000Z",
        value:100000,
        effectivePrincipal:80000,
        pnl:10000,
        swapTotal:10000,
        realizedPnlDaily:null,
        cash:5000,
        rates:null,
        memo:""
      };

      appData = {
        accounts:[account],
        snapshots:[existingSnapshot],
        fxPositions:[{
          id:"fx-daily-render-position",
          accountId,
          pair:"TRY/JPY",
          side:"買",
          quantity:1000000,
          openRate:3.167,
          swap:0,
          status:"保有中"
        }],
        fxRates:[{
          id:"fx-daily-render-rate",
          accountId,
          pair:"TRY/JPY",
          rate:3.2,
          asOfDate:"2026-11-13"
        }],
        fxSwapLedger:[]
      };
      editingSnapshotId = null;

      const dailyForm = renderFxDailyInputForm(account);
      assert(
        dailyForm.querySelector('[name="asOfDate"]') !== null,
        "日次入力フォームに対象日欄が必要です。"
      );
      assert(
        dailyForm.querySelector(".fx-daily-rates") !== null,
        "日次入力フォームに評価レート欄が必要です。"
      );
      assert(
        dailyForm.querySelector('[data-role="fx-daily-weekday"]') !== null,
        "日次入力フォームに曜日表示が必要です。"
      );
      assert(
        dailyForm.querySelector('[name="value"]') !== null,
        "日次入力フォームに総資産欄が必要です。"
      );

      const newHistoryForm = renderSnapshotForm(account);
      assert(
        newHistoryForm.querySelector("h3").textContent === "評価額を追加",
        "新規履歴フォームを描画できる必要があります。"
      );
      assert(
        newHistoryForm.querySelector(".fx-daily-rates") !== null,
        "新規履歴フォームに評価レート欄が必要です。"
      );

      editingSnapshotId = existingSnapshot.id;
      const editHistoryForm = renderSnapshotForm(account);
      assert(
        editHistoryForm.querySelector("h3").textContent === "履歴を編集",
        "履歴編集フォームを描画できる必要があります。"
      );
      assert(
        editHistoryForm.querySelector(".fx-daily-rates") !== null,
        "履歴編集フォームに評価レート欄が必要です。"
      );
    } finally {
      appData = originalData;
      editingSnapshotId = originalEditingId;
    }
  });

  runTest("S5f D：過去の日付ではfxRatesを更新しない",() => {
    const accountId = "fx-daily-test";
    const data = makeDailyData({
      snapshots:[{
        id:"snapshot-latest",
        accountId,
        asOfDate:"2026-11-13",
        recordedAt:"2026-11-13T10:00:00.000Z"
      }],
      rates:[makeRate(accountId,3.167,"2026-11-13")]
    });

    assert(
      canUpdateFxDailyRate(
        data,
        accountId,
        "TRY/JPY",
        "2026-11-10"
      ) === false,
      "11月10日の入力では最新レートを更新してはいけません。"
    );
  });

  runTest("S5f D：最新日以降の日付ではfxRatesを更新できる",() => {
    const accountId = "fx-daily-test";
    const data = makeDailyData({
      snapshots:[{
        id:"snapshot-latest",
        accountId,
        asOfDate:"2026-11-13",
        recordedAt:"2026-11-13T10:00:00.000Z"
      }],
      rates:[makeRate(accountId,3.167,"2026-11-13")]
    });

    assert(
      canUpdateFxDailyRate(
        data,
        accountId,
        "TRY/JPY",
        "2026-11-16"
      ) === true,
      "11月16日の入力では最新レートを更新できる必要があります。"
    );

    assert(
      canUpdateFxDailyRate(
        data,
        accountId,
        "TRY/JPY",
        "2026-11-13"
      ) === true,
      "最新日と同日の入力でも更新できる必要があります。"
    );
  });

  runTest("S5f D：fxRatesのasOfDateより前なら更新しない",() => {
    const accountId = "fx-daily-test";
    const data = makeDailyData({
      snapshots:[{
        id:"snapshot-latest",
        accountId,
        asOfDate:"2026-11-10",
        recordedAt:"2026-11-10T10:00:00.000Z"
      }],
      rates:[makeRate(accountId,3.167,"2026-11-13")]
    });

    assert(
      canUpdateFxDailyRate(
        data,
        accountId,
        "TRY/JPY",
        "2026-11-12"
      ) === false,
      "fxRatesのasOfDateより前の日付では更新してはいけません。"
    );

    assert(
      canUpdateFxDailyRate(
        data,
        accountId,
        "TRY/JPY",
        "2026-11-13"
      ) === true,
      "fxRatesのasOfDateと同日の入力では更新できる必要があります。"
    );
  });

  runTest("S5h 13-3：FX履歴ページの内訳・表描画",() => {
    const originalData = appData;
    const originalChildren = Array.from(app.childNodes);
    const originalHistoryAccountId = selectedFxHistoryAccountIdS5h;
    const originalSelectedAccountId = selectedAccountId;
    const originalEditingId = editingSnapshotId;
    const originalEditSnapshot = editSnapshot;
    let editedSnapshotId = null;

    try {
      const accountId = "fx-history-s5h-test";
      const account = makeAccount(accountId,"架空FX口座","fx","fx");
      const baseSnapshot = {
        id:"s5h-base",accountId,asOfDate:"2026-11-10",
        recordedAt:"2026-11-10T10:00:00.000Z",value:100000,
        effectivePrincipal:90000,pnl:5000,swapTotal:500,
        realizedPnlTotal:1000,realizedPnlDaily:null,requiredMargin:2000,
        rates:{"TRY/JPY":3.1,"ZAR/JPY":7.2},memo:"基準日"
      };
      const dailySnapshot = {
        id:"s5h-daily",accountId,asOfDate:"2026-11-11",
        recordedAt:"2026-11-11T10:00:00.000Z",value:101000,
        effectivePrincipal:90000,pnl:6000,swapTotal:600,
        realizedPnlTotal:null,realizedPnlDaily:200,requiredMargin:2100,
        rates:{"TRY/JPY":3.2},memo:"日次入力あり"
      };
      const fallbackSnapshot = {
        id:"s5h-fallback",accountId,asOfDate:"2026-11-12",
        recordedAt:"2026-11-12T10:00:00.000Z",value:102000,
        effectivePrincipal:null,pnl:null,swapTotal:null,
        realizedPnlTotal:null,realizedPnlDaily:null,requiredMargin:null,
        rates:null,memo:"日次入力なし"
      };

      appData = {
        accounts:[account],
        snapshots:[baseSnapshot,dailySnapshot,fallbackSnapshot],
        fxPositions:[
          {id:"s5h-settled-daily",accountId,status:"決済済",closeDate:"2026-11-11",realizedPnl:300},
          {id:"s5h-settled-fallback",accountId,status:"決済済",closeDate:"2026-11-12",realizedPnl:400},
          {id:"s5h-settled-before-base",accountId,status:"決済済",closeDate:"2026-11-10",realizedPnl:500}
        ],
        fxRates:[],
        fxSwapLedger:[]
      };
      selectedFxHistoryAccountIdS5h = accountId;
      selectedAccountId = accountId;
      editingSnapshotId = null;
      editSnapshot = id => { editedSnapshotId = id; };

      const before = JSON.stringify(appData);
      renderFxHistoryPageS5h(account);
      const realized = getFxRealizedAt(appData,accountId,localDateString());

      assert(realized && realized.value === 1600,"累積確定損益は1,600円である必要があります。");
      assert(
        realized.baseAmount + realized.dailyPnlTotal + realized.fallbackSettledPnl === realized.value,
        "基準値＋日次確定損益＋日次のない日の決済損益が累積確定損益と一致する必要があります。"
      );
      assert(app.textContent.includes("+¥1,000"),"基準値1,000円を表示する必要があります。");
      assert(app.textContent.includes("+¥200"),"日次確定損益200円を表示する必要があります。");
      assert(app.textContent.includes("+¥400"),"日次のない日の決済損益400円を表示する必要があります。");
      assert(app.textContent.includes("+¥1,600"),"内訳の合計1,600円を表示する必要があります。");

      const table = app.querySelector(".fx-history-table");
      assert(table !== null,"FX履歴表を描画する必要があります。");
      assert(table.querySelectorAll("thead th").length === 10,"固定8列と通貨ペア別2列の計10列を描画する必要があります。");
      const rows = table.querySelectorAll("tbody tr");
      assert(rows.length === 3,"対象日ごとに1行ずつ、3行を描画する必要があります。");
      assert(rows[0].cells[0].textContent.includes("2026-11-12"),"新しい対象日を上に表示する必要があります。");
      assert(rows[0].cells[2].textContent === "","未入力の有効元本を空欄にする必要があります。");
      assert(rows[0].cells[7].textContent === "" && rows[0].cells[8].textContent === "","ratesがない日の評価レートを空欄にする必要があります。");
      assert(rows[1].cells[7].textContent === "3.2" && rows[1].cells[8].textContent === "","通貨ペアごとにratesの値を対応する列へ表示する必要があります。");
      assert(JSON.stringify(appData) === before,"履歴ページの描画で保存データを変更してはいけません。");

      rows[0].click();
      assert(editedSnapshotId === "s5h-fallback","履歴行のタップで既存の履歴編集画面を開く必要があります。");
    } finally {
      appData = originalData;
      selectedFxHistoryAccountIdS5h = originalHistoryAccountId;
      selectedAccountId = originalSelectedAccountId;
      editingSnapshotId = originalEditingId;
      editSnapshot = originalEditSnapshot;
      app.replaceChildren(...originalChildren);
    }
  });

  runTest("S5h 13-3：履歴なし・ratesなし・日次確定損益なし",() => {
    const originalData = appData;
    const originalChildren = Array.from(app.childNodes);
    const originalHistoryAccountId = selectedFxHistoryAccountIdS5h;

    try {
      const account = makeAccount("fx-history-s5h-empty","架空FX口座","fx","fx");
      appData = {accounts:[account],snapshots:[],fxPositions:[],fxRates:[],fxSwapLedger:[]};
      selectedFxHistoryAccountIdS5h = account.id;

      renderFxHistoryPageS5h(account);

      assert(app.textContent.includes("累積確定損益"),"履歴がなくても累積確定損益の見出しを表示する必要があります。");
      assert(app.textContent.includes("未入力"),"累積確定損益がない場合は未入力と表示する必要があります。");
      assert(app.textContent.includes("履歴はまだありません。"),"履歴がない場合は空表示を行う必要があります。");
      assert(app.querySelector(".fx-history-table") === null,"履歴がない場合に空の表を表示しない必要があります。");
    } finally {
      appData = originalData;
      selectedFxHistoryAccountIdS5h = originalHistoryAccountId;
      app.replaceChildren(...originalChildren);
    }
  });
}

const registerFxTestsBeforeDaily = registerFxTests;

registerFxTests = function(context) {
  registerFxTestsBeforeDaily(context);
  registerFxDailyTests(context);
};