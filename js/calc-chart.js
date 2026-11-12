"use strict";

/* ---------- S8a グラフ系列の計算 ---------- */

const CHART_FIELD_DEFINITIONS = [
  {value:"value",label:"総資産"},
  {value:"effectivePrincipal",label:"有効元本"},
  {value:"pnl",label:"評価損益"},
  {value:"realizedPnlTotal",label:"累積確定損益"},
  {value:"totalPnl",label:"通算損益"},
  {value:"swapTotal",label:"累計スワップ"}
];

function getChartTargetOptions(data) {
  const options = [
    {value:"all",label:"全体合計",type:"all"},
    {value:"category:fx",label:"FX合計",type:"category",category:"fx"},
    {value:"category:stock",label:"株式合計",type:"category",category:"stock"},
    {value:"category:crypto",label:"暗号資産合計",type:"category",category:"crypto"},
    {value:"category:bank",label:"銀行合計",type:"category",category:"bank"}
  ];

  for (const account of data.accounts) {
    options.push({
      value:"account:" + account.id,
      label:account.name,
      type:"account",
      accountId:account.id,
      category:getCategory(account)
    });
  }

  return options;
}

function getChartTargetInfo(data,targetValue) {
  if (targetValue === "all") {
    return {
      value:"all",
      label:"全体合計",
      type:"all",
      accounts:data.accounts.slice()
    };
  }

  if (typeof targetValue !== "string") return null;

  if (targetValue.startsWith("category:")) {
    const category = targetValue.slice("category:".length);
    if (!Object.prototype.hasOwnProperty.call(
      CATEGORY_LABELS,
      category
    )) return null;

    return {
      value:targetValue,
      label:CATEGORY_LABELS[category] + "合計",
      type:"category",
      category,
      accounts:data.accounts.filter(account =>
        getCategory(account) === category
      )
    };
  }

  if (targetValue.startsWith("account:")) {
    const accountId = targetValue.slice("account:".length);
    const account = data.accounts.find(item => item.id === accountId);
    if (!account) return null;

    return {
      value:targetValue,
      label:account.name,
      type:"account",
      accountId,
      category:getCategory(account),
      accounts:[account]
    };
  }

  return null;
}

function getChartFieldOptions(targetInfo) {
  if (!targetInfo) return [];

  if (targetInfo.category === "bank") {
    return CHART_FIELD_DEFINITIONS.filter(
      field => field.value === "value"
    );
  }

  if (targetInfo.type === "account" &&
      targetInfo.category === "fx") {
    return CHART_FIELD_DEFINITIONS.filter(
      field => ["value","effectivePrincipal","pnl","swapTotal"]
        .includes(field.value)
    );
  }

  if (targetInfo.type === "category" &&
      targetInfo.category === "fx") {
    return CHART_FIELD_DEFINITIONS.filter(
      field => ["value","effectivePrincipal","pnl","swapTotal"]
        .includes(field.value)
    );
  }

  if (targetInfo.type === "all") {
    return CHART_FIELD_DEFINITIONS.filter(
      field => field.value !== "realizedPnlTotal" &&
        field.value !== "totalPnl"
    ).concat(
      CHART_FIELD_DEFINITIONS.filter(
        field => ["realizedPnlTotal","totalPnl"].includes(field.value)
      )
    );
  }

  return CHART_FIELD_DEFINITIONS.filter(
    field => field.value !== "swapTotal"
  );
}

function getChartMetricValue(account,snapshot,field) {
  if (!account || !snapshot) return null;

  if (getCategory(account) === "bank" && field !== "value") {
    return null;
  }

  if (field === "totalPnl") {
    if (account.type === "fx") return null;

    if (!isFiniteMetricValue(snapshot.pnl) ||
        !isFiniteMetricValue(snapshot.realizedPnlTotal)) {
      return null;
    }

    return snapshot.pnl + snapshot.realizedPnlTotal;
  }

  if (field === "realizedPnlTotal" && account.type === "fx") {
    return null;
  }

  if (field === "swapTotal" && account.type !== "fx") {
    return null;
  }

  const value = snapshot[field];
  return isFiniteMetricValue(value) ? value : null;
}

function getChartAccountSnapshots(data,accountId) {
  return data.snapshots
    .filter(snapshot => snapshot.accountId === accountId)
    .sort((a,b) => {
      if (a.asOfDate !== b.asOfDate) {
        return a.asOfDate.localeCompare(b.asOfDate);
      }
      return String(a.recordedAt || "").localeCompare(
        String(b.recordedAt || "")
      );
    });
}

function getChartSnapshotAtDate(snapshots,targetDate) {
  let selected = null;

  for (const snapshot of snapshots) {
    if (snapshot.asOfDate > targetDate) break;
    if (!selected ||
        snapshot.asOfDate > selected.asOfDate ||
        (snapshot.asOfDate === selected.asOfDate &&
         String(snapshot.recordedAt || "") >
         String(selected.recordedAt || ""))) {
      selected = snapshot;
    }
  }

  return selected;
}

