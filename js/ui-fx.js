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

  const open = makeButton(
    "建玉一覧・追加",
    "open-fx-positions",
    "secondary"
  );

  open.addEventListener("click",() => {
    renderFxPositionManagement(row.accountId,row.pair,row.side);
  });

  card.appendChild(open);

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
  } else {
    for (const row of rows) {
      section.appendChild(renderFxAggregateCard(row));
    }
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

/* ---------- FX建玉の入力 ---------- */

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

  const pairField = makeField(
    "通貨ペア",
    "pair",
    position ? position.pair : pair,
    {type:"text",required:true}
  );
  form.appendChild(pairField);

  const sideField = makeField(
    "売買方向",
    "side",
    position ? position.side : side,
    {type:"text",required:true}
  );
  form.appendChild(sideField);

  const dateField = makeField(
    "約定日時",
    "openDate",
    position
      ? position.openDate.replace(" ","T")
      : "",
    {type:"datetime-local",required:true}
  );
  form.appendChild(dateField);

  const previous = getFxPreviousPosition(
    appData,
    accountId,
    position ? position.pair : pair,
    position ? position.side : side,
    position ? position.id : null
  );

  const quantityField = makeNumericField(
    "数量（通貨）",
    "quantity",
    position
      ? String(position.quantity)
      : previous
        ? String(previous.quantity)
        : "",
    {required:true}
  );
  form.appendChild(quantityField);

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

    const nextPosition = {
      id:position ? position.id : createId(),
      accountId,
      pair:String(values.get("pair") || "").trim(),
      side:String(values.get("side") || "").trim(),
      openDate:String(values.get("openDate") || "").trim(),
      quantity:toNumberOrNull(rawQuantity),
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
    const oldPosition = position
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
    formatInputNumber(position.quantity)
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

function renderFxPositionManagement(accountId,pair,side) {
  app.replaceChildren();

  const account = appData.accounts.find(item =>
    item.id === accountId && item.type === "fx"
  );

  if (!account) {
    showMessage("FX口座が見つかりません。",true);
    render();
    return;
  }

  const section = el("section","card");
  section.appendChild(heading(
    account.name + " ／ " + pair + " ／ " + side
  ));

  const back = makeButton(
    "集計一覧へ戻る",
    "back-fx-aggregate",
    "secondary"
  );
  back.addEventListener("click",() => render());
  section.appendChild(back);

  const positions = getFxOpenPositions(appData,accountId)
    .filter(position =>
      position.pair === pair &&
      position.side === side
    )
    .sort((a,b) =>
      String(a.openDate).localeCompare(String(b.openDate))
    );

  if (!positions.length) {
    section.appendChild(el(
      "div",
      "empty",
      "保有中の建玉はありません。"
    ));
  } else {
    for (const position of positions) {
      section.appendChild(renderFxPositionRow(position));
    }
  }

  const add = makeButton(
    "建玉を追加",
    "add-fx-position",
    "primary"
  );
  add.addEventListener("click",() => {
    app.appendChild(renderFxPositionForm(accountId,pair,side));
  });
  section.appendChild(add);

  const csv = renderFxCsvImportForm(accountId);
  section.appendChild(csv);

  app.appendChild(section);
}

/* ---------- FX建玉CSV取込 ---------- */

function renderFxCsvImportForm(accountId) {
  const form = document.createElement("form");
  form.className = "fx-csv-import-form";

  form.appendChild(heading("建玉CSV一括取込"));

  form.appendChild(el(
    "div",
    "help",
    "CSVの列順：口座名,通貨ペア,売買方向,約定日時,数量,約定レート,累計スワップ"
  ));

  const fileField = document.createElement("input");
  fileField.type = "file";
  fileField.accept = ".csv,text/csv";
  fileField.required = true;
  fileField.name = "csvFile";
  form.appendChild(fileField);

  const preview = el("div","fx-csv-preview");
  form.appendChild(preview);

  const actions = el("div","actions");
  const previewButton = document.createElement("button");
  previewButton.type = "button";
  previewButton.textContent = "CSVを確認";
  actions.appendChild(previewButton);

  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.textContent = "一括取込";
  importButton.disabled = true;
  actions.appendChild(importButton);

  form.appendChild(actions);

  let parsedItems = [];

  previewButton.addEventListener("click",async () => {
    const file = fileField.files && fileField.files[0];

    parsedItems = [];
    importButton.disabled = true;
    preview.replaceChildren();

    if (!file) {
      showMessage("CSVファイルを選択してください。",true);
      return;
    }

    let text;

    try {
      text = await file.text();
    } catch (error) {
      showMessage("CSVファイルを読み込めませんでした。",true);
      return;
    }

    const result = parseFxPositionCsv(
      text,
      appData.accounts
    );

    if (result.errors.length > 0) {
      preview.appendChild(el(
        "div",
        "error",
        result.errors.join("\n")
      ));
      preview.appendChild(el(
        "div",
        "help",
        "エラーがあるため、一括取込はできません。"
      ));
      return;
    }

    parsedItems = result.items;

    preview.appendChild(el(
      "div",
      "success",
      parsedItems.length + "件を取り込めます。"
    ));

    const list = document.createElement("ul");

    for (const item of parsedItems.slice(0,10)) {
      const li = document.createElement("li");
      li.textContent =
        getFxAccountName(item.accountId) + " ／ " +
        item.pair + " ／ " +
        item.side + " ／ " +
        item.openDate + " ／ " +
        formatInputNumber(item.quantity) + " ／ " +
        item.openRate;
      list.appendChild(li);
    }

    preview.appendChild(list);

    if (parsedItems.length > 10) {
      preview.appendChild(el(
        "div",
        "help",
        "ほか " + (parsedItems.length - 10) + "件"
      ));
    }

    importButton.disabled = parsedItems.length === 0;
  });

  importButton.addEventListener("click",() => {
    if (!parsedItems.length) return;

    if (!window.confirm(
      parsedItems.length +
      "件の建玉を取り込みます。よろしいですか？"
    )) {
      return;
    }

    const nextData = JSON.parse(JSON.stringify(appData));
    const now = new Date().toISOString();

    for (const item of parsedItems) {
      const position = {
        ...item,
        id:createId(),
        recordedAt:now,
        createdAt:now,
        updatedAt:now
      };

      nextData.fxPositions.push(position);

      if (position.swap !== null && position.swap !== 0) {
        nextData.fxSwapLedger.push(
          createFxSwapAdjustment(
            position,
            "追加",
            position.swap,
            now
          )
        );
      }

      const rateExists = nextData.fxRates.some(rate =>
        rate.accountId === position.accountId &&
        rate.pair === position.pair
      );

      if (!rateExists) {
        nextData.fxRates.push({
          id:createId(),
          accountId:position.accountId,
          pair:position.pair,
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
      parsedItems = [];
      preview.replaceChildren();
      importButton.disabled = true;
      fileField.value = "";
      showMessage("建玉を一括取込しました。");
      render();
    } catch (error) {
      showMessage(
        error.message || "CSVの取込に失敗しました。",
        true
      );
    }
  });

  return form;
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
