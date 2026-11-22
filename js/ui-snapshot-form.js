"use strict";

/* ---------- 入力フォーム補助 ---------- */

function getSnapshotInputValue(snapshot,field) {
  if (!snapshot) return null;

  if (field === "effectivePrincipal") {
    if (snapshot.effectivePrincipal !== null &&
        snapshot.effectivePrincipal !== undefined) {
      return snapshot.effectivePrincipal;
    }
    return snapshot.principal ?? null;
  }

  return snapshot[field] ?? null;
}

function getPreviousValueLabel(targetDate,value,isText = false) {
  const dateLabel = targetDate
    ? targetDate.slice(5).replace("-","/")
    : "";

  const displayValue = isText
    ? String(value)
    : formatInputNumber(value);

  return `前回（${dateLabel}）：${displayValue}`;
}

function updateSnapshotPreviousValues(form,account) {
  const dateInput = form.elements.namedItem("asOfDate");
  const targetDate = dateInput ? dateInput.value : "";
  const previous = getPreviousSnapshotForInput(
    appData,
    account.id,
    targetDate,
    editingSnapshotId
  );

  form.querySelectorAll("[data-previous-field]").forEach(wrapper => {
    const field = wrapper.dataset.previousField;
    const hint = wrapper.querySelector(".previous-value-text");
    const apply = wrapper.querySelector(".previous-value-apply");

    const value = previous
      ? getSnapshotInputValue(previous,field)
      : null;

    const hasValue = value !== null && value !== undefined &&
      value !== "";

    wrapper.classList.toggle("has-previous-value",hasValue);

    if (!hasValue) {
      hint.textContent = "";
      hint.classList.add("hidden");
      apply.classList.add("hidden");
      apply.disabled = true;
      delete wrapper.dataset.previousValue;
      delete wrapper.dataset.hasPreviousValue;
      return;
    }

    hint.textContent = getPreviousValueLabel(
      previous.asOfDate,
      value,
      Boolean(wrapper.dataset.textValue)
    );
    hint.classList.remove("hidden");
    apply.classList.remove("hidden");
    apply.disabled = false;

    wrapper.dataset.previousValue = String(value);
    wrapper.dataset.hasPreviousValue = "true";
  });

  const dateWeekday = form.querySelector(".snapshot-date-weekday");
  if (dateWeekday) {
    dateWeekday.textContent = targetDate
      ? formatDateWithWeekday(targetDate).slice(10)
      : "";
  }
}

function appendSnapshotInputField(
  form,
  account,
  label,
  field,
  value,
  options = {}
) {
  const wrapper = options.textarea
    ? makeField(label,field,value,{textarea:true})
    : makeNumericField(label,field,value,{
        required:Boolean(options.required),
        placeholder:options.placeholder
      });

  wrapper.dataset.previousField = field;
  if (options.textarea) wrapper.dataset.textValue = "true";

  const hintRow = el("div","previous-value-row");
  const hint = el("span","previous-value-text hidden");
  const apply = makeButton(
    "反映",
    "apply-previous-value",
    "secondary small previous-value-apply hidden"
  );
  apply.disabled = true;

  apply.addEventListener("click",() => {
    if (wrapper.dataset.hasPreviousValue !== "true") return;

    const input = wrapper.querySelector("input,textarea");
    if (!input) return;

    input.value = wrapper.dataset.previousValue;
    input.dispatchEvent(new Event("input",{bubbles:true}));
    input.dispatchEvent(new Event("change",{bubbles:true}));
  });

  hintRow.append(hint,apply);
  wrapper.appendChild(hintRow);
  form.appendChild(wrapper);
}

