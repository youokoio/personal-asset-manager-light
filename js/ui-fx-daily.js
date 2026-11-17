
"use strict";

/* ---------- FX日次入力 UI ---------- */

function getFxDailyPairs(accountId,existing=null) {
  const pairs = new Set();

  for (const position of getFxOpenPositions(appData)) {
    if (position.accountId === accountId) {
      pairs.add(position.pair);
    }
  }

  for (const rate of appData.fxRates) {
    if (rate.accountId === accountId) {
      pairs.add(rate.pair);
    }
  }

  if (existing && existing.rates && typeof existing.rates === "object") {
    for (const pair of Object.keys(existing.rates)) pairs.add(pair);
  }

  return [...pairs].sort((a,b) => a.localeCompare(b));
}

function getFxDailyPreviousSnapshot(accountId,targetDate) {
  return appData.snapshots
    .filter(snapshot =>
      snapshot.accountId === accountId &&
      snapshot.asOfDate < targetDate
    )
    .sort((a,b) =>
      b.asOfDate.localeCompare(a.asOfDate) ||
      String(b.recordedAt || "").localeCompare(String(a.recordedAt || ""))
    )[0] || null;
}

function getFxDailyPreviousValue(accountId,field,targetDate) {
  const previous = getFxDailyPreviousSnapshot(
    accountId,
    targetDate
  );

  return previous && previous[field] !== undefined
    ? previous[field]
    : null;
}

function getFxDailyOtherAccountRate(accountId,pair) {
  const accountOrder = appData.accounts.filter(account =>
    account.type === "fx" && account.id !== accountId
  );

  for (const account of accountOrder) {
    const record = getFxRateRecord(
      appData,
      account.id,
      pair
    );

    if (record &&
        Number.isFinite(record.rate) &&
        record.rate > 0) {
      return {
        accountName:account.name,
        rate:record.rate,
        asOfDate:record.asOfDate || null
      };
    }
  }

  return null;
}

function makeFxDailyApplyButton(label,value,target) {
  const button = makeButton(label,"fx-daily-apply","secondary");
  button.dataset.target = target;
  button.dataset.value = value === null ||
    value === undefined
      ? ""
      : String(value);
  return button;
}

function appendFxDailyPreviousValue(
  wrapper,
  accountId,
  field,
  targetDate,
  targetName
) {
  const value = getFxDailyPreviousValue(
    accountId,
    field,
    targetDate
  );

  const note = el(
    "div",
    "help fx-daily-previous",
    "前回値：" +
      (value === null ? "未入力" : formatYen(value))
  );

  if (value !== null) {
    note.appendChild(makeFxDailyApplyButton(
      "反映",
      value,
      targetName
    ));
  }

  wrapper.appendChild(note);
}

function renderFxDailyRateFields(account,existing,targetDate) {
  const section = el("section","fx-daily-rates");
  section.appendChild(el("h4","","通貨ペアごとの評価レート"));

  const pairs = getFxDailyPairs(account.id,existing);
  const existingRates = existing && existing.rates &&
    typeof existing.rates === "object"
      ? existing.rates
      : {};

  for (const pair of pairs) {
    const field = makeField(
      pair,
      "rate_" + pair,
      Object.prototype.hasOwnProperty.call(existingRates,pair)
        ? existingRates[pair]
        : "",
      {placeholder:"評価レート"}
    );

    const input = field.querySelector("input");
    input.dataset.fxPair = pair;

    const previous = getFxDailyPreviousSnapshot(
      account.id,
      targetDate
    );
    const previousRate = previous &&
      previous.rates &&
      Number.isFinite(previous.rates[pair])
        ? previous.rates[pair]
        : null;

    if (previousRate !== null) {
      field.appendChild(el(
        "div",
        "help",
        "前回値：" + previousRate
      ));
      field.appendChild(makeFxDailyApplyButton(
        "前回値を反映",
        previousRate,
        input.name
      ));
    }

    const other = getFxDailyOtherAccountRate(
      account.id,
      pair
    );

    if (other) {
      field.appendChild(el(
        "div",
        "help",
        "他口座（" + other.accountName + "）：" +
          other.rate +
          (other.asOfDate ? " ／ " + other.asOfDate : "")
      ));
      field.appendChild(makeFxDailyApplyButton(
        "他口座の値を反映",
        other.rate,
        input.name
      ));
    }

    section.appendChild(field);
  }

  if (!pairs.length) {
    section.appendChild(el(
      "div",
      "help",
      "評価レートを入力できる通貨ペアがありません。"
    ));
  }

  return section;
}

