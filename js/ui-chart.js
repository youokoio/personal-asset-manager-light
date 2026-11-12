"use strict";

/* ---------- S8a グラフ画面 ---------- */

const CHART_SERIES_COLORS = [
  "#246b9e",
  "#b45b36",
  "#39845a",
  "#815ca8",
  "#a17b24",
  "#397f83"
];

let chartVisibleSeries = {};
let chartSelectedPointText = "グラフ上の点を選択すると、日付と金額を表示します。";

function getChartPreferences() {
  const saved = appData.settings.chartPrefs;

  if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
    return {
      series:[],
      period:"all",
      startDate:"",
      endDate:""
    };
  }

  return {
    series:Array.isArray(saved.series)
      ? saved.series.slice(0,6).map(item => ({
          target:item.target,
          field:item.field
        }))
      : [],
    period:["all","1m","3m","6m","1y","custom"].includes(saved.period)
      ? saved.period
      : "all",
    startDate:typeof saved.startDate === "string"
      ? saved.startDate
      : "",
    endDate:typeof saved.endDate === "string"
      ? saved.endDate
      : ""
  };
}

function saveChartPreferences(preferences) {
  appData.settings.chartPrefs = {
    series:preferences.series.slice(0,6).map(item => ({
      target:item.target,
      field:item.field
    })),
    period:preferences.period,
    startDate:preferences.startDate,
    endDate:preferences.endDate
  };

  saveData(appData);
}

function createChartSelect(options,selected,className) {
  const select = document.createElement("select");
  select.className = className;

  for (const item of options) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    option.selected = item.value === selected;
    select.appendChild(option);
  }

  return select;
}

function getChartFieldLabel(field) {
  const item = CHART_FIELD_DEFINITIONS.find(
    definition => definition.value === field
  );
  return item ? item.label : field;
}

function getChartPeriodLabel(period) {
  const labels = {
    all:"全期間",
    "1m":"1か月",
    "3m":"3か月",
    "6m":"6か月",
    "1y":"1年",
    custom:"期間指定"
  };
  return labels[period] || "全期間";
}

function formatChartAmount(value) {
  if (!Number.isFinite(value)) return "未入力";

  const absolute = Math.abs(value);
  const sign = value < 0 ? "−" : "";

  if (absolute >= 100000000) {
    return sign + (absolute / 100000000).toFixed(2) + "億円";
  }

  if (absolute >= 10000) {
    return sign + (absolute / 10000).toFixed(1) + "万円";
  }

  return sign + Math.round(absolute).toLocaleString("ja-JP") + "円";
}

function formatChartDate(date) {
  if (!date) return "未入力";
  return date.replace(/-/g,"/");
}

function createChartSvgElement(name,attributes = {}) {
  const element = document.createElementNS(
    "http://www.w3.org/2000/svg",
    name
  );

  for (const [key,value] of Object.entries(attributes)) {
    element.setAttribute(key,String(value));
  }

  return element;
}

function getChartPointTimestamp(dateString) {
  const parts = dateString.split("-").map(Number);
  return Date.UTC(parts[0],parts[1] - 1,parts[2]);
}

function getChartAxisRange(series) {
  const values = series.flatMap(item =>
    item.points.map(point => point.value)
  );

  if (!values.length) return null;

  let minimum = Math.min(...values);
  let maximum = Math.max(...values);

  if (minimum > 0 && maximum > 0) {
    minimum = 0;
  } else if (minimum < 0 && maximum < 0) {
    maximum = 0;
  }

  if (minimum === maximum) {
    const padding = Math.abs(minimum) * 0.1 || 1;
    minimum -= padding;
    maximum += padding;
  } else {
    const padding = (maximum - minimum) * 0.08;
    minimum -= padding;
    maximum += padding;
  }

  return {minimum,maximum};
}

