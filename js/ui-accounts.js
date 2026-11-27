"use strict";

/* ---------- 分類別口座一覧・詳細 ---------- */

function appendAccountMetric(container,label,value,subText = "") {
  const row = el("div","account-metric-line");
  const labelBox = el("div","account-metric-label",label);
  row.appendChild(labelBox);

  const valueBox = el("div","account-metric-value");
  valueBox.appendChild(el("div","",value));
  if (subText) {
    valueBox.appendChild(el("div","account-metric-sub",subText));
  }
  row.appendChild(valueBox);
  container.appendChild(row);
}

function appendContributionAccountListMetric(container,account) {
  try {
    const summary = calculateContributionSummary(
      appData,
      localDateString().slice(0,7)
    );
    const accountTotal = summary.accountTotals.find(item =>
      item.accountId === account.id
    );

    appendAccountMetric(
      container,
      "累積積立額",
      accountTotal && accountTotal.hasRecords
        ? formatYen(accountTotal.cumulativeAmount)
        : "未入力"
    );
  } catch (error) {
    appendAccountMetric(container,"累積積立額","算出不可");
  }
}

function renderBankAccountCreateForm() {
  const card = el("section","card");
  card.appendChild(el("h3","","銀行口座を追加"));
  card.appendChild(makeField(
    "口座名",
    "bank-account-name",
    "ゆうちょ銀行",
    {type:"text",required:true}
  ));
  card.appendChild(makeField(
    "メモ（任意）",
    "bank-account-memo",
    "",
    {textarea:true}
  ));
  card.appendChild(makeButton(
    "口座を追加",
    "bank-account-add"
  ));
  return card;
}

function addBankAccountFromForm() {
  const nameInput = document.getElementById("field-bank-account-name");
  const memoInput = document.getElementById("field-bank-account-memo");

  if (!nameInput) {
    showMessage("口座名の入力欄が見つかりません。",true);
    render();
    return;
  }

  const name = nameInput.value.trim();
  const memo = memoInput ? memoInput.value.trim() : "";

  if (!name) {
    showMessage("口座名を入力してください。",true);
    render();
    return;
  }

  if (appData.accounts.some(account =>
    account.name.trim() === name
  )) {
    showMessage("同じ口座名がすでに登録されています。",true);
    render();
    return;
  }

  try {
    const nextData = JSON.parse(JSON.stringify(appData));
    const sortOrder = nextData.accounts.reduce(
      (maximum,account) => Math.max(maximum,account.sortOrder),
      -1
    ) + 1;
    const now = new Date().toISOString();
    const account = createInitialAccount(
      {
        name,
        type:"bank",
        category:"bank"
      },
      sortOrder,
      now
    );

    account.memo = memo;
    nextData.accounts.push(account);

    saveData(nextData);
    appData = nextData;
    selectedAccountId = account.id;
    showMessage("銀行口座を追加しました。");
  } catch (error) {
    showMessage(
      error.message || "銀行口座を追加できませんでした。",
      true
    );
  }

  render();
}