function getChartTargetDates(data,accounts) {
  const accountIds = new Set(accounts.map(account => account.id));
  const dates = new Set();

  for (const snapshot of data.snapshots) {
    if (accountIds.has(snapshot.accountId)) {
      dates.add(snapshot.asOfDate);
    }
  }

  return Array.from(dates).sort();
}

function createChartSeries(data,targetValue,field) {
  const targetInfo = getChartTargetInfo(data,targetValue);
  if (!targetInfo) {
    return {
      target:targetValue,
      field,
      label:"対象が見つかりません",
      points:[]
    };
  }

  const allowedFields = getChartFieldOptions(targetInfo)
    .map(item => item.value);

  if (!allowedFields.includes(field)) {
    return {
      target:targetValue,
      field,
      label:targetInfo.label + "／対象外項目",
      points:[]
    };
  }

  const accounts = targetInfo.accounts;
  const dates = getChartTargetDates(data,accounts);
  const snapshotsByAccount = new Map(
    accounts.map(account => [
      account.id,
      getChartAccountSnapshots(data,account.id)
    ])
  );

  const points = [];

  for (const date of dates) {
    let total = 0;
    let includedCount = 0;

    for (const account of accounts) {
      const snapshots = snapshotsByAccount.get(account.id) || [];
      const snapshot = getChartSnapshotAtDate(snapshots,date);
      if (!snapshot) continue;

      const value = getChartMetricValue(account,snapshot,field);
      if (value === null) continue;

      total += value;
      includedCount += 1;
    }

    if (includedCount > 0) {
      points.push({
        date,
        value:targetInfo.type === "account" ? total : total,
        includedCount
      });
    }
  }

  const fieldLabel = CHART_FIELD_DEFINITIONS.find(
    item => item.value === field
  )?.label || field;

  return {
    target:targetValue,
    field,
    label:targetInfo.label + "／" + fieldLabel,
    points
  };
}

/* ---------- 期間 ---------- */

function shiftChartDate(dateString,months) {
  if (typeof dateString !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return null;
  }

  const parts = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(
    parts[0],
    parts[1] - 1,
    parts[2]
  ));

  if (date.getUTCFullYear() !== parts[0] ||
      date.getUTCMonth() !== parts[1] - 1 ||
      date.getUTCDate() !== parts[2]) {
    return null;
  }

  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);

  const lastDay = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    0
  )).getUTCDate();

  date.setUTCDate(Math.min(originalDay,lastDay));

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2,"0"),
    String(date.getUTCDate()).padStart(2,"0")
  ].join("-");
}

function getChartPeriod(data,period,startDate,endDate) {
  const dates = data.snapshots
    .map(snapshot => snapshot.asOfDate)
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();

  const latestDate = dates.length
    ? dates[dates.length - 1]
    : null;
  const earliestDate = dates.length ? dates[0] : null;

  if (period === "custom") {
    return {
      startDate:startDate || earliestDate,
      endDate:endDate || latestDate
    };
  }

  if (!latestDate) {
    return {startDate:null,endDate:null};
  }

  if (period === "all") {
    return {
      startDate:earliestDate,
      endDate:latestDate
    };
  }

  const months = {
    "1m":1,
    "3m":3,
    "6m":6,
    "1y":12
  }[period];

  if (!months) {
    return {
      startDate:earliestDate,
      endDate:latestDate
    };
  }

  return {
    startDate:shiftChartDate(latestDate,-months),
    endDate:latestDate
  };
}

function filterChartSeriesByPeriod(series,periodRange) {
  if (!periodRange.startDate || !periodRange.endDate) {
    return {...series,points:[]};
  }

  return {
    ...series,
    points:series.points.filter(point =>
      point.date >= periodRange.startDate &&
      point.date <= periodRange.endDate
    )
  };
}

/* ---------- 期間統計 ---------- */

function calculateChartStatistics(points) {
  if (!Array.isArray(points) || points.length <= 1) {
    return {
      available:false,
      startDate:null,
      endDate:null,
      startValue:null,
      endValue:null,
      difference:null,
      rate:null
    };
  }

  const first = points[0];
  const last = points[points.length - 1];
  const difference = last.value - first.value;

  return {
    available:true,
    startDate:first.date,
    endDate:last.date,
    startValue:first.value,
    endValue:last.value,
    difference,
    rate:first.value === 0
      ? null
      : difference / first.value * 100
  };
}

function buildChartData(data,seriesPreferences,period,startDate,endDate) {
  const periodRange = getChartPeriod(
    data,
    period,
    startDate,
    endDate
  );

  const series = (Array.isArray(seriesPreferences)
    ? seriesPreferences
    : [])
    .slice(0,6)
    .filter(item =>
      item &&
      typeof item.target === "string" &&
      typeof item.field === "string"
    )
    .map(item => {
      const created = createChartSeries(
        data,
        item.target,
        item.field
      );
      const filtered = filterChartSeriesByPeriod(
        created,
        periodRange
      );

      return {
        ...filtered,
        statistics:calculateChartStatistics(filtered.points)
      };
    });

  return {
    period:periodRange,
    series
  };
}

