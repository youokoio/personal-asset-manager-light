"use strict";

/* ---------- FX建玉の入力 ---------- */

function makeFxSelectField(label,name,value,options,required = false) {
  const field = makeField(label,name,value || "",{type:"text"});
  const oldInput = field.querySelector("input");
  const select = document.createElement("select");
  select.name = name;
  select.required = required;
  if (oldInput) {
    select.className = oldInput.className;
    oldInput.replaceWith(select);
  } else {
    field.appendChild(select);
  }

  if (!value) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "選択してください";
    select.appendChild(placeholder);
  }

  for (const optionValue of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue;
    select.appendChild(option);
  }

  select.value = value || "";
  return field;
}

function getFxPreviousPosition(data,accountId,pair,side,excludeId = null) {
  return data.fxPositions
    .filter(position =>
      position.accountId === accountId &&
      position.pair === pair &&
      position.side === side &&
      position.status === "保有中" &&
      position.id !== excludeId
    )
    .sort((a,b) =>
      String(b.openDate).localeCompare(String(a.openDate))
    )[0] || null;
}

function getFxAverageOpenRate(data,accountId,pair,side) {
  const positions = getFxOpenPositions(data,accountId).filter(position =>
    position.pair === pair &&
    position.side === side
  );

  const quantity = positions.reduce(
    (sum,position) => sum + position.quantity,
    0
  );

  if (quantity <= 0) return "";

  const total = positions.reduce(
    (sum,position) =>
      sum + position.quantity * position.openRate,
    0
  );

  return String(total / quantity);
}

