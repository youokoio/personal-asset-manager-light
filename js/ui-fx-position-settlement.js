"use strict";

/* ---------- FX建玉の削除 ---------- */

function deleteFxPosition(positionId) {
  const position = appData.fxPositions.find(item =>
    item.id === positionId
  );

  if (!position || position.status !== "保有中") {
    showMessage("保有中の建玉だけ削除できます。",true);
    return;
  }

  if (!window.confirm(
    position.pair + " " +
    position.side + " " +
    formatInputNumber(position.quantity) +
    "通貨の建玉を削除しますか？"
  )) {
    return;
  }

  const nextData = JSON.parse(JSON.stringify(appData));
  const target = nextData.fxPositions.find(item =>
    item.id === positionId
  );

  if (target.swap !== null && target.swap !== 0) {
    nextData.fxSwapLedger.push(
      createFxSwapAdjustment(
        target,
        "削除",
        -target.swap
      )
    );
  }

  nextData.fxPositions = nextData.fxPositions.filter(item =>
    item.id !== positionId
  );

  try {
    saveData(nextData);
    appData = nextData;
    showMessage("建玉を削除しました。");
    renderFxPositionManagement(
      position.accountId,
      position.pair,
      position.side
    );
  } catch (error) {
    showMessage(
      error.message || "建玉を削除できませんでした。",
      true
    );
  }
}

/* ---------- FX建玉一覧 ---------- */

function renderFxPositionRow(position) {
  const card = el("section","card");

  card.appendChild(el(
    "div",
    "account-name",
    position.pair + " ／ " + position.side
  ));

  appendAccountMetric(
    card,
    "約定日時",
    position.openDate.replace("T"," ")
  );

  appendAccountMetric(
    card,
    "数量",
    formatFxQuantity(position.quantity)
  );

  appendAccountMetric(
    card,
    "データ確認日",
    position.asOfDate
      ? formatDateWithWeekday(position.asOfDate)
      : "未入力"
  );

  appendAccountMetric(
    card,
    "約定レート",
    formatFxRateValue(position.openRate)
  );

  appendAccountMetric(
    card,
    "累計スワップ",
    position.swap === null
      ? "未入力"
      : formatSignedYen(position.swap)
  );

  const actions = el("div","actions");

  const edit = makeButton(
    "編集",
    "edit-fx-position",
    "secondary small"
  );
  edit.addEventListener("click",() => {
    app.appendChild(renderFxPositionForm(
      position.accountId,
      position.pair,
      position.side,
      position
    ));
  });
  actions.appendChild(edit);

  const remove = makeButton(
    "削除",
    "delete-fx-position",
    "danger small"
  );
  remove.addEventListener("click",() => {
    deleteFxPosition(position.id);
  });
  actions.appendChild(remove);

  card.appendChild(actions);

  return card;
}

function renderFxSettlementForm(accountId,pair,side,positions) {
  const form = document.createElement("form");
  form.className = "fx-settlement-form";
  form.appendChild(heading("建玉の決済"));

  const dateField = makeField(
    "決済日",
    "closeDate",
    localDateString(),
    {type:"date",required:true}
  );
  form.appendChild(dateField);

  form.appendChild(el(
    "div",
    "help",
    "決済する建玉を選択し、決済数量と確定損益を入力してください。決済数量は通貨数です。"
  ));

  const selectedInputs = [];

  for (const position of positions) {
    const row = el("section","fx-settlement-position");
    const checkLabel = document.createElement("label");
    checkLabel.className = "fx-settlement-select";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.name = "settle_" + position.id;
    check.value = position.id;

    const title = document.createElement("span");
    title.textContent =
      position.pair + " ／ " + position.side + " ／ " +
      formatFxQuantity(position.quantity) + " ／ " +
      formatDateWithWeekday(String(position.openDate).slice(0,10));

    checkLabel.append(check,title);
    row.appendChild(checkLabel);

    const quantityField = makeNumericField(
      "決済数量（通貨）",
      "quantity_" + position.id,
      String(position.quantity),
      {placeholder:"保有数量以内の整数"}
    );
    const realizedField = makeNumericField(
      "確定損益（円）",
      "realizedPnl_" + position.id,
      "",
      {placeholder:"必須"}
    );
    const closeRateField = makeNumericField(
      "決済レート（任意）",
      "closeRate_" + position.id,
      "",
      {placeholder:"未入力可"}
    );

    row.append(
      quantityField,
      realizedField,
      closeRateField
    );
    form.appendChild(row);

    const quantityInput = quantityField.querySelector("input");
    const realizedInput = realizedField.querySelector("input");
    const closeRateInput = closeRateField.querySelector("input");

    for (const input of [quantityInput,realizedInput,closeRateInput]) {
      if (input) input.disabled = true;
    }

    check.addEventListener("change",() => {
      if (quantityInput) {
        quantityInput.disabled = !check.checked;
        quantityInput.required = check.checked;
      }
      if (realizedInput) {
        realizedInput.disabled = !check.checked;
        realizedInput.required = check.checked;
      }
      if (closeRateInput) {
        closeRateInput.disabled = !check.checked;
      }
    });

    selectedInputs.push({
      check,
      quantityInput,
      realizedInput,
      closeRateInput
    });
  }

  const actions = el("div","actions");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "選択した建玉を決済";
  actions.appendChild(submit);
  form.appendChild(actions);

  form.addEventListener("submit",event => {
    event.preventDefault();

    const closeDate = String(
      new FormData(form).get("closeDate") || ""
    ).trim();

    if (!isValidFxPositionAsOfDate(closeDate)) {
      showMessage("決済日を正しく入力してください。",true);
      return;
    }

    const settlements = [];

    for (const item of selectedInputs) {
      if (!item.check.checked) continue;

      const quantity = toNumberOrNull(
        item.quantityInput ? item.quantityInput.value : ""
      );
      const realizedPnl = toNumberOrNull(
        item.realizedInput ? item.realizedInput.value : ""
      );
      const rawCloseRate = String(
        item.closeRateInput ? item.closeRateInput.value : ""
      ).trim();
      const closeRate = rawCloseRate === ""
        ? null
        : toNumberOrNull(rawCloseRate);

      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        showMessage("決済数量は正の整数で入力してください。",true);
        return;
      }

      if (realizedPnl === null) {
        showMessage("確定損益を数値で入力してください。",true);
        return;
      }

      if (rawCloseRate !== "" &&
          (closeRate === null || closeRate <= 0)) {
        showMessage("決済レートは空欄、または0より大きい数値にしてください。",true);
        return;
      }

      settlements.push({
        positionId:item.check.value,
        quantity,
        realizedPnl,
        closeRate
      });
    }

    if (!settlements.length) {
      showMessage("決済する建玉を1件以上選択してください。",true);
      return;
    }

    try {
      const nextData = buildFxSettlementData(
        appData,
        settlements,
        closeDate
      );
      saveData(nextData);
      appData = nextData;
      showMessage(settlements.length + "件の建玉を決済しました。");
      renderFxPositionManagement(accountId,pair,side);
    } catch (error) {
      showMessage(
        error.message || "建玉の決済に失敗しました。",
        true
      );
    }
  });

  return form;
}