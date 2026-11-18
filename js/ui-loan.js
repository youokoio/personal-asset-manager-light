"use strict";

/* ---------- 住宅ローン画面 ---------- */

let loanEditingId = null;
let loanSnapshotTargetId = null;

function makeLoanDateField(labelText,name,value,required = true) {
  const wrapper = el("div","field");
  const label = el("label","",labelText);
  const input = document.createElement("input");

  input.type = "date";
  input.name = name;
  input.id = "loan-field-" + name;
  input.value = value || "";
  if (required) input.required = true;

  label.htmlFor = input.id;
  wrapper.append(label,input);
  return wrapper;
}

function makeLoanNumberField(labelText,name,value,options = {}) {
  const wrapper = makeNumericField(labelText,name,value,{
    required:Boolean(options.required),
    help:options.help || ""
  });
  wrapper.querySelector("input").id = "loan-field-" + name;
  return wrapper;
}

function makeLoanCheckbox(labelText,name,checked) {
  const wrapper = el("div","field loan-checkbox-field");
  const label = el("label","");
  const input = document.createElement("input");

  input.type = "checkbox";
  input.name = name;
  input.checked = Boolean(checked);
  label.append(input,document.createTextNode(" " + labelText));
  wrapper.appendChild(label);
  return wrapper;
}

function getLoanSnapshots(loanId) {
  return appData.loanSnapshots
    .filter(item => item.loanId === loanId)
    .sort((a,b) => {
      if (a.asOfDate !== b.asOfDate) {
        return b.asOfDate.localeCompare(a.asOfDate);
      }
      return String(b.recordedAt || "").localeCompare(
        String(a.recordedAt || "")
      );
    });
}

function createLoanEditor(loan = null) {
  const form = el("form","card loan-form");
  form.dataset.loanForm = "true";

  form.appendChild(heading(loan ? "住宅ローンの編集" : "住宅ローンの登録"));

  const name = makeField(
    "ローン名",
    "name",
    loan ? loan.name : "",
    {type:"text",required:true}
  );
  form.appendChild(name);

  form.appendChild(makeLoanDateField(
    "当初借入日",
    "startDate",
    loan ? loan.startDate : ""
  ));

  form.appendChild(makeLoanNumberField(
    "当初借入額（円）",
    "startAmount",
    loan ? loan.startAmount : "",
    {required:true}
  ));

  form.appendChild(makeSelectField(
    "金利タイプ",
    "rateType",
    [
      {value:"変動",label:"変動"},
      {value:"固定",label:"固定"}
    ],
    loan ? loan.rateType : "変動"
  ));

  form.appendChild(makeLoanDateField(
    "最終返済期日",
    "finalDueDate",
    loan ? loan.finalDueDate : ""
  ));

  form.appendChild(makeLoanNumberField(
    "毎月の返済日（1〜31日）",
    "repayDay",
    loan ? loan.repayDay : "",
    {required:true}
  ));

  form.appendChild(makeLoanNumberField(
    "現在の毎月返済額（円）",
    "monthlyPayment",
    loan ? loan.monthlyPayment : "",
    {help:"返済予定表の金額を入力します。未入力のままでも登録できます。"}
  ));

  form.appendChild(makeLoanDateField(
    "次回の返済額見直し日",
    "reviewDate",
    loan ? loan.reviewDate : "2028-12-28"
  ));

  form.appendChild(makeLoanCheckbox(
    "5年ルールを適用する",
    "rule5y",
    loan ? loan.rule5y : true
  ));

  form.appendChild(makeLoanCheckbox(
    "125%ルールを適用する",
    "rule125",
    loan ? loan.rule125 : true
  ));

  form.appendChild(makeField(
    "メモ",
    "memo",
    loan ? loan.memo : "",
    {type:"text"}
  ));

  const actions = el("div","form-actions");
  actions.appendChild(makeButton(
    "保存",
    "loan-save",
    "primary"
  ));
  actions.appendChild(makeButton(
    "キャンセル",
    "loan-cancel",
    "secondary"
  ));
  form.appendChild(actions);

  return form;
}

