"use strict";

/* ---------- ホーム ---------- */

function appendHomeMetric(container,label,value) {
  const row = el("div","home-metric-row");
  row.appendChild(el("div","home-metric-label",label));
  row.appendChild(el("div","home-metric-value",value));
  container.appendChild(row);
}

function renderDashboard() {
  clearApp();
  app.appendChild(heading("ホーム"));
  addMessage(app);

  const summary = calculateDashboard(appData);
  const grid = el("div","metric-grid");

  const totalCard = el("section","card home-total-card");
  const totalRow = el("div","home-total-row");
  totalRow.appendChild(el("div","metric-label","総資産"));
  totalRow.appendChild(el("div","metric-value",
    summary.total === null ? "未入力" : formatYen(summary.total)
  ));
  totalCard.appendChild(totalRow);
  totalCard.appendChild(el("div","metric-sub",
    "入力済み " + summary.includedAccountCount + "口座"
  ));
  grid.appendChild(totalCard);

  const differenceCard = el("section","card");
  differenceCard.appendChild(el("div","metric-label","前回記録との差"));
  differenceCard.appendChild(el("div","metric-value",
    summary.difference === null
      ? "算出不可"
      : formatSignedYen(summary.difference)
  ));
  differenceCard.appendChild(el("div","metric-sub",
    summary.difference === null
      ? "比較できる前回記録がありません"
      : "比較対象 " + summary.previousAccountCount + "口座"
  ));
  grid.appendChild(differenceCard);

  app.appendChild(grid);

  const totals = calculateCategoryTotals(appData);

  app.appendChild(heading("分類別合計"));

  for (const category of ["fx","stock","crypto","bank"]) {
    const item = totals[category];
    const card = el("section","card");

    const titleRow = el("div","category-card-title");
    titleRow.appendChild(el("h3","",item.label));
    titleRow.appendChild(el("div","category-count",
      "入力済み " + item.inputAccountCount + "/" +
      item.accountCount + "口座"
    ));
    card.appendChild(titleRow);

    if (item.inputAccountCount === 0) {
      card.appendChild(el("div","empty","未入力"));
      app.appendChild(card);
      continue;
    }

    if (category === "bank") {
      appendHomeMetric(card,"口座残高",
        formatYen(item.bankBalance));
      appendHomeMetric(card,"前回記録との差",
        formatSignedYen(item.bankChange));
      if (item.counts.bankChange < item.inputAccountCount) {
        card.appendChild(el("div","help",
          "前回記録がない口座を除く " +
          item.counts.bankChange + "口座の合計"
        ));
      }
    } else {
      appendHomeMetric(card,"総資産",
        formatYen(item.totalAssets));
      appendHomeMetric(card,"累計投資元本",
        formatYen(item.cumulativeInvested));
      appendHomeMetric(card,"有効元本",
        formatYen(item.effectivePrincipal));
      appendHomeMetric(card,"評価損益",
        formatSignedYen(item.pnl));
      appendHomeMetric(card,"累積確定損益",
        category === "fx" ? "後続段階で対応" :
          formatSignedYen(item.realizedPnlTotal)
      );
    }

    app.appendChild(card);
  }

  app.appendChild(el("div","help",
    "未入力の項目は0として扱いません。FX建玉は総資産に加算せず、FX口座の最新snapshotを採用します。"
  ));
}
