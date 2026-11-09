"use strict";

/* ---------- ダッシュボード ---------- */

function renderDashboard() {
  clearApp();
  app.appendChild(heading("ダッシュボード"));
  addMessage(app);

  const summary = calculateDashboard(appData);

  const grid = el("div","metric-grid");

  const totalCard = el("section","card");
  totalCard.appendChild(el("div","metric-label","総資産"));
  totalCard.appendChild(el("div","metric-value",formatYen(summary.total)));
  totalCard.appendChild(el("div","metric-sub","口座の最新評価額の合計"));
  grid.appendChild(totalCard);

  const differenceCard = el("section","card");
  differenceCard.appendChild(el("div","metric-label","前回記録との差"));
  differenceCard.appendChild(el("div","metric-value",
    summary.difference === null ? "算出不可" : formatSignedYen(summary.difference)
  ));
  differenceCard.appendChild(el("div","metric-sub",
    summary.difference === null
      ? "比較可能な前回記録がありません"
      : "各口座の前回記録との差の合計"
  ));
  grid.appendChild(differenceCard);

  app.appendChild(grid);

  const accountCard = el("section","card");
  accountCard.appendChild(el("h3","","口座別一覧"));

  for (const row of summary.accountRows) {
    const line = el("div","account-row");
    const left = el("div");
    left.appendChild(el("div","account-name",row.account.name));
    left.appendChild(el("div","account-meta",
      TYPE_LABELS[row.account.type] + " ・ " +
      (row.latest ? row.latest.asOfDate : "記録なし")
    ));

    const right = el("div");
    right.appendChild(el("div","account-value",
      row.value === null ? "未入力" : formatYen(row.value)
    ));
    if (row.difference !== null) {
      const diff = el("div","account-meta",
        "前回比 " + formatSignedYen(row.difference)
      );
      if (row.difference > 0) diff.classList.add("positive");
      if (row.difference < 0) diff.classList.add("negative");
      right.appendChild(diff);
    }

    line.append(left,right);
    line.addEventListener("click",() => {
      selectedAccountId = row.account.id;
      currentTab = "accounts";
      render();
    });
    line.style.cursor = "pointer";
    accountCard.appendChild(line);
  }

  app.appendChild(accountCard);

  const typeCard = el("section","card");
  typeCard.appendChild(el("h3","","種別別合計"));

  for (const [type,label] of Object.entries(TYPE_LABELS)) {
    const value = summary.typeTotals[type];
    if (value === undefined) continue;
    const line = el("div","account-row");
    line.appendChild(el("div","account-name",label));
    line.appendChild(el("div","account-value",formatYen(value)));
    typeCard.appendChild(line);
  }

  app.appendChild(typeCard);

  app.appendChild(el("div","help",
    "評価額が未入力の口座は総資産に含まれません。FX建玉は総資産に加算せず、FX口座の純資産snapshotを採用します。"
  ));
}