function updateFxDailyPnlHint(form,account) {
  const dateInput = form.elements.namedItem("asOfDate");
  const dailyInput = form.elements.namedItem("realizedPnlDaily");
  const hint = form.querySelector(".fx-settled-pnl-hint");
  const apply = form.querySelector('[data-action="apply-settled-pnl"]');
  if (!dateInput || !dailyInput || !hint || !apply) return;
  const result = getFxSettledPnlForDate(appData,account.id,dateInput.value);
  if (!result) {
    hint.textContent = "";
    hint.classList.add("hidden");
    apply.classList.add("hidden");
    apply.disabled = true;
    delete apply.dataset.value;
    return;
  }
  hint.textContent = "同日の決済建玉合計：" + formatSignedYen(result.value) +
    "（" + result.count + "件）";
  hint.classList.remove("hidden");
  apply.classList.remove("hidden");
  apply.disabled = false;
  apply.dataset.value = String(result.value);
}
function appendFxDailyPnlInputField(form,account,value) {
  const wrapper = makeNumericField("その日の確定損益（円・任意）","realizedPnlDaily",value,{});
  const hintRow = el("div","previous-value-row");
  const hint = el("span","previous-value-text fx-settled-pnl-hint hidden");
  const apply = makeButton("反映","apply-settled-pnl","secondary small");
  apply.dataset.action = "apply-settled-pnl";
  apply.disabled = true;
  apply.classList.add("hidden");
  apply.addEventListener("click",() => {
    if (apply.dataset.value === undefined) return;
    const input = form.elements.namedItem("realizedPnlDaily");
    if (!input) return;
    input.value = apply.dataset.value;
    input.dispatchEvent(new Event("input",{bubbles:true}));
    input.dispatchEvent(new Event("change",{bubbles:true}));
  });
  hintRow.append(hint,apply);
  wrapper.appendChild(hintRow);
  form.appendChild(wrapper);
  updateFxDailyPnlHint(form,account);
}
function appendFxRealizedWarnings(container,realized) {
  if (!realized || !Array.isArray(realized.warnings) || realized.warnings.length === 0) return;
  for (const warning of realized.warnings) {
    container.appendChild(el("div","help",
      "確定損益の差異：" + formatDateWithWeekday(warning.date) +
      " ／ 日次 " + formatSignedYen(warning.dailyPnl) +
      " ／ 決済建玉合計 " + formatSignedYen(warning.settledPnl) +
      " ／ 差 " + formatSignedYen(warning.difference)
    ));
  }
}

function getSnapshotFieldLabel(account,field,fallback) {
  return getAccountFieldLabel(account,field,fallback);
}

function setupSnapshotAutoCalculation(form,account) {
  let targetField = null;
  let sourceFields = [];

  if (account.autoCalc === "principal") {
    targetField = "effectivePrincipal";
    sourceFields = ["value","pnl"];
  } else if (account.autoCalc === "swap") {
    targetField = "swapTotal";
    sourceFields = ["value","effectivePrincipal","pnl"];
  } else {
    return;
  }

  const allowedValues = getAllowedAutoCalcValues(account);
  if (!allowedValues.includes(account.autoCalc)) return;

  const target = form.elements.namedItem(targetField);
  const status = Array.from(
    form.querySelectorAll(".auto-calc-status")
  ).find(item => item.dataset.target === targetField);
  if (!target || !status) return;

  let manualOverride = false;
  let hasAutoCalculated = false;

  const update = () => {
    if (manualOverride) return;

    const values = {};
    for (const field of sourceFields) {
      const input = form.elements.namedItem(field);
      values[field] = input ? toNumberOrNull(input.value) : null;
    }

    const calculated = calculateAutoCalcValue(account,values);
    if (calculated === null) {
      if (hasAutoCalculated) {
        target.value = "";
        hasAutoCalculated = false;
      }
      status.classList.add("hidden");
      return;
    }

    target.value = String(calculated);
    hasAutoCalculated = true;
    status.classList.remove("hidden");
  };

  target.addEventListener("input",() => {
    manualOverride = true;
    status.classList.add("hidden");
  });

  for (const field of sourceFields) {
    const input = form.elements.namedItem(field);
    if (input) {
      input.addEventListener("input",update);
      input.addEventListener("change",update);
    }
  }

  if (target.value.trim() === "") update();
}