function createChartPointPath(points,xForDate,yForValue) {
  return points.map((point,index) => {
    const command = index === 0 ? "M" : "L";
    return command + " " +
      xForDate(point.date).toFixed(2) + " " +
      yForValue(point.value).toFixed(2);
  }).join(" ");
}

function renderChartSvg(container,series) {
  const width = 340;
  const height = 230;
  const padding = {
    left:57,
    right:10,
    top:13,
    bottom:35
  };

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const svg = createChartSvgElement("svg",{
    viewBox:"0 0 " + width + " " + height,
    role:"img",
    "aria-label":"資産推移グラフ"
  });
  svg.classList.add("chart-svg");

  const visibleSeries = series.filter((item,index) =>
    chartVisibleSeries[index] !== false
  );
  const allPoints = visibleSeries.flatMap(item => item.points);

  if (!allPoints.length) {
    container.appendChild(el(
      "div",
      "empty",
      "表示できる記録がありません。対象・項目・期間を確認してください。"
    ));
    return;
  }

  const dates = allPoints.map(point =>
    getChartPointTimestamp(point.date)
  );
  const firstTimestamp = Math.min(...dates);
  const lastTimestamp = Math.max(...dates);
  const axisRange = getChartAxisRange(visibleSeries);

  const xForDate = date => {
    const timestamp = getChartPointTimestamp(date);
    if (firstTimestamp === lastTimestamp) {
      return padding.left + plotWidth / 2;
    }
    return padding.left +
      (timestamp - firstTimestamp) /
      (lastTimestamp - firstTimestamp) * plotWidth;
  };

  const yForValue = value =>
    padding.top +
    (axisRange.maximum - value) /
    (axisRange.maximum - axisRange.minimum) * plotHeight;

  for (let index = 0; index <= 4; index += 1) {
    const value = axisRange.maximum -
      (axisRange.maximum - axisRange.minimum) * index / 4;
    const y = yForValue(value);

    svg.appendChild(createChartSvgElement("line",{
      x1:padding.left,
      y1:y,
      x2:width - padding.right,
      y2:y,
      class:"chart-grid-line"
    }));

    const label = createChartSvgElement("text",{
      x:padding.left - 6,
      y:y + 4,
      "text-anchor":"end",
      class:"chart-axis-label"
    });
    label.textContent = formatChartAmount(value);
    svg.appendChild(label);
  }

  if (axisRange.minimum <= 0 && axisRange.maximum >= 0) {
    const zeroLine = createChartSvgElement("line",{
      x1:padding.left,
      y1:yForValue(0),
      x2:width - padding.right,
      y2:yForValue(0),
      class:"chart-zero-line"
    });
    svg.appendChild(zeroLine);
  }

  const firstDate = allPoints.reduce((value,point) =>
    point.date < value ? point.date : value,
    allPoints[0].date
  );
  const lastDate = allPoints.reduce((value,point) =>
    point.date > value ? point.date : value,
    allPoints[0].date
  );

  const firstLabel = createChartSvgElement("text",{
    x:padding.left,
    y:height - 9,
    "text-anchor":"start",
    class:"chart-axis-label"
  });
  firstLabel.textContent = formatChartDate(firstDate);
  svg.appendChild(firstLabel);

  const lastLabel = createChartSvgElement("text",{
    x:width - padding.right,
    y:height - 9,
    "text-anchor":"end",
    class:"chart-axis-label"
  });
  lastLabel.textContent = formatChartDate(lastDate);
  svg.appendChild(lastLabel);

  visibleSeries.forEach(item => {
    const originalIndex = series.indexOf(item);
    const color = CHART_SERIES_COLORS[originalIndex];

    if (item.points.length >= 2) {
      const path = createChartSvgElement("path",{
        d:createChartPointPath(
          item.points,
          xForDate,
          yForValue
        ),
        stroke:color,
        class:"chart-series-line"
      });
      svg.appendChild(path);
    }

    item.points.forEach(point => {
      const circle = createChartSvgElement("circle",{
        cx:xForDate(point.date),
        cy:yForValue(point.value),
        r:4,
        fill:color,
        class:"chart-series-point",
        tabindex:"0",
        role:"button",
        "aria-label":formatChartDate(point.date) + " " +
          formatChartAmount(point.value)
      });

      const showPoint = () => {
        chartSelectedPointText =
          item.label + "／" +
          formatChartDate(point.date) + "：" +
          formatChartAmount(point.value);

        const detail = container.querySelector(
          ".chart-point-detail"
        );
        if (detail) detail.textContent = chartSelectedPointText;
      };

      circle.addEventListener("click",showPoint);
      circle.addEventListener("keydown",event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showPoint();
        }
      });

      svg.appendChild(circle);
    });
  });

  container.appendChild(svg);
}

