"use strict";

/* ---------- S13e 売却・利確確認画面の描画テスト ---------- */

function registerSaleCheckRenderTests(context) {
  const {assert,runTest,makeAccount} = context;

  function makeTestAccount() {
    return makeAccount(
      "salecheck-render-1",
      "楽天証券",
      "securities",
      "stock"
    );
  }

  function makeTestData(account) {
    return {
      accounts:[account],
      snapshots:[
        {
          id:"salecheck-render-snapshot-1",
          accountId:account.id,
          asOfDate:"2026-03-31",
          recordedAt:"2026-03-31T12:00:00.000Z",
          value:200000,
          effectivePrincipal:200000,
          cumulativeInvested:null,
          pnl:null,
          realizedPnlTotal:null,
          memo:""
        },
        {
          id:"salecheck-render-snapshot-2",
          accountId:account.id,
          asOfDate:"2026-04-30",
          recordedAt:"2026-04-30T12:00:00.000Z",
          value:150000,
          effectivePrincipal:150000,
          cumulativeInvested:null,
          pnl:null,
          realizedPnlTotal:null,
          memo:""
        }
      ],
      holdings:[
        {
          id:"salecheck-render-holding-1",
          accountId:account.id,
          name:"テスト投信A",
          wrapper:"特定",
          asOfDate:"2026-03-31",
          recordedAt:"2026-03-31T12:00:00.000Z",
          costBasis:200000,
          value:200000,
          quantity:null,
          averageCost:null,
          memo:""
        },
        {
          id:"salecheck-render-holding-2",
          accountId:account.id,
          name:"テスト投信A",
          wrapper:"特定",
          asOfDate:"2026-04-30",
          recordedAt:"2026-04-30T12:00:00.000Z",
          costBasis:150000,
          value:150000,
          quantity:null,
          averageCost:null,
          memo:""
        }
      ],
      contributions:[],
      saleChecks:[]
    };
  }

  function withSaleCheckTestData(data,callback) {
    const previousData = appData;
    appData = data;

    try {
      callback();
    } finally {
      appData = previousData;
    }
  }

  runTest("S13e：売却・利確確認欄の基本表示",() => {
    const account = makeTestAccount();
    const data = makeTestData(account);

    withSaleCheckTestData(data,() => {
      const section = renderSaleCheckSection(account);

      assert(section !== null,
        "売却・利確確認欄が生成されていません。");
      assert(section.classList.contains("salecheck-section"),
        "売却・利確確認欄のCSSクラスがありません。");
      assert(section.textContent.includes("売却・利確の確認"),
        "見出しが表示されていません。");
      assert(section.textContent.includes("未確認の候補："),
        "未確認候補の件数が表示されていません。");
      assert(section.textContent.includes("テスト投信A"),
        "検出された商品別候補が表示されていません。");
      assert(section.querySelector('[data-action="salecheck-confirm"]') !== null,
        "利確確認操作が表示されていません。");
      assert(section.querySelector('[data-action="salecheck-dismiss"]') !== null,
        "候補解除操作が表示されていません。");
    });
  });

  runTest("S13e：候補なしの手動記録フォーム",() => {
    const account = makeTestAccount();
    const data = makeTestData(account);
    data.holdings = [];
    data.snapshots = [];

    withSaleCheckTestData(data,() => {
      const section = renderSaleCheckSection(account);
      const manualButton = section.querySelector('[data-action="salecheck-manual"]');

      assert(manualButton !== null,
        "候補なしの手動記録ボタンがありません。");

      manualButton.click();

      const form = section.querySelector(".salecheck-manual-form");
      assert(form !== null,
        "手動記録フォームが表示されていません。");
      assert(form.querySelector('[name="level"]') !== null,
        "記録単位の選択欄がありません。");
      assert(form.querySelector('[name="productName"]') !== null,
        "商品名の入力欄がありません。");
      assert(form.querySelector('[name="wrapper"]') !== null,
        "保有区分の選択欄がありません。");
      assert(form.querySelector('[name="saleDate"]') !== null,
        "売却日の入力欄がありません。");
      assert(form.querySelector('[name="realizedPnl"]') !== null,
        "確定損益の入力欄がありません。");
      assert(form.querySelector('[name="source"]') !== null,
        "情報源の選択欄がありません。");
      assert(form.querySelector('[name="proceeds"]') !== null,
        "売却金額の入力欄がありません。");
      assert(form.querySelector('[name="memo"]') !== null,
        "メモ欄がありません。");
    });
  });

  runTest("S13e：商品別選択時だけ商品入力欄を表示",() => {
    const account = makeTestAccount();
    const data = makeTestData(account);
    data.holdings = [];
    data.snapshots = [];

    withSaleCheckTestData(data,() => {
      const section = renderSaleCheckSection(account);
      section.querySelector('[data-action="salecheck-manual"]').click();

      const form = section.querySelector(".salecheck-manual-form");
      const level = form.querySelector('[name="level"]');
      const productField = form.querySelector(
        '[name="productName"]'
      ).closest(".field");
      const wrapperField = form.querySelector(
        '[name="wrapper"]'
      ).closest(".field");

      assert(productField.classList.contains("hidden"),
        "口座全体の初期状態で商品名欄が表示されています。");
      assert(wrapperField.classList.contains("hidden"),
        "口座全体の初期状態で保有区分欄が表示されています。");

      level.value = "商品別";
      level.dispatchEvent(new Event("change",{bubbles:true}));

      assert(!productField.classList.contains("hidden"),
        "商品別選択後に商品名欄が表示されていません。");
      assert(!wrapperField.classList.contains("hidden"),
        "商品別選択後に保有区分欄が表示されていません。");

      level.value = "口座全体";
      level.dispatchEvent(new Event("change",{bubbles:true}));

      assert(productField.classList.contains("hidden"),
        "口座全体に戻した後、商品名欄が非表示になっていません。");
      assert(wrapperField.classList.contains("hidden"),
        "口座全体に戻した後、保有区分欄が非表示になっていません。");
    });
  });

  runTest("S13e：未確認候補バッジの件数",() => {
    const account = makeTestAccount();
    const data = makeTestData(account);

    withSaleCheckTestData(data,() => {
      const badge = renderSaleCheckBadge(account);

      assert(badge !== null,
        "未確認候補があるのにバッジが表示されていません。");
      assert(badge.textContent.includes("売却・利確候補 2件"),
        "未確認候補の件数表示が正しくありません。");
    });
  });

  runTest("S13e：株式口座以外では確認欄を表示しない",() => {
    const account = makeTestAccount();
    account.category = "bank";
    account.type = "bank";
    const data = makeTestData(account);

    withSaleCheckTestData(data,() => {
      assert(renderSaleCheckSection(account) === null,
        "株式口座以外に確認欄が生成されています。");
      assert(renderSaleCheckBadge(account) === null,
        "株式口座以外に候補バッジが生成されています。");
    });
  });
}
