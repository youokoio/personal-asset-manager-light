"use strict";

/* ---------- FX画面 ---------- */

function renderFxManagementSection(accountId = null) {
  if (accountId !== null) {
    const account = appData.accounts.find(item =>
      item.id === accountId && item.type === "fx"
    );

    if (!account) return;

    app.appendChild(renderFxAggregateSection(account.id));
    app.appendChild(renderFxRateManagement(account));

    const entrySection = el("section","card");
    entrySection.appendChild(heading("建玉の登録"));
    entrySection.appendChild(makeFxPositionEntryButton(account));
    app.appendChild(entrySection);
    app.appendChild(renderFxSettlementSimulationEntry(account));
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
    section.appendChild(makeFxPositionEntryButton(account));
    app.appendChild(section);
  }
}

/* ---------- FX決済シミュレーション ---------- */

function renderFxSettlementSimulationEntry(account) {
  const card = el("section","card fx-settlement-entry");
  card.appendChild(heading("決済シミュレーション"));
  const open = makeButton("決済シミュレーションを開く","open-fx-settlement-simulation","secondary");
  open.addEventListener("click",() => {
    open.disabled = true;
    card.appendChild(renderFxSettlementSimulation(
      account.id,
      () => { open.disabled = false; }
    ));
  });
  card.appendChild(open);
  return card;
}

function appendFxSettlementSimulationLossCut(container,label,result) {
  if (!result || !result.canCalculate || !result.metrics) {
    const missing = result && result.missing && result.missing.length
      ? result.missing.join("、")
      : "計算に必要な建玉がありません。";
    container.appendChild(el("div","help",label + "：計算できません（" + missing + "）。"));
    return;
  }

  appendAccountMetric(container,label + "維持率",formatFxLossCutRatio(result.metrics.maintenanceRatio));
  const details = result.lossCutAtDetails || [];
  if (!details.length) {
    container.appendChild(el("div","help",label + "ロスカットレート：該当なし"));
    return;
  }
  for (const detail of details) {
    appendAccountMetric(
      container,
      label + " " + detail.pair + "ロスカットレート",
      formatFxLossCutRate(detail.rate)
    );
  }
}

function appendFxSettlementSimulationResult(container,result) {
  container.replaceChildren();
  container.appendChild(heading("試算結果"));

  for (const detail of result.details) {
    appendAccountMetric(
      container,
      detail.pair + " " + detail.side + " ／ " + detail.positionId,
      formatFxLossCutYen(detail.total),
      "為替損益 " + formatFxLossCutYen(detail.exchangeProfit) +
        " ／ スワップ " + formatFxLossCutYen(detail.swap)
    );
  }

  appendAccountMetric(container,"決済損益合計",formatFxLossCutYen(result.settlementPnl));
  appendAccountMetric(
    container,
    "税金目安",
    formatFxLossCutMoney(result.estimatedTax),
    "税率 " + result.taxRatePct + "%"
  );
  appendAccountMetric(container,"税引後利益",formatFxLossCutYen(result.afterTaxProfit));
  appendAccountMetric(
    container,
    "決済前の有効証拠金",
    Number.isFinite(result.currentEquity) ? formatFxLossCutYen(result.currentEquity) : "未入力"
  );
  appendAccountMetric(
    container,
    "決済後の有効証拠金",
    Number.isFinite(result.afterEquity) ? formatFxLossCutYen(result.afterEquity) : "未入力",
    result.deductTax ? "税金目安を差し引いた試算" : "税金目安を差し引かない試算"
  );

  appendFxSettlementSimulationLossCut(container,"決済前",result.beforeLossCut);
  appendFxSettlementSimulationLossCut(container,"決済後",result.afterLossCut);

  if (result.targetMaintenance && result.targetMaintenance.canCalculate) {
    appendAccountMetric(
      container,
      "目安ロスカットレート維持に必要な有効証拠金",
      formatFxLossCutYen(result.targetMaintenance.requiredEffectiveEquity),
      result.targetMaintenance.pair + " " + formatFxLossCutRate(result.targetMaintenance.rate)
    );
    appendAccountMetric(
      container,
      "決済後有効証拠金との差額",
      formatFxLossCutYen(result.targetMaintenance.difference),
      "マイナス：出金可能額 ／ プラス：追加入金額"
    );
  } else {
    container.appendChild(el(
      "div",
      "help",
      "目安ロスカットレート維持の必要額は、残りの建玉・通貨ペア・レートがそろうと計算できます。"
    ));
  }

  for (const warning of result.warnings) {
    container.appendChild(el("div","warning",warning));
  }
  container.appendChild(el("div","help","税率・損益通算・繰越控除は目安です。確定申告の前に税理士等へ確認してください。"));
  container.appendChild(el("div","help","この結果は試算のみです。建玉・履歴・口座残高などの保存データは変更されません。"));
}