function renderChartSeriesSettings(preferences) {
  const card = el("section","card");
  card.appendChild(el("h3","","表示する系列"));

  const targetOptions = getChartTargetOptions(appData);

  if (!preferences.series.length) {
    card.appendChild(el(
      "div",
      "empty",
      "系列を追加して、グラフに表示する対象と項目を選択してください。"
    ));
  }

  preferences.series.forEach((series,index) => {
    const row = el("div","chart-series-setting");
    const title = el("div","chart-series-setting-title",
      "系列 " + (index + 1)
    );
    row.appendChild(title);

    const targetSelect = createChartSelect(
      targetOptions,
      series.target,
      "chart-target-select"
    );
    targetSelect.setAttribute("aria-label","系列 " +
      (index + 1) + " の対象");

    const targetInfo = getChartTargetInfo(
      appData,
      targetSelect.value
    );
    const fieldOptions = getChartFieldOptions(targetInfo);

    const fieldSelect = createChartSelect(
      fieldOptions,
      fieldOptions.some(item => item.value === series.field)
        ? series.field
        : fieldOptions[0]?.value || "",
      "chart-field-select"
    );
    fieldSelect.setAttribute("aria-label","系列 " +
      (index + 1) + " の項目");

    targetSelect.addEventListener("change",() => {
      const updatedTargetInfo = getChartTargetInfo(
        appData,
        targetSelect.value
      );
      const updatedFields = getChartFieldOptions(updatedTargetInfo);
      const nextField = updatedFields.some(item =>
        item.value === fieldSelect.value
      )
        ? fieldSelect.value
        : updatedFields[0]?.value || "";

      series.target = targetSelect.value;
      series.field = nextField;
      render();
    });

    fieldSelect.addEventListener("change",() => {
      series.target = targetSelect.value;
      series.field = fieldSelect.value;
      render();
    });

    const remove = makeButton(
      "削除",
      "remove-chart-series",
      "secondary small"
    );
    remove.dataset.index = String(index);

    row.append(targetSelect,fieldSelect,remove);
    card.appendChild(row);
  });

  const actions = el("div","actions");

  const add = makeButton(
    "系列を追加",
    "add-chart-series",
    "secondary"
  );
  add.disabled = preferences.series.length >= 6;
  actions.appendChild(add);

  card.appendChild(actions);
  return card;
}

function renderChartPeriodSettings(preferences) {
  const card = el("section","card");
  card.appendChild(el("h3","","表示期間"));

  const periodOptions = [
    {value:"all",label:"全期間"},
    {value:"1m",label:"1か月"},
    {value:"3m",label:"3か月"},
    {value:"6m",label:"6か月"},
    {value:"1y",label:"1年"},
    {value:"custom",label:"期間指定"}
  ];

  const periodSelect = createChartSelect(
    periodOptions,
    preferences.period,
    "chart-period-select"
  );
  periodSelect.setAttribute("aria-label","グラフの表示期間");
  periodSelect.addEventListener("change",() => {
    preferences.period = periodSelect.value;
    render();
  });

  card.appendChild(el("label","chart-control-label","期間"));
  card.appendChild(periodSelect);

  if (preferences.period === "custom") {
    const start = makeField(
      "開始日",
      "chartStartDate",
      preferences.startDate,
      {type:"date"}
    );
    const end = makeField(
      "終了日",
      "chartEndDate",
      preferences.endDate,
      {type:"date"}
    );

    const startInput = start.querySelector("input");
    const endInput = end.querySelector("input");

    startInput.addEventListener("change",() => {
      preferences.startDate = startInput.value;
      render();
    });
    endInput.addEventListener("change",() => {
      preferences.endDate = endInput.value;
      render();
    });

    card.append(start,end);
  }

  return card;
}

