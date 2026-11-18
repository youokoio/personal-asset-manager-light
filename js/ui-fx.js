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