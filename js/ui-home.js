"use strict";

/* ---------- ホーム ---------- */

function appendHomeMetric(container,label,value) {
  const row = el("div","home-metric-row");
  row.appendChild(el("div","home-metric-label",label));
  row.appendChild(el("div","home-metric-value",value));
  container.appendChild(row);
}

function createHomeSummaryCard(label,value,subText,extraClass = "") {
  const card = el("section","card home-summary-card " + extraClass);
  const row = el("div","home-summary-row");
  row.appendChild(el("div","metric-label",label));
  row.appendChild(el("div","metric-value home-summary-value",value));
  card.appendChild(row);

  if (subText) {
    card.appendChild(el("div","metric-sub",subText));
  }

  return card;
}

function renderDashboard() {
  clearApp();
  app.appendChild(heading("ホーム"));
  addMessage(app);

  const summary = calculateDashboard(appData);
  const grid = el("div","metric-grid");

  grid.appendChild(createHomeSummaryCard(
    "総資産",
    summary.total === null ? "未入力" : formatYen(summary.total),
    "入力済み " + summary.includedAccountCount + "口座",
    "home-total-card"
  ));

  const diff = summary.difference30;
  const diffText = diff.isUnavailable
    ? "算出不可"
    : formatSignedYen(diff.difference);

  const diffCard = createHomeSummaryCard(
    "30日前からの差",
    diffText,
    diff.comparedAccountCount + "口座を比較／" +
      diff.excludedAccountCount + "口座は比較対象外",
    "home-difference-card"
  );

  diffCard.appendChild(el(
    "div",
    "metric-sub",
    "比較日は口座ごとに異なります。各口座の最新記録日から30日前を基準にしています。"
  ));
  grid.appendChild(diffCard);

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
      appendHomeMetric(card,"30日前からの差",
        item.bankChange === null
          ? "算出不可"
          : formatSignedYen(item.bankChange)
      );
      card.appendChild(el(
        "div",
        "help",
        item.bankComparedAccountCount + "口座を比較／" +
          item.bankExcludedAccountCount +
          "口座は比較対象外。比較日は口座ごとに異なります。"
      ));
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