function renderCategoryAccountList(category) {
  const label = CATEGORY_LABELS[category];
  app.appendChild(heading(label));

  if (category === "bank") {
    app.appendChild(renderBankAccountCreateForm());
  }

  const accounts = appData.accounts.filter(
    account => getCategory(account) === category
  );

  if (!accounts.length) {
    app.appendChild(el("div","empty","口座がありません。"));
    return;
  }

  const diff30 = category === "bank"
    ? calculateDiff30(appData)
    : null;

  for (const account of accounts) {
    const latest = getLatestSnapshot(appData,account.id);
    const card = el("section","card account-card");
    const top = el("div","account-card-top");

    const left = el("div");
    left.appendChild(el("div","account-name",account.name));
    const accountHoldingsSummary = isHoldingsAccount(account)
      ? calculateHoldingsSummary(appData,account.id)
      : null;
    left.appendChild(el("div","account-meta",
      latest
        ? formatDateWithWeekday(latest.asOfDate)
        : accountHoldingsSummary && accountHoldingsSummary.asOfDate
          ? formatDateWithWeekday(accountHoldingsSummary.asOfDate)
          : "記録なし"
    ));
    top.appendChild(left);

    const open = makeButton("詳細","open-account","secondary small");
    open.dataset.id = account.id;
    top.appendChild(open);
    card.appendChild(top);

    if (!latest) {
      const holdingsSummary = isHoldingsAccount(account)
        ? calculateHoldingsSummary(appData,account.id)
        : null;
      if (holdingsSummary && holdingsSummary.total !== null) {
        appendAccountMetric(
          card,
          "商品別保有合計",
          formatYen(holdingsSummary.total),
          "対象日：" + formatDateWithWeekday(holdingsSummary.asOfDate)
        );
      } else {
        card.appendChild(el("div","empty","未入力"));
      }
    } else if (category === "bank") {
      appendAccountMetric(card,"口座残高",formatYen(latest.value));

      const result = diff30.accounts.find(item =>
        item.accountId === account.id
      );

      appendAccountMetric(
        card,
        "30日前からの差",
        result && result.comparable
          ? formatSignedYen(result.difference)
          : "算出不可",
        result && result.comparable
          ? "比較値の対象日：" +
            formatDateWithWeekday(result.comparisonDate)
          : "30日前以前の比較記録がありません"
      );
    } else {
      appendAccountMetric(
        card,
        getAccountFieldLabel(account,"value","総資産"),
        formatYen(latest.value)
      );
      appendAccountMetric(
        card,
        getAccountFieldLabel(account,"effectivePrincipal","有効元本"),
        formatYen(latest.effectivePrincipal)
      );
      appendAccountMetric(
        card,
        getAccountFieldLabel(account,"pnl","評価損益"),
        formatSignedYen(latest.pnl)
      );

      if (category === "fx") {
        const realized = getFxRealizedAt(
          appData,
          account.id,
          localDateString()
        );
        const realizedBaseLabel = realized && realized.baseSource &&
          realized.baseDate
            ? "基準：" + realized.baseSource + " " +
              formatDateWithWeekday(realized.baseDate)
            : realized && realized.baseUnset
              ? "基準額未設定（決済損益のみ）"
              : realized
                ? "基準額未設定"
                : "";
        appendAccountMetric(
          card,
          "累積確定損益",
          realized && isFiniteMetricValue(realized.value)
            ? formatSignedYen(realized.value)
            : "未入力",
          realizedBaseLabel
        );
        appendFxRealizedWarnings(card,realized);
        appendAccountMetric(
          card,
          getAccountFieldLabel(account,"swapTotal","累計スワップ"),
          formatYen(latest.swapTotal)
        );

        const fxRows = calculateFxAggregateRows(appData).filter(row =>
          row.accountId === account.id
        );
        const fxExchangeProfit = fxRows.length === 0
          ? 0
          : fxRows.every(row => isFiniteMetricValue(row.exchangeProfit))
            ? fxRows.reduce((sum,row) => sum + row.exchangeProfit,0)
            : null;
        const fxSwapTotal = fxRows.length === 0
          ? 0
          : fxRows.every(row => isFiniteMetricValue(row.swapTotal))
            ? fxRows.reduce((sum,row) => sum + row.swapTotal,0)
            : null;
        const totalPnl = realized &&
          isFiniteMetricValue(fxExchangeProfit) &&
          isFiniteMetricValue(fxSwapTotal)
            ? fxExchangeProfit + fxSwapTotal + realized.value
            : null;
        appendAccountMetric(
          card,
          "トータル損益",
          totalPnl === null ? "算出不可" : formatSignedYen(totalPnl)
        );
      } else {
        appendAccountMetric(card,"累積確定損益",
          formatSignedYen(latest.realizedPnlTotal));
      }
    }

    if (category === "stock") {
      appendContributionAccountListMetric(card,account);
      const saleCheckBadge = renderSaleCheckBadge(account);
      if (saleCheckBadge) {
        card.appendChild(saleCheckBadge);
      }
    }

    card.addEventListener("click",event => {
      if (event.target.closest("button")) {
        selectedAccountId = account.id;
        render();
      } else {
        selectedAccountId = account.id;
        render();
      }
    });

    app.appendChild(card);
  }
}

