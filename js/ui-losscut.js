"use strict";

function formatFxLossCutYen(value) {
  if (!Number.isFinite(value)) return "算出不可";
  const amount = Math.trunc(value);
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return sign + "¥" + Math.abs(amount).toLocaleString("ja-JP");
}

function formatFxLossCutMoney(value) {
  if (!Number.isFinite(value)) return "算出不可";
  return "¥" + Math.abs(Math.trunc(value)).toLocaleString("ja-JP");
}

function formatFxLossCutRatio(value) {
  if (!Number.isFinite(value)) return "算出不可";
  return (Math.round(value * 100) / 100).toFixed(2) + "%";
}

function formatFxLossCutRate(value) {
  if (!Number.isFinite(value)) return "算出不可";
  const truncated = Math.trunc(value * 10000) / 10000;
  return truncated.toLocaleString("ja-JP",{
    minimumFractionDigits:0,
    maximumFractionDigits:4
  });
}

function formatFxLossCutPercent(value) {
  if (!Number.isFinite(value)) return "算出不可";
  const truncated = Math.trunc(value * 10000) / 10000;
  return truncated.toLocaleString("ja-JP",{
    minimumFractionDigits:0,
    maximumFractionDigits:4
  }) + "%";
}

function formatFxLossCutShortfall(value) {
  if (!Number.isFinite(value)) return "算出不可";
  return value > 0 ? formatFxLossCutMoney(value) : "不足なし";
}

function createFxLossCutInputField(labelText,name,value,placeholder) {
  const wrapper = el("div","field fx-losscut-input-field");
  const label = el("label","",labelText);
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.autocomplete = "off";
  input.className = "fx-losscut-input";
  input.id = name;
  input.name = name;
  input.value = value === null || value === undefined ? "" : String(value);
  if (placeholder) input.placeholder = placeholder;
  label.htmlFor = name;
  wrapper.append(label,input);
  return {wrapper,input};
}

function appendFxLossCutMetric(container,label,value,subText = "") {
  appendAccountMetric(container,label,value,subText);
}

