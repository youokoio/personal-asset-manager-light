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

    const latestSwapRegistration = getLatestFxSwapRegistration(
      data,
      group.accountId,
      group.pair,
      group.side
    );

    const swapTotal = latestSwapRegistration
      ? latestSwapRegistration.total
      : allSwapsEntered
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

/* ---------- FX建玉入力補助 ---------- */

const FX_STANDARD_PAIRS = [
  "TRY/JPY",
  "ZAR/JPY",
  "USD/JPY",
  "EUR/JPY",
  "AUD/JPY"
];

const FX_OTHER_PAIR_OPTION = "その他（入力）";

function buildPairOptions(data,accountId) {
  const pairs = new Set(FX_STANDARD_PAIRS);

  for (const rate of data.fxRates) {
    if (rate.accountId === accountId &&
        typeof rate.pair === "string") {
      pairs.add(rate.pair);
    }
  }

  for (const position of data.fxPositions) {
    if (position.accountId === accountId &&
        typeof position.pair === "string") {
      pairs.add(position.pair);
    }
  }

  return [
    ...pairs,
    FX_OTHER_PAIR_OPTION
  ];
}

function convertFxQuantityInput(value,unit) {
  const factors = {
    "通貨":1,
    "千通貨":1000,
    "万通貨":10000
  };

  if (typeof value !== "string" ||
      !value.trim()) {
    return {
      quantity:null,
      error:"数量を入力してください。"
    };
  }

  if (!Object.prototype.hasOwnProperty.call(factors,unit)) {
    return {
      quantity:null,
      error:"数量の単位を選択してください。"
    };
  }

  const text = value.trim();

  if (!/^\d+(?:\.\d+)?$/.test(text)) {
    return {
      quantity:null,
      error:"数量は0より大きい数値で入力してください。"
    };
  }

  const parts = text.split(".");
  const integerPart = parts[0];
  const decimalPart = parts[1] || "";
  const factor = BigInt(factors[unit]);
  const denominator = 10n ** BigInt(decimalPart.length);
  const numerator =
    BigInt(integerPart) * denominator +
    BigInt(decimalPart || "0");

  const convertedNumerator = numerator * factor;

  if (convertedNumerator % denominator !== 0n) {
    return {
      quantity:null,
      error:"数量の最小単位は1通貨です。"
    };
  }

  const converted = convertedNumerator / denominator;

  if (converted <= 0n ||
      converted > BigInt(Number.MAX_SAFE_INTEGER)) {
    return {
      quantity:null,
      error:"数量は正の安全な整数で入力してください。"
    };
  }

  return {
    quantity:Number(converted),
    error:null
  };
}

function getFxQuantityInputParts(quantity) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    return {
      value:"",
      unit:"万通貨"
    };
  }

  if (quantity % 10000 === 0) {
    return {
      value:String(quantity / 10000),
      unit:"万通貨"
    };
  }

  if (quantity % 1000 === 0) {
    return {
      value:String(quantity / 1000),
      unit:"千通貨"
    };
  }

  return {
    value:String(quantity),
    unit:"通貨"
  };
}

function formatFxQuantity(quantity) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    return "—";
  }

  if (quantity % 10000 === 0) {
    return (quantity / 10000).toLocaleString("ja-JP") + "万通貨";
  }

  if (quantity % 1000 === 0) {
    return (quantity / 1000).toLocaleString("ja-JP") + "千通貨";
  }

  return quantity.toLocaleString("ja-JP") + "通貨";
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

