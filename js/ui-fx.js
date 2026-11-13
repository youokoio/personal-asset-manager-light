"use strict";

/* ---------- FX表示補助 ---------- */

function formatFxRateValue(value) {
  if (value === null || value === undefined ||
      !Number.isFinite(value)) {
    return "未入力";
  }

  return value.toLocaleString("ja-JP",{
    minimumFractionDigits:0,
    maximumFractionDigits:5
  });
}

function getFxAccountName(accountId) {
  const account = appData.accounts.find(item =>
    item.id === accountId
  );

  return account ? account.name : "不明";
}

function getFxRateInputValue(value) {
  return value === null || value === undefined
    ? ""
    : String(value);
}

/* ---------- FX集計一覧 ---------- */

function renderFxAggregateCard(row) {
  const card = el("section","card");
  card.appendChild(el(
    "div",
    "account-name",
    row.accountName + " ／ " + row.pair + " ／ " + row.side
  ));

  appendAccountMetric(
    card,
    "建玉数量",
    formatInputNumber(row.quantity),
    row.positionCount + "件"
  );

  appendAccountMetric(
    card,
    "平均約定レート",
    formatFxRateValue(row.averageOpenRate)
  );

  appendAccountMetric(
    card,
    "評価レート",
    formatFxRateValue(row.evaluationRate),
    row.evaluationRateDate
      ? "対象日：" + formatDateWithWeekday(row.evaluationRateDate)
      : ""
  );

  appendAccountMetric(
    card,
    "為替差損益",
    row.exchangeProfit === null
      ? "未計算"
      : formatSignedYen(row.exchangeProfit)
  );

  appendAccountMetric(
    card,
    "累計スワップ",
    row.swapTotal === null
      ? "未入力"
      : formatSignedYen(row.swapTotal)
  );

  appendAccountMetric(
    card,
    "評価損益",
    row.evaluationPnl === null
      ? "未計算"
      : formatSignedYen(row.evaluationPnl)
  );

  return card;
}

function renderFxAggregateSection(accountId = null) {
  const section = el("section","card");
  section.appendChild(heading("通貨ペア別建玉集計"));

  const rows = calculateFxAggregateRows(appData).filter(row =>
    accountId === null || row.accountId === accountId
  );

  if (!rows.length) {
    section.appendChild(el(
      "div",
      "empty",
      "保有中の建玉はありません。"
    ));
    return section;
  }

  for (const row of rows) {
    section.appendChild(renderFxAggregateCard(row));
  }

  if (accountId !== null) {
    const summary = calculateFxAccountAggregateSummary(
      appData,
      accountId
    );

    appendAccountMetric(
      section,
      "口座内の為替差損益合計",
      summary.exchangeProfit === null
        ? "未計算"
        : formatSignedYen(summary.exchangeProfit),
      summary.status === "計算済"
        ? summary.calculatedCount + "／" +
          summary.aggregateCount + "集計を計算済み"
        : summary.status
    );
  }

  return section;
}

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

/* ---------- FX口座別管理 ---------- */

function renderFxRateManagement(account) {
  const section = el("section","card");
  section.appendChild(heading("評価レート・通貨ペア"));

  const pairs = getFxAccountPairs(appData,account.id);

  if (!pairs.length) {
    section.appendChild(el(
      "div",
      "empty",
      "通貨ペアはまだ登録されていません。"
    ));
  } else {
    for (const rateRecord of pairs) {
      section.appendChild(
        renderFxPairRateCard(account,rateRecord)
      );
    }
  }

  section.appendChild(renderFxPairAddForm(account));

  return section;
}

/* ---------- FX画面 ---------- */

function renderFxManagementSection(accountId = null) {
  if (accountId !== null) {
    const account = appData.accounts.find(item =>
      item.id === accountId && item.type === "fx"
    );

    if (!account) return;

    app.appendChild(renderFxAggregateSection(account.id));
    app.appendChild(renderFxRateManagement(account));
    return;
  }

  app.appendChild(renderFxAggregateSection());

  const accounts = appData.accounts.filter(account =>
    account.type === "fx"
  );

  for (const account of accounts) {
    const section = el("section","card");
    section.appendChild(heading(account.name));

    const summary = calculateFxAccountAggregateSummary(
      appData,
      account.id
    );

    appendAccountMetric(
      section,
      "為替差損益合計",
      summary.exchangeProfit === null
        ? "未計算"
        : formatSignedYen(summary.exchangeProfit),
      summary.status
    );

    const open = makeButton(
      "評価レート・通貨ペアを管理",
      "open-fx-management",
      "secondary"
    );
    open.dataset.id = account.id;
    open.addEventListener("click",() => {
      selectedAccountId = account.id;
      render();
    });

    section.appendChild(open);
    app.appendChild(section);
  }
}
