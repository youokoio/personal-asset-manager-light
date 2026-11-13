"use strict";

/* ---------- FX集計 ---------- */

function getFxOpenPositions(data,accountId = null) {
  return data.fxPositions.filter(position =>
    position.status === "保有中" &&
    (accountId === null || position.accountId === accountId)
  );
}

function getFxRateRecord(data,accountId,pair) {
  return data.fxRates.find(rate =>
    rate.accountId === accountId &&
    rate.pair === pair
  ) || null;
}

function calculateFxPositionExchangeProfit(position,rate) {
  if (!position ||
      !Number.isFinite(rate) ||
      !Number.isFinite(position.openRate) ||
      !Number.isFinite(position.quantity)) {
    return null;
  }

  if (position.side === "買") {
    return (rate - position.openRate) * position.quantity;
  }

  if (position.side === "売") {
    return (position.openRate - rate) * position.quantity;
  }

  return null;
}

function calculateFxAggregateRows(data) {
  const groups = new Map();

  for (const position of getFxOpenPositions(data)) {
    const key = JSON.stringify([
      position.accountId,
      position.pair,
      position.side
    ]);

    if (!groups.has(key)) {
      groups.set(key,{
        accountId:position.accountId,
        pair:position.pair,
        side:position.side,
        positions:[]
      });
    }

    groups.get(key).positions.push(position);
  }

  const accountOrder = new Map(
    data.accounts.map((account,index) => [account.id,index])
  );

  const rows = [];

  for (const group of groups.values()) {
    const positions = group.positions;
    const quantity = positions.reduce(
      (sum,position) => sum + position.quantity,
      0
    );

    const weightedRateTotal = positions.reduce(
      (sum,position) =>
        sum + position.quantity * position.openRate,
      0
    );

    const averageOpenRate = quantity > 0
      ? weightedRateTotal / quantity
      : null;

    const rateRecord = getFxRateRecord(
      data,
      group.accountId,
      group.pair
    );

    const evaluationRate = rateRecord &&
      Number.isFinite(rateRecord.rate) &&
      rateRecord.rate > 0
        ? rateRecord.rate
        : null;

    const exchangeProfit = evaluationRate === null
      ? null
      : positions.reduce((sum,position) =>
          sum + calculateFxPositionExchangeProfit(
            position,
            evaluationRate
          ),
          0
        );

    const allSwapsEntered = positions.every(position =>
      typeof position.swap === "number" &&
      Number.isFinite(position.swap)
    );

    const swapTotal = allSwapsEntered
      ? positions.reduce((sum,position) => sum + position.swap,0)
      : null;

    const evaluationPnl = exchangeProfit !== null &&
      swapTotal !== null
        ? exchangeProfit + swapTotal
        : null;

    const account = data.accounts.find(item =>
      item.id === group.accountId
    );

    rows.push({
      accountId:group.accountId,
      accountName:account ? account.name : "不明",
      pair:group.pair,
      side:group.side,
      quantity,
      positionCount:positions.length,
      averageOpenRate,
      evaluationRate,
      evaluationRateDate:rateRecord
        ? rateRecord.asOfDate ?? null
        : null,
      exchangeProfit,
      swapTotal,
      evaluationPnl
    });
  }

  return rows.sort((a,b) => {
    const accountDifference =
      (accountOrder.get(a.accountId) ?? Number.MAX_SAFE_INTEGER) -
      (accountOrder.get(b.accountId) ?? Number.MAX_SAFE_INTEGER);

    if (accountDifference !== 0) return accountDifference;
    if (a.pair !== b.pair) return a.pair.localeCompare(b.pair);
    if (a.side === b.side) return 0;
    return a.side === "買" ? -1 : 1;
  });
}

function calculateFxAccountAggregateSummary(data,accountId) {
  const rows = calculateFxAggregateRows(data).filter(row =>
    row.accountId === accountId
  );

  if (!rows.length) {
    return {
      aggregateCount:0,
      calculatedCount:0,
      exchangeProfit:null,
      status:"未入力"
    };
  }

  const calculatedRows = rows.filter(row =>
    row.exchangeProfit !== null
  );

  const allCalculated = calculatedRows.length === rows.length;

  return {
    aggregateCount:rows.length,
    calculatedCount:calculatedRows.length,
    exchangeProfit:allCalculated
      ? calculatedRows.reduce(
          (sum,row) => sum + row.exchangeProfit,
          0
        )
      : null,
    status:allCalculated
      ? "計算済"
      : calculatedRows.length > 0
        ? "一部未計算"
        : "未計算"
  };
}

function getFxAccountPairs(data,accountId) {
  return data.fxRates
    .filter(rate => rate.accountId === accountId)
    .slice()
    .sort((a,b) => a.pair.localeCompare(b.pair));
}

/* ---------- 建玉データ検証 ---------- */