function formatFxDailyWeekday(dateValue) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ""))) return "";
  const parts = dateValue.split("-").map(Number);
  const date = new Date(parts[0],parts[1]-1,parts[2]);
  if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1]-1 || date.getDate() !== parts[2]) return "";
  return ["日","月","火","水","木","金","土"][date.getDay()];
}

function updateFxDailyWeekday(form) {
  const input = form.elements.namedItem("asOfDate");
  const label = form.querySelector('[data-role="fx-daily-weekday"]');
  if (label) label.textContent = formatFxDailyWeekday(input ? input.value : "") + "曜日";
}

function refreshFxDailyPreviousValues(form,account,targetDate) {
  const mapping = [
    ["swapTotal","swapTotal"],
    ["effectivePrincipal","effectivePrincipal"],
    ["pnl","pnl"],
    ["realizedPnlDaily","realizedPnlDaily"],
    ["value","value"]
  ];
  for (const [name,field] of mapping) {
    const input = form.elements.namedItem(name);
    if (!input) continue;
    const wrapper = input.closest(".field");
    if (!wrapper) continue;
    const old = wrapper.querySelector(".fx-daily-previous");
    if (old) old.remove();
    appendFxDailyPreviousValue(wrapper,account.id,field,targetDate,name);
  }
}

function updateFxDailySettlementNote(form,account,targetDate) {
  const note = form.querySelector('[data-role="fx-daily-settlement-note"]');
  if (!note) return;
  const previous = getFxDailyPreviousSnapshot(account.id,targetDate);
  const settled = appData.fxPositions.filter(position =>
    position.accountId === account.id &&
    position.status === "決済済" &&
    previous &&
    position.closeDate > previous.asOfDate &&
    position.closeDate <= targetDate
  );
  note.textContent = settled.length
    ? "前回履歴以降に決済した建玉があります。口座残高が変わっている可能性があります。"
    : "";
}