function createLoanSnapshotEditor(loan) {
  const form = el("form","card loan-snapshot-form");
  form.dataset.loanSnapshotForm = "true";
  form.dataset.loanId = loan.id;

  form.appendChild(heading(loan.name + "：残高・金利の登録"));

  form.appendChild(makeLoanDateField(
    "対象日",
    "asOfDate",
    localDateString()
  ));

  form.appendChild(makeLoanNumberField(
    "現在残高（円）",
    "balance",
    "",
    {required:true}
  ));

  form.appendChild(makeLoanNumberField(
    "適用金利（年率・%）",
    "rate",
    "",
    {required:true}
  ));

  const actions = el("div","form-actions");
  actions.appendChild(makeButton(
    "履歴を保存",
    "loan-snapshot-save",
    "primary"
  ));
  actions.appendChild(makeButton(
    "キャンセル",
    "loan-snapshot-cancel",
    "secondary"
  ));
  form.appendChild(actions);

  return form;
}

function createLoanHistory(loan) {
  const snapshots = getLoanSnapshots(loan.id);
  const section = el("section","loan-history");

  section.appendChild(el("h4","","残高・金利の履歴"));

  if (snapshots.length === 0) {
    section.appendChild(el("div","empty","履歴はまだありません。"));
    return section;
  }

  for (const snapshot of snapshots) {
    const row = el("div","loan-history-row");
    const date = el(
      "div",
      "loan-history-date",
      formatDateWithWeekday(snapshot.asOfDate)
    );
    const values = el("div","loan-history-values");

    values.appendChild(el(
      "div",
      "",
      "残高：" + formatYen(snapshot.balance)
    ));
    values.appendChild(el(
      "div",
      "",
      "金利：" + snapshot.rate + "%"
    ));

    row.append(date,values);
    section.appendChild(row);
  }

  return section;
}

function createLoanCard(loan) {
  const card = el("section","card loan-card");
  const latest = getLatestLoanSnapshot(appData,loan.id);

  card.appendChild(el("h3","",loan.name));

  const summary = el("div","loan-summary");
  summary.appendChild(el(
    "div",
    "",
    "当初借入額：" + formatYen(loan.startAmount)
  ));
  summary.appendChild(el(
    "div",
    "",
    "当初借入日：" + formatDateWithWeekday(loan.startDate)
  ));
  summary.appendChild(el(
    "div",
    "",
    "現在残高：" + (
      latest ? formatYen(latest.balance) : "未入力"
    )
  ));
  summary.appendChild(el(
    "div",
    "",
    "適用金利：" + (
      latest ? latest.rate + "%" : "未入力"
    )
  ));
  summary.appendChild(el(
    "div",
    "",
    "毎月返済額：" + formatYen(loan.monthlyPayment)
  ));
  summary.appendChild(el(
    "div",
    "",
    "次回見直し日：" + formatDateWithWeekday(loan.reviewDate)
  ));
  card.appendChild(summary);

  const actions = el("div","form-actions");
  const editButton = makeButton(
    "ローン情報を編集",
    "loan-edit",
    "secondary"
  );
  editButton.dataset.id = loan.id;

  const snapshotButton = makeButton(
    "残高・金利を記録",
    "loan-add-snapshot",
    "primary"
  );
  snapshotButton.dataset.id = loan.id;

  actions.append(editButton,snapshotButton);
  card.appendChild(actions);

  card.appendChild(createLoanHistory(loan));
  card.appendChild(createLoanSimulation(loan));

  if (loan.memo) {
    card.appendChild(el("div","help","メモ：" + loan.memo));
  }

  return card;
}

function renderLoanScreen() {
  clearApp();
  app.appendChild(heading("住宅ローン"));
  addMessage(app);

  if (loanEditingId !== null) {
    const loan = appData.loans.find(item =>
      item.id === loanEditingId
    );
    app.appendChild(createLoanEditor(loan || null));
    return;
  }

  if (loanSnapshotTargetId !== null) {
    const loan = appData.loans.find(item =>
      item.id === loanSnapshotTargetId
    );

    if (loan) {
      app.appendChild(createLoanSnapshotEditor(loan));
      return;
    }

    loanSnapshotTargetId = null;
  }

  if (appData.loans.length === 0) {
    app.appendChild(el(
      "div",
      "empty",
      "住宅ローンはまだ登録されていません。"
    ));
  }

  for (const loan of appData.loans) {
    app.appendChild(createLoanCard(loan));
  }

  if (appData.loans.length > 0) {
    app.appendChild(createLoanCombinedSummaryCard());
  }

  if (appData.loans.length < 2) {
    app.appendChild(makeButton(
      "住宅ローンを登録",
      "loan-new",
      "primary"
    ));
  } else {
    app.appendChild(el(
      "div",
      "help",
      "登録できる住宅ローンは2本までです。"
    ));
  }

  app.appendChild(el(
    "div",
    "help",
    "残高・金利は対象日ごとに履歴として記録します。未入力の値は0円として扱いません。"
  ));
}