function renderFxSettlementSimulation(accountId,onClose = null) {
  const card = el("section","card fx-settlement-simulation");
  const account = appData.accounts.find(item => item.id === accountId && item.type === "fx");
  if (!account) {
    card.appendChild(el("div","error","FX口座が見つかりません。"));
    return card;
  }

  card.appendChild(heading(account.name + " ／ 決済シミュレーション"));
  const close = makeButton("閉じる","close-fx-settlement-simulation","secondary small");
  close.addEventListener("click",() => {
    card.remove();
    if (typeof onClose === "function") onClose();
  });
  const closeActions = el("div","actions");
  closeActions.appendChild(close);
  card.appendChild(closeActions);

  const positions = getFxOpenPositions(appData,accountId);
  if (!positions.length) {
    card.appendChild(el("div","empty","保有中の建玉はありません。"));
    return card;
  }

  card.appendChild(el("div","help","決済する建玉を選択してください。決済レートは通貨ペアごとに設定します。"));
  const form = document.createElement("form");
  const pairs = Array.from(new Set(positions.map(item => item.pair))).sort();

  for (const pair of pairs) {
    const rateRecord = getFxRateRecord(appData,accountId,pair);
    form.appendChild(makeNumericField(
      pair + " 決済レート",
      "settlementRate_" + pair,
      rateRecord ? rateRecord.rate : "",
      {placeholder:"評価レートを入力"}
    ));
  }

  const estimate = calculateFxSwapEstimates(appData,accountId);
  const estimatedSwaps = new Map();
  if (estimate && Array.isArray(estimate.positions)) {
    for (const item of estimate.positions) {
      if (Number.isSafeInteger(item.currentSwap)) estimatedSwaps.set(item.positionId,item.currentSwap);
    }
  }

  for (const position of positions) {
    const row = el("section","fx-settlement-position");
    const label = el("label","fx-settlement-select");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.name = "selectedPositionId";
    check.value = position.id;
    label.append(check,el(
      "span",
      "",
      position.pair + " ／ " + position.side + " ／ " +
        formatFxQuantity(position.quantity) + " ／ 約定 " +
        formatFxLossCutRate(position.openRate)
    ));
    row.appendChild(label);

    const estimated = estimatedSwaps.get(position.id);
    const defaultSwap = Number.isSafeInteger(position.swap)
      ? position.swap
      : (Number.isSafeInteger(estimated) ? estimated : "");
    const swapHelp = Number.isSafeInteger(position.swap)
      ? "建玉に入力済みのスワップです。必要に応じて変更できます。"
      : (Number.isSafeInteger(estimated)
          ? "スワップ推定値を初期表示しています。必要に応じて変更できます。"
          : "推定値がないため、スワップを入力してください。");
    row.appendChild(makeNumericField(
      "決済スワップ（円）",
      "settlementSwap_" + position.id,
      defaultSwap,
      {placeholder:"整数の円",help:swapHelp}
    ));
    form.appendChild(row);
  }

  const before = calculateFxLossCut(appData,accountId);
  const defaultTarget = before.lossCutAtDetails && before.lossCutAtDetails.length
    ? before.lossCutAtDetails[0]
    : null;
  const defaultPair = defaultTarget ? defaultTarget.pair : pairs[0];
  const defaultRate = defaultTarget ? defaultTarget.rate : "";

  form.appendChild(makeSelectField(
    "維持する目安ロスカットレートの通貨ペア",
    "targetPair",
    pairs.map(pair => ({value:pair,label:pair})),
    defaultPair
  ));
  form.appendChild(makeNumericField(
    "維持する目安ロスカットレート",
    "targetRate",
    Number.isFinite(defaultRate) ? defaultRate : "",
    {placeholder:"レートを入力"}
  ));

  const taxField = el("div","field");
  const taxLabel = el("label","");
  const taxCheck = document.createElement("input");
  taxCheck.type = "checkbox";
  taxCheck.name = "deductTax";
  taxCheck.value = "yes";
  taxLabel.append(taxCheck,document.createTextNode("税金目安を決済後の有効証拠金から差し引く"));
  taxField.appendChild(taxLabel);
  taxField.appendChild(el("div","help","初期状態では差し引きません。"));
  form.appendChild(taxField);

  const preview = makeButton("この条件で試算","calculate-fx-settlement-simulation","primary");
  form.appendChild(preview);
  const resultArea = el("section","fx-settlement-simulation-result");
  form.appendChild(resultArea);

  preview.addEventListener("click",() => {
    try {
      const values = new FormData(form);
      const selectedIds = values.getAll("selectedPositionId");
      const rates = {};
      for (const pair of pairs) {
        rates[pair] = toNumberOrNull(String(values.get("settlementRate_" + pair) || "").trim());
      }
      const swaps = {};
      for (const position of positions) {
        if (!selectedIds.includes(position.id)) continue;
        swaps[position.id] = toNumberOrNull(
          String(values.get("settlementSwap_" + position.id) || "").trim()
        );
      }
      const targetRateRaw = String(values.get("targetRate") || "").trim();
      const targetRate = targetRateRaw === "" ? null : toNumberOrNull(targetRateRaw);
      const result = calculateFxSettlementSimulation(
        appData,
        accountId,
        selectedIds,
        rates,
        swaps,
        {
          deductTax:values.get("deductTax") === "yes",
          targetPair:String(values.get("targetPair") || ""),
          targetRate
        }
      );
      appendFxSettlementSimulationResult(resultArea,result);
    } catch (error) {
      resultArea.replaceChildren(el("div","error",error.message || "決済シミュレーションを計算できませんでした。"));
    }
  });

  card.appendChild(form);
  return card;
}