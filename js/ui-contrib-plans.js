"use strict";

/* ---------- 積立予定の保存・削除 ---------- */

function saveContributionPlanFromUi(accountId,candidate,planId = null,storage = localStorage) {
  const now = new Date().toISOString();
  const nextPlan = {
    ...candidate,
    id:planId || createId(),
    accountId,
    createdAt:planId
      ? appData.contributionPlans.find(item => item.id === planId)?.createdAt || now
      : now,
    updatedAt:planId ? now : null
  };

  if (planId &&
      !appData.contributionPlans.some(item => item.id === planId)) {
    throw new Error("訂正する積立予定が見つかりません。");
  }

  const nextData = saveStockTrackingData(
    "contribution",
    data => {
      data.contributionPlans = data.contributionPlans.filter(item =>
        item.id !== planId
      );
      data.contributionPlans.push(nextPlan);
    },
    storage
  );

  appData = nextData;
  showMessage("積立予定を保存しました。");
  render();
}

function deleteContributionPlanFromUi(planId,storage = localStorage) {
  if (!window.confirm("この積立予定を削除しますか？")) return;

  const nextData = saveStockTrackingData(
    "contribution",
    data => {
      data.contributionPlans = data.contributionPlans.filter(item =>
        item.id !== planId
      );
    },
    storage
  );

  appData = nextData;
  showMessage("積立予定を削除しました。");
  render();
}

/* ---------- 積立予定フォーム ---------- */

function renderContributionPlanForm(account,plan = null,storage = localStorage) {
  const section = el("section","card");
  section.appendChild(el(
    "h3",
    "",
    plan ? "積立予定の訂正" : "積立予定の登録"
  ));

  const form = el("form","contribution-form");

  form.appendChild(makeField(
    "商品名（口座全体の場合は空欄）",
    "productName",
    plan ? plan.productName : "",
    {type:"text"}
  ));

  form.appendChild(makeSelectField(
    "保有区分",
    "wrapper",
    HOLDING_WRAPPERS.map(value => ({
      value,
      label:value
    })),
    plan ? plan.wrapper : "NISAつみたて"
  ));

  form.appendChild(makeContributionInput(
    "適用開始月",
    "effectiveFrom",
    plan ? plan.effectiveFrom : localDateString().slice(0,7),
    {type:"month",required:true}
  ));

  form.appendChild(makeSelectField(
    "予定状態",
    "status",
    [
      {value:"積立中",label:"積立中"},
      {value:"停止",label:"停止"}
    ],
    plan ? plan.status : "積立中"
  ));

  form.appendChild(makeNumericField(
    "予定現金額（円）",
    "plannedCash",
    plan ? plan.plannedCash : ""
  ));

  form.appendChild(makeNumericField(
    "予定ポイント額（円）",
    "plannedPoint",
    plan ? plan.plannedPoint : "0"
  ));

  form.appendChild(makeField(
    "メモ",
    "memo",
    plan ? plan.memo : "",
    {type:"text"}
  ));

  const actions = el("div","form-actions");
  const save = makeButton(
    plan ? "予定を訂正" : "予定を登録",
    "contribution-plan-save",
    "primary"
  );
  save.type = "submit";
  actions.appendChild(save);

  const cancel = makeButton(
    "キャンセル",
    "contribution-cancel",
    "secondary"
  );
  cancel.addEventListener("click",() => render());
  actions.appendChild(cancel);

  if (plan) {
    const remove = makeButton(
      "この予定を削除",
      "contribution-plan-delete",
      "danger"
    );
    remove.addEventListener("click",() => {
      deleteContributionPlanFromUi(plan.id,storage);
    });
    actions.appendChild(remove);
  }

  form.appendChild(actions);

  form.addEventListener("submit",event => {
    event.preventDefault();

    try {
      const name = getContributionFormValue(form,"productName") || null;
      const selected = getContributionFormValue(form,"wrapper");
      const effectiveFrom = getContributionFormValue(form,"effectiveFrom");
      const status = getContributionFormValue(form,"status");

      if (!isValidContributionMonth(effectiveFrom)) {
        throw new Error("適用開始月を正しく入力してください。");
      }

      const candidate = {
        productName:name,
        wrapper:name ? selected : null,
        effectiveFrom,
        status,
        plannedCash:status === "積立中"
          ? getContributionFormNumber(form,"plannedCash")
          : null,
        plannedPoint:getContributionFormNumber(form,"plannedPoint"),
        memo:getContributionFormValue(form,"memo")
      };

      saveContributionPlanFromUi(
        account.id,
        candidate,
        plan ? plan.id : null,
        storage
      );
    } catch (error) {
      showMessage(error.message || "積立予定を保存できませんでした。",true);
      render();
    }
  });

  section.appendChild(form);
  return section;
}