/* ---------- 住宅ローン登録・履歴保存 ---------- */

function startNewLoan() {
  if (appData.loans.length >= 2) {
    throw new Error("住宅ローンは2本まで登録できます。");
  }
  loanEditingId = "";
  loanSnapshotTargetId = null;
  renderLoanScreen();
}

function startEditLoan(id) {
  if (!appData.loans.some(item => item.id === id)) return;
  loanEditingId = id;
  loanSnapshotTargetId = null;
  renderLoanScreen();
}

function startLoanSnapshot(id) {
  if (!appData.loans.some(item => item.id === id)) return;
  loanEditingId = null;
  loanSnapshotTargetId = id;
  renderLoanScreen();
}

function cancelLoanEditor() {
  loanEditingId = null;
  loanSnapshotTargetId = null;
  showMessage("");
  renderLoanScreen();
}

function saveLoanFromForm() {
  const form = app.querySelector("[data-loan-form]");
  if (!form) return;

  const values = new FormData(form);
  const name = String(values.get("name") || "").trim();
  const startDate = values.get("startDate");
  const startAmount = toNumberOrNull(values.get("startAmount"));
  const rateType = values.get("rateType");
  const finalDueDate = values.get("finalDueDate");
  const repayDay = toNumberOrNull(values.get("repayDay"));
  const monthlyPayment = toNumberOrNull(values.get("monthlyPayment"));
  const reviewDate = values.get("reviewDate");
  const memo = String(values.get("memo") || "");

  if (!name || !startDate || !finalDueDate || !reviewDate ||
      startAmount === null || startAmount <= 0 ||
      repayDay === null || !Number.isInteger(repayDay) ||
      repayDay < 1 || repayDay > 31 ||
      (monthlyPayment !== null && monthlyPayment < 0) ||
      !["変動","固定"].includes(rateType)) {
    throw new Error("入力内容を確認してください。");
  }

  const existing = loanEditingId
    ? appData.loans.find(item => item.id === loanEditingId)
    : null;

  if (!existing && appData.loans.length >= 2) {
    throw new Error("住宅ローンは2本まで登録できます。");
  }

  const now = new Date().toISOString();
  const loan = {
    id:existing ? existing.id : createId(),
    name,
    startDate,
    startAmount,
    rateType,
    finalDueDate,
    repayDay,
    monthlyPayment,
    reviewDate,
    rule5y:form.elements.rule5y.checked,
    rule125:form.elements.rule125.checked,
    memo,
    createdAt:existing ? existing.createdAt : now,
    updatedAt:now
  };

  const nextData = {
    ...appData,
    loans:existing
      ? appData.loans.map(item => item.id === existing.id ? loan : item)
      : [...appData.loans,loan]
  };

  saveData(nextData);
  appData = nextData;
  loanEditingId = null;
  loanSnapshotTargetId = null;
  showMessage("住宅ローンを保存しました。");
  renderLoanScreen();
}

function saveLoanSnapshotFromForm() {
  const form = app.querySelector("[data-loan-snapshot-form]");
  if (!form) return;

  const loanId = form.dataset.loanId;
  const loan = appData.loans.find(item => item.id === loanId);
  if (!loan) {
    throw new Error("住宅ローンが見つかりません。");
  }

  const values = new FormData(form);
  const asOfDate = values.get("asOfDate");
  const balance = toNumberOrNull(values.get("balance"));
  const rate = toNumberOrNull(values.get("rate"));

  if (!asOfDate || balance === null || balance < 0 ||
      rate === null || rate < 0) {
    throw new Error("対象日・残高・金利を確認してください。");
  }

  const now = new Date().toISOString();
  const snapshot = {
    id:createId(),
    loanId,
    asOfDate,
    recordedAt:now,
    balance,
    rate,
    createdAt:now,
    updatedAt:now
  };

  const nextData = {
    ...appData,
    loanSnapshots:[...appData.loanSnapshots,snapshot]
  };

  saveData(nextData);
  appData = nextData;
  loanSnapshotTargetId = null;
  showMessage("残高・金利の履歴を保存しました。");
  renderLoanScreen();
}


