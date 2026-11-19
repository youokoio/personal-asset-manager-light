"use strict";

/* ---------- S5h FX履歴ページ ---------- */

function getFxHistoryCellTextS5h(value,signed = false) {
  if (value === null || value === undefined ||
      !Number.isFinite(value)) {
    return "";
  }
  return signed ? formatSignedYen(value) : formatYen(value);
}

function appendFxHistoryTableCellS5h(row,value,className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = value;
  row.appendChild(cell);
}

function renderFxHistorySummaryS5h(account) {
  const card = el("section","card fx-history-summary");
  card.appendChild(el("h3","","累積確定損益"));

  const realized = getFxRealizedAt(
    appData,
    account.id,
    localDateString()
  );

  appendAccountMetric(
    card,
    "累積確定損益（現在）",
    realized && isFiniteMetricValue(realized.value)
      ? formatSignedYen(realized.value)
      : "未入力",
    realized && realized.baseSource && realized.baseDate
      ? "基準：" + realized.baseSource + " " +
        formatDateWithWeekday(realized.baseDate)
      : ""
  );

  if (!realized) {
    card.appendChild(el(
      "div",
      "help",
      "基準値・日次確定損益・決済損益の記録がないため、累積確定損益は算出できません。"
    ));
    return card;
  }

  appendAccountMetric(
    card,
    "基準値",
    realized.baseAmount === null
      ? "未設定（加算なし）"
      : formatSignedYen(realized.baseAmount),
    realized.baseDate
      ? formatDateWithWeekday(realized.baseDate)
      : ""
  );

  appendAccountMetric(
    card,
    "基準日より後の日次確定損益の合計",
    realized.dailyPnlCount > 0
      ? formatSignedYen(realized.dailyPnlTotal)
      : "該当なし（加算なし）",
    realized.dailyPnlCount > 0
      ? realized.dailyPnlCount + "日分"
      : ""
  );

  appendAccountMetric(
    card,
    "日次のない日の決済損益の合計",
    realized.fallbackSettledCount > 0
      ? formatSignedYen(realized.fallbackSettledPnl)
      : "該当なし（加算なし）",
    realized.fallbackSettledCount > 0
      ? realized.fallbackSettledCount + "件"
      : ""
  );

  const breakdownTotal =
    (realized.baseAmount === null ? 0 : realized.baseAmount) +
    realized.dailyPnlTotal +
    realized.fallbackSettledPnl;

  appendAccountMetric(
    card,
    "内訳の合計",
    formatSignedYen(breakdownTotal),
    "累積確定損益と一致"
  );

  appendFxRealizedWarnings(card,realized);
  return card;
}

