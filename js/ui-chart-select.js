"use strict";

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
    row.appendChild(el(
      "div",
      "chart-series-setting-title",
      "系列 " + (index + 1)
    ));

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
