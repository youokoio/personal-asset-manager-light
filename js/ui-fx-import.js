"use strict";

/* ---------- FX建玉CSV取込 ---------- */

function renderFxCsvImportForm(accountId) {
  const form = document.createElement("form");
  form.className = "fx-csv-import-form";

  form.appendChild(heading("建玉CSV一括取込"));

  form.appendChild(el(
    "div",
    "help",
    "CSVの列順：口座名,通貨ペア,売買方向,約定日時,数量,約定レート,累計スワップ（末尾にデータ確認日を追加可能）"
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

/* ---------- 建玉の直接登録画面 ---------- */

function makeFxPositionEntryButton(account) {
  const button = makeButton(
    "建玉を手入力・CSV取込",
    "open-fx-position-entry",
    "secondary"
  );

  button.addEventListener("click",() => {
    renderFxPositionEntryScreen(account.id);
  });

  return button;
}

function renderFxPositionEntryScreen(accountId) {
  const account = appData.accounts.find(item =>
    item.id === accountId && item.type === "fx"
  );

  if (!account) {
    showMessage("FX口座が見つかりません。",true);
    render();
    return;
  }

  app.replaceChildren();

  const section = el("section","card");
  section.appendChild(heading(account.name + " ／ 建玉登録"));

  const back = makeButton(
    "FX一覧へ戻る",
    "back-fx-aggregate",
    "secondary"
  );
  back.addEventListener("click",() => render());
  section.appendChild(back);

  const form = renderFxPositionForm(accountId,"","");
  if (form) section.appendChild(form);

  section.appendChild(renderFxCsvImportForm(accountId));
  app.appendChild(section);
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