/* ---------- S8a 純粋関数テスト ---------- */

function runChartCalculationTests() {
  const results = [];

  function assert(condition,message) {
    if (!condition) throw new Error(message);
  }

  function run(name,callback) {
    try {
      callback();
      results.push({name,success:true,message:"合格"});
    } catch (error) {
      results.push({
        name,
        success:false,
        message:error.message
      });
    }
  }

  function account(id,name,category,type) {
    return {
      id,
      name,
      category,
      type,
      sortOrder:0
    };
  }

  function snapshot(id,accountId,date,recordedAt,value,extra = {}) {
    return {
      id,
      accountId,
      asOfDate:date,
      recordedAt,
      value,
      ...extra
    };
  }

  run("S8a：口座系列は対象日の最新記録を採用",() => {
    const data = {
      accounts:[account("a","架空口座A","stock","securities")],
      snapshots:[
        snapshot("a1","a","2026-01-01","2026-01-01T09:00:00Z",100),
        snapshot("a2","a","2026-01-01","2026-01-01T12:00:00Z",150),
        snapshot("a3","a","2026-01-10","2026-01-10T12:00:00Z",200)
      ]
    };

    const result = createChartSeries(
      data,
      "account:a",
      "value"
    );

    assert(result.points.length === 2,
      "同一対象日の重複が除外されていません。");
    assert(result.points[0].value === 150,
      "recordedAtが最新の値を採用していません。");
  });

  run("S8a：合計系列は各口座のその日以前の最新値を合算",() => {
    const data = {
      accounts:[
        account("a","架空口座A","stock","securities"),
        account("b","架空口座B","stock","securities")
      ],
      snapshots:[
        snapshot("a1","a","2026-01-01","2026-01-01T10:00:00Z",100),
        snapshot("a2","a","2026-01-10","2026-01-10T10:00:00Z",150),
        snapshot("b1","b","2026-01-05","2026-01-05T10:00:00Z",200)
      ]
    };

    const result = createChartSeries(
      data,
      "category:stock",
      "value"
    );

    assert(result.points.length === 3,
      "記録日の系列点が3点ではありません。");
    assert(result.points[0].value === 100,
      "最初の日の合計が100ではありません。");
    assert(result.points[1].value === 300,
      "2日目の合計が300ではありません。");
    assert(result.points[2].value === 350,
      "3日目の合計が350ではありません。");
  });

  run("S8a：nullの項目は合計に含めない",() => {
    const data = {
      accounts:[
        account("a","架空口座A","stock","securities"),
        account("b","架空口座B","stock","securities")
      ],
      snapshots:[
        snapshot("a1","a","2026-01-01","2026-01-01T10:00:00Z",100,{
          pnl:20
        }),
        snapshot("b1","b","2026-01-01","2026-01-01T10:00:00Z",200,{
          pnl:null
        })
      ]
    };

    const result = createChartSeries(
      data,
      "category:stock",
      "pnl"
    );

    assert(result.points.length === 1,
      "値がある日付の点が作成されていません。");
    assert(result.points[0].value === 20,
      "nullの口座を0として加算、または含めています。");
    assert(result.points[0].includedCount === 1,
      "集計対象口座数が正しくありません。");
  });

  run("S8a：記録のない日を補完しない",() => {
    const data = {
      accounts:[account("a","架空口座A","stock","securities")],
      snapshots:[
        snapshot("a1","a","2026-01-01","2026-01-01T10:00:00Z",100),
        snapshot("a2","a","2026-01-10","2026-01-10T10:00:00Z",200)
      ]
    };

    const result = createChartSeries(data,"account:a","value");

    assert(result.points.length === 2,
      "記録のない日が補完されています。");
    assert(result.points[0].date === "2026-01-01" &&
      result.points[1].date === "2026-01-10",
      "記録日が正しくありません。");
  });

  run("S8a：期間統計の増減額と増減率",() => {
    const stats = calculateChartStatistics([
      {date:"2026-01-01",value:100},
      {date:"2026-02-01",value:125}
    ]);

    assert(stats.available,"2点の統計が算出できません。");
    assert(stats.difference === 25,"増減額が25ではありません。");
    assert(stats.rate === 25,"増減率が25%ではありません。");
  });

  run("S8a：1点以下は記録不足",() => {
    const stats = calculateChartStatistics([
      {date:"2026-01-01",value:100}
    ]);

    assert(stats.available === false,
      "1点の系列が統計可能になっています。");
    assert(stats.difference === null,
      "記録不足の増減額がnullではありません。");
  });

  return results;
}
