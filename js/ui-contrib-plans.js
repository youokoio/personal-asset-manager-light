"use strict";

/* ---------- 積立予定の追記保存 ---------- */

function saveContributionPlanFromUi(
  accountId,
  candidate,
  sourcePlanId = null,
  storage = localStorage
) {
  const now = new Date().toISOString();
  const sourcePlan = sourcePlanId
    ? appData.contributionPlans.find(item => item.id === sourcePlanId)
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

  const duplicate = appData.contributionPlans.some(item =>
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

  const nextPlan = {
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
      data.contributionPlans.unshift(nextPlan);
    },
    storage
  );

  appData = nextData;
  showMessage("積立予定を追加しました。過去の予定は保持されています。");
  render();
}

/* ---------- 積立予定フォーム ---------- */

function renderContributionPlanForm(account,plan = null,storage = localStorage) {
  const section = el("section","card");
  section.appendChild(el(
    "h3",
    "",
    plan
      ? "積立予定の変更（履歴を残す）"
      : "積立予定の登録"
  ));

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
    plan ? "変更を登録（履歴を残す）" : "予定を登録",
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
