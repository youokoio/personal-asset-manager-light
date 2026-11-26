function stockOcrUpdateMakeInput(
  index,field,labelText,value,options = {}
) {
  const wrapper = el("div","field");
  const inputId = "stock-ocr-" + index + "-" + field;
  const label = el("label","",labelText);
  label.htmlFor = inputId;

  const input = document.createElement("input");
  input.type = "text";
  input.id = inputId;
  input.name = field;
  input.autocomplete = "off";

  if (options.numeric) {
    input.inputMode = "decimal";
    input.value = value === null || value === undefined
      ? ""
      : formatInputNumber(value);
  } else {
    input.value = value === null || value === undefined
      ? ""
      : String(value);
  }

  input.dataset.stockOcrIndex = String(index);
  input.dataset.stockOcrField = field;
  wrapper.append(label,input);
  return wrapper;
}

function stockOcrUpdateMakeSelect(
  index,field,labelText,values,selected
) {
  const wrapper = el("div","field");
  const inputId = "stock-ocr-" + index + "-" + field;
  const label = el("label","",""+labelText);
  label.htmlFor = inputId;

  const select = document.createElement("select");
  select.id = inputId;
  select.name = field;
  select.dataset.stockOcrIndex = String(index);
  select.dataset.stockOcrField = field;

  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "未選択";
  select.appendChild(blank);

  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }

  select.value = selected || "";
  wrapper.append(label,select);
  return wrapper;
}

function stockOcrUpdateRenderCandidateOptions(
  section,card,index,field,labelText
) {
  const options = stockOcrGetCandidateOptionsStateStock(
    card,
    field
  );
  if (options.length === 0) return;

  const candidateSection = el("div","field");
  candidateSection.appendChild(el(
    "div",
    "metric-sub",
    labelText + "の候補"
  ));

  const selection = card.candidateSelections &&
    card.candidateSelections[field]
      ? card.candidateSelections[field]
      : null;

  if (selection) {
    candidateSection.appendChild(el(
      "div",
      "success",
      "選択済み：" + selection.label
    ));
  }

  options.forEach((option,candidateIndex) => {
    const selected = Boolean(
      selection &&
      JSON.stringify(selection.value) ===
        JSON.stringify(option.value)
    );

    const button = makeButton(
      (selected ? "選択中：" : "候補" + (candidateIndex + 1) + "：") +
        option.label,
      "stock-ocr-candidate",
      selected ? "primary" : "secondary"
    );
    button.dataset.index = String(index);
    button.dataset.field = field;
    button.dataset.candidateIndex = String(candidateIndex);
    candidateSection.appendChild(button);
  });

  if (selection) {
    const clearButton = makeButton(
      "選択を解除",
      "stock-ocr-candidate-clear",
      "secondary"
    );
    clearButton.dataset.index = String(index);
    clearButton.dataset.field = field;
    candidateSection.appendChild(clearButton);
  }

  section.appendChild(candidateSection);
}

