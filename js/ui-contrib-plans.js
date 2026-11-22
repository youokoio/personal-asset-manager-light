"use strict";

/* ---------- 積立予定の保存 ---------- */

function saveContributionPlanData(
  accountId,
  candidate,
  sourcePlanId = null,
  storage = localStorage,
  sourceData = appData
) {
  const now = new Date().toISOString();
  const sourcePlan = sourcePlanId
    ? sourceData.contributionPlans.find(item => item.id === sourcePlanId)
    : null;

  if (sourcePlanId &&
      (!sourcePlan || sourcePlan.accountId !== accountId)) {
    throw new Error("変更元の積立予定が見つかりません。");
  }

  const productName = candidate.productName === null
    ? null
    : String(candidate.productName || "").trim() || null;
  const wrapper = productName === null ? null : candidate.wrapper;

  if (productName !== null &&
      !HOLDING_WRAPPERS.includes(wrapper)) {
    throw new Error("商品に対応する保有区分を選択してください。");
  }

  if (!isValidContributionMonth(candidate.effectiveFrom)) {
    throw new Error("適用開始月を正しく入力してください。");
  }

  if (!["積立中","停止"].includes(candidate.status)) {
    throw new Error("予定状態を正しく選択してください。");
  }

  const duplicate = sourceData.contributionPlans.some(item =>
    item.id !== sourcePlanId &&
    item.accountId === accountId &&
    item.productName === productName &&
    item.wrapper === wrapper &&
    item.effectiveFrom === candidate.effectiveFrom
  );

  if (duplicate) {
    throw new Error(
      "同じ積立単位・適用開始月の予定が既にあります。別の月を指定してください。"
    );
  }

  const nextPlan = sourcePlan
    ? {
        ...sourcePlan,
        ...candidate,
        productName,
        wrapper,
        id:sourcePlan.id,
        accountId,
        createdAt:sourcePlan.createdAt,
        updatedAt:now
      }
    : {
        ...candidate,
        productName,
        wrapper,
        id:createId(),
        accountId,
        createdAt:now,
        updatedAt:now
      };

  const nextData = saveStockTrackingData(
    "contribution",
    data => {
      if (sourcePlanId) {
        const index = data.contributionPlans.findIndex(item =>
          item.id === sourcePlanId &&
          item.accountId === accountId
        );

        if (index < 0) {
          throw new Error("訂正対象の積立予定が保存データにありません。");
        }

        data.contributionPlans[index] = nextPlan;
      } else {
        data.contributionPlans.unshift(nextPlan);
      }
    },
    storage
  );

  return nextData;
}

function saveContributionPlanFromUi(
  accountId,
  candidate,
  sourcePlanId = null,
  storage = localStorage
) {
  const nextData = saveContributionPlanData(
    accountId,
    candidate,
    sourcePlanId,
    storage
  );

  appData = nextData;
  showMessage(
    sourcePlanId
      ? "積立予定を訂正しました。"
      : "積立予定を追加しました。過去の予定は保持されています。"
  );
  render();
}

/* ---------- 積立予定の削除 ---------- */

function deleteContributionPlanData(
  accountId,
  planId,
  storage = localStorage,
  sourceData = appData
) {
  const sourcePlan = sourceData.contributionPlans.find(item =>
    item.id === planId &&
    item.accountId === accountId
  );

  if (!sourcePlan) {
    throw new Error("削除する積立予定が見つかりません。");
  }

  const nextData = saveStockTrackingData(
    "contribution",
    data => {
      const index = data.contributionPlans.findIndex(item =>
        item.id === planId &&
        item.accountId === accountId
      );

      if (index < 0) {
        throw new Error("削除対象の積立予定が保存データにありません。");
      }

      data.contributionPlans.splice(index,1);
    },
    storage
  );

  return nextData;
}

function deleteContributionPlanFromUi(accountId,planId,storage = localStorage) {
  const nextData = deleteContributionPlanData(
    accountId,
    planId,
    storage
  );

  appData = nextData;
  showMessage("誤登録した積立予定を削除しました。");
  render();
}

/* ---------- 積立予定フォーム ---------- */

