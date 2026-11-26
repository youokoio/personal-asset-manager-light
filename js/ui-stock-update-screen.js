function renderStockOcrUpdate() {
  app.appendChild(makeButton(
    "← 戻る",
    "stock-ocr-back",
    "secondary"
  ));
  app.appendChild(heading("株式の月次更新"));

  app.appendChild(el(
    "div",
    "help",
    "楽天証券・iDeCo・企業型DCのOCRテキストを貼り付けて解析します。解析・比較だけでは保存されません。貼り付けた原文は保存しません。"
  ));

  const accountField = el("div","field");
  const accountLabel = el("label","","口座");
  accountLabel.htmlFor = "stock-ocr-account";

  const accountSelect = document.createElement("select");
  accountSelect.id = "stock-ocr-account";
  accountSelect.dataset.stockOcrAccount = "true";

  const blankOption = document.createElement("option");
  blankOption.value = "";
  blankOption.textContent = "口座を選択";
  accountSelect.appendChild(blankOption);

  for (const account of stockOcrUpdateGetAccounts()) {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = account.name;
    accountSelect.appendChild(option);
  }

  accountSelect.value = stockOcrUpdateAccountId;
  accountField.append(accountLabel,accountSelect);
  app.appendChild(accountField);

  const dateField = makeField(
    "対象日",
    "stockOcrTargetDate",
    stockOcrUpdateTargetDate,
    {type:"date",required:true}
  );
  dateField.querySelector("input").id = "stock-ocr-target-date";
  app.appendChild(dateField);

  const pasteField = makeField(
    "OCRテキスト",
    "stockOcrPasteText",
    stockOcrUpdatePasteText,
    {
      textarea:true,
      help:"証券会社の画面からコピーしたテキストを貼り付けてください。"
    }
  );
  const textarea = pasteField.querySelector("textarea");
  textarea.id = "stock-ocr-paste";
  textarea.rows = 8;
  app.appendChild(pasteField);

  const actions = el("div","form-actions");
  actions.appendChild(makeButton("解析","stock-ocr-parse"));
  actions.appendChild(makeButton(
    "消去",
    "stock-ocr-clear",
    "secondary"
  ));
  app.appendChild(actions);

  if (stockOcrUpdateMessage) {
    app.appendChild(el("div","success",stockOcrUpdateMessage));
  }
  if (stockOcrUpdateError) {
    app.appendChild(el("div","error",stockOcrUpdateError));
  }

  if (stockOcrUpdateCards.length > 0) {
    app.appendChild(el(
      "h3",
      "",
      "商品カード " + stockOcrUpdateCards.length + "件"
    ));

    for (let index = 0;
         index < stockOcrUpdateCards.length;
         index += 1) {
      app.appendChild(stockOcrUpdateRenderCard(
        stockOcrUpdateCards[index],
        index
      ));
    }

    stockOcrUpdateRenderComparison();

    const snapshotCard = el("section","card");
    snapshotCard.appendChild(el(
      "h3",
      "",
      "口座全体の履歴"
    ));

    const snapshotLabel = el(
      "label",
      "",
      "口座全体の履歴も追加する"
    );
    const snapshotCheckbox = document.createElement("input");
    snapshotCheckbox.type = "checkbox";
    snapshotCheckbox.id = "stock-ocr-snapshot-enabled";
    snapshotCheckbox.checked = stockOcrUpdateSnapshotEnabled;
    snapshotLabel.appendChild(snapshotCheckbox);
    snapshotCard.appendChild(snapshotLabel);

    const snapshotValueField = makeField(
      "口座全体の評価額",
      "stockOcrSnapshotValue",
      stockOcrUpdateSnapshotValue,
      {type:"text",inputmode:"decimal"}
    );
    const snapshotValueInput = snapshotValueField.querySelector("input");
    snapshotValueInput.id = "stock-ocr-snapshot-value";
    snapshotValueInput.inputMode = "decimal";
    snapshotCard.appendChild(snapshotValueField);

    app.appendChild(snapshotCard);

    const selectedCount = stockOcrUpdateCards.filter(card =>
      card.selected !== false && !card.duplicate
    ).length;
    const unresolved = stockOcrUpdateCards.some(card =>
      card.status !== "recognized"
    );
    const snapshotValue = toNumberOrNull(stockOcrUpdateSnapshotValue);

    const saveButton = makeButton(
      "保存（" + selectedCount + "件）",
      "stock-ocr-save"
    );
    saveButton.disabled = unresolved ||
      (selectedCount === 0 && !stockOcrUpdateSnapshotEnabled) ||
      (stockOcrUpdateSnapshotEnabled && snapshotValue === null);
    app.appendChild(saveButton);
  }
}