function stockOcrUpdateRenderCard(card,index) {
  const section = el("section","card");
  section.appendChild(el(
    "h3",
    "",
    card.name && card.name.trim()
      ? card.name
      : "商品名未取得（要確認）"
  ));

  const statusLabel = card.duplicate
    ? "重複・追加しません"
    : card.status === "recognized"
      ? "認識・確定済み"
      : "要確認";

  section.appendChild(el(
    "div",
    card.status === "recognized" ? "success" : "help",
    "状態：" + statusLabel
  ));

  const selection = el("div","field");
  const checkboxLabel = el("label","","保存対象");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = card.selected !== false;
  checkbox.disabled = Boolean(
    card.duplicate || card.batchDuplicate ||
    card.status !== "recognized"
  );
  checkbox.dataset.stockOcrIndex = String(index);
  checkbox.dataset.stockOcrSelect = "true";
  checkboxLabel.appendChild(checkbox);
  selection.appendChild(checkboxLabel);
  section.appendChild(selection);

  section.appendChild(stockOcrUpdateMakeInput(
    index,"name","商品名",card.name
  ));
  stockOcrUpdateRenderCandidateOptions(
    section,card,index,"name","商品名"
  );

  section.appendChild(stockOcrUpdateMakeSelect(
    index,"wrapper","wrapper",HOLDING_WRAPPERS,card.wrapper
  ));
  stockOcrUpdateRenderCandidateOptions(
    section,card,index,"wrapper","wrapper"
  );

  section.appendChild(stockOcrUpdateMakeSelect(
    index,"kind","種別",HOLDING_KINDS,card.kind
  ));
  stockOcrUpdateRenderCandidateOptions(
    section,card,index,"kind","種別"
  );

  section.appendChild(stockOcrUpdateMakeInput(
    index,"value","評価額",card.value,{numeric:true}
  ));
  stockOcrUpdateRenderCandidateOptions(
    section,card,index,"value","評価額"
  );

  section.appendChild(stockOcrUpdateMakeInput(
    index,"pnl","評価損益",card.pnl,{numeric:true}
  ));
  section.appendChild(stockOcrUpdateMakeInput(
    index,"costBasis","取得額",card.costBasis,{numeric:true}
  ));

  stockOcrUpdateRenderCandidateOptions(
    section,card,index,"amountPair","評価額・評価損益・取得額"
  );

  if (card.costBasisSource === "value-minus-pnl") {
    section.appendChild(el("div","help","取得額：計算値"));
  }
  section.appendChild(stockOcrUpdateMakeInput(
    index,"quantity","数量",card.quantity,{numeric:true}
  ));

  if (card.reasons && card.reasons.length > 0) {
    for (const reason of card.reasons) {
      section.appendChild(el("div","error",reason));
    }
  }

  if (card.status !== "recognized" && !card.batchDuplicate) {
    section.appendChild(makeButton(
      "内容を確認して確定",
      "stock-ocr-confirm-card",
      "secondary"
    ));
    section.lastChild.dataset.index = String(index);
  }

  if (card.comparison) {
    const labels = {
      new:"新規追加候補",
      unavailable:"比較不可",
      "cost-increase":"取得額増",
      "cost-decrease":"取得額減",
      "value-change":"評価額のみ変化",
      unchanged:"変化なし"
    };
    let comparisonText = labels[card.comparison] ||
      "比較結果なし";

    if (card.costDifference !== null &&
        card.costDifference !== undefined) {
      comparisonText += "：" + formatSignedYen(card.costDifference);
    }
    section.appendChild(el("div","metric-sub",comparisonText));

    if (card.wrapperWarning) {
      section.appendChild(el(
        "div",
        "error",
        "wrapperの取り違えの疑いがあります。過去の取得額：" +
          formatYen(card.previousHolding.costBasis)
      ));
    }

    if (card.similarNames && card.similarNames.length > 0) {
      section.appendChild(el(
        "div",
        "help",
        "類似候補：" + card.similarNames.join("、") +
          "（自動統合しません）"
      ));
    }

    if (card.quantityDifference !== null &&
        card.quantityDifference !== undefined) {
      section.appendChild(el(
        "div",
        "metric-sub",
        "数量差：" + formatInputNumber(card.quantityDifference)
      ));
    }
  }

  if (Array.isArray(card.safeLines) && card.safeLines.length > 0) {
    const details = document.createElement("details");
    const summary = el("summary","","OCR行（伏せ字処理済み）");
    details.appendChild(summary);

    for (const line of card.safeLines) {
      details.appendChild(el(
        "div",
        "metric-sub",
        line.lineNumber + "行目：" + line.text
      ));
    }
    section.appendChild(details);
  }

  return section;
}

function stockOcrUpdateRenderComparison() {
  const result = stockOcrUpdateComparison;
  if (!result || !result.aggregateComparison) return;

  const comparison = result.aggregateComparison;
  const card = el("section","card");
  card.appendChild(el("h3","","過去記録との比較"));

  card.appendChild(el(
    "div",
    "metric-sub",
    comparison.previousDate
      ? "前回（" + formatDateWithWeekday(comparison.previousDate) +
        "）：" + formatYen(comparison.previousTotal)
      : "前回の記録なし"
  ));

  card.appendChild(el(
    "div",
    "metric-sub",
    "今回（" + formatDateWithWeekday(result.targetDate) + "）：" +
      (comparison.status === "pending"
        ? "確定後に表示"
        : formatYen(comparison.currentTotal))
  ));

  card.appendChild(el(
    "div",
    "metric-sub",
    "増減：" +
      (comparison.status === "pending"
        ? "確定後に表示"
        : comparison.status === "no-previous"
          ? "前回の記録なし"
          : formatSignedYen(comparison.change))
  ));

  if (result.missingHoldings.length > 0) {
    card.appendChild(el("h4","","今回出ていません"));
    for (const item of result.missingHoldings) {
      card.appendChild(el(
        "div",
        "snapshot-row",
        item.name + " ／ " + item.wrapper
      ));
    }
    card.appendChild(el(
      "div",
      "help",
      "今回出ていない商品は、削除・保存しません。"
    ));
  }

  app.appendChild(card);
}