function renderFxDailyInputForm(account) {
  const form = document.createElement("form");
  form.id = "fx-daily-input-form";
  form.appendChild(el("h3","","日々の入力"));

  const dateField = makeField(
    "対象日",
    "asOfDate",
    localDateString(),
    {type:"date",required:true}
  );
  dateField.classList.add("snapshot-date-field");
  const weekday = el("span","help");
  weekday.dataset.role = "fx-daily-weekday";
  dateField.appendChild(weekday);
  form.appendChild(dateField);
  updateFxDailyWeekday(form);

  form.appendChild(renderFxDailyRateFields(
    account,
    null,
    localDateString()
  ));

  const fieldDefinitions = [
    ["累計スワップ（未決済・円）","swapTotal"],
    ["有効元本（円）","effectivePrincipal"],
    ["評価損益（円）","pnl"],
    ["その日の確定損益（円・任意）","realizedPnlDaily"],
    ["総資産（円）","value"]
  ];

  for (const [label,name] of fieldDefinitions) {
    const previousField = name === "value"
      ? "value"
      : name;

    const field = makeField(
      label,
      name,
      "",
      {required:name === "value"}
    );

    appendFxDailyPreviousValue(
      field,
      account.id,
      previousField,
      localDateString(),
      name
    );

    form.appendChild(field);
  }

  const warning = el(
    "div",
    "help",
    "累計スワップは手入力です。この入力欄では自動計算しません。"
  );
  form.appendChild(warning);

  form.appendChild(el(
    "div",
    "help",
    "前回の履歴より後に決済した建玉がある場合、口座残高が変わっている可能性があります。"
  ));

  const settlementNote = el("div","help");
  settlementNote.dataset.role = "fx-daily-settlement-note";
  form.appendChild(settlementNote);

  const estimate = el("div","help");
  estimate.dataset.role = "fx-daily-estimate";
  estimate.textContent = "総資産の目安：入力後に計算できます。";
  form.appendChild(estimate);

  const actions = el("div","actions");
  const estimateButton = makeButton(
    "総資産の目安を反映",
    "fx-daily-estimate",
    "secondary"
  );
  actions.appendChild(estimateButton);

  const pnlButton = makeButton(
    "評価損益の計算値を反映",
    "fx-daily-pnl",
    "secondary"
  );
  actions.appendChild(pnlButton);

  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "日々の入力を保存";
  actions.appendChild(save);
  form.appendChild(actions);

  form.addEventListener("click",event => {
    const button = event.target.closest(
      'button[data-action="fx-daily-apply"]'
    );

    if (button) {
      const target = form.elements.namedItem(
        button.dataset.target
      );

      if (target) {
        target.value = button.dataset.value;
        target.dispatchEvent(new Event("input",{bubbles:true}));
      }
      return;
    }

    if (event.target.closest(
      'button[data-action="fx-daily-estimate"]'
    )) {
      const result = calculateFxDailyEstimateFromForm(
        form,
        account
      );

      estimate.textContent = result.missing.length
        ? "総資産の目安を計算できません。不足：" +
          result.missing.join("、")
        : "総資産の目安：" + formatYen(result.value);

      if (!result.missing.length) {
        form.elements.namedItem("value").value =
          String(result.value);
      }
      return;
    }

    if (event.target.closest(
      'button[data-action="fx-daily-pnl"]'
    )) {
      const result = calculateFxDailyEstimateFromForm(
        form,
        account
      );

      if (result.exchangeProfit !== null) {
        form.elements.namedItem("pnl").value =
          String(result.exchangeProfit);
      }
    }
  });

  updateFxDailySettlementNote(form,account,localDateString());

  form.elements.namedItem("asOfDate").addEventListener(
    "change",
    () => {
      const date = form.elements.namedItem("asOfDate").value;
      updateFxDailyWeekday(form);
      refreshFxDailyPreviousValues(form,account,date);
      updateFxDailySettlementNote(form,account,date);

      const rateSection = form.querySelector(".fx-daily-rates");
      const currentRates = readFxRatesFromForm(form);
      const replacement = renderFxDailyRateFields(
        account,
        {rates:currentRates},
        date
      );
      rateSection.replaceWith(replacement);
    }
  );

  form.addEventListener("submit",event => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    saveFxDailyForm(form,account);
  });

  return form;
}

function calculateFxDailyEstimateFromForm(form,account) {
  const values = new FormData(form);
  const rates = {};

  for (const pair of getFxDailyPairs(account.id)) {
    const rate = toNumberOrNull(values.get("rate_" + pair));
    if (rate !== null) rates[pair] = rate;
  }

  const temporaryData = JSON.parse(JSON.stringify(appData));

  for (const [pair,rate] of Object.entries(rates)) {
    const record = getFxRateRecord(
      temporaryData,
      account.id,
      pair
    );

    if (record) {
      record.rate = rate;
    } else {
      temporaryData.fxRates.push({
        accountId:account.id,
        pair,
        rate,
        asOfDate:String(values.get("asOfDate") || "")
      });
    }
  }

  const rows = calculateFxAggregateRows(temporaryData).filter(
    row => row.accountId === account.id
  );

  let exchangeProfit = 0;
  let exchangeProfitAvailable = true;

  for (const row of rows) {
    if (!Number.isFinite(row.exchangeProfit)) {
      exchangeProfitAvailable = false;
      break;
    }
    exchangeProfit += row.exchangeProfit;
  }

  const principal = toNumberOrNull(
    values.get("effectivePrincipal")
  );
  const swap = toNumberOrNull(values.get("swapTotal"));

  const result = calculateFxDailyEstimatedTotal(
    {
      ...temporaryData,
      fxRates:temporaryData.fxRates
    },
    account.id,
    principal,
    swap
  );

  if (!exchangeProfitAvailable) {
    result.exchangeProfit = null;
    result.value = null;
    if (!result.missing.includes("評価レート")) {
      result.missing.push("評価レート");
    }
  } else if (result.missing.length === 0) {
    result.exchangeProfit = exchangeProfit;
    result.value = principal + exchangeProfit + swap;
  }

  return result;
}