function renderFxPositionForm(accountId,pair,side,position = null) {
  const account = appData.accounts.find(item =>
    item.id === accountId && item.type === "fx"
  );

  if (!account) return null;

  const isEdit = position !== null;
  const form = document.createElement("form");
  form.className = "fx-position-form";

  form.appendChild(heading(
    isEdit ? "建玉を編集" : "建玉を追加"
  ));

  const selectedPair = position ? position.pair : pair;
  const pairOptions = buildPairOptions(appData,accountId);
  const pairField = makeFxSelectField(
    "通貨ペア",
    "pairChoice",
    selectedPair || "",
    pairOptions,
    true
  );
  form.appendChild(pairField);

  const customPairField = makeField(
    "その他の通貨ペア",
    "customPair",
    "",
    {
      type:"text",
      placeholder:"例：USD/JPY"
    }
  );
  const customPairInput = customPairField.querySelector("input");
  if (customPairInput) customPairInput.autocomplete = "off";
  customPairField.hidden = false;
  form.appendChild(customPairField);

  const pairSelect = pairField.querySelector("select");
  const customPairInputElement = customPairField.querySelector("input");

  function updateCustomPairVisibility() {
    const showCustom = pairSelect &&
      pairSelect.value === FX_OTHER_PAIR_OPTION;
    customPairField.hidden = !showCustom;
    if (customPairInputElement) {
      customPairInputElement.required = Boolean(showCustom);
    }
  }

  if (pairSelect) {
    pairSelect.addEventListener("change",updateCustomPairVisibility);
  }
  updateCustomPairVisibility();

  const sideField = makeFxSelectField(
    "売買方向",
    "side",
    position ? position.side : side,
    ["買","売"],
    true
  );
  form.appendChild(sideField);

  const dateField = makeField(
    "約定日",
    "openDate",
    position
      ? String(position.openDate).slice(0,10)
      : "",
    {type:"date",required:true}
  );
  form.appendChild(dateField);

  const asOfDateField = makeField(
    "データ確認日",
    "asOfDate",
    position
      ? position.asOfDate || ""
      : localDateString(),
    {type:"date"}
  );
  form.appendChild(asOfDateField);

  const previous = getFxPreviousPosition(
    appData,
    accountId,
    position ? position.pair : pair,
    position ? position.side : side,
    position ? position.id : null
  );

  const quantityParts = getFxQuantityInputParts(
    position
      ? position.quantity
      : previous
        ? previous.quantity
        : 0
  );

  const quantityField = makeNumericField(
    "数量",
    "quantity",
    quantityParts.value,
    {required:true}
  );
  form.appendChild(quantityField);

  const quantityUnitField = makeFxSelectField(
    "数量単位",
    "quantityUnit",
    quantityParts.unit,
    ["通貨","千通貨","万通貨"],
    true
  );
  form.appendChild(quantityUnitField);

  const rateField = makeNumericField(
    "約定レート",
    "openRate",
    position
      ? String(position.openRate)
      : getFxAverageOpenRate(
          appData,
          accountId,
          pair,
          side
        ),
    {required:true}
  );
  form.appendChild(rateField);

  const swapField = makeNumericField(
    "累計スワップ（円）",
    "swap",
    position
      ? position.swap === null
        ? ""
        : String(position.swap)
      : "0",
    {placeholder:"空欄は未入力"}
  );
  form.appendChild(swapField);

  const actions = el("div","actions");
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = isEdit ? "変更を保存" : "建玉を追加";
  actions.appendChild(save);

  const cancel = makeButton(
    "キャンセル",
    "cancel-fx-position",
    "secondary"
  );
  cancel.addEventListener("click",() => {
    renderFxPositionManagement(accountId,pair,side);
  });
  actions.appendChild(cancel);

  form.appendChild(actions);

  form.addEventListener("submit",event => {
    event.preventDefault();

    const values = new FormData(form);
    const rawSwap = String(values.get("swap") || "").trim();
    const rawQuantity = String(values.get("quantity") || "").trim();
    const rawRate = String(values.get("openRate") || "").trim();
    const quantityResult = convertFxQuantityInput(
      rawQuantity,
      String(values.get("quantityUnit") || "")
    );
    const pairChoice = String(values.get("pairChoice") || "").trim();
    const selectedCustomPair = String(
      values.get("customPair") || ""
    ).trim();
    const finalPair = pairChoice === FX_OTHER_PAIR_OPTION
      ? selectedCustomPair
      : pairChoice;
    const rawAsOfDate = String(values.get("asOfDate") || "").trim();

    if (quantityResult.error) {
      showMessage(quantityResult.error,true);
      return;
    }

    const nextPosition = {
      id:position ? position.id : createId(),
      accountId,
      pair:finalPair,
      side:String(values.get("side") || "").trim(),
      openDate:String(values.get("openDate") || "").trim(),
      asOfDate:rawAsOfDate === "" ? null : rawAsOfDate,
      quantity:quantityResult.quantity,
      openRate:toNumberOrNull(rawRate),
      swap:rawSwap === "" ? null : toNumberOrNull(rawSwap),
      status:"保有中",
      closeDate:null,
      closeRate:null,
      realizedPnl:null,
      recordedAt:position
        ? position.recordedAt
        : new Date().toISOString(),
      createdAt:position
        ? position.createdAt
        : new Date().toISOString(),
      updatedAt:new Date().toISOString()
    };

    const validationError = validateFxPositionInput(nextPosition);

    if (validationError) {
      showMessage(validationError,true);
      return;
    }

    const nextData = JSON.parse(JSON.stringify(appData));
    const oldPosition = isEdit
      ? nextData.fxPositions.find(item => item.id === position.id)
      : null;

    if (isEdit && !oldPosition) {
      showMessage("編集対象の建玉が見つかりません。",true);
      return;
    }

    if (isEdit) {
      Object.assign(oldPosition,nextPosition);

      if (oldPosition.pair !== position.pair ||
          oldPosition.side !== position.side) {
        if (position.swap !== null && position.swap !== 0) {
          const oldAdjustment = createFxSwapAdjustment(
            position,
            "移動",
            -position.swap
          );
          const newAdjustment = createFxSwapAdjustment(
            nextPosition,
            "移動",
            position.swap
          );
          nextData.fxSwapLedger.push(oldAdjustment,newAdjustment);
        }
      }
    } else {
      nextData.fxPositions.push(nextPosition);

      if (nextPosition.swap !== null && nextPosition.swap !== 0) {
        nextData.fxSwapLedger.push(
          createFxSwapAdjustment(
            nextPosition,
            "追加",
            nextPosition.swap
          )
        );
      }

      const rateExists = nextData.fxRates.some(rate =>
        rate.accountId === accountId &&
        rate.pair === nextPosition.pair
      );

      if (!rateExists) {
        const now = new Date().toISOString();
        nextData.fxRates.push({
          id:createId(),
          accountId,
          pair:nextPosition.pair,
          rate:null,
          asOfDate:null,
          createdAt:now,
          updatedAt:now
        });
      }
    }

    try {
      saveData(nextData);
      appData = nextData;
      showMessage(isEdit ? "建玉を更新しました。" : "建玉を追加しました。");
      renderFxPositionManagement(accountId,nextPosition.pair,nextPosition.side);
    } catch (error) {
      showMessage(
        error.message || "建玉を保存できませんでした。",
        true
      );
    }
  });

  return form;
}