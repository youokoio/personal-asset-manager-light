"use strict";

/* ---------- 評価レート入力 ---------- */

function renderFxRateForm(account,rateRecord) {
  const form = document.createElement("form");
  form.className = "fx-rate-form";
  form.dataset.pair = rateRecord.pair;

  form.appendChild(el(
    "h4",
    "",
    rateRecord.pair
  ));

  const rateField = makeNumericField(
    "評価レート",
    "rate",
    getFxRateInputValue(rateRecord.rate),
    {placeholder:"未入力の場合は空欄"}
  );
  form.appendChild(rateField);

  const dateField = makeField(
    "対象日",
    "asOfDate",
    rateRecord.asOfDate || "",
    {type:"date"}
  );
  form.appendChild(dateField);

  const actions = el("div","actions");
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "評価レートを保存";
  actions.appendChild(save);

  form.appendChild(actions);

  form.addEventListener("submit",event => {
    event.preventDefault();

    const values = new FormData(form);
    const rawRate = String(values.get("rate") || "").trim();
    const rawDate = String(values.get("asOfDate") || "").trim();

    const rate = rawRate === ""
      ? null
      : toNumberOrNull(rawRate);

    if (rawRate !== "" &&
        (rate === null || rate <= 0)) {
      showMessage("評価レートは0より大きい数値で入力してください。",true);
      render();
      return;
    }

    if (rate !== null && rawDate === "") {
      showMessage("評価レートの対象日を入力してください。",true);
      render();
      return;
    }

    if (rawDate !== "" &&
        !isValidFxDateForStorage(rawDate)) {
      showMessage("対象日を正しく入力してください。",true);
      render();
      return;
    }

    const nextData = JSON.parse(JSON.stringify(appData));
    const target = nextData.fxRates.find(item =>
      item.id === rateRecord.id
    );

    if (!target) {
      showMessage("評価レートの登録先が見つかりません。",true);
      render();
      return;
    }

    target.rate = rate;
    target.asOfDate = rate === null ? null : rawDate;
    target.updatedAt = new Date().toISOString();

    try {
      saveData(nextData);
      appData = nextData;
      showMessage("評価レートを保存しました。");
    } catch (error) {
      showMessage(
        error.message || "評価レートを保存できませんでした。",
        true
      );
    }

    render();
  });

  return form;
}

/* ---------- 通貨ペア管理 ---------- */

function renderFxPairAddForm(account) {
  const form = document.createElement("form");
  form.className = "fx-pair-add-form";

  form.appendChild(el("h4","","通貨ペアを追加"));

  const pairField = makeField(
    "通貨ペア",
    "pair",
    "",
    {
      type:"text",
      placeholder:"例：USD/JPY",
      required:true
    }
  );
  form.appendChild(pairField);

  const help = el(
    "div",
    "help",
    "英大文字3文字/JPYの形式で入力してください。"
  );
  form.appendChild(help);

  const actions = el("div","actions");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "通貨ペアを追加";
  actions.appendChild(submit);
  form.appendChild(actions);

  form.addEventListener("submit",event => {
    event.preventDefault();

    const pair = String(
      new FormData(form).get("pair") || ""
    ).trim();

    if (!isValidFxPairForStorage(pair)) {
      showMessage("通貨ペアは英大文字3文字/JPYで入力してください。",true);
      return;
    }

    const exists = appData.fxRates.some(item =>
      item.accountId === account.id &&
      item.pair === pair
    );

    if (exists) {
      showMessage("この通貨ペアは既に登録されています。",true);
      return;
    }

    const now = new Date().toISOString();
    const nextData = JSON.parse(JSON.stringify(appData));

    nextData.fxRates.push({
      id:createId(),
      accountId:account.id,
      pair,
      rate:null,
      asOfDate:null,
      createdAt:now,
      updatedAt:now
    });

    try {
      saveData(nextData);
      appData = nextData;
      showMessage(pair + "を追加しました。");
    } catch (error) {
      showMessage(
        error.message || "通貨ペアを追加できませんでした。",
        true
      );
    }

    render();
  });

  return form;
}

function deleteFxPair(accountId,pair) {
  const hasPosition = appData.fxPositions.some(position =>
    position.accountId === accountId &&
    position.pair === pair
  );

  if (hasPosition) {
    showMessage(
      "この通貨ペアには建玉データがあるため削除できません。",
      true
    );
    render();
    return;
  }

  if (!window.confirm(
    pair + "をこの口座から削除しますか？"
  )) {
    return;
  }

  const nextData = JSON.parse(JSON.stringify(appData));
  nextData.fxRates = nextData.fxRates.filter(rate =>
    !(rate.accountId === accountId && rate.pair === pair)
  );

  try {
    saveData(nextData);
    appData = nextData;
    showMessage(pair + "を削除しました。");
  } catch (error) {
    showMessage(
      error.message || "通貨ペアを削除できませんでした。",
      true
    );
  }

  render();
}

function renderFxPairRateCard(account,rateRecord) {
  const card = el("section","card");
  card.appendChild(renderFxRateForm(account,rateRecord));

  const actions = el("div","actions");
  const remove = makeButton(
    "通貨ペアを削除",
    "delete-fx-pair",
    "danger small"
  );

  remove.addEventListener("click",() => {
    deleteFxPair(account.id,rateRecord.pair);
  });

  actions.appendChild(remove);
  card.appendChild(actions);

  return card;
}