/* ---------- 履歴フォームへの評価レート追加 ---------- */

const renderSnapshotFormBeforeFxDaily = renderSnapshotForm;

renderSnapshotForm = function(account) {
  const form = renderSnapshotFormBeforeFxDaily(account);

  if (!account || account.type !== "fx") return form;

  const existing = editingSnapshotId
    ? appData.snapshots.find(snapshot =>
        snapshot.id === editingSnapshotId
      )
    : null;

  const dateInput = form.elements.namedItem("asOfDate");
  const targetDate = dateInput
    ? dateInput.value
    : localDateString();

  const weekday = el("span","help");
  weekday.dataset.role = "fx-daily-weekday";
  if (dateInput && dateInput.parentElement) dateInput.parentElement.appendChild(weekday);
  updateFxDailyWeekday(form);

  form.appendChild(renderFxDailyRateFields(
    account,
    existing,
    targetDate
  ));

  if (dateInput) {
    dateInput.addEventListener("change",() => {
      const currentRates = readFxRatesFromForm(form);
      updateFxDailyWeekday(form);
      const rateSection = form.querySelector(".fx-daily-rates");
      if (rateSection) {
        rateSection.replaceWith(renderFxDailyRateFields(
          account,
          {rates:currentRates},
          dateInput.value
        ));
      }
    });
  }

  form.addEventListener("submit",event => {
    if (event.eventPhase !== Event.CAPTURING &&
        event.eventPhase !== Event.AT_TARGET) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (!form.reportValidity()) return;

    saveFxSnapshotHistoryForm(form,account);
  },true);

  return form;
};

/* ---------- FX履歴の保存 ---------- */

function readFxRatesFromForm(form) {
  const rates = {};

  for (const input of form.querySelectorAll("[data-fx-pair]")) {
    const value = toNumberOrNull(input.value);

    if (value !== null) {
      rates[input.dataset.fxPair] = value;
    }
  }

  return rates;
}

function saveFxSnapshotHistoryForm(form,account) {
  const values = new FormData(form);
  const asOfDate = String(values.get("asOfDate") || "");
  const value = toNumberOrNull(values.get("value"));

  if (!isValidFxDateForStorage(asOfDate) || value === null) {
    showMessage("対象日と総資産を正しく入力してください。",true);
    render();
    return;
  }

  const now = new Date().toISOString();
  const nextData = JSON.parse(JSON.stringify(appData));
  const existing = editingSnapshotId
    ? nextData.snapshots.find(snapshot =>
        snapshot.id === editingSnapshotId
      )
    : null;

  if (editingSnapshotId && !existing) {
    showMessage("編集対象の履歴が見つかりません。",true);
    render();
    return;
  }

  const duplicate = nextData.snapshots.some(item =>
    item.accountId === account.id &&
    item.asOfDate === asOfDate &&
    item.id !== (existing ? existing.id : null)
  );

  if (duplicate && !confirm("同じ口座・対象日の履歴があります。新しい履歴として保存しますか？")) {
    return;
  }

  const snapshot = {
    ...(existing || {}),
    id:editingSnapshotId || createId(),
    accountId:account.id,
    asOfDate,
    recordedAt:now,
    value,
    cash:existing ? existing.cash ?? null : null,
    pnl:toNumberOrNull(values.get("pnl")),
    principal:existing ? existing.principal ?? null : null,
    cumulativeInvested:existing
      ? existing.cumulativeInvested ?? null
      : null,
    effectivePrincipal:toNumberOrNull(
      values.get("effectivePrincipal")
    ),
    realizedPnlTotal:toNumberOrNull(
      values.get("realizedPnlTotal")
    ),
    realizedPnlDaily:toNumberOrNull(
      values.get("realizedPnlDaily")
    ),
    swapTotal:toNumberOrNull(values.get("swapTotal")),
    requiredMargin:toNumberOrNull(
      values.get("requiredMargin")
    ),
    rates:readFxRatesFromForm(form),
    memo:String(values.get("memo") || "")
  };

  if (existing) {
    const index = nextData.snapshots.findIndex(item => item.id === existing.id);
    nextData.snapshots[index] = snapshot;
  } else {
    nextData.snapshots.push(snapshot);
  }
  nextData.accounts.find(item =>
    item.id === account.id
  ).updatedAt = now;

  updateFxDailyRatesInData(
    nextData,
    account.id,
    asOfDate,
    snapshot.rates,
    now
  );

  persistFxDailyData(nextData);
}