function renderContributionPlanForm(account,plan = null,storage = localStorage) {
  const section = el("section","card");
  section.appendChild(el(
    "h3",
    "",
    plan
      ? "積立予定の訂正"
      : "積立予定の登録"
  ));

  if (plan) {
    section.appendChild(el(
      "div",
      "help",
      "誤登録の訂正用です。将来の積立額変更は「積立予定を登録」から新しい適用開始月で追加してください。"
    ));
  }

  const form = el("form","contribution-form");
  const errorBox = el("div","error hidden");
  section.appendChild(errorBox);

  const productField = makeField(
    "商品名（口座全体の場合は空欄）",
    "productName",
    plan ? plan.productName : "",
    {type:"text"}
  );
  const productInput = productField.querySelector("input");
  form.appendChild(productField);

  const wrapperField = makeSelectField(
    "保有区分",
    "wrapper",
    [
      {value:"",label:"選択してください"},
      ...HOLDING_WRAPPERS.map(value => ({
        value,
        label:value
      }))
    ],
    plan && plan.wrapper ? plan.wrapper : ""
  );
  const wrapperSelect = wrapperField.querySelector("select");
  form.appendChild(wrapperField);

  function updateWrapperVisibility() {
    const hasProduct = productInput.value.trim() !== "";
    wrapperField.classList.toggle("hidden",!hasProduct);

    if (!hasProduct) {
      wrapperSelect.value = "";
    } else if (!wrapperSelect.value) {
      wrapperSelect.value = "NISAつみたて";
    }
  }

  productInput.addEventListener("input",updateWrapperVisibility);
  updateWrapperVisibility();

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
    plan ? "訂正を保存" : "予定を登録",
    "contribution-plan-save",
    "primary"
  );
  save.type = "submit";
  actions.appendChild(save);

  if (plan) {
    const remove = makeButton(
      "この予定を削除",
      "contribution-plan-delete",
      "secondary"
    );
    remove.addEventListener("click",() => {
      if (!window.confirm(
        "この積立予定の記録自体を削除しますか？\n" +
        "誤登録の取り消しに使用してください。\n" +
        "積立を停止する場合は、削除せず「停止」の予定を新規登録してください。"
      )) {
        return;
      }

      try {
        deleteContributionPlanFromUi(
          account.id,
          plan.id,
          storage
        );
      } catch (error) {
        errorBox.textContent =
          error.message || "積立予定を削除できませんでした。";
        errorBox.classList.remove("hidden");
      }
    });
    actions.appendChild(remove);
  }

  const cancel = makeButton(
    "キャンセル",
    "contribution-cancel",
    "secondary"
  );
  cancel.addEventListener("click",() => render());
  actions.appendChild(cancel);

  form.appendChild(actions);

  form.addEventListener("submit",event => {
    event.preventDefault();
    errorBox.textContent = "";
    errorBox.classList.add("hidden");

    try {
      const name = productInput.value.trim() || null;
      const selected = wrapperSelect.value;
      const effectiveFrom = getContributionFormValue(
        form,
        "effectiveFrom"
      );
      const status = getContributionFormValue(form,"status");

      if (!isValidContributionMonth(effectiveFrom)) {
        throw new Error("適用開始月を正しく入力してください。");
      }

      if (name !== null && !HOLDING_WRAPPERS.includes(selected)) {
        throw new Error("商品に対応する保有区分を選択してください。");
      }

      const candidate = {
        productName:name,
        wrapper:name === null ? null : selected,
        effectiveFrom,
        status,
        plannedCash:status === "積立中"
          ? getContributionFormNumber(form,"plannedCash")
          : null,
        plannedPoint:getContributionFormNumber(form,"plannedPoint"),
        memo:getContributionFormValue(form,"memo")
      };

      if (plan && !window.confirm(
        "この積立予定を訂正しますか？\n" +
        "誤登録の内容を、入力した内容に置き換えます。"
      )) {
        return;
      }

      saveContributionPlanFromUi(
        account.id,
        candidate,
        plan ? plan.id : null,
        storage
      );
    } catch (error) {
      errorBox.textContent =
        error.message || "積立予定を保存できませんでした。";
      errorBox.classList.remove("hidden");
    }
  });

  section.appendChild(form);
  return section;
}