function renderSnapshotForm(account) {
  const existing = editingSnapshotId
    ? appData.snapshots.find(s => s.id === editingSnapshotId)
    : null;

  const category = getCategory(account);
  const isBank = category === "bank";
  const isFx = category === "fx";

  const form = document.createElement("form");
  form.id = "snapshot-form";
  form.appendChild(el("h3","",existing ? "履歴を編集" : "評価額を追加"));

  const defaultDate = existing
    ? existing.asOfDate
    : localDateString();

  const dateField = makeField("対象日","asOfDate",defaultDate,{
    type:"date",
    required:true
  });
  dateField.classList.add("snapshot-date-field");
  const dateInput = dateField.querySelector("input");
  const dateControl = el("div","snapshot-date-control");
  const dateWeekday = el(
    "span",
    "snapshot-date-weekday",
    formatDateWithWeekday(defaultDate).slice(10)
  );
  dateControl.append(dateInput,dateWeekday);
  dateField.appendChild(dateControl);
  form.appendChild(dateField);

  if (isBank) {
    appendSnapshotInputField(
      form,
      account,
      "口座残高（円）",
      "value",
      existing ? existing.value : "",
      {required:true}
    );
  } else {
    appendSnapshotInputField(
      form,
      account,
      getSnapshotFieldLabel(account,"value","総資産") + "（円）",
      "value",
      existing ? existing.value : "",
      {required:true}
    );

    appendSnapshotInputField(
      form,
      account,
      getSnapshotFieldLabel(account,"effectivePrincipal","有効元本") + "（円）",
      "effectivePrincipal",
      existing
        ? getSnapshotInputValue(existing,"effectivePrincipal")
        : "",
      {}
    );

    appendSnapshotInputField(
      form,
      account,
      getSnapshotFieldLabel(account,"pnl","評価損益") + "（円）",
      "pnl",
      existing ? existing.pnl : "",
      {}
    );

    if (isFx) {
      appendSnapshotInputField(
        form,
        account,
        getSnapshotFieldLabel(account,"swapTotal","累計スワップ") + "（円）",
        "swapTotal",
        existing ? existing.swapTotal : "",
        {}
      );

      appendFxDailyPnlInputField(
        form,
        account,
        existing ? existing.realizedPnlDaily ?? "" : ""
      );

      appendSnapshotInputField(
        form,
        account,
        "累積確定損益 基準値（初回・補正用）（円・任意）",
        "realizedPnlTotal",
        existing ? existing.realizedPnlTotal : "",
        {}
      );

      appendSnapshotInputField(
        form,
        account,
        "必要証拠金（円・任意）",
        "requiredMargin",
        existing ? existing.requiredMargin : "",
        {}
      );

      const swapStatus = el("div","auto-calc-status hidden","自動計算");
      swapStatus.dataset.target = "swapTotal";
      form.appendChild(swapStatus);
    } else {
      appendSnapshotInputField(
        form,
        account,
        "累積確定損益（円）",
        "realizedPnlTotal",
        existing ? existing.realizedPnlTotal : "",
        {}
      );

      appendSnapshotInputField(
        form,
        account,
        "現金（円・任意）",
        "cash",
        existing ? existing.cash : "",
        {}
      );

      const principalStatus = el(
        "div",
        "auto-calc-status hidden",
        "自動計算"
      );
      principalStatus.dataset.target = "effectivePrincipal";
      form.appendChild(principalStatus);
    }
  }

  appendSnapshotInputField(
    form,
    account,
    "メモ（任意）",
    "memo",
    existing ? existing.memo || "" : "",
    {textarea:true}
  );

  form.appendChild(el(
    "div",
    "help",
    "口座番号・契約番号・暗証番号・ログイン情報は入力しないでください。"
  ));

  const actions = el("div","actions");
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = existing ? "変更を保存" : "追加する";
  actions.appendChild(save);

  if (existing) {
    actions.appendChild(makeButton("編集を中止","cancel-edit","secondary"));
  }
  form.appendChild(actions);

  dateInput.addEventListener("change",() => {
    updateSnapshotPreviousValues(form,account);
    if (isFx) updateFxDailyPnlHint(form,account);
  });

  form.addEventListener("submit",handleSnapshotSubmit);

  updateSnapshotPreviousValues(form,account);
  setupSnapshotAutoCalculation(form,account);

  return form;
}