function saveFxDailyForm(form,account) {
  const values = new FormData(form);
  const asOfDate = String(values.get("asOfDate") || "");
  const value = toNumberOrNull(values.get("value"));

  if (!isValidFxDateForStorage(asOfDate) || value === null) {
    showMessage("対象日と総資産を正しく入力してください。",true);
    return;
  }

  const duplicate = appData.snapshots.some(snapshot =>
    snapshot.accountId === account.id &&
    snapshot.asOfDate === asOfDate
  );

  if (duplicate &&
      !confirm("同じ口座・対象日の履歴があります。新しい履歴として追加しますか？")) {
    return;
  }

  const rates = readFxRatesFromForm(form);
  const now = new Date().toISOString();
  const nextData = JSON.parse(JSON.stringify(appData));

  nextData.snapshots.push({
    id:createId(),
    accountId:account.id,
    asOfDate,
    recordedAt:now,
    value,
    cash:null,
    pnl:toNumberOrNull(values.get("pnl")),
    principal:null,
    cumulativeInvested:null,
    effectivePrincipal:toNumberOrNull(
      values.get("effectivePrincipal")
    ),
    realizedPnlTotal:null,
    realizedPnlDaily:toNumberOrNull(
      values.get("realizedPnlDaily")
    ),
    swapTotal:toNumberOrNull(values.get("swapTotal")),
    requiredMargin:null,
    rates,
    memo:""
  });

  nextData.accounts.find(item =>
    item.id === account.id
  ).updatedAt = now;

  updateFxDailyRatesInData(
    nextData,
    account.id,
    asOfDate,
    rates,
    now
  );

  persistFxDailyData(nextData);
}

function updateFxDailyRatesInData(
  data,
  accountId,
  targetDate,
  rates,
  now
) {
  for (const [pair,rate] of Object.entries(rates)) {
    if (!canUpdateFxDailyRate(
      data,
      accountId,
      pair,
      targetDate
    )) {
      continue;
    }

    const record = getFxRateRecord(data,accountId,pair);

    if (record) {
      record.rate = rate;
      record.asOfDate = targetDate;
      record.updatedAt = now;
    } else {
      data.fxRates.push({
        accountId,
        pair,
        rate,
        asOfDate:targetDate,
        updatedAt:now
      });
    }
  }
}

function persistFxDailyData(nextData) {
  try {
    validateData(nextData);
    saveData(nextData);
    appData = nextData;
    editingSnapshotId = null;
    showMessage("保存しました。");
  } catch (error) {
    showMessage(error.message || "保存に失敗しました。",true);
  }

  render();
}

/* ---------- 口座詳細への日々の入力欄追加 ---------- */

const renderAccountDetailBeforeFxDaily = renderAccountDetail;