function isValidFxPositionDate(value) {
  if (typeof value !== "string" || !value.trim()) return false;

  const normalized = value.replace(" ","T");
  const timestamp = Date.parse(normalized);

  if (!Number.isFinite(timestamp)) return false;

  const datePart = value.slice(0,10).replace(/\//g,"-");
  const parts = datePart.split("-").map(Number);

  if (parts.length !== 3 ||
      !parts.every(Number.isFinite)) {
    return false;
  }

  const date = new Date(
    parts[0],
    parts[1] - 1,
    parts[2]
  );

  return date.getFullYear() === parts[0] &&
    date.getMonth() === parts[1] - 1 &&
    date.getDate() === parts[2];
}

function validateFxPositionInput(position) {
  if (!position || typeof position !== "object") {
    return "建玉データが正しくありません。";
  }

  if (typeof position.accountId !== "string" ||
      !position.accountId) {
    return "口座を選択してください。";
  }

  if (typeof position.pair !== "string" ||
      !/^[A-Z]{3}\/JPY$/.test(position.pair)) {
    return "通貨ペアは英大文字3文字/JPYで入力してください。";
  }

  if (!["買","売"].includes(position.side)) {
    return "売買方向を選択してください。";
  }

  if (!isValidFxPositionDate(position.openDate)) {
    return "約定日時を正しく入力してください。";
  }

  if (!Number.isSafeInteger(position.quantity) ||
      position.quantity <= 0) {
    return "数量は正の整数で入力してください。";
  }

  if (typeof position.openRate !== "number" ||
      !Number.isFinite(position.openRate) ||
      position.openRate <= 0) {
    return "約定レートは0より大きい数値で入力してください。";
  }

  if (position.swap !== null &&
      position.swap !== undefined &&
      (typeof position.swap !== "number" ||
       !Number.isFinite(position.swap))) {
    return "累計スワップは数値または空欄にしてください。";
  }

  return null;
}

/* ---------- FX建玉CSV解析 ---------- */

function parseFxCsvDate(value) {
  const text = String(value || "").trim();
  const match = text.match(
    /^(\d{2}|\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/
  );

  if (!match) return null;

  let year = Number(match[1]);
  if (match[1].length === 2) year += 2000;

  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] === undefined ? null : Number(match[4]);
  const minute = match[5] === undefined ? null : Number(match[5]);

  const date = new Date(year,month - 1,day);

  if (date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day ||
      (hour !== null && (hour < 0 || hour > 23)) ||
      (minute !== null && (minute < 0 || minute > 59))) {
    return null;
  }

  const dateText =
    String(year).padStart(4,"0") + "-" +
    String(month).padStart(2,"0") + "-" +
    String(day).padStart(2,"0");

  return hour === null
    ? dateText
    : dateText + "T" +
      String(hour).padStart(2,"0") + ":" +
      String(minute).padStart(2,"0");
}

function parseFxCsvText(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  const source = String(text || "").replace(/^\uFEFF/,"");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quoted) {
      if (character === "\"" && source[index + 1] === "\"") {
        cell += "\"";
        index += 1;
      } else if (character === "\"") {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === "\"" && cell === "") {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }

  if (quoted) {
    return {
      rows:[],
      error:"CSVの引用符が閉じられていません。"
    };
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return {
    rows:rows.filter(items =>
      items.some(value => String(value).trim() !== "")
    ),
    error:null
  };
}

function parseFxPositionCsv(text,accounts) {
  const parsed = parseFxCsvText(text);

  if (parsed.error) {
    return {items:[],errors:[parsed.error]};
  }

  if (parsed.rows.length < 2) {
    return {
      items:[],
      errors:["ヘッダーとデータ行を含むCSVを入力してください。"]
    };
  }

  const headers = parsed.rows[0].map(value =>
    String(value).trim()
  );

  const requiredHeaders = [
    "口座名",
    "通貨ペア",
    "売買方向",
    "約定日時",
    "数量",
    "約定レート",
    "累計スワップ"
  ];

  if (headers.length !== requiredHeaders.length ||
      requiredHeaders.some((header,index) =>
        headers[index] !== header
      )) {
    return {
      items:[],
      errors:[
        "CSVの列順・見出しが正しくありません。",
        "必要な列： " + requiredHeaders.join(",")
      ]
    };
  }

  const fxAccounts = accounts.filter(account =>
    account.type === "fx"
  );
  const items = [];
  const errors = [];

  for (let index = 1; index < parsed.rows.length; index += 1) {
    const values = parsed.rows[index];
    const lineNumber = index + 1;

    if (values.length !== requiredHeaders.length) {
      errors.push(lineNumber + "行目：列数が正しくありません。");
      continue;
    }

    const accountName = String(values[0]).trim();
    const account = fxAccounts.find(item =>
      item.name === accountName
    );

    const date = parseFxCsvDate(values[3]);
    const quantityText = String(values[4]).replace(/,/g,"").trim();
    const rateText = String(values[5]).replace(/,/g,"").trim();
    const swapText = String(values[6]).replace(/,/g,"").trim();

    const quantity = quantityText === ""
      ? null
      : Number(quantityText);
    const openRate = rateText === ""
      ? null
      : Number(rateText);
    const swap = swapText === ""
      ? null
      : Number(swapText);

    const item = {
      accountId:account ? account.id : "",
      pair:String(values[1]).trim(),
      side:String(values[2]).trim(),
      openDate:date || "",
      quantity,
      openRate,
      swap,
      status:"保有中",
      closeDate:null,
      closeRate:null,
      realizedPnl:null,
      sourceRow:lineNumber
    };

    if (!account) {
      errors.push(lineNumber + "行目：FX口座名が見つかりません。");
      continue;
    }

    const validationError = validateFxPositionInput(item);
    if (validationError) {
      errors.push(lineNumber + "行目：" + validationError);
      continue;
    }

    items.push(item);
  }

  return {items,errors};
}

/* ---------- スワップ調整 ---------- */

function createFxSwapAdjustment(
  position,
  reason,
  amount,
  now = new Date().toISOString()
) {
  if (!position ||
      !Number.isFinite(amount) ||
      amount === 0) {
    return null;
  }

  return {
    id:createId(),
    accountId:position.accountId,
    pair:position.pair,
    side:position.side,
    asOfDate:localDateString(),
    recordedAt:now,
    amount,
    reason,
    positionId:position.id
  };
}
