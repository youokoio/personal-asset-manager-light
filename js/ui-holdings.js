"use strict";

function parseHoldingsCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell === "") {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some(value => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell);
  if (row.some(value => value.trim() !== "")) rows.push(row);
  return rows;
}

function getHoldingsCsvColumnIndex(headers,aliases) {
  return headers.findIndex(header =>
    aliases.includes(header.replace(/^\uFEFF/,"").trim())
  );
}

function buildHoldingsImportPreview(account,text) {
  const rows = parseHoldingsCsvRows(text);
  if (rows.length < 2) {
    return {
      items:[],
      error:"ヘッダー行とデータ行を含むCSVを貼り付けてください。"
    };
  }

  const headers = rows[0];
  const columns = {
    name:getHoldingsCsvColumnIndex(headers,["商品名","name"]),
    wrapper:getHoldingsCsvColumnIndex(headers,["口座枠","口座区分","wrapper"]),
    kind:getHoldingsCsvColumnIndex(headers,["種別","kind"]),
    asOfDate:getHoldingsCsvColumnIndex(headers,["対象日","asOfDate"]),
    quantity:getHoldingsCsvColumnIndex(headers,["数量","quantity"]),
    costBasis:getHoldingsCsvColumnIndex(headers,["取得額","costBasis"]),
    value:getHoldingsCsvColumnIndex(headers,["評価額","value"]),
    pnl:getHoldingsCsvColumnIndex(headers,["評価損益","pnl"]),
    memo:getHoldingsCsvColumnIndex(headers,["メモ","memo"])
  };

  for (const field of ["name","wrapper","kind","asOfDate","value"]) {
    if (columns[field] < 0) {
      return {
        items:[],
        error:"必須列がありません：" + field
      };
    }
  }

  const existingKeys = new Set(
    appData.holdings.map(item => getHoldingImportKey(item))
  );
  const items = [];

  for (let index = 1; index < rows.length; index += 1) {
    const cells = rows[index];
    const getCell = field => columns[field] < 0
      ? ""
      : String(cells[columns[field]] ?? "").trim();

    const name = getCell("name");
    const wrapper = getCell("wrapper");
    const kind = getCell("kind");
    const asOfDate = getCell("asOfDate");
    const value = toNumberOrNull(getCell("value"));
    const quantity = toNumberOrNull(getCell("quantity"));
    const costBasis = toNumberOrNull(getCell("costBasis"));
    const pnl = toNumberOrNull(getCell("pnl"));
    const memo = getCell("memo");

    let error = "";
    if (!name) error = "商品名が空欄です。";
    else if (!HOLDING_WRAPPERS.includes(wrapper)) {
      error = "口座枠が正しくありません。";
    } else if (!HOLDING_KINDS.includes(kind)) {
      error = "種別が正しくありません。";
    } else if (formatDateWithWeekday(asOfDate) === asOfDate) {
      error = "対象日が正しくありません。";
    } else if (value === null) {
      error = "評価額が数値ではありません。";
    } else if (["quantity","costBasis","pnl"].some(field =>
      getCell(field) !== "" &&
      ({quantity,costBasis,pnl})[field] === null
    )) {
      error = "数量・取得額・評価損益は数値または空欄にしてください。";
    }

    const item = {
      accountId:account.id,
      name,
      wrapper,
      kind,
      asOfDate,
      quantity,
      costBasis,
      value,
      pnl,
      memo
    };
    const key = getHoldingImportKey(item);

    if (!error && existingKeys.has(key)) {
      error = "同じ商品・口座枠・対象日が登録済みのためスキップします。";
      item.status = "duplicate";
    } else if (!error) {
      existingKeys.add(key);
      item.status = "add";
    } else {
      item.status = "error";
    }

    item.error = error;
    item.rowNumber = index + 1;
    items.push(item);
  }

  return {items,error:""};
}

function renderHoldingsImportPreview(preview,container) {
  container.replaceChildren();

  if (preview.error) {
    container.appendChild(el("div","error",preview.error));
    return;
  }

  const addCount = preview.items.filter(item => item.status === "add").length;
  const duplicateCount = preview.items.filter(
    item => item.status === "duplicate"
  ).length;
  const errorCount = preview.items.filter(
    item => item.status === "error"
  ).length;

  container.appendChild(el(
    "div",
    "help",
    "追加 " + addCount + "件 ／ 重複スキップ " +
      duplicateCount + "件 ／ エラー " + errorCount + "件"
  ));

  for (const item of preview.items) {
    const row = el("div","snapshot-row");
    row.appendChild(el(
      "div",
      "snapshot-top",
      "CSV " + item.rowNumber + "行目：" +
        (item.name || "商品名なし") + " ／ " +
        (item.status === "add"
          ? "追加予定"
          : item.status === "duplicate"
            ? "重複・スキップ"
            : "エラー")
    ));
    row.appendChild(el(
      "div",
      "snapshot-meta",
      item.error || (
        item.wrapper + " ／ " + item.kind + " ／ " +
        formatDateWithWeekday(item.asOfDate) + " ／ " +
        formatYen(item.value)
      )
    ));
    container.appendChild(row);
  }
}