renderAccountDetail = function() {
  renderAccountDetailBeforeFxDaily();

  const account = appData.accounts.find(item =>
    item.id === selectedAccountId
  );

  if (!account || account.type !== "fx") return;

  const snapshotForm = document.getElementById("snapshot-form");
  if (!snapshotForm) return;

  const formCard = snapshotForm.parentElement;
  const dailyCard = el("section","card");
  dailyCard.appendChild(renderFxDailyInputForm(account));

  app.insertBefore(dailyCard,formCard);
};

/* ---------- S5g：FX口座詳細の6区分表示 ---------- */

function appendFxAccountLatestStateS5g(account) {
  const section = el("section","card");
  section.appendChild(el("h3","","最新状態"));

  const latest = getLatestSnapshot(appData,account.id);
  const positions = getFxOpenPositions(appData,account.id);
  const rows = calculateFxAggregateRows(appData).filter(row =>
    row.accountId === account.id
  );

  appendAccountMetric(
    section,
    "最新総資産",
    latest && isFiniteMetricValue(latest.value)
      ? formatYen(latest.value)
      : "未入力",
    latest && latest.asOfDate
      ? "対象日：" + formatDateWithWeekday(latest.asOfDate)
      : "履歴なし"
  );

  appendAccountMetric(
    section,
    "累計スワップ",
    latest && isFiniteMetricValue(latest.swapTotal)
      ? formatSignedYen(latest.swapTotal)
      : "未入力"
  );

  const evaluationProfit = rows.every(row =>
    Number.isFinite(row.exchangeProfit)
  )
    ? rows.reduce((sum,row) => sum + row.exchangeProfit,0)
    : null;

  appendAccountMetric(
    section,
    "建玉の評価損益",
    evaluationProfit === null
      ? "評価レート未入力"
      : formatSignedYen(evaluationProfit)
  );

  appendAccountMetric(
    section,
    "保有中建玉数",
    positions.length.toLocaleString("ja-JP")
  );

  const pairGroups = new Map();
  for (const position of positions) {
    const key = position.pair + " ／ " + position.side;
    if (!pairGroups.has(key)) pairGroups.set(key,[]);
    pairGroups.get(key).push(position);
  }

  for (const [key,items] of pairGroups) {
    const quantity = items.reduce(
      (sum,item) => sum + item.quantity,
      0
    );
    const weightedRate = items.reduce(
      (sum,item) => sum + item.quantity * item.openRate,
      0
    );
    appendAccountMetric(
      section,
      key + " 平均約定レート",
      quantity > 0
        ? (weightedRate / quantity).toLocaleString("ja-JP",{
            maximumFractionDigits:6
          })
        : "未計算"
    );
  }

  section.appendChild(renderFxLossCutBlock(appData,account.id));

  const realized = getFxRealizedAt(
    appData,
    account.id,
    localDateString()
  );
  const realizedCard = el("section","fx-account-realized");
  realizedCard.appendChild(el("h4","","累積確定損益"));
  appendAccountMetric(
    realizedCard,
    "累積確定損益",
    realized && isFiniteMetricValue(realized.value)
      ? formatSignedYen(realized.value)
      : "未入力",
    realized && realized.baseSource && realized.baseDate
      ? "基準：" + realized.baseSource + " " +
        formatDateWithWeekday(realized.baseDate)
      : ""
  );
  appendFxRealizedWarnings(realizedCard,realized);
  section.appendChild(realizedCard);

  return section;
}

