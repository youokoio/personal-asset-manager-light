"use strict";

function formatFxLossCutYen(value) {
  if (!Number.isFinite(value)) return "未計算";
  const amount = Math.trunc(value);
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return sign + "¥" + Math.abs(amount).toLocaleString("ja-JP");
}

function formatFxLossCutRatio(value) {
  if (!Number.isFinite(value)) return "算出不可";
  return (Math.round(value * 100) / 100).toFixed(2) + "%";
}

function formatFxLossCutRate(value) {
  if (!Number.isFinite(value)) return "未計算";
  const truncated = Math.trunc(value * 10000) / 10000;
  return truncated.toLocaleString("ja-JP",{
    minimumFractionDigits:0,
    maximumFractionDigits:4
  });
}

function formatFxLossCutPercent(value) {
  if (!Number.isFinite(value)) return "未計算";
  const truncated = Math.trunc(value * 10000) / 10000;
  return truncated.toLocaleString("ja-JP",{
    minimumFractionDigits:0,
    maximumFractionDigits:4
  }) + "%";
}

function formatFxLossCutShortfall(value) {
  return Number.isFinite(value) && value > 0
    ? formatFxLossCutYen(value)
    : "不足なし";
}

function renderFxLossCutCard(accountId) {
  const card = el("section","card fx-losscut-card");
  const account = appData.accounts.find(item =>
    item.id === accountId && item.type === "fx"
  );
  if (!account) return card;

  card.appendChild(heading(account.name + " ／ ロスカット計算"));
  card.appendChild(el(
    "div",
    "help",
    "シナリオと計算結果は目安です。入力内容・結果は保存されません。"
  ));

  const initial = calculateFxLossCut(appData,accountId);
  const equityField = makeNumericField(
    "有効証拠金（円）",
    "fxLossCutEquity_" + accountId,
    initial.effectiveEquity === null
      ? ""
      : formatInputNumber(initial.effectiveEquity),
    {placeholder:"最新の口座評価額。手入力で変更できます。"}
  );
  const equityInput = equityField.querySelector("input");
  card.appendChild(equityField);
  appendAccountMetric(
    card,
    "有効証拠金の対象日",
    initial.effectiveEquityDate
      ? formatDateWithWeekday(initial.effectiveEquityDate)
      : "対象日なし"
  );

  const settingArea = el("div","fx-losscut-settings");
  appendAccountMetric(
    settingArea,
    "ロスカット維持率",
    Number.isFinite(initial.lossCutRatio)
      ? formatFxLossCutRatio(initial.lossCutRatio)
      : "未設定"
  );
  appendAccountMetric(
    settingArea,
    "必要証拠金率",
    Number.isFinite(initial.marginRatePct)
      ? formatFxLossCutRatio(initial.marginRatePct)
      : "未設定"
  );
  appendAccountMetric(
    settingArea,
    "目安維持率",
    formatFxLossCutRatio(initial.targetRatio)
  );
  appendAccountMetric(
    settingArea,
    "必要証拠金の補正",
    initial.correctionDate
      ? "補正係数 " + initial.correctionFactor.toLocaleString("ja-JP",{maximumFractionDigits:6})
      : "補正なし（係数1）",
    initial.correctionDate
      ? "実績対象日：" + formatDateWithWeekday(initial.correctionDate)
      : ""
  );
  card.appendChild(settingArea);

  const rateInputs = new Map();
  const rateSection = el("section","fx-losscut-rate-inputs");
  rateSection.appendChild(el("h3","","通貨ペアごとのシナリオレート"));
  const pairs = Object.keys(initial.rates).sort();
  if (!pairs.length) {
    rateSection.appendChild(el("div","help","保有中の円建て建玉がありません。"));
  }
  for (const pair of pairs) {
    const field = makeNumericField(
      pair + "（現在 " + formatFxLossCutRate(initial.rates[pair]) + "）",
      "fxLossCutRate_" + accountId + "_" + pair.replace("/","_"),
      formatInputNumber(initial.rates[pair]),
      {placeholder:"シナリオレート"}
    );
    const input = field.querySelector("input");
    rateInputs.set(pair,input);
    rateSection.appendChild(field);
  }
  card.appendChild(rateSection);

  const uniformField = makeNumericField(
    "全ペア一律の変動率（%）",
    "fxLossCutUniform_" + accountId,
    "",
    {placeholder:"例：-10（下落10%）"}
  );
  const uniformInput = uniformField.querySelector("input");
  uniformInput.setAttribute("inputmode","decimal");
  card.appendChild(uniformField);
  card.appendChild(el(
    "div",
    "help",
    "一律変動率は−100%〜＋1,000%の範囲です。空欄なら一律シナリオを表示しません。"
  ));

  const resultArea = el("section","fx-losscut-results");
  card.appendChild(resultArea);

  function appendResultBadge(container) {
    container.appendChild(el("div","success","目安"));
  }

  function appendScenarioMetrics(container,metrics) {
    appendAccountMetric(container,"為替差損益",formatFxLossCutYen(metrics.scenarioProfit));
    appendAccountMetric(container,"シナリオ有効証拠金",formatFxLossCutYen(metrics.effectiveEquity));
    appendAccountMetric(container,"必要証拠金",formatFxLossCutYen(metrics.requiredMargin));
    appendAccountMetric(container,"維持率",formatFxLossCutRatio(metrics.maintenanceRatio));
    appendAccountMetric(
      container,
      "ロスカット判定",
      metrics.isLossCut === null
        ? "算出不可"
        : metrics.isLossCut ? "ロスカット" : "ロスカットなし"
    );
    appendAccountMetric(container,"ロスカットまでの余裕額",formatFxLossCutYen(metrics.headroom));
    appendAccountMetric(
      container,
      "不足額（ロスカット維持率基準）",
      formatFxLossCutShortfall(metrics.lossCutShortfall),
      "余裕額：" + formatFxLossCutYen(metrics.headroom)
    );
    appendAccountMetric(
      container,
      "不足額（目安維持率基準）",
      formatFxLossCutShortfall(metrics.targetShortfall)
    );
  }

  function updateResults() {
    resultArea.replaceChildren();
    const effectiveEquity = toNumberOrNull(equityInput.value);
    const scenarioRates = {};
    const invalidPairs = [];
    for (const [pair,input] of rateInputs.entries()) {
      const rate = toNumberOrNull(input.value);
      if (rate === null || rate <= 0) {
        invalidPairs.push(pair);
      } else {
        scenarioRates[pair] = rate;
      }
    }

    const uniformChangePct = toNumberOrNull(uniformInput.value);
    const uniformIsValid = uniformInput.value.trim() === "" ||
      (uniformChangePct !== null &&
       uniformChangePct >= -100 && uniformChangePct <= 1000);
    const result = calculateFxLossCut(appData,accountId,{
      effectiveEquity,
      effectiveEquityDate:initial.effectiveEquityDate,
      scenarioRates,
      ...(uniformIsValid && uniformInput.value.trim() !== ""
        ? {uniformChangePct}
        : {})
    });

    for (const warning of result.warnings) {
      resultArea.appendChild(el("div","help","警告：" + warning));
    }

    if (result.missing.length) {
      resultArea.appendChild(el(
        "div",
        "error",
        "計算できません。不足項目：" + result.missing.join("、")
      ));
    }
    if (invalidPairs.length) {
      resultArea.appendChild(el(
        "div",
        "error",
        "シナリオレートを正しく入力してください：" + invalidPairs.join("、")
      ));
    }
    if (!uniformIsValid) {
      resultArea.appendChild(el(
        "div",
        "error",
        "全ペア一律の変動率は−100%〜＋1,000%で入力してください。"
      ));
    }

    if (result.metrics && invalidPairs.length === 0) {
      const scenarioSection = el("section","fx-losscut-result-section");
      scenarioSection.appendChild(el("h3","","シナリオ結果"));
      appendResultBadge(scenarioSection);
      appendScenarioMetrics(scenarioSection,result.metrics);
      resultArea.appendChild(scenarioSection);
    }

    if (result.canCalculate) {
      const pairSection = el("section","fx-losscut-result-section");
      pairSection.appendChild(el("h3","","通貨ペアごとのロスカットレート"));
      appendResultBadge(pairSection);
      for (const pairResult of result.pairRates) {
        for (const root of pairResult.roots) {
          appendAccountMetric(
            pairSection,
            pairResult.pair + " ／ " + root.direction,
            root.rate === null
              ? root.status
              : formatFxLossCutRate(root.rate) + "（" + root.status + "）"
          );
        }
      }
      resultArea.appendChild(pairSection);

      const detailSection = el("section","fx-losscut-result-section");
      detailSection.appendChild(el("h3","","ロスカット時点の評価損益・有効証拠金"));
      appendResultBadge(detailSection);
      if (!result.lossCutAtDetails.length) {
        detailSection.appendChild(el("div","help","算出できるロスカットレートがありません。"));
      }
      for (const detail of result.lossCutAtDetails) {
        appendAccountMetric(
          detailSection,
          detail.pair + " ／ " + detail.direction + " 評価損益合計",
          formatFxLossCutYen(detail.exchangeProfit)
        );
        appendAccountMetric(
          detailSection,
          detail.pair + " ／ " + detail.direction + " 有効証拠金",
          formatFxLossCutYen(detail.effectiveEquity)
        );
      }
      resultArea.appendChild(detailSection);

      const uniformSection = el("section","fx-losscut-result-section");
      uniformSection.appendChild(el("h3","","全ペア一律変動率の逆算"));
      appendResultBadge(uniformSection);
      for (const direction of ["down","up"]) {
        const root = result.uniformRoots[direction];
        if (!root) continue;
        appendAccountMetric(
          uniformSection,
          direction === "down" ? "下落方向" : "上昇方向",
          root.percent === null
            ? root.status
            : formatFxLossCutPercent(root.percent)
        );
      }
      if (!result.uniformRoots.down && !result.uniformRoots.up) {
        uniformSection.appendChild(el("div","help","該当する探索方向がありません。"));
      }
      if (result.uniformScenario) {
        appendAccountMetric(
          uniformSection,
          "入力した一律変動率の維持率",
          formatFxLossCutRatio(result.uniformScenario.maintenanceRatio)
        );
        appendAccountMetric(
          uniformSection,
          "入力した一律変動率のロスカット判定",
          result.uniformScenario.isLossCut ? "ロスカット" : "ロスカットなし"
        );
      }
      resultArea.appendChild(uniformSection);
    }
  }

  equityInput.addEventListener("input",updateResults);
  for (const input of rateInputs.values()) {
    input.addEventListener("input",updateResults);
  }
  uniformInput.addEventListener("input",updateResults);
  updateResults();

  return card;
}