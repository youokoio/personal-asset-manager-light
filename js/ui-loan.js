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