function renderFxAccountPairSectionS5g(account) {
  const section = el("section","card");
  section.appendChild(el("h3","","通貨ペア別"));

  const rows = calculateFxAggregateRows(appData).filter(row =>
    row.accountId === account.id
  );

  if (!rows.length) {
    section.appendChild(el("div","empty","保有中の建玉はありません。"));
    return section;
  }

  const table = document.createElement("table");
  const head = document.createElement("thead");
  const header = document.createElement("tr");

  for (const label of [
    "通貨ペア",
    "売買",
    "数量",
    "平均約定レート",
    "評価レート",
    "評価損益"
  ]) {
    const cell = document.createElement("th");
    cell.textContent = label;
    header.appendChild(cell);
  }

  head.appendChild(header);
  table.appendChild(head);

  const body = document.createElement("tbody");

  for (const row of rows) {
    const tr = document.createElement("tr");
    const values = [
      row.pair,
      row.side,
      formatFxQuantity(row.quantity),
      row.averageOpenRate === null
        ? "未計算"
        : row.averageOpenRate.toLocaleString("ja-JP",{
            maximumFractionDigits:6
          }),
      row.evaluationRate === null
        ? "未入力"
        : row.evaluationRate.toLocaleString("ja-JP",{
            maximumFractionDigits:6
          }),
      row.exchangeProfit === null
        ? "未計算"
        : formatSignedYen(row.exchangeProfit)
    ];

    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      tr.appendChild(cell);
    }

    body.appendChild(tr);
  }

  table.appendChild(body);
  section.appendChild(table);
  return section;
}

function renderFxAccountOpenPositionRowS5g(account,position) {
  const details = document.createElement("details");
  details.className = "fx-account-position";

  const summary = document.createElement("summary");
  summary.textContent =
    position.pair + " ／ " +
    position.side + " ／ " +
    formatFxQuantity(position.quantity) + " ／ " +
    formatDateWithWeekday(String(position.openDate || "").slice(0,10));
  details.appendChild(summary);

  const content = el("div","fx-account-position-detail");

  appendAccountMetric(
    content,
    "約定レート",
    formatFxRateValue(position.openRate)
  );
  appendAccountMetric(
    content,
    "累計スワップ",
    position.swap === null
      ? "未入力"
      : formatSignedYen(position.swap)
  );
  appendAccountMetric(
    content,
    "データ確認日",
    position.asOfDate
      ? formatDateWithWeekday(position.asOfDate)
      : "未入力"
  );

  const actions = el("div","actions");

  const edit = makeButton(
    "編集",
    "edit-fx-position",
    "secondary small"
  );
  edit.addEventListener("click",() => {
    content.appendChild(renderFxPositionForm(
      account.id,
      position.pair,
      position.side,
      position
    ));
  });
  actions.appendChild(edit);

  const settle = makeButton(
    "決済入力",
    "settle-fx-position",
    "secondary small"
  );
  settle.addEventListener("click",() => {
    const form = renderFxSettlementForm(
      account.id,
      position.pair,
      position.side,
      [position]
    );
    const check = form.querySelector(
      'input[name="settle_' + position.id + '"]'
    );
    if (check) {
      check.checked = true;
      check.dispatchEvent(new Event("change",{bubbles:true}));
    }
    content.appendChild(form);
  });
  actions.appendChild(settle);

  content.appendChild(actions);
  details.appendChild(content);
  return details;
}

function renderFxAccountOpenPositionsS5g(account) {
  const section = el("section","card");
  section.appendChild(el("h3","","保有中建玉"));

  const positions = getFxOpenPositions(appData,account.id)
    .slice()
    .sort((a,b) =>
      String(a.pair).localeCompare(String(b.pair)) ||
      String(a.openDate).localeCompare(String(b.openDate))
    );

  if (!positions.length) {
    section.appendChild(el("div","empty","保有中の建玉はありません。"));
    return section;
  }

  for (const position of positions) {
    section.appendChild(
      renderFxAccountOpenPositionRowS5g(account,position)
    );
  }

  return section;
}

