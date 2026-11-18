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

function renderFxSwapRegistrationForm(row) {
  const form = document.createElement("form");
  form.className = "fx-swap-registration-form";
  form.appendChild(el("h4","","集計スワップ登録"));
  form.appendChild(makeNumericField("累計スワップ（円）","total","",{placeholder:"整数で入力"}));
  form.appendChild(makeField("登録日","asOfDate","",{type:"date",required:true}));
  form.appendChild(el("div","help","初回登録は基準額として保存します。2回目以降は前回基準額との差額を、保有中の建玉数量に応じて配分します。"));
  const previewButton = document.createElement("button");
  previewButton.type = "button";
  previewButton.textContent = "配分を試算";
  form.appendChild(previewButton);
  const previewArea = el("div","fx-swap-preview");
  form.appendChild(previewArea);
  let currentPreview = null;
  previewButton.addEventListener("click",() => {
    const values = new FormData(form);
    const rawTotal = String(values.get("total") || "").trim();
    const rawDate = String(values.get("asOfDate") || "").trim();
    const total = toNumberOrNull(rawTotal);
    if (rawTotal === "" || total === null || !Number.isSafeInteger(total)) {
      showMessage("累計スワップは整数の円で入力してください。",true);
      return;
    }
    if (!isValidFxPositionAsOfDate(rawDate)) {
      showMessage("登録日を正しく入力してください。",true);
      return;
    }
    try {
      currentPreview = calculateFxSwapRegistrationPreview(appData,row.accountId,row.pair,row.side,total,rawDate);
      previewArea.replaceChildren();
      appendAccountMetric(previewArea,"前回基準額",formatSignedYen(currentPreview.baseline));
      appendAccountMetric(previewArea,"今回増加額",formatSignedYen(currentPreview.increase));
      appendAccountMetric(previewArea,"配分状態",currentPreview.status,currentPreview.reason || "");
      for (const allocation of currentPreview.allocations) {
        const position = appData.fxPositions.find(item => item.id === allocation.positionId);
        appendAccountMetric(previewArea,position ? "建玉 " + position.id : "建玉",formatSignedYen(allocation.amount));
      }
      const allocationTotal = currentPreview.allocations.reduce((sum,item) => sum + item.amount,0);
      appendAccountMetric(previewArea,"配分合計",formatSignedYen(allocationTotal));
      const saveButton = document.createElement("button");
      saveButton.type = "submit";
      saveButton.textContent = "この内容で登録";
      previewArea.appendChild(saveButton);
      showMessage("配分プレビューを作成しました。");
    } catch (error) {
      currentPreview = null;
      previewArea.replaceChildren();
      showMessage(error.message || "配分を試算できませんでした。",true);
    }
  });
  form.addEventListener("submit",event => {
    event.preventDefault();
    if (!currentPreview) {
      showMessage("先に配分を試算してください。",true);
      return;
    }
    try {
      const values = new FormData(form);
      const total = toNumberOrNull(String(values.get("total") || "").trim());
      const asOfDate = String(values.get("asOfDate") || "").trim();
      const freshPreview = calculateFxSwapRegistrationPreview(appData,row.accountId,row.pair,row.side,total,asOfDate);
      if (JSON.stringify(freshPreview) !== JSON.stringify(currentPreview)) {
        currentPreview = null;
        previewArea.replaceChildren();
        throw new Error("入力内容または建玉がプレビュー後に変わりました。もう一度試算してください。");
      }
      const nextData = buildFxSwapRegistrationData(appData,freshPreview);
      validateData(nextData);
      const storedData = localStorage.getItem("pam2");
      if (storedData === null) {
        throw new Error("保存データが見つからないため、登録を中止しました。");
      }
      localStorage.setItem("pam2_pre_fxswap",storedData);
      saveData(nextData);
      appData = nextData;
      showMessage("集計スワップを登録しました。");
      render();
    } catch (error) {
      showMessage(error.message || "集計スワップを登録できませんでした。",true);
    }
  });
  return form;
}

function appendFxSwapGroupWarning(container,row) {
  const result = calculateFxSwapGroupReconciliation(appData,row.accountId,row.pair,row.side);
  if (result && result.warning) {
    container.appendChild(el("div","warning","建玉スワップ合計と集計スワップに " + formatSignedYen(result.difference) + " の差があります。自動修正はしていません。"));
  }
}

function appendFxSwapAccountWarning(container,accountId) {
  const result = calculateFxSwapAccountReconciliation(appData,accountId);
  if (result && result.warning) {
    container.appendChild(el("div","warning","口座スワップ合計と通貨ペア別集計に " + formatSignedYen(result.difference) + " の差があります。自動修正はしていません。"));
  }
}

