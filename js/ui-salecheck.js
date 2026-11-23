
"use strict";

/* ---------- 売却・利確の確認画面 ---------- */

const SALECHECK_DISMISS_REASONS = [
  "資金移動",
  "商品の入れ替え",
  "入力の訂正",
  "売却ではない",
  "その他"
];

function getSaleCheckUnitLabel(item) {
  return item.level === "口座全体"
    ? "口座全体"
    : item.productName + "／" + item.wrapper;
}

function getSaleCheckAmountText(value) {
  return isFiniteMetricValue(value) ? formatYen(value) : "記録なし";
}

function appendSaleCheckTextList(container,items,className) {
  for (const item of items) {
    container.appendChild(el("div",className,item));
  }
}

function getSaleCheckRecordByCandidate(data,candidate) {
  return (Array.isArray(data.saleChecks) ? data.saleChecks : []).find(item =>
    getSaleCheckCandidateKey(item) ===
    getSaleCheckCandidateKey(candidate)
  ) || null;
}

function renderSaleCheckCandidateCard(account,candidate,storage,allowActions = true) {
  const card = el("article","salecheck-item");
  card.appendChild(el("strong","salecheck-item-title",
    getSaleCheckUnitLabel(candidate)
  ));
  card.appendChild(el("div","salecheck-period",
    "期間：" + candidate.fromDate + " ～ " + candidate.toDate
  ));
  card.appendChild(el("div","salecheck-values",
    "元本：" + getSaleCheckAmountText(candidate.oldCostBasis) +
    " → " + getSaleCheckAmountText(candidate.newCostBasis)
  ));
  card.appendChild(el("div","salecheck-values",
    "評価額：" + getSaleCheckAmountText(candidate.oldValue) +
    " → " + getSaleCheckAmountText(candidate.newValue)
  ));
  card.appendChild(el("div","salecheck-meta",
    "間隔：" + candidate.gapDays + "日"
  ));

  if (candidate.gapNote) {
    card.appendChild(el("div","salecheck-warning",candidate.gapNote));
  }
  if (candidate.hints && candidate.hints.length) {
    appendSaleCheckTextList(card,candidate.hints,"salecheck-hint");
  }

  if (candidate.status !== "未確認") {
    card.appendChild(el("div","salecheck-status",
      "状態：" + candidate.status
    ));
  }

  if (allowActions && candidate.status === "未確認") {
    const actions = el("div","form-actions");
    const dismiss = makeButton(
      "解除",
      "salecheck-dismiss",
      "secondary"
    );
    dismiss.addEventListener("click",() => {
      const form = renderSaleCheckDismissForm(account,candidate,storage);
      const old = card.querySelector(".salecheck-form");
      if (old) old.remove();
      card.appendChild(form);
    });

    const confirm = makeButton(
      "利確確認済みにする",
      "salecheck-confirm",
      "primary"
    );
    confirm.addEventListener("click",() => {
      const form = renderSaleCheckConfirmationForm(
        account,candidate,storage
      );
      const old = card.querySelector(".salecheck-form");
      if (old) old.remove();
      card.appendChild(form);
    });
    actions.append(dismiss,confirm);
    card.appendChild(actions);
  }

  return card;
}

function getSaleCheckFormValue(form,name) {
  const input = form.querySelector(`[name="${name}"]`);
  return input ? input.value.trim() : "";
}

function getSaleCheckFormNumber(form,name) {
  const value = getSaleCheckFormValue(form,name);
  return value === "" ? null : toNumberOrNull(value);
}

function appendSaleCheckFormMessage(form,messages,className) {
  const old = form.querySelector(".salecheck-form-message");
  if (old) old.remove();
  if (!messages.length) return;

  const box = el("div",className + " salecheck-form-message");
  appendSaleCheckTextList(box,messages,"");
  form.appendChild(box);
}

function createSaleCheckFormActions(form,saveLabel,onSave,onCancel) {
  const actions = el("div","form-actions");
  const save = makeButton(saveLabel,"salecheck-save","primary");
  save.type = "submit";
  const cancel = makeButton("キャンセル","salecheck-cancel","secondary");
  cancel.addEventListener("click",onCancel);
  actions.append(save,cancel);
  form.appendChild(actions);
  form.addEventListener("submit",event => {
    event.preventDefault();
    onSave();
  });
}