function renderFxAccountSettledPositionsS5g(account) {
  const section = el("section","card");
  section.appendChild(el("h3","","決済済建玉"));

  const positions = appData.fxPositions
    .filter(position =>
      position.accountId === account.id &&
      position.status === "決済済"
    )
    .slice()
    .sort((a,b) =>
      String(b.closeDate || "").localeCompare(String(a.closeDate || "")) ||
      String(b.openDate || "").localeCompare(String(a.openDate || ""))
    );

  if (!positions.length) {
    section.appendChild(el("div","empty","決済済建玉はありません。"));
    return section;
  }

  const total = positions.reduce((sum,position) =>
    sum + (
      Number.isFinite(position.realizedPnl)
        ? position.realizedPnl
        : 0
    ),
    0
  );

  const totalCard = el("div","metric-card");
  totalCard.appendChild(el("div","metric-label","アプリ内の決済損益の合計"));
  totalCard.appendChild(el("div","metric-value",formatSignedYen(total)));
  section.appendChild(totalCard);

  section.appendChild(el(
    "div",
    "help",
    "この合計は決済済建玉に記録された確定損益の合計です。口座の累積確定損益とは集計対象が異なる場合があります。"
  ));

  for (const position of positions) {
    const item = el("section","fx-settled-position");
    item.appendChild(el(
      "div",
      "metric-label",
      position.pair + " ／ " + position.side
    ));
    appendAccountMetric(
      item,
      "約定日",
      formatDateWithWeekday(String(position.openDate || "").slice(0,10))
    );
    appendAccountMetric(
      item,
      "決済日",
      position.closeDate
        ? formatDateWithWeekday(position.closeDate)
        : "未入力"
    );
    appendAccountMetric(
      item,
      "決済損益",
      Number.isFinite(position.realizedPnl)
        ? formatSignedYen(position.realizedPnl)
        : "未入力"
    );
    section.appendChild(item);
  }

  return section;
}

function renderFxAccountExistingFeaturesS5g(account) {
  const section = el("section","card");
  section.appendChild(el("h3","","既存機能"));

  const rows = calculateFxAggregateRows(appData).filter(row =>
    row.accountId === account.id
  );

  for (const row of rows) {
    appendFxSwapGroupWarning(section,row);
  }
  appendFxSwapAccountWarning(section,account.id);

  section.appendChild(renderFxSwapEstimateCard(account.id));
  section.appendChild(renderFxSwapRegistrationForm(rows[0] || null));
  section.appendChild(renderFxRateManagement(account));
  section.appendChild(makeFxPositionEntryButton(account));

  const snapshotCard = el("section","fx-account-snapshot-form");
  snapshotCard.appendChild(el("h4","","評価額履歴の入力・編集"));
  snapshotCard.appendChild(renderSnapshotForm(account));
  section.appendChild(snapshotCard);

  section.appendChild(renderAccountSettings(account));

  const historyCard = el("section","fx-account-history");
  historyCard.appendChild(el("h4","","評価額履歴"));

  const snapshots = getAccountSnapshots(appData,account.id);
  if (!snapshots.length) {
    historyCard.appendChild(el("div","empty","履歴はまだありません。"));
  } else {
    for (const snapshot of snapshots) {
      historyCard.appendChild(renderSnapshotRow(snapshot));
    }
  }

  section.appendChild(historyCard);
  return section;
}

function renderFxAccountDetailS5g(account) {
  app.replaceChildren();

  const back = makeButton(
    "← FX口座一覧へ",
    "back-accounts",
    "secondary"
  );
  back.addEventListener("click",() => {
    selectedAccountId = null;
    renderCategoryAccountList(currentTab);
  });
  app.appendChild(back);
  app.appendChild(heading(account.name));

  const latestSection = appendFxAccountLatestStateS5g(account);
  const dailySection = el("section","card");
  dailySection.appendChild(renderFxDailyInputForm(account));

  app.appendChild(latestSection);
  app.appendChild(dailySection);
  app.appendChild(renderFxAccountPairSectionS5g(account));
  app.appendChild(renderFxAccountOpenPositionsS5g(account));
  app.appendChild(renderFxAccountSettledPositionsS5g(account));
  app.appendChild(renderFxAccountExistingFeaturesS5g(account));
}

const renderAccountDetailBeforeS5g = renderAccountDetail;

renderAccountDetail = function() {
  const account = appData.accounts.find(item =>
    item.id === selectedAccountId
  );

  if (!account || account.type !== "fx") {
    renderAccountDetailBeforeS5g();
    return;
  }

  renderFxAccountDetailS5g(account);
};