function renderFxLossCutBlock(data,accountId) {
  const card = el("section","card fx-losscut-card");
  const account = data.accounts.find(item =>
    item.id === accountId && item.type === "fx"
  );
  if (!account) return card;

  const initial = calculateFxLossCut(data,accountId);
  const openPositions = getFxOpenPositions(data,accountId);
  const headingRow = el("div","fx-losscut-heading");
  headingRow.appendChild(el("h3","","ロスカット値"));
  headingRow.appendChild(el("span","pill","目安"));
  card.appendChild(headingRow);
  card.appendChild(el(
    "div",
    "help",
    "現在の評価レートと最新の有効証拠金を使った目安です。"
  ));

  const summary = el("div","fx-losscut-summary");
  appendFxLossCutMetric(
    summary,
    "現在の維持率",
    initial.metrics
      ? formatFxLossCutRatio(initial.metrics.maintenanceRatio)
      : "算出不可"
  );
  if (initial.metrics) {
    appendFxLossCutMetric(
      summary,
      "現在の判定",
      initial.metrics.isLossCut ? "ロスカット水準" : "ロスカット水準ではありません"
    );
  }

  if (openPositions.length === 0) {
    summary.appendChild(el("div","empty","建玉なし"));
  } else if (initial.positions.length === 0) {
    summary.appendChild(el(
      "div",
      "empty",
      "計算対象となる円建て建玉がありません。"
    ));
  } else {
    for (const pairResult of initial.pairRates) {
      for (const root of pairResult.roots) {
        appendFxLossCutMetric(
          summary,
          pairResult.pair + " ／ " + root.direction,
          root.rate === null
            ? root.status
            : formatFxLossCutRate(root.rate)
        );
      }
    }
    if (!initial.canCalculate) {
      const unavailablePairs = Array.from(new Set(
        initial.positions.map(position => position.pair)
      )).sort();
      for (const pair of unavailablePairs) {
        appendFxLossCutMetric(summary,pair,"算出不可");
      }
    }
  }
  card.appendChild(summary);

  const warningArea = el("div","fx-losscut-warnings");
  for (const warning of initial.warnings) {
    warningArea.appendChild(el("div","notice","警告：" + warning));
  }
  const displayedMissing = initial.missing.filter(item =>
    item !== "保有中の建玉"
  );
  if (displayedMissing.length) {
    warningArea.appendChild(el(
      "div",
      "notice",
      "計算に必要な入力が不足しています：" + displayedMissing.join("、")
    ));
  }
  if (warningArea.childNodes.length) card.appendChild(warningArea);

  const details = document.createElement("details");
  details.className = "fx-losscut-details";
  const summaryLabel = document.createElement("summary");
  summaryLabel.textContent = "詳細・シナリオ試算";
  details.appendChild(summaryLabel);

  const inputArea = el("div","fx-losscut-inputs");
  inputArea.appendChild(el("h4","","シナリオ入力（保存されません）"));

  const equityField = createFxLossCutInputField(
    "有効証拠金の上書き（円）",
    "fx-losscut-equity-" + accountId,
    initial.effectiveEquity,
    "最新の有効証拠金"
  );
  inputArea.appendChild(equityField.wrapper);
  inputArea.appendChild(el(
    "div",
    "help",
    "対象日：" + (initial.effectiveEquityDate
      ? formatDateWithWeekday(initial.effectiveEquityDate)
      : "未入力")
  ));

  const rateInputs = new Map();
  const pairSection = el("div","fx-losscut-rate-inputs");
  pairSection.appendChild(el("h4","","通貨ペアごとのシナリオレート"));
  const pairs = Object.keys(initial.rates).sort();
  if (!pairs.length) {
    pairSection.appendChild(el("div","empty","保有中の円建て建玉がありません。"));
  }
  for (const pair of pairs) {
    const safePair = pair.replace(/[^A-Za-z0-9_-]/g,"-");
    const field = createFxLossCutInputField(
      pair + "（現在 " + formatFxLossCutRate(initial.rates[pair]) + "）",
      "fx-losscut-rate-" + accountId + "-" + safePair,
      initial.rates[pair],
      "評価レート"
    );
    rateInputs.set(pair,field.input);
    pairSection.appendChild(field.wrapper);
  }
  inputArea.appendChild(pairSection);

  const uniformField = createFxLossCutInputField(
    "全ペア一律の変動率（%）",
    "fx-losscut-uniform-" + accountId,
    0,
    "−100〜＋1,000"
  );
  inputArea.appendChild(uniformField.wrapper);
  inputArea.appendChild(el(
    "div",
    "help",
    "マイナスは下落、プラスは上昇です。範囲は−100%〜＋1,000%です。"
  ));
  details.appendChild(inputArea);

  const resultArea = el("div","fx-losscut-detail-results");
  details.appendChild(resultArea);
  card.appendChild(details);

  function appendScenarioMetrics(container,metrics) {
    appendFxLossCutMetric(container,"シナリオ評価損益",formatFxLossCutYen(metrics.scenarioProfit));
    appendFxLossCutMetric(container,"シナリオ有効証拠金",formatFxLossCutYen(metrics.effectiveEquity));
    appendFxLossCutMetric(container,"必要証拠金",formatFxLossCutMoney(metrics.requiredMargin));
    appendFxLossCutMetric(container,"維持率",formatFxLossCutRatio(metrics.maintenanceRatio));
    appendFxLossCutMetric(
      container,
      "ロスカット判定",
      metrics.isLossCut === null
        ? "算出不可"
        : metrics.isLossCut ? "ロスカット" : "ロスカットなし"
    );
    appendFxLossCutMetric(container,"ロスカットまでの余裕額",formatFxLossCutYen(metrics.headroom));
    appendFxLossCutMetric(
      container,
      "不足額（ロスカット維持率基準）",
      formatFxLossCutShortfall(metrics.lossCutShortfall),
      metrics.lossCutShortfall <= 0 && Number.isFinite(metrics.headroom)
        ? "余裕額：" + formatFxLossCutYen(metrics.headroom)
        : ""
    );
    appendFxLossCutMetric(
      container,
      "不足額（目安維持率基準）",
      formatFxLossCutShortfall(metrics.targetShortfall),
      metrics.targetShortfall <= 0 && Number.isFinite(metrics.targetShortfall)
        ? "余裕額：" + formatFxLossCutYen(-metrics.targetShortfall)
        : ""
    );
  }

  function appendLossCutRoots(container,result) {
    const section = el("section","fx-losscut-result-section");
    section.appendChild(el("h4","","通貨ペアごとのロスカットレート"));
    if (!result.pairRates.length) {
      section.appendChild(el("div","empty","算出できるロスカットレートがありません。"));
    }
    for (const pairResult of result.pairRates) {
      for (const root of pairResult.roots) {
        appendFxLossCutMetric(
          section,
          pairResult.pair + " ／ " + root.direction,
          root.rate === null ? root.status : formatFxLossCutRate(root.rate)
        );
      }
    }
    container.appendChild(section);
  }

  function updateResults() {
    resultArea.replaceChildren();
    const rawEquity = equityField.input.value.trim();
    const effectiveEquity = toNumberOrNull(rawEquity);
    const scenarioRates = {};
    const invalidInputs = [];

    if (rawEquity === "" || effectiveEquity === null || effectiveEquity <= 0) {
      invalidInputs.push("有効証拠金は0より大きい数値で入力してください。");
    }

    for (const [pair,input] of rateInputs.entries()) {
      const rawRate = input.value.trim();
      const rate = toNumberOrNull(rawRate);
      if (rawRate === "" || rate === null || rate <= 0) {
        invalidInputs.push(pair + "のシナリオレートは0より大きい数値で入力してください。");
      } else {
        scenarioRates[pair] = rate;
      }
    }

    const rawUniform = uniformField.input.value.trim();
    const uniformChangePct = toNumberOrNull(rawUniform);
    if (rawUniform === "" || uniformChangePct === null ||
        uniformChangePct < -100 || uniformChangePct > 1000) {
      invalidInputs.push("全ペア一律の変動率は−100%〜＋1,000%で入力してください。");
    }

    if (invalidInputs.length) {
      resultArea.appendChild(el(
        "div",
        "error",
        invalidInputs.join("／")
      ));
      return;
    }

    const result = calculateFxLossCut(data,accountId,{
      effectiveEquity,
      effectiveEquityDate:initial.effectiveEquityDate,
      scenarioRates,
      uniformChangePct
    });

    for (const warning of result.warnings) {
      resultArea.appendChild(el("div","notice","警告：" + warning));
    }
    if (result.missing.length) {
      resultArea.appendChild(el(
        "div",
        "notice",
        "計算できません。不足項目：" + result.missing.join("、")
      ));
      return;
    }
    if (!result.metrics) {
      resultArea.appendChild(el("div","notice","計算結果を表示できません。"));
      return;
    }

    const metricsSection = el("section","fx-losscut-result-section");
    metricsSection.appendChild(el("h4","","シナリオ結果"));
    appendScenarioMetrics(metricsSection,result.metrics);
    resultArea.appendChild(metricsSection);

    appendLossCutRoots(resultArea,result);

    const atSection = el("section","fx-losscut-result-section");
    atSection.appendChild(el("h4","","ロスカット時点の評価損益・有効証拠金"));
    if (!result.lossCutAtDetails.length) {
      atSection.appendChild(el("div","empty","算出できるロスカットレートがありません。"));
    }
    for (const item of result.lossCutAtDetails) {
      appendFxLossCutMetric(
        atSection,
        item.pair + " ／ " + item.direction + " 評価損益合計",
        formatFxLossCutYen(item.exchangeProfit)
      );
      appendFxLossCutMetric(
        atSection,
        item.pair + " ／ " + item.direction + " 有効証拠金",
        formatFxLossCutMoney(item.effectiveEquity)
      );
    }
    resultArea.appendChild(atSection);

    const uniformSection = el("section","fx-losscut-result-section");
    uniformSection.appendChild(el("h4","","全ペア一律の逆算・試算"));
    for (const direction of ["down","up"]) {
      const root = result.uniformRoots[direction];
      if (!root) continue;
      appendFxLossCutMetric(
        uniformSection,
        direction === "down" ? "下落方向の変動率" : "上昇方向の変動率",
        root.percent === null ? root.status : formatFxLossCutPercent(root.percent)
      );
    }
    if (!result.uniformRoots.down && !result.uniformRoots.up) {
      uniformSection.appendChild(el("div","empty","該当する探索方向がありません。"));
    }
    if (result.uniformScenario) {
      appendFxLossCutMetric(
        uniformSection,
        "入力した一律変動率の維持率",
        formatFxLossCutRatio(result.uniformScenario.maintenanceRatio)
      );
      appendFxLossCutMetric(
        uniformSection,
        "入力した一律変動率のロスカット判定",
        result.uniformScenario.isLossCut ? "ロスカット" : "ロスカットなし"
      );
    }
    resultArea.appendChild(uniformSection);

    const contextSection = el("section","fx-losscut-result-section");
    contextSection.appendChild(el("h4","","計算条件・対象日"));
    appendFxLossCutMetric(
      contextSection,
      "必要証拠金の補正係数",
      result.correctionDate
        ? result.correctionFactor.toLocaleString("ja-JP",{maximumFractionDigits:6})
        : "補正なし（係数1）",
      result.correctionDate
        ? "実績対象日：" + formatDateWithWeekday(result.correctionDate)
        : ""
    );
    appendFxLossCutMetric(
      contextSection,
      "有効証拠金の対象日",
      result.effectiveEquityDate
        ? formatDateWithWeekday(result.effectiveEquityDate)
        : "対象日なし"
    );
    for (const pair of Object.keys(result.rateDates).sort()) {
      appendFxLossCutMetric(
        contextSection,
        pair + " 評価レートの対象日",
        result.rateDates[pair]
          ? formatDateWithWeekday(result.rateDates[pair])
          : "対象日なし"
      );
    }
    resultArea.appendChild(contextSection);
  }

  equityField.input.addEventListener("input",updateResults);
  for (const input of rateInputs.values()) {
    input.addEventListener("input",updateResults);
  }
  uniformField.input.addEventListener("input",updateResults);
  updateResults();

  return card;
}