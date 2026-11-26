"use strict";

/* ---------- S11b 株式OCR画面の描画テスト ---------- */

function withStockOcrRenderStateTest(data,callback) {
  const previousData = appData;
  const previousState = {
    accountId:stockOcrUpdateAccountId,
    targetDate:stockOcrUpdateTargetDate,
    pasteText:stockOcrUpdatePasteText,
    cards:stockOcrUpdateCards,
    comparison:stockOcrUpdateComparison,
    snapshotEnabled:stockOcrUpdateSnapshotEnabled,
    snapshotValue:stockOcrUpdateSnapshotValue,
    snapshotManual:stockOcrUpdateSnapshotManual,
    snapshotState:stockOcrUpdateSnapshotState,
    message:stockOcrUpdateMessage,
    error:stockOcrUpdateError
  };
  const previousChildren = Array.from(app.childNodes);

  try {
    appData = data;
    stockOcrUpdateAccountId = "";
    stockOcrUpdateTargetDate = "2026-11-30";
    stockOcrUpdatePasteText = "";
    stockOcrUpdateCards = [];
    stockOcrUpdateComparison = null;
    stockOcrUpdateSnapshotEnabled = true;
    stockOcrUpdateSnapshotValue = "";
    stockOcrUpdateSnapshotManual = false;
    stockOcrUpdateSnapshotState = null;
    stockOcrUpdateMessage = "";
    stockOcrUpdateError = "";
    app.replaceChildren();

    callback();
  } finally {
    appData = previousData;
    stockOcrUpdateAccountId = previousState.accountId;
    stockOcrUpdateTargetDate = previousState.targetDate;
    stockOcrUpdatePasteText = previousState.pasteText;
    stockOcrUpdateCards = previousState.cards;
    stockOcrUpdateComparison = previousState.comparison;
    stockOcrUpdateSnapshotEnabled = previousState.snapshotEnabled;
    stockOcrUpdateSnapshotValue = previousState.snapshotValue;
    stockOcrUpdateSnapshotManual = previousState.snapshotManual;
    stockOcrUpdateSnapshotState = previousState.snapshotState;
    stockOcrUpdateMessage = previousState.message;
    stockOcrUpdateError = previousState.error;
    app.replaceChildren(...previousChildren);
  }
}

function makeStockOcrRenderCardTest(overrides = {}) {
  return {
    name:"架空テストファンド",
    wrapper:"NISAつみたて",
    kind:"投信",
    value:60000,
    pnl:-10000,
    costBasis:70000,
    costBasisSource:"value-minus-pnl",
    quantity:null,
    status:"recognized",
    selected:true,
    duplicate:false,
    batchDuplicate:false,
    manualConfirmed:true,
    reasons:[],
    comparison:"cost-decrease",
    costDifference:-30000,
    wrapperWarning:false,
    similarNames:[],
    quantityDifference:null,
    safeLines:[],
    ...overrides
  };
}

function makeStockOcrRenderTestData(makeAccount) {
  return {
    accounts:[
      makeAccount("stock-ocr-render-rakuten","楽天証券","securities","stock"),
      makeAccount("stock-ocr-render-ideco","iDeCo","ideco","stock"),
      makeAccount("stock-ocr-render-dc","企業型DC","dc","stock")
    ],
    snapshots:[],
    holdings:[]
  };
}