function renderChartLegend(series) {
  const legend = el("div","chart-legend");

  series.forEach((item,index) => {
    const button = makeButton(
      item.label,
      "toggle-chart-series",
      "chart-legend-button"
    );
    button.dataset.index = String(index);
    button.style.borderColor = CHART_SERIES_COLORS[index];
    button.style.color = CHART_SERIES_COLORS[index];

    if (chartVisibleSeries[index] === false) {
      button.classList.add("chart-legend-hidden");
    }

    legend.appendChild(button);
  });

  return legend;
}

function renderChartStatistics(series) {
  const card = el("section","card");
  card.appendChild(el("h3","","期間統計"));

  if (!series.length) {
    card.appendChild(el("div","empty","系列が選択されていません。"));
    return card;
  }

  for (const item of series) {
    const section = el("div","chart-statistics-series");
    section.appendChild(el("h3","",item.label));

    if (!item.statistics.available) {
      section.appendChild(el(
        "div",
        "empty",
        "記録が足りません（2点以上の記録が必要です）。"
      ));
      card.appendChild(section);
      continue;
    }

    const stats = item.statistics;
    const rows = [
      ["開始日",formatChartDate(stats.startDate)],
      ["終了日",formatChartDate(stats.endDate)],
      ["開始値",formatChartAmount(stats.startValue)],
      ["終了値",formatChartAmount(stats.endValue)],
      ["増減額",formatChartAmount(stats.difference)],
      ["増減率",stats.rate === null
        ? "算出不可"
        : (stats.rate > 0 ? "+" : "") +
          stats.rate.toFixed(2) + "%"]
    ];

    for (const [label,value] of rows) {
      const row = el("div","chart-statistics-row");
      row.append(
        el("span","chart-statistics-label",label),
        el("span","chart-statistics-value",value)
      );
      section.appendChild(row);
    }

    card.appendChild(section);
  }

  return card;
}

function renderChartScreen() {
  clearApp();
  addMessage(app);
  app.appendChild(heading("資産推移グラフ"));

  const preferences = getChartPreferences();

  app.appendChild(renderChartSeriesSettings(preferences));
  app.appendChild(renderChartPeriodSettings(preferences));

  const actions = el("div","actions");
  const save = makeButton("選択内容を保存","save-chart-preferences");
  const back = makeButton("ホームへ戻る","close-chart","secondary");
  actions.append(save,back);
  app.appendChild(actions);

  const result = buildChartData(
    appData,
    preferences.series,
    preferences.period,
    preferences.startDate,
    preferences.endDate
  );

  const chartCard = el("section","card");
  chartCard.appendChild(el("h3","","推移グラフ"));

  if (result.series.length) {
    chartCard.appendChild(renderChartLegend(result.series));

    const graph = el("div","chart-graph");
    renderChartSvg(graph,result.series);
    chartCard.appendChild(graph);

    chartCard.appendChild(el(
      "div",
      "chart-point-detail",
      chartSelectedPointText
    ));
  } else {
    chartCard.appendChild(el(
      "div",
      "empty",
      "表示する系列を追加してください。"
    ));
  }

  app.appendChild(chartCard);
  app.appendChild(renderChartStatistics(result.series));

  app.appendChild(el(
    "div",
    "help",
    "記録のない日付は補完しません。表示される系列は入力済みの履歴から算出した目安です。"
  ));
}