function saveSaleCheckRecordFromUi(record,storage,form) {
  const now = new Date().toISOString();
  const nextRecord = {
    ...record,
    id:createId(),
    createdAt:now,
    updatedAt:now
  };

  try {
    const nextData = saveStockTrackingData(
      "saleCheck",
      data => {
        const duplicate = data.saleChecks.some(item =>
          getSaleCheckCandidateKey(item) ===
          getSaleCheckCandidateKey(nextRecord)
        );
        if (duplicate) {
          throw new Error("同じ候補の確認記録が既にあります。");
        }
        data.saleChecks.push(nextRecord);
      },
      storage
    );
    appData = nextData;
    showMessage("売却・利確の確認を保存しました。");
    render();
    return true;
  } catch (error) {
    appendSaleCheckFormMessage(
      form,
      [error.message || "確認記録を保存できませんでした。"],
      "error"
    );
    return false;
  }
}

function renderSaleCheckDismissForm(account,candidate,storage) {
  const form = el("form","salecheck-form");
  form.appendChild(el("h4","","候補を解除"));
  form.appendChild(makeSelectField(
    "解除理由",
    "dismissReason",
    SALECHECK_DISMISS_REASONS.map(value => ({
      value,
      label:value
    })),
    "資金移動"
  ));
  form.appendChild(makeField("メモ（任意）","memo","",{
    textarea:true
  }));

  createSaleCheckFormActions(
    form,
    "解除を保存",
    () => {
      const reason = getSaleCheckFormValue(form,"dismissReason");
      if (!SALECHECK_DISMISS_REASONS.includes(reason)) {
        appendSaleCheckFormMessage(
          form,
          ["解除理由を選択してください。"],
          "error"
        );
        return;
      }

      const record = {
        accountId:account.id,
        level:candidate.level,
        productName:candidate.level === "口座全体"
          ? null
          : candidate.productName,
        wrapper:candidate.level === "口座全体"
          ? null
          : candidate.wrapper,
        toDate:candidate.toDate,
        fromDate:candidate.fromDate,
        status:"解除",
        dismissReason:reason,
        memo:getSaleCheckFormValue(form,"memo")
      };
      saveSaleCheckRecordFromUi(record,storage,form);
    },
    () => form.remove()
  );

  return form;
}

function renderSaleCheckConfirmationForm(account,candidate,storage) {
  const form = el("form","salecheck-form");
  form.appendChild(el("h4","","利確確認済みの記録"));
  form.appendChild(makeField("売却日","saleDate",localDateString(),{
    type:"date",
    required:true
  }));
  form.appendChild(makeNumericField(
    "確定損益（円）",
    "realizedPnl",
    "",
    {required:true}
  ));
  form.appendChild(makeSelectField(
    "情報源",
    "source",
    SALECHECK_SOURCES.map(value => ({value,label:value})),
    "取引履歴"
  ));
  form.appendChild(makeNumericField("売却金額（円・任意）","proceeds",""));
  form.appendChild(makeField("メモ（任意）","memo","",{
    textarea:true
  }));

  createSaleCheckFormActions(
    form,
    "利確確認済みとして保存",
    () => {
      const input = {
        saleDate:getSaleCheckFormValue(form,"saleDate"),
        realizedPnl:getSaleCheckFormNumber(form,"realizedPnl"),
        proceeds:getSaleCheckFormNumber(form,"proceeds"),
        source:getSaleCheckFormValue(form,"source"),
        memo:getSaleCheckFormValue(form,"memo")
      };
      const checked = validateSaleCheckConfirmation(
        appData,
        candidate,
        input
      );

      if (!checked.valid) {
        appendSaleCheckFormMessage(form,checked.errors,"error");
        return;
      }

      appendSaleCheckFormMessage(
        form,
        checked.warnings,
        "salecheck-warning"
      );
      saveSaleCheckRecordFromUi(checked.record,storage,form);
    },
    () => form.remove()
  );

  return form;
}