function registerStockOcrRenderTests(context) {
  const {assert,runTest,makeAccount} = context;

  runTest("S11b描画①：月次更新画面の基本表示",() => {
    const data = makeStockOcrRenderTestData(makeAccount);

    withStockOcrRenderStateTest(data,() => {
      renderStockOcrUpdate();

      assert(app.textContent.includes("株式の月次更新"),
        "画面の見出しがありません。");
      assert(app.textContent.includes("解析・比較だけでは保存されません"),
        "解析・比較時の説明がありません。");
      assert(app.querySelector("#stock-ocr-account") !== null,
        "口座選択欄がありません。");
      assert(app.querySelector("#stock-ocr-target-date") !== null,
        "対象日の入力欄がありません。");
      assert(app.querySelector("#stock-ocr-paste") !== null,
        "OCRテキスト欄がありません。");
      assert(app.querySelector('[data-action="stock-ocr-parse"]') !== null,
        "解析ボタンがありません。");
      assert(app.querySelector('[data-action="stock-ocr-clear"]') !== null,
        "消去ボタンがありません。");

      const accountSelect = app.querySelector("#stock-ocr-account");
      assert(
        accountSelect.options.length === STOCK_OCR_RULES.length + 1,
        "ルールのある口座だけが選択肢に表示されていません。"
      );
    });
  });

  runTest("S11b描画②：商品カードの項目と計算値表示",() => {
    const card = makeStockOcrRenderCardTest();
    const section = stockOcrUpdateRenderCard(card,0);

    assert(section.textContent.includes(card.name),
      "商品名が表示されていません。");
    assert(section.textContent.includes("認識・確定済み"),
      "認識済みの状態が表示されていません。");
    assert(section.textContent.includes("取得額：計算値"),
      "取得額の計算値表示がありません。");

    for (const field of [
      "name","value","pnl","costBasis","quantity"
    ]) {
      assert(section.querySelector(
        '[name="' + field + '"]'
      ) !== null,field + " の入力欄がありません。");
    }

    assert(section.querySelector('[name="wrapper"]') !== null,
      "wrapperの選択欄がありません。");
    assert(section.querySelector('[name="kind"]') !== null,
      "種別の選択欄がありません。");

    const valueInput = section.querySelector('[name="value"]');
    assert(valueInput.inputMode === "decimal",
      "評価額の入力欄が数字キーボード設定ではありません。");

    const checkbox = section.querySelector(
      'input[type="checkbox"]'
    );
    assert(checkbox.checked,
      "保存対象の初期状態がオンではありません。");
  });

  runTest("S11b描画③：前回・今回・増減の3行表示",() => {
    withStockOcrRenderStateTest(makeStockOcrRenderTestData(makeAccount),() => {
      stockOcrUpdateComparison = {
        targetDate:"2026-11-30",
        aggregateComparison:{
          status:"calculated",
          previousDate:"2026-10-31",
          previousTotal:100000,
          currentTotal:125000,
          change:25000
        },
        missingHoldings:[
          {name:"架空の過去商品",wrapper:"特定"}
        ]
      };

      stockOcrUpdateRenderComparison();

      assert(app.textContent.includes("前回（2026-10-31"),
        "前回の日付が表示されていません。");
      assert(app.textContent.includes("¥100,000"),
        "前回の合計額が表示されていません。");
      assert(app.textContent.includes("今回（2026-11-30"),
        "今回の日付が表示されていません。");
      assert(app.textContent.includes("¥125,000"),
        "今回の合計額が表示されていません。");
      assert(app.textContent.includes("増減：+¥25,000"),
        "増減額が表示されていません。");
      assert(app.textContent.includes("今回出ていません"),
        "消失商品の見出しがありません。");
      assert(app.textContent.includes("架空の過去商品"),
        "消失商品の商品名がありません。");
      assert(app.textContent.includes("削除・保存しません"),
        "消失商品を削除・保存しない説明がありません。");
      assert(!app.textContent.includes("5%を超えています"),
        "削除対象の5%警告が残っています。");
      assert(!app.textContent.includes("50,001"),
        "削除対象の口座全体との差額が残っています。");
    });
  });

  runTest("S11b描画④：口座全体履歴の初期状態と保存件数",() => {
    withStockOcrRenderStateTest(makeStockOcrRenderTestData(makeAccount),() => {
      stockOcrUpdateAccountId = "stock-ocr-render-rakuten";
      stockOcrUpdateCards = [
        makeStockOcrRenderCardTest()
      ];

      renderStockOcrUpdate();

      const checkbox = app.querySelector(
        "#stock-ocr-snapshot-enabled"
      );
      const valueInput = app.querySelector(
        "#stock-ocr-snapshot-value"
      );
      const saveButton = app.querySelector(
        '[data-action="stock-ocr-save"]'
      );

      assert(checkbox !== null,
        "口座全体履歴のチェック欄がありません。");
      assert(checkbox.checked,
        "口座全体履歴の初期状態がオンではありません。");
      assert(valueInput !== null,
        "口座全体の評価額入力欄がありません。");
      assert(valueInput.value === "60000",
        "確定済みカードの商品別評価額合計が反映されていません。");
      assert(saveButton !== null,
        "保存ボタンがありません。");
      assert(saveButton.textContent === "保存（1件）",
        "保存対象件数の表示が一致しません。");
      assert(!saveButton.disabled,
        "確定済みカードがあるのに保存ボタンが無効です。");
    });
  });

  runTest("S11b描画⑤：候補ボタン・選択済み・解除ボタン",() => {
    const card = makeStockOcrRenderCardTest({
      status:"needs-confirmation",
      manualConfirmed:false,
      valueCandidates:[
        {value:60000,label:"60,000円"},
        {value:61000,label:"61,000円"}
      ],
      candidateSelections:{
        value:{
          value:60000,
          label:"60,000円"
        }
      }
    });

    const section = stockOcrUpdateRenderCard(card,0);
    const candidateButtons = section.querySelectorAll(
      'button[data-action="stock-ocr-candidate"]'
    );
    const clearButton = section.querySelector(
      'button[data-action="stock-ocr-candidate-clear"]'
    );

    assert(candidateButtons.length === 2,
      "評価額の候補ボタンが2つ表示されていません。");
    assert(section.textContent.includes("選択済み：60,000円"),
      "選択済みの候補が表示されていません。");
    assert(candidateButtons[0].dataset.candidateIndex === "0",
      "1つ目の候補の番号が正しくありません。");
    assert(candidateButtons[1].dataset.candidateIndex === "1",
      "2つ目の候補の番号が正しくありません。");
    assert(clearButton !== null,
      "選択を解除するボタンがありません。");
    assert(clearButton.textContent === "選択を解除",
      "解除ボタンの表示が正しくありません。");
  });

  runTest("S11b描画⑥：株式以外の口座を選択肢に含めない",() => {
    const data = makeStockOcrRenderTestData(makeAccount);
    const stockAccount = data.accounts.find(account =>
      account.category === "stock"
    );

    assert(stockAccount !== undefined,
      "テスト用の株式口座がありません。");

    data.accounts.push({
      ...stockAccount,
      id:"fictional-non-stock-account",
      category:"bank",
      type:"bank"
    });

    withStockOcrRenderStateTest(data,() => {
      const accounts = stockOcrUpdateGetAccounts();

      assert(!accounts.some(account =>
        account.id === "fictional-non-stock-account"
      ),"株式以外の口座が選択肢に含まれています。");
    });
  });

  runTest("S11b描画⑦：入力文字列をHTMLとして解釈しない",() => {
    const unsafeText = '<img src=x onerror="alert(1)">';

    const section = stockOcrUpdateRenderCard(
      makeStockOcrRenderCardTest({
        name:unsafeText,
        safeLines:[
          {
            lineNumber:1,
            text:unsafeText
          }
        ]
      }),
      0
    );

    assert(section.querySelector("img") === null,
      "商品名がHTML要素として生成されています。");
    assert(section.textContent.includes(unsafeText),
      "商品名が文字列として表示されていません。");
    assert(section.querySelector("details") !== null,
      "伏せ字処理済みOCR行の表示欄がありません。");
  });

  runTest("S11b描画⑧：8桁以上の連続数字を伏せ字にする",() => {
    const masked = stockOcrMaskStock("12345678");

    assert(masked === "●●●●●●●●",
      "8桁の連続数字が伏せ字になっていません。");
  });

  runTest("S11b描画⑨：口座データが空でも画面を描画できる",() => {
    const data = makeStockOcrRenderTestData(makeAccount);
    data.accounts = [];

    withStockOcrRenderStateTest(data,() => {
      renderStockOcrUpdate();

      const accountSelect = app.querySelector("#stock-ocr-account");
      assert(accountSelect !== null,
        "口座データが空のとき、口座選択欄がありません。");
      assert(accountSelect.options.length === 1,
        "口座データが空なのに選択肢があります。");
      assert(app.textContent.includes("株式の月次更新"),
        "口座データが空のとき、画面が描画されていません。");
    });
  });

  runTest("S11b追補A：米国株の種別選択肢",() => {
    const section = stockOcrUpdateRenderCard(
      makeStockOcrRenderCardTest({kind:"米国株"}),
      0
    );
    const kindSelect = section.querySelector('[name="kind"]');

    assert(kindSelect !== null,
      "種別の選択欄がありません。");
    assert(Array.from(kindSelect.options).some(option =>
      option.value === "米国株"
    ),"種別の選択肢に米国株がありません。");
    assert(kindSelect.value === "米国株",
      "米国株を選択した状態で表示できていません。");
  });

}