/* ---------- 住宅ローン金利シミュレーション ---------- */

function createLoanDisplayLine(label,value) {
  return el("div","loan-simulation-line",label + "：" + value);
}

function createLoanSimulationTable(months,paymentDates) {
  const section = el("section","card loan-monthly-breakdown");
  section.appendChild(el(
    "h4",
    "",
    "指定金利での12回分の返済内訳"
  ));
  section.appendChild(el(
    "div",
    "help",
    "過去の月別残高は保存していないため、現在残高からの試算です。"
  ));

  if (!months || !months.length) {
    section.appendChild(el("div","empty","返済内訳を計算できません。"));
    return section;
  }

  const table = el("div","loan-monthly-table");
  const header = el("div","loan-monthly-row loan-monthly-header");
  for (const label of ["回数・返済日","利息","元金","返済後残高"]) {
    header.appendChild(el("div","",label));
  }
  table.appendChild(header);

  for (let index = 0; index < months.length; index += 1) {
    const month = months[index];
    const row = el("div","loan-monthly-row");
    const date = paymentDates[index] || (month.month + "回目");
    row.appendChild(el("div","",month.month + "回目\n" + date));
    row.appendChild(el("div","",formatYen(month.interest)));
    row.appendChild(el("div","",formatYen(month.principal)));
    row.appendChild(el("div","",formatYen(month.nextBalance)));
    table.appendChild(row);
  }

  section.appendChild(table);
  if (months.some(item => item.unpaidInterest)) {
    section.appendChild(el(
      "div",
      "notice warning",
      "未払利息が発生する試算です。"
    ));
  }
  return section;
}

function createLoanScenarioResult(row) {
  const card = el("section","card loan-scenario-result");
  card.appendChild(el(
    "h4",
    "",
    formatDateWithWeekday(row.reviewDate) + " の見直し試算"
  ));

  card.appendChild(createLoanDisplayLine(
    "見直し日時点の予測残高",
    formatYen(row.forecastBalance)
  ));
  card.appendChild(createLoanDisplayLine(
    "想定金利",
    row.scenarioRate + "%"
  ));
  card.appendChild(createLoanDisplayLine(
    "見直し後の毎月返済額",
    row.newPayment === null ? "計算不可" : formatYen(row.newPayment)
  ));

  if (row.firstMonth) {
    card.appendChild(createLoanDisplayLine(
      "初月の利息",
      formatYen(row.firstMonth.interest)
    ));
    card.appendChild(createLoanDisplayLine(
      "初月の元金",
      formatYen(row.firstMonth.principal)
    ));
  }

  card.appendChild(createLoanDisplayLine(
    "現行返済額との差",
    row.difference === null ? "計算不可" : formatSignedYen(row.difference)
  ));
  card.appendChild(createLoanDisplayLine(
    "見直し後の累計利息",
    row.cumulativeInterestAfterReview === null
      ? "計算不可"
      : formatYen(row.cumulativeInterestAfterReview)
  ));

  if (row.capped) {
    card.appendChild(el(
      "div",
      "notice warning",
      "125%ルールの上限を適用しました（上限：" +
        formatYen(row.capAmount) +
        "）。"
    ));
  }
  if (row.unpaidInterest) {
    card.appendChild(el(
      "div",
      "notice warning",
      "未払利息が発生する試算です。"
    ));
  }
  return card;
}