function renderSaleCheckManualForm(account,storage) {
  const form = el("form","salecheck-form");
  form.appendChild(el("h4","","候補なしで利確確認済みを記録"));

  const levelField = makeSelectField(
    "記録する単位",
    "level",
    [
      {value:"口座全体",label:"口座全体"},
      {value:"商品別",label:"商品別"}
    ],
    "口座全体"
  );
  const productField = makeField("商品名","productName","",{
    type:"text"
  });
  const wrapperField = makeSelectField(
    "保有区分",
    "wrapper",
    HOLDING_WRAPPERS.map(value => ({value,label:value})),
    HOLDING_WRAPPERS[0]
  );
  productField.classList.add("hidden");
  wrapperField.classList.add("hidden");
  form.append(levelField,productField,wrapperField);

  const levelInput = levelField.querySelector("select");
  levelInput.addEventListener("change",() => {
    const isProduct = levelInput.value === "商品別";
    productField.classList.toggle("hidden",!isProduct);
    wrapperField.classList.toggle("hidden",!isProduct);
  });

  form.appendChild(makeField("売却日","saleDate",localDateString(),{
    type:"date",
    required:true
  }));
  form.appendChild(makeNumericField(
    "確定損益（円）",
    "realizedPnl",
    "",
    {required:true}
  ));
  form.appendChild(makeSelectField(
    "情報源",
    "source",
    SALECHECK_SOURCES.map(value => ({value,label:value})),
    "取引履歴"
  ));
  form.appendChild(makeNumericField("売却金額（円・任意）","proceeds",""));
  form.appendChild(makeField("メモ（任意）","memo","",{
    textarea:true
  }));

  createSaleCheckFormActions(
    form,
    "利確確認済みとして記録",
    () => {
      const level = getSaleCheckFormValue(form,"level");
      const productName = level === "商品別"
        ? getSaleCheckFormValue(form,"productName")
        : null;
      const wrapper = level === "商品別"
        ? getSaleCheckFormValue(form,"wrapper")
        : null;
      const target = {
        accountId:account.id,
        level,
        productName,
        wrapper,
        manual:true
      };
      const input = {
        saleDate:getSaleCheckFormValue(form,"saleDate"),
        realizedPnl:getSaleCheckFormNumber(form,"realizedPnl"),
        proceeds:getSaleCheckFormNumber(form,"proceeds"),
        source:getSaleCheckFormValue(form,"source"),
        memo:getSaleCheckFormValue(form,"memo")
      };
      const checked = validateSaleCheckConfirmation(
        appData,
        target,
        input
      );

      if (!checked.valid) {
        appendSaleCheckFormMessage(form,checked.errors,"error");
        return;
      }

      appendSaleCheckFormMessage(
        form,
        checked.warnings,
        "salecheck-warning"
      );
      saveSaleCheckRecordFromUi(checked.record,storage,form);
    },
    () => form.remove()
  );

  return form;
}

function deleteSaleCheckDismissal(recordId,storage) {
  if (!window.confirm("解除の記録を取り消して、未確認に戻しますか？")) {
    return;
  }

  try {
    appData = saveStockTrackingData(
      "saleCheck",
      data => {
        data.saleChecks = data.saleChecks.filter(item =>
          item.id !== recordId
        );
      },
      storage
    );
    showMessage("解除を取り消しました。");
    render();
  } catch (error) {
    showMessage(error.message || "解除を取り消せませんでした。",true);
    render();
  }
}

function renderSaleCheckRecordCard(record,storage) {
  const card = el("article","salecheck-item");
  card.appendChild(el("strong","salecheck-item-title",
    getSaleCheckUnitLabel(record)
  ));
  card.appendChild(el("div","salecheck-period",
    "売却日：" + record.saleDate
  ));
  card.appendChild(el("div","salecheck-values",
    "確定損益：" + formatSignedYen(record.realizedPnl) +
    (record.realizedPnl < 0 ? "（損）" : record.realizedPnl > 0 ? "（益）" : "")
  ));
  card.appendChild(el("div","salecheck-meta",
    "情報源：" + record.source
  ));
  if (record.proceeds !== null && record.proceeds !== undefined) {
    card.appendChild(el("div","salecheck-meta",
      "売却金額：" + formatYen(record.proceeds)
    ));
  }
  if (record.dismissReason) {
    card.appendChild(el("div","salecheck-meta",
      "解除理由：" + record.dismissReason
    ));
  }
  if (record.memo) {
    card.appendChild(el("div","salecheck-meta","メモ：" + record.memo));
  }
  if (record.manual) {
    card.appendChild(el("div","salecheck-status",
      "候補なしで記録"
    ));
  }
  if (record.status === "解除") {
    const undo = makeButton(
      "解除を取り消す",
      "salecheck-undo",
      "secondary small"
    );
    undo.addEventListener("click",() =>
      deleteSaleCheckDismissal(record.id,storage)
    );
    card.appendChild(undo);
  }
  return card;
}

function appendSaleCheckDetails(container,title,items,renderItem) {
  const details = document.createElement("details");
  details.className = "salecheck-details";
  const summary = document.createElement("summary");
  summary.textContent = title + "（" + items.length + "件）";
  details.appendChild(summary);

  if (!items.length) {
    details.appendChild(el("div","empty","記録はありません。"));
  } else {
    for (const item of items) {
      details.appendChild(renderItem(item));
    }
  }
  container.appendChild(details);
}