function isValidFxPositionAsOfDate(value) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parts = value.split("-").map(Number);
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

  if (position.asOfDate !== null &&
      position.asOfDate !== undefined &&
      !isValidFxPositionAsOfDate(position.asOfDate)) {
    return "データ確認日を正しく入力してください。";
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

  const optionalHeader = "データ確認日";

  const hasAsOfDateColumn =
    headers.length === requiredHeaders.length + 1 &&
    headers[requiredHeaders.length] === optionalHeader;

  if ((!hasAsOfDateColumn &&
       headers.length !== requiredHeaders.length) ||
      requiredHeaders.some((header,index) =>
        headers[index] !== header
      )) {
    return {
      items:[],
      errors:[
        "CSVの列順・見出しが正しくありません。",
        "必要な列： " +
          requiredHeaders.concat([optionalHeader]).join(",") +
          "（最後のデータ確認日は省略できます）"
      ]
    };
  }

  const expectedColumnCount = hasAsOfDateColumn
    ? requiredHeaders.length + 1
    : requiredHeaders.length;

  const fxAccounts = accounts.filter(account =>
    account.type === "fx"
  );
  const items = [];
  const errors = [];

  for (let index = 1; index < parsed.rows.length; index += 1) {
    const values = parsed.rows[index];
    const lineNumber = index + 1;

    if (values.length !== expectedColumnCount) {
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
    const asOfDateText = hasAsOfDateColumn
      ? String(values[7]).trim()
      : "";

    const asOfDate = asOfDateText === ""
      ? null
      : parseFxCsvDate(asOfDateText);

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
      asOfDate,
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

    if (asOfDateText !== "" &&
        (asOfDate === null ||
         !isValidFxPositionAsOfDate(asOfDate))) {
      errors.push(lineNumber + "行目：データ確認日を正しく入力してください。");
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

/* ---------- FX決済シミュレーション ---------- */

function calculateFxSettlementSimulation(
  data,
  accountId,
  selectedPositionIds,
  settlementRates,
  swapValues,
  options = {}
) {
  if (!data || !Array.isArray(data.accounts) ||
      !Array.isArray(data.fxPositions) || !Array.isArray(data.fxRates) ||
      !Array.isArray(data.snapshots) || !Array.isArray(data.fxSwapLedger) ||
      !data.settings) {
    throw new Error("FXデータの形式が正しくありません。");
  }

  if (!data.accounts.some(item =>
    item.id === accountId && item.type === "fx"
  )) {
    throw new Error("FX口座が見つかりません。");
  }

  if (!Array.isArray(selectedPositionIds) ||
      selectedPositionIds.length === 0 ||
      new Set(selectedPositionIds).size !== selectedPositionIds.length) {
    throw new Error("決済する建玉を1件以上選択してください。");
  }

  const openPositions = getFxOpenPositions(data,accountId);
  const selectedPositions = selectedPositionIds.map(id =>
    openPositions.find(position => position.id === id) || null
  );
  if (selectedPositions.some(position => position === null)) {
    throw new Error("選択した建玉が見つからないか、既に決済されています。");
  }

  const rates = settlementRates && typeof settlementRates === "object"
    ? settlementRates
    : {};
  const swaps = swapValues && typeof swapValues === "object"
    ? swapValues
    : {};
  const details = [];
  let settlementPnl = 0;

  for (const position of selectedPositions) {
    const rate = rates[position.pair];
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(position.pair + "の決済レートを入力してください。");
    }

    const swap = Object.prototype.hasOwnProperty.call(swaps,position.id)
      ? swaps[position.id]
      : position.swap;
    if (!Number.isSafeInteger(swap)) {
      throw new Error(
        position.pair + "のスワップを整数の円で入力してください。"
      );
    }

    const exchangeProfit = Math.trunc(
      calculateFxPositionExchangeProfit(position,rate)
    );
    if (!Number.isSafeInteger(exchangeProfit)) {
      throw new Error("決済為替損益が安全な整数の範囲を超えています。");
    }

    const total = exchangeProfit + swap;
    if (!Number.isSafeInteger(total)) {
      throw new Error("決済損益が安全な整数の範囲を超えています。");
    }
    settlementPnl += total;
    details.push({
      positionId:position.id,
      pair:position.pair,
      side:position.side,
      quantity:position.quantity,
      openRate:position.openRate,
      settlementRate:rate,
      exchangeProfit,
      swap,
      total
    });
  }

  if (!Number.isSafeInteger(settlementPnl)) {
    throw new Error("決済損益合計が安全な整数の範囲を超えています。");
  }

  const taxRatePct = data.settings.taxRatePct;
  const fxYtdRealized = data.settings.fxYtdRealized;
  const fxLossCarry = data.settings.fxLossCarry;
  if (![taxRatePct,fxYtdRealized,fxLossCarry].every(Number.isFinite) ||
      taxRatePct < 0) {
    throw new Error("税率・今年の確定損益・繰越損失の設定を確認してください。");
  }

  const taxBefore = Math.max(0,fxYtdRealized - fxLossCarry);
  const taxAfter = Math.max(
    0,
    fxYtdRealized + settlementPnl - fxLossCarry
  );
  const estimatedTax = settlementPnl < 0
    ? 0
    : Math.floor(Math.max(0,taxAfter - taxBefore) * taxRatePct / 100);
  const afterTaxProfit = settlementPnl - estimatedTax;

  const beforeLossCut = calculateFxLossCut(data,accountId);
  const context = getFxLossCutAccountContext(data,accountId);
  const deductTax = options.deductTax === true;
  const currentEquity = context.effectiveEquity;
  const afterEquity = Number.isFinite(currentEquity)
    ? currentEquity - (deductTax ? estimatedTax : 0)
    : null;
  const selectedIdSet = new Set(selectedPositionIds);
  const remainingPositions = openPositions.filter(position =>
    !selectedIdSet.has(position.id)
  );
  const remainingLossCutPositions = context.positions.filter(position =>
    !selectedIdSet.has(position.id)
  );
  const remainingPairs = new Set(remainingLossCutPositions.map(position =>
    position.pair
  ));
  const afterContext = {
    ...context,
    positions:remainingLossCutPositions,
    missing:context.missing.filter(item => {
      const match = item.match(/^評価レート（(.+)）$/);
      return !match || remainingPairs.has(match[1]);
    })
  };

  let afterLossCut = {
    canCalculate:false,
    missing:[],
    warnings:context.warnings.slice(),
    effectiveEquity:afterEquity,
    metrics:null,
    pairRates:[],
    lossCutAtDetails:[]
  };

  if (remainingLossCutPositions.length > 0 &&
      afterContext.missing.length === 0 &&
      Number.isFinite(afterEquity)) {
    const metrics = calculateFxLossCutMetrics(
      afterContext,
      afterContext.rates,
      afterEquity
    );
    if (metrics) {
      const pairRates = calculateFxLossCutPairRates(
        afterContext,
        afterEquity
      );
      const lossCutAtDetails = pairRates.flatMap(pairResult =>
        pairResult.roots
          .filter(root => root.rate !== null)
          .map(root => ({pair:pairResult.pair,...root}))
      );
      afterLossCut = {
        canCalculate:true,
        missing:[],
        warnings:context.warnings.slice(),
        effectiveEquity:afterEquity,
        metrics,
        pairRates,
        lossCutAtDetails
      };
    }
  } else {
    afterLossCut.missing = afterContext.missing.slice();
    if (!remainingLossCutPositions.length) {
      afterLossCut.missing.push("決済後に残る円建て建玉");
    }
  }

  const targetPair = options.targetPair || "";
  const targetRate = options.targetRate;
  let targetMaintenance = {
    canCalculate:false,
    pair:targetPair || null,
    rate:Number.isFinite(targetRate) ? targetRate : null,
    requiredEffectiveEquity:null,
    difference:null
  };

  if (remainingLossCutPositions.length > 0 &&
      afterContext.missing.length === 0 &&
      Number.isFinite(afterEquity) &&
      remainingPairs.has(targetPair) &&
      Number.isFinite(targetRate) &&
      targetRate > 0) {
    let currentProfit = 0;
    let targetProfit = 0;
    let rawRequiredMargin = 0;
    let valid = true;

    for (const position of remainingLossCutPositions) {
      const currentRate = afterContext.rates[position.pair];
      const scenarioRate = position.pair === targetPair
        ? targetRate
        : currentRate;
      if (!Number.isFinite(currentRate) ||
          !Number.isFinite(scenarioRate) ||
          !Number.isFinite(position.quantity) ||
          position.quantity <= 0) {
        valid = false;
        break;
      }
      currentProfit += calculateFxPositionExchangeProfit(
        position,
        currentRate
      );
      targetProfit += calculateFxPositionExchangeProfit(
        position,
        scenarioRate
      );
      rawRequiredMargin += position.quantity *
        scenarioRate * context.marginRatePct / 100;
    }

    const requiredMargin = rawRequiredMargin * context.correctionFactor;
    if (valid && Number.isFinite(requiredMargin)) {
      const requiredEffectiveEquity =
        context.lossCutRatio * requiredMargin / 100 -
        (targetProfit - currentProfit);
      targetMaintenance = {
        canCalculate:true,
        pair:targetPair,
        rate:targetRate,
        requiredEffectiveEquity,
        difference:requiredEffectiveEquity - afterEquity
      };
    }
  }

  const warnings = [];
  const selectedGroups = new Map();
  for (const position of selectedPositions) {
    const key = JSON.stringify([
      position.accountId,
      position.pair,
      position.side
    ]);
    if (!selectedGroups.has(key)) {
      selectedGroups.set(key,{
        pair:position.pair,
        side:position.side
      });
    }
  }

  for (const group of selectedGroups.values()) {
    const latest = getLatestFxSwapRegistration(
      data,
      accountId,
      group.pair,
      group.side
    );
    const reconciliation = calculateFxSwapGroupReconciliation(
      data,
      accountId,
      group.pair,
      group.side
    );
    if ((latest && latest.status === "未配分") ||
        (reconciliation && reconciliation.warning)) {
      warnings.push(
        group.pair + "／" + group.side +
        "にスワップの未配分・不一致があります。決済損益のスワップが不正確な可能性があります。"
      );
    }
  }

  return {
    accountId,
    selectedCount:selectedPositions.length,
    details,
    settlementPnl,
    taxRatePct,
    estimatedTax,
    afterTaxProfit,
    deductTax,
    currentEquity,
    afterEquity,
    beforeLossCut:{
      canCalculate:beforeLossCut.canCalculate,
      missing:beforeLossCut.missing,
      metrics:beforeLossCut.metrics,
      lossCutAtDetails:beforeLossCut.lossCutAtDetails
    },
    afterLossCut,
    remainingPositionCount:remainingPositions.length,
    targetMaintenance,
    warnings
  };
}