function addFxLedgerOnlyRows(rows,accountId = null) {
  const existing = new Set(rows.map(row => JSON.stringify([row.accountId,row.pair,row.side])));
  const groups = new Map();
  for (const ledger of appData.fxSwapLedger) {
    if (!Object.prototype.hasOwnProperty.call(ledger,"total") || (accountId !== null && ledger.accountId !== accountId)) continue;
    const key = JSON.stringify([ledger.accountId,ledger.pair,ledger.side]);
    if (!groups.has(key)) groups.set(key,{accountId:ledger.accountId,pair:ledger.pair,side:ledger.side});
  }
  for (const group of groups.values()) {
    const key = JSON.stringify([group.accountId,group.pair,group.side]);
    if (existing.has(key)) continue;
    const latest = getLatestFxSwapRegistration(appData,group.accountId,group.pair,group.side);
    if (!latest) continue;
    rows.push({
      accountId:group.accountId,
      accountName:getFxAccountName(group.accountId),
      pair:group.pair,
      side:group.side,
      quantity:0,
      positionCount:0,
      averageOpenRate:null,
      evaluationRate:null,
      evaluationRateDate:null,
      exchangeProfit:null,
      swapTotal:latest.total,
      evaluationPnl:null
    });
  }
  return rows;
}

function renderFxSwapEstimateCard(accountId) {
  const card = el("section","card");
  const account = appData.accounts.find(item =>
    item.id === accountId && item.type === "fx"
  );
  if (!account) return card;

  card.appendChild(heading(account.name + " ／ スワップ推定"));
  const initial = calculateFxSwapEstimates(appData,accountId);
  const dateField = makeField(
    "推定対象日",
    "targetDate",
    initial.baseDate || "",
    {type:"date"}
  );
  const dateInput = dateField.querySelector("input");
  card.appendChild(dateField);
  const resultArea = el("div","fx-swap-estimate-results");
  card.appendChild(resultArea);

  function updateEstimate() {
    resultArea.replaceChildren();
    const result = calculateFxSwapEstimates(
      appData,
      accountId,
      dateInput ? dateInput.value : null
    );
    if (result.status !== "計算済") {
      resultArea.appendChild(el(
        "div",
        result.status === "入力エラー" ? "error" : "help",
        result.reason || "スワップを推定できません。"
      ));
      return;
    }

    appendAccountMetric(resultArea,"基準日",result.baseDate);
    appendAccountMetric(
      resultArea,
      "口座累計スワップ",
      formatSignedYen(Math.trunc(result.accountTotal))
    );
    appendAccountMetric(
      resultArea,
      "建玉入力済みスワップ合計",
      formatSignedYen(Math.trunc(result.positionInputTotal))
    );
    appendAccountMetric(
      resultArea,
      "口座との差額",
      formatSignedYen(Math.trunc(result.accountDifference))
    );
    appendAccountMetric(
      resultArea,
      "指定日の推定合計",
      result.totalAtDate === null
        ? "算出できません"
        : formatSignedYen(Math.trunc(result.totalAtDate))
    );

    if (result.unallocatedDifference !== 0) {
      appendAccountMetric(
        resultArea,
        "未配分差額",
        formatSignedYen(Math.trunc(result.unallocatedDifference))
      );
    }

    resultArea.appendChild(el(
      "div",
      "help",
      "口座との差額には決済済み建玉分が含まれる可能性があります。推定値は表示のみで、保存されません。"
    ));

    for (const position of result.positions) {
      const label = position.pair + " ／ " + position.side +
        (position.isEstimated ? " ／ 推定" : "");
      appendAccountMetric(
        resultArea,
        label,
        position.targetSwap === null
          ? "算出できません"
          : formatSignedYen(Math.trunc(position.targetSwap))
      );
    }
  }

  if (dateInput) {
    dateInput.addEventListener("change",updateEstimate);
  }
  updateEstimate();
  return card;
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

  const latestSwap = getLatestFxSwapRegistration(appData,row.accountId,row.pair,row.side);
  if (latestSwap && latestSwap.status === "未配分") {
    appendAccountMetric(card,"未配分",formatSignedYen(latestSwap.increase),latestSwap.reason || "");
  }
  appendFxSwapGroupWarning(card,row);

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
  card.appendChild(renderFxSwapRegistrationForm(row));

  return card;
}

function renderFxAggregateSection(accountId = null) {
  const section = el("section","card");
  section.appendChild(heading("通貨ペア別建玉集計"));

  const rows = addFxLedgerOnlyRows(
    calculateFxAggregateRows(appData).filter(row =>
      accountId === null || row.accountId === accountId
    ),
    accountId
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
    for (const account of appData.accounts.filter(item => item.type === "fx")) {
      appendFxSwapAccountWarning(section,account.id);
    }
  }

  const estimateAccounts = appData.accounts.filter(item =>
    item.type === "fx" &&
    (accountId === null || item.id === accountId)
  );
  for (const account of estimateAccounts) {
    section.appendChild(renderFxSwapEstimateCard(account.id));
  }

  if (accountId !== null) {
    appendFxSwapAccountWarning(section,accountId);
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