function renderHoldingsImportForm(account) {
  const card = el("section","card");

  const supportsStockOcr = Array.isArray(STOCK_OCR_RULES) &&
    STOCK_OCR_RULES.some(rule =>
      Array.isArray(rule.accountNames) &&
      rule.accountNames.includes(account.name)
    );

  if (supportsStockOcr) {
    const ocrButton = makeButton(
      "株式の月次更新（OCR）",
      "stock-ocr-open",
      "secondary"
    );
    ocrButton.addEventListener("click",event => {
      event.preventDefault();
      openStockOcrUpdate(account.id);
      render();
      window.scrollTo(0,0);
    });
    card.appendChild(ocrButton);
  }

  card.appendChild(el("h3","","商品別保有の一括取込"));

  card.appendChild(el(
    "div",
    "help",
    "この口座に取り込みます。CSVの1行目に「商品名,口座枠,種別,対象日,数量,取得額,評価額,評価損益,メモ」を置いてください。必須は商品名・口座枠・種別・対象日・評価額です。数値はカンマ区切りなしで入力し、空欄は未入力として保存します。"
  ));

  const form = document.createElement("form");
  const input = makeField("CSV貼り付け","holdingsCsv","",{textarea:true});
  const textarea = input.querySelector("textarea");
  textarea.rows = 6;
  textarea.placeholder =
    "商品名,口座枠,種別,対象日,数量,取得額,評価額,評価損益,メモ";
  form.appendChild(input);

  const previewButton = makeButton("プレビュー","holdings-preview","secondary");
  form.appendChild(previewButton);

  const previewContainer = el("div","holdings-import-preview");
  form.appendChild(previewContainer);

  const approve = makeButton("承認して追加","holdings-approve");
  approve.disabled = true;
  form.appendChild(approve);

  let preview = null;

  textarea.addEventListener("input",() => {
    preview = null;
    approve.disabled = true;
    previewContainer.replaceChildren();
  });

  previewButton.addEventListener("click",event => {
    event.preventDefault();
    preview = buildHoldingsImportPreview(account,textarea.value);
    renderHoldingsImportPreview(preview,previewContainer);
    approve.disabled = Boolean(preview.error) ||
      preview.items.some(item => item.status === "error") ||
      !preview.items.some(item => item.status === "add");
  });

  approve.addEventListener("click",event => {
    event.preventDefault();
    if (!preview || preview.error) return;

    const additions = preview.items.filter(item => item.status === "add");
    if (!additions.length) {
      showMessage("追加できる商品がありません。",true);
      render();
      return;
    }

    const nextData = JSON.parse(JSON.stringify(appData));
    const now = new Date().toISOString();

    for (const item of additions) {
      nextData.holdings.push({
        id:createId(),
        accountId:item.accountId,
        name:item.name,
        wrapper:item.wrapper,
        kind:item.kind,
        asOfDate:item.asOfDate,
        recordedAt:now,
        quantity:item.quantity,
        costBasis:item.costBasis,
        value:item.value,
        pnl:item.pnl,
        memo:item.memo,
        createdAt:now,
        updatedAt:now
      });
    }

    const updatedAccount = nextData.accounts.find(item =>
      item.id === account.id
    );
    if (updatedAccount) updatedAccount.updatedAt = now;

    try {
      saveData(nextData);
      appData = nextData;
      showMessage(additions.length + "件の商品別保有を追加しました。");
    } catch (error) {
      showMessage(
        error.message || "商品別保有を保存できませんでした。",
        true
      );
    }

    render();
  });

  card.appendChild(form);
  return card;
}

function renderHoldingsSection(account) {
  const card = el("section","card");
  card.appendChild(el("h3","","商品別保有"));

  const summary = calculateHoldingsSummary(appData,account.id);
  if (!summary.holdings.length) {
    card.appendChild(el("div","empty","商品別保有の記録はありません。"));
  } else {
    card.appendChild(el(
      "div",
      "metric-sub",
      "対象日：" + formatDateWithWeekday(summary.asOfDate)
    ));

    for (const wrapper of HOLDING_WRAPPERS) {
      const items = summary.holdings.filter(item => item.wrapper === wrapper);
      if (!items.length) continue;
      const subtotal = items.reduce((sum,item) => sum + item.value,0);
      appendAccountMetric(
        card,
        wrapper + " 小計",
        formatYen(subtotal),
        items.length + "商品"
      );
    }

    appendAccountMetric(card,"商品別合計",formatYen(summary.total));

    if (summary.accountValue !== null) {
      appendAccountMetric(
        card,
        "口座評価額との差額",
        formatSignedYen(summary.difference)
      );
    } else {
      appendAccountMetric(
        card,
        "口座評価額との差額",
        "算出不可",
        "口座全体の履歴がありません"
      );
    }

    for (const item of summary.holdings) {
      const row = el("div","snapshot-row");
      row.appendChild(el("div","snapshot-top",item.name));
      const details = [
        item.wrapper,
        item.kind,
        "評価額 " + formatYen(item.value),
        "取得額 " + formatYen(item.costBasis),
        "評価損益 " + formatSignedYen(item.pnl)
      ];
      if (item.quantity !== null && item.quantity !== undefined) {
        details.push("数量 " + formatInputNumber(item.quantity));
      }
      row.appendChild(el("div","snapshot-meta",details.join(" ／ ")));
      if (item.memo) {
        row.appendChild(el("div","snapshot-meta","メモ：" + item.memo));
      }
      card.appendChild(row);
    }
  }

  return card;
}