function createLoanSimulation(loan) {
  const section = el("section","loan-simulation");
  section.appendChild(el("h4","","金利変更シミュレーション"));

  const latest = getLatestLoanSnapshot(appData,loan.id);
  if (!latest ||
      !isFiniteMetricValue(loan.monthlyPayment) ||
      !isFiniteMetricValue(latest.balance) ||
      !isFiniteMetricValue(latest.rate)) {
    section.appendChild(el(
      "div",
      "empty",
      "現在残高・適用金利・毎月返済額を登録すると試算できます。"
    ));
    return section;
  }

  if (loan.rateType !== "変動") {
    section.appendChild(el(
      "div",
      "help",
      "仕様§7の試算は変動金利を前提とするため、固定金利は対象外です。"
    ));
    return section;
  }

  const reviewDates = getLoanReviewDates(loan);
  if (!reviewDates.length || latest.asOfDate >= reviewDates[0]) {
    section.appendChild(el(
      "div",
      "empty",
      "次回見直し日と最終返済期日を確認してください。"
    ));
    return section;
  }

  section.appendChild(el(
    "div",
    "help",
    loan.rule5y
      ? "5年ルールを前提に、見直し日まで現在の返済額を維持して試算します。"
      : "5年ルールは無効ですが、仕様§7の見直し日単位の計算条件で試算します。"
  ));

  const rateInputs = [];
  const controls = el("div","loan-scenario-controls");

  for (const reviewDate of reviewDates) {
    const row = el("section","card loan-scenario-row");
    row.dataset.loanScenarioRow = "true";
    row.appendChild(el(
      "h4",
      "",
      formatDateWithWeekday(reviewDate)
    ));

    const label = el("label","","想定金利（年率・%）");
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "0.01";
    input.value = String(latest.rate);
    input.inputMode = "decimal";
    input.dataset.loanScenarioRate = "true";
    input.id = "loan-scenario-rate-" + reviewDate.replace(/-/g,"");
    label.htmlFor = input.id;
    label.appendChild(input);
    row.appendChild(label);

    const buttons = el("div","form-actions");
    for (const step of [0.25,0.5,1,2]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = "+" + step.toFixed(2).replace(/0+$/,"").replace(/\.$/,"");
      button.dataset.loanRateStep = String(step);
      buttons.appendChild(button);
    }
    row.appendChild(buttons);
    controls.appendChild(row);
    rateInputs.push(input);
  }

  section.appendChild(controls);

  const results = el("div","loan-scenario-results");
  section.appendChild(results);

  function updateLoanSimulationResults() {
    results.replaceChildren();
    const rates = rateInputs.map(input => toNumberOrNull(input.value));

    if (rates.some(rate => rate === null || rate < 0)) {
      results.appendChild(el(
        "div",
        "help",
        "すべての想定金利を0以上の数値で入力してください。"
      ));
      return;
    }

    const scenario = calculateLoanScenarioTable(loan,latest,rates);
    if (!scenario || !scenario.rows.length) {
      results.appendChild(el(
        "div",
        "empty",
        "試算できません。残高・返済額・日付を確認してください。"
      ));
      return;
    }

    results.appendChild(el("h4","","見直し日ごとの試算結果"));
    for (const row of scenario.rows) {
      results.appendChild(createLoanScenarioResult(row));
    }

    if (scenario.unpaidInterest) {
      results.appendChild(el(
        "div",
        "notice warning",
        "試算期間中に未払利息が発生します。"
      ));
    }

    const monthlyDates = getLoanRepaymentDates(
      latest.asOfDate,
      loan.finalDueDate,
      loan.repayDay
    ).slice(0,12);
    const monthly = calculateLoanRecentBreakdown(
      latest.balance,
      rates[0],
      loan.monthlyPayment,
      monthlyDates.length
    );

    if (monthly) {
      results.appendChild(createLoanSimulationTable(
        monthly.months,
        monthlyDates
      ));
    }
  }

  section.addEventListener("input",event => {
    if (event.target.matches("[data-loan-scenario-rate]")) {
      updateLoanSimulationResults();
    }
  });

  section.addEventListener("click",event => {
    const button = event.target.closest("[data-loan-rate-step]");
    if (!button) return;

    const row = button.closest("[data-loan-scenario-row]");
    const input = row
      ? row.querySelector("[data-loan-scenario-rate]")
      : null;
    if (!input) return;

    const step = Number(button.dataset.loanRateStep);
    input.value = (latest.rate + step).toFixed(2);
    updateLoanSimulationResults();
  });

  updateLoanSimulationResults();
  return section;
}

function createLoanCombinedSummaryCard() {
  const card = el("section","card loan-combined-summary");
  card.appendChild(el("h3","","住宅ローン合計"));
  const summary = calculateLoanCombinedSummary(appData);

  if (!summary.complete) {
    card.appendChild(el(
      "div",
      "help",
      "登録した全ローンの残高・金利・毎月返済額がそろうと、合計を表示します。"
    ));
    return card;
  }

  card.appendChild(createLoanDisplayLine(
    "毎月返済額",
    formatYen(summary.monthlyPayment)
  ));
  card.appendChild(createLoanDisplayLine(
    "元金",
    formatYen(summary.principal)
  ));
  card.appendChild(createLoanDisplayLine(
    "利息",
    formatYen(summary.interest)
  ));
  return card;
}
