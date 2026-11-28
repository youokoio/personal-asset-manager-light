"use strict";

function renderChartSeriesSettings(preferences) {
  const card = el("section","card");
  card.appendChild(el("h3","","表示する系列"));

  const help = el(
    "div",
    "help",
    "表示したい対象と項目にチェックを入れてください。最大6系列まで選択できます。"
  );
  card.appendChild(help);

  const targetOptions = getChartTargetOptions(appData);
  const selectedCount = preferences.series.length;

  const countText = el(
    "div",
    "help",
    "選択中：" + selectedCount + "／6系列"
  );
  card.appendChild(countText);

  const matrix = el("div","chart-series-matrix");

  for (const target of targetOptions) {
    const targetInfo = getChartTargetInfo(
      appData,
      target.value
    );
    const allowedFields = new Set(
      getChartFieldOptions(targetInfo).map(field => field.value)
    );

    const row = el("section","chart-series-matrix-row");
    row.appendChild(el(
      "h4",
      "chart-series-matrix-title",
      target.label
    ));

    const fields = el("div","chart-series-matrix-fields");

    for (const field of CHART_FIELD_DEFINITIONS) {
      const selected = preferences.series.some(series =>
        series.target === target.value &&
        series.field === field.value
      );
      const supported = allowedFields.has(field.value);
      const atLimit = selectedCount >= 6 && !selected;

      const label = el(
        "label",
        "chart-series-checkbox"
      );
      const checkbox = el("input");
      checkbox.type = "checkbox";
      checkbox.checked = selected;
      checkbox.disabled = !supported || atLimit;
      checkbox.setAttribute(
        "aria-label",
        target.label + " " + field.label
      );

      if (!supported) {
        if (targetInfo && targetInfo.category === "bank") {
          checkbox.title = "銀行は総資産のみ選択できます。";
        } else if (field.value === "swapTotal") {
          checkbox.title = "累計スワップはFXのみ選択できます。";
        } else {
          checkbox.title = "この対象では選択できない項目です。";
        }
      } else if (atLimit) {
        checkbox.title = "系列は最大6つまで選択できます。";
      }

      checkbox.addEventListener("change",() => {
        const exists = preferences.series.some(series =>
          series.target === target.value &&
          series.field === field.value
        );

        if (checkbox.checked && !exists) {
          if (preferences.series.length >= 6) {
            checkbox.checked = false;
            showMessage(
              "系列は最大6つまで選択できます。",
              true
            );
            render();
            return;
          }

          preferences.series.push({
            target:target.value,
            field:field.value
          });
        } else if (!checkbox.checked && exists) {
          preferences.series = preferences.series.filter(series =>
            series.target !== target.value ||
            series.field !== field.value
          );
        }

        chartVisibleSeries = {};
        resetChartZoom();
        showMessage("");
        render();
      });

      label.append(
        checkbox,
        document.createTextNode(field.label)
      );
      fields.appendChild(label);
    }

    row.appendChild(fields);
    matrix.appendChild(row);
  }

  card.appendChild(matrix);

  if (!preferences.series.length) {
    card.appendChild(el(
      "div",
      "empty",
      "系列が選択されていません。対象と項目を選択してください。"
    ));
  }

  return card;
}
