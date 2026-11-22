"use strict";

function registerContributionRenderTests(context) {
  const {assert,runTest,makeAccount} = context;

  function makeTestAccount() {
    return makeAccount(
      "contrib-render-1",
      "楽天証券",
      "securities",
      "stock"
    );
  }

  runTest("S13c③：積立予定の新規フォーム描画",() => {
    const account = makeTestAccount();
    const formSection = renderContributionPlanForm(account,null);

    const form = formSection.querySelector("form");
    assert(form !== null,"積立予定フォームが描画されていません。");

    assert(
      form.querySelector('[name="effectiveFrom"]') !== null,
      "適用開始月の入力欄がありません。"
    );
    assert(
      form.querySelector('[name="status"]') !== null,
      "予定状態の入力欄がありません。"
    );
    assert(
      form.querySelector('[name="plannedCash"]') !== null,
      "予定現金額の入力欄がありません。"
    );
    assert(
      form.querySelector('[name="plannedPoint"]') !== null,
      "予定ポイント額の入力欄がありません。"
    );
    assert(
      form.querySelector('[name="memo"]') !== null,
      "メモの入力欄がありません。"
    );

    const saveButton = form.querySelector(
      'button[type="submit"]'
    );
    assert(saveButton !== null,"登録ボタンがありません。");
    assert(
      saveButton.textContent === "予定を登録",
      "新規登録ボタンの表示が正しくありません。"
    );
    assert(
      form.querySelector('[data-action="contribution-plan-delete"]') === null,
      "新規登録フォームに削除操作が表示されています。"
    );
  });

  runTest("S13c③：商品別予定のwrapper表示",() => {
    const account = makeTestAccount();
    const formSection = renderContributionPlanForm(account,null);
    const form = formSection.querySelector("form");

    const productInput = form.querySelector(
      '[name="productName"]'
    );
    const wrapperSelect = form.querySelector(
      '[name="wrapper"]'
    );
    const wrapperField = wrapperSelect.closest(".field");

    assert(
      wrapperField.classList.contains("hidden"),
      "商品未入力時にwrapper欄が非表示になっていません。"
    );

    productInput.value = "テスト投信A";
    productInput.dispatchEvent(new Event("input",{bubbles:true}));

    assert(
      !wrapperField.classList.contains("hidden"),
      "商品入力後にwrapper欄が表示されていません。"
    );
    assert(
      wrapperSelect.value === "NISAつみたて",
      "商品入力後のwrapper初期値が正しくありません。"
    );

    productInput.value = "";
    productInput.dispatchEvent(new Event("input",{bubbles:true}));

    assert(
      wrapperField.classList.contains("hidden"),
      "商品名を消した後にwrapper欄が非表示になっていません。"
    );
    assert(
      wrapperSelect.value === "",
      "口座全体に戻した後のwrapper値が空欄ではありません。"
    );
  });

  runTest("S13c③：口座全体予定のwrapper非表示",() => {
    const account = makeTestAccount();
    const plan = {
      id:"plan-render-account",
      accountId:account.id,
      productName:null,
      wrapper:null,
      effectiveFrom:"2026-11",
      status:"積立中",
      plannedCash:30000,
      plannedPoint:1000,
      memo:"",
      createdAt:"2026-11-01T00:00:00.000Z",
      updatedAt:"2026-11-01T00:00:00.000Z"
    };

    const formSection = renderContributionPlanForm(account,plan);
    const form = formSection.querySelector("form");
    const wrapperSelect = form.querySelector('[name="wrapper"]');

    assert(
      wrapperSelect.closest(".field").classList.contains("hidden"),
      "口座全体の予定でwrapper欄が非表示になっていません。"
    );
    assert(
      wrapperSelect.value === "",
      "口座全体のwrapper値がnull相当の空欄ではありません。"
    );
  });

  runTest("S13c③：積立予定の訂正フォームと削除操作",() => {
    const account = makeTestAccount();
    const plan = {
      id:"plan-render-edit",
      accountId:account.id,
      productName:"テスト投信A",
      wrapper:"NISAつみたて",
      effectiveFrom:"2026-10",
      status:"積立中",
      plannedCash:30000,
      plannedPoint:500,
      memo:"変更前",
      createdAt:"2026-10-01T00:00:00.000Z",
      updatedAt:"2026-10-01T00:00:00.000Z"
    };

    const formSection = renderContributionPlanForm(account,plan);
    const form = formSection.querySelector("form");

    assert(
      formSection.querySelector("h3").textContent === "積立予定の訂正",
      "訂正フォームの見出しが正しくありません。"
    );
    assert(
      formSection.textContent.includes("誤登録の訂正用です。"),
      "訂正フォームに用途の説明がありません。"
    );

    const saveButton = form.querySelector(
      'button[type="submit"]'
    );
    assert(
      saveButton.textContent === "訂正を保存",
      "訂正ボタンの表示が正しくありません。"
    );

    assert(
      form.querySelector('[name="effectiveFrom"]').value === "2026-10",
      "既存の適用開始月がフォームに反映されていません。"
    );
    assert(
      form.querySelector('[name="memo"]').value === "変更前",
      "既存のメモがフォームに反映されていません。"
    );

    const deleteButton = form.querySelector(
      '[data-action="contribution-plan-delete"]'
    );
    assert(
      deleteButton !== null,
      "訂正フォームに削除操作がありません。"
    );
    assert(
      deleteButton.textContent === "この予定を削除",
      "削除ボタンの表示が正しくありません。"
    );
  });
}