function renderAccountDetail() {
  const account = appData.accounts.find(a => a.id === selectedAccountId);
  if (!account) {
    selectedAccountId = null;
    renderCategoryAccountList(currentTab);
    return;
  }

  const back = makeButton(
    "← " + CATEGORY_LABELS[getCategory(account)] + "一覧へ",
    "back-accounts",
    "secondary"
  );
  app.appendChild(back);

  app.appendChild(heading(account.name));

  if (account.type === "fx") {
    app.appendChild(renderFxLossCutBlock(appData,account.id));
  }

  const latest = getLatestSnapshot(appData,account.id);
  const holdingsSummary = isHoldingsAccount(account)
    ? calculateHoldingsSummary(appData,account.id)
    : null;
  const displayedValue = latest
    ? latest.value
    : holdingsSummary
      ? holdingsSummary.total
      : null;
  const displayedDate = latest
    ? latest.asOfDate
    : holdingsSummary
      ? holdingsSummary.asOfDate
      : null;
  const info = el("section","card");
  info.appendChild(el("div","metric-label","最新評価額"));
  info.appendChild(el("div","metric-value",
    displayedValue !== null ? formatYen(displayedValue) : "未入力"
  ));
  info.appendChild(el("div","metric-sub",
    displayedDate
      ? "対象日：" + formatDateWithWeekday(displayedDate)
      : "評価額の記録がありません"
  ));
  app.appendChild(info);

  if (account.type === "fx") {
    const realized = getFxRealizedAt(
      appData,
      account.id,
      localDateString()
    );
    const realizedCard = el("section","card");
    realizedCard.appendChild(el(
      "div",
      "metric-label",
      "累積確定損益"
    ));
    realizedCard.appendChild(el(
      "div",
      "metric-value",
      realized && isFiniteMetricValue(realized.value)
        ? formatSignedYen(realized.value)
        : "未入力"
    ));

    let baseLabel = "基準額未設定";
    if (realized && realized.baseSource && realized.baseDate) {
      baseLabel = "基準：" + realized.baseSource + " " +
        formatDateWithWeekday(realized.baseDate);
    } else if (realized && realized.baseUnset) {
      baseLabel = "基準額未設定（決済損益のみ）";
    }
    realizedCard.appendChild(el("div","metric-sub",baseLabel));
    appendFxRealizedWarnings(realizedCard,realized);
    app.appendChild(realizedCard);
  }

  const formCard = el("section","card");
  formCard.appendChild(renderSnapshotForm(account));
  app.appendChild(formCard);

  if (isHoldingsAccount(account)) {
    app.appendChild(renderHoldingsSection(account));
    app.appendChild(renderHoldingsImportForm(account));
  }

  if (getCategory(account) === "stock") {
    app.appendChild(renderContributionSection(account));
    app.appendChild(renderSaleCheckSection(account));
  }

  app.appendChild(renderAccountSettings(account));

  const historyCard = el("section","card");
  historyCard.appendChild(el("h3","","評価額履歴"));

  const snapshots = getAccountSnapshots(appData,account.id);
  if (!snapshots.length) {
    historyCard.appendChild(el("div","empty","履歴はまだありません。"));
  } else {
    for (const snapshot of snapshots) {
      historyCard.appendChild(renderSnapshotRow(snapshot));
    }
  }

  app.appendChild(historyCard);
}