function renderSaleCheckSection(account,storage = localStorage) {
  if (!account || getCategory(account) !== "stock") return null;

  const section = el("section","card salecheck-section");
  section.appendChild(el("h3","","売却・利確の確認"));
  section.appendChild(el(
    "div",
    "salecheck-explanation",
    "元本と評価額がともに減っています。売却したとは限りません（資金移動・商品の入れ替え・入力の違いなど）。"
  ));

  let result;
  try {
    result = calculateSaleCheckCandidates(appData,localDateString());
  } catch (error) {
    section.appendChild(el(
      "div",
      "error",
      error.message || "売却・利確候補を表示できませんでした。"
    ));
    return section;
  }

  const accountCandidates = result.candidates.filter(item =>
    item.accountId === account.id
  );
  const classified = classifyOldSaleCheckCandidates(
    accountCandidates,
    localDateString()
  );
  const currentUnconfirmed = classified.current.filter(item =>
    item.status === "未確認"
  );
  const records = (Array.isArray(appData.saleChecks)
    ? appData.saleChecks
    : []).filter(item => item.accountId === account.id);

  section.appendChild(el(
    "div",
    "salecheck-subtitle",
    "未確認の候補：" + currentUnconfirmed.length + "件"
  ));

  if (!currentUnconfirmed.length) {
    section.appendChild(el("div","empty","未確認の候補はありません。"));
  } else {
    for (const candidate of currentUnconfirmed) {
      section.appendChild(renderSaleCheckCandidateCard(
        account,candidate,storage
      ));
    }
  }

  const dismissed = records.filter(item => item.status === "解除");
  const confirmed = records.filter(item =>
    item.status === "利確確認済み"
  );
  appendSaleCheckDetails(
    section,
    "解除済み",
    dismissed,
    item => renderSaleCheckRecordCard(item,storage)
  );
  appendSaleCheckDetails(
    section,
    "利確確認済み",
    confirmed,
    item => renderSaleCheckRecordCard(item,storage)
  );
  appendSaleCheckDetails(
    section,
    "過去の候補",
    classified.old,
    item => renderSaleCheckCandidateCard(account,item,storage)
  );

  const incomparable = result.noComparison.filter(item =>
    item.accountId === account.id
  );
  section.appendChild(el(
    "div",
    "salecheck-meta",
    "比較不可：" + result.incomparableCount + "件"
  ));
  if (incomparable.length) {
    appendSaleCheckTextList(
      section,
      incomparable.map(item => getSaleCheckUnitLabel(item) +
        "：" + item.message),
      "salecheck-meta"
    );
  }

  const warnings = result.warnings.filter(item =>
    item.accountId === account.id
  );
  appendSaleCheckDetails(
    section,
    "記録の確認",
    warnings,
    item => {
      const card = el("article","salecheck-item salecheck-warning-card");
      card.appendChild(el("div","salecheck-warning",item.message));
      return card;
    }
  );

  const totals = calculateSaleCheckReferenceTotals(
    appData.saleChecks,
    account.id
  );
  const reference = el("div","card salecheck-reference");
  reference.appendChild(el("h4","","確認済みの確定損益（参考）"));
  reference.appendChild(el(
    "div",
    "salecheck-values",
    "商品別：" + formatSignedYen(totals.productTotal) +
      "（" + totals.productCount + "件）"
  ));
  reference.appendChild(el(
    "div",
    "salecheck-values",
    "口座全体：" + formatSignedYen(totals.accountTotal) +
      "（" + totals.accountCount + "件）"
  ));
  section.appendChild(reference);

  const manualButton = makeButton(
    "候補なしで利確確認済みを記録",
    "salecheck-manual",
    "secondary"
  );
  manualButton.addEventListener("click",() => {
    const old = section.querySelector(".salecheck-manual-form");
    if (old) {
      old.remove();
      return;
    }
    const form = renderSaleCheckManualForm(account,storage);
    form.classList.add("salecheck-manual-form");
    section.appendChild(form);
  });
  section.appendChild(manualButton);

  return section;
}

function renderSaleCheckBadge(account) {
  if (!account || getCategory(account) !== "stock") return null;

  const result = calculateSaleCheckCandidates(appData,localDateString());
  const candidates = result.candidates.filter(item =>
    item.accountId === account.id
  );
  const classified = classifyOldSaleCheckCandidates(
    candidates,
    localDateString()
  );
  const count = classified.current.filter(item =>
    item.status === "未確認"
  ).length;

  if (count === 0) return null;

  return el(
    "div",
    "salecheck-badge",
    "売却・利確候補 " + count + "件（未確認）"
  );
}