function renderFxHistoryTableS5h(account) {
  const section = el("section","card");
  section.appendChild(el("h3","","FX履歴"));

  const snapshots = getAccountSnapshots(appData,account.id);
  if (!snapshots.length) {
    section.appendChild(el("div","empty","履歴はまだありません。"));
    return section;
  }

  const pairs = new Set();
  const positions = Array.isArray(appData.fxPositions)
    ? appData.fxPositions
    : [];
  for (const position of positions) {
    if (position.accountId === account.id && position.pair) {
      pairs.add(position.pair);
    }
  }
  for (const snapshot of snapshots) {
    if (!snapshot.rates ||
        typeof snapshot.rates !== "object" ||
        Array.isArray(snapshot.rates)) {
      continue;
    }
    for (const pair of Object.keys(snapshot.rates)) {
      pairs.add(pair);
    }
  }
  const pairList = Array.from(pairs).sort((a,b) =>
    a.localeCompare(b,"ja")
  );

  const columns = [
    {label:"対象日",key:"asOfDate"},
    {label:"総資産",key:"value",editable:true},
    {label:"有効元本",key:"effectivePrincipal",editable:true},
    {label:"評価損益",key:"pnl",signed:true,editable:true},
    {label:"累計スワップ",key:"swapTotal",signed:true,editable:true},
    {label:"その日の確定損益",key:"realizedPnlDaily",signed:true,editable:true},
    {label:"必要証拠金",key:"requiredMargin",editable:true},
    ...pairList.map(pair => ({
      label:"評価レート " + pair,
      pair,
      editable:true
    })),
    {label:"メモ",key:"memo"}
  ];

  const scroll = el("div","fx-history-table-wrap");
  const table = document.createElement("table");
  table.className = "fx-history-table";
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");

  for (let i = 0; i < columns.length; i++) {
    const cell = document.createElement("th");
    cell.textContent = columns[i].label;
    if (i === 0) cell.className = "fx-history-date-cell";
    headerRow.appendChild(cell);
  }

  head.appendChild(headerRow);
  table.appendChild(head);

  const body = document.createElement("tbody");
  for (const snapshot of snapshots) {
    const row = document.createElement("tr");
    row.className = "fx-history-click-row";
    row.setAttribute("aria-label",
      formatDateWithWeekday(snapshot.asOfDate) + "の履歴");

    const dateCell = document.createElement("td");
    dateCell.className = "fx-history-date-cell";
    dateCell.textContent = formatDateWithWeekday(snapshot.asOfDate);
    dateCell.tabIndex = 0;
    dateCell.setAttribute("role","button");
    dateCell.setAttribute("aria-label",
      formatDateWithWeekday(snapshot.asOfDate) + "の履歴を編集");

    const openEditor = () => {
      openFxHistoryInlineFormS11a(account,snapshot);
    };

    dateCell.addEventListener("click",openEditor);
    dateCell.addEventListener("keydown",event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openEditor();
      }
    });
    row.appendChild(dateCell);

    for (const column of columns.slice(1,-1)) {
      if (!column.editable) continue;

      const cell = column.pair
        ? renderFxHistoryEditableCellS11a(
            snapshot,
            "rates",
            {pair:column.pair}
          )
        : renderFxHistoryEditableCellS11a(
            snapshot,
            column.key
          );

      row.appendChild(cell);
    }

    const memoCell = document.createElement("td");
    memoCell.textContent = typeof snapshot.memo === "string"
      ? snapshot.memo
      : "";
    memoCell.className = "fx-history-memo-cell";
    memoCell.tabIndex = 0;
    memoCell.setAttribute("role","button");
    memoCell.setAttribute("aria-label",
      formatDateWithWeekday(snapshot.asOfDate) + "のメモ・日付を編集");
    memoCell.addEventListener("click",openEditor);
    memoCell.addEventListener("keydown",event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openEditor();
      }
    });
    row.appendChild(memoCell);

    body.appendChild(row);

    if (fxHistoryEditStateS11a.openSnapshotId === snapshot.id) {
      body.appendChild(
        renderFxHistoryInlineFormRowS11a(account,snapshot)
      );
    }
  }

  table.appendChild(body);
  scroll.appendChild(table);

  section.appendChild(el(
    "div",
    "help",
    "日付またはメモをタップすると行内編集を開きます。金額・評価レートのセルをタップすると直接編集できます。変更は「まとめて保存」まで保存されません。表は左右にスクロールできます。"
  ));

  section.appendChild(renderFxHistoryEditStateS11a(account));
  section.appendChild(scroll);
  return section;
}

function renderFxHistoryPageS5h(account) {
  app.replaceChildren();

  const back = makeButton(
    "← FX口座詳細へ戻る",
    "back-fx-history",
    "secondary"
  );
  back.addEventListener("click",() => {
    if (!confirmFxHistoryLeaveS11a()) return;

    selectedFxHistoryAccountIdS5h = null;
    resetFxHistoryEditStateS11a(null);
    render();
    window.scrollTo(0,0);
  });
  app.appendChild(back);
  app.appendChild(heading(account.name + " ／ FX履歴"));
  app.appendChild(renderFxHistorySummaryS5h(account));
  app.appendChild(renderFxHistoryTableS5h(account));
}

const renderAccountDetailBeforeS5g = renderAccountDetail;

renderAccountDetail = function() {
  const account = appData.accounts.find(item =>
    item.id === selectedAccountId
  );

  if (!account || account.type !== "fx") {
    selectedFxHistoryAccountIdS5h = null;
    renderAccountDetailBeforeS5g();
    return;
  }

  if (selectedFxHistoryAccountIdS5h === account.id) {
    renderFxHistoryPageS5h(account);
    return;
  }

  selectedFxHistoryAccountIdS5h = null;
  renderFxAccountDetailS5g(account);
};
