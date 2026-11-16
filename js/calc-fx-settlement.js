
"use strict";

/* ---------- FX決済入力の自動計算 ---------- */

const renderFxSettlementFormBaseS5e = renderFxSettlementForm;

renderFxSettlementForm = function renderFxSettlementFormWithAutoCalcS5e(
  accountId,
  pair,
  side,
  positions
) {
  const form = renderFxSettlementFormBaseS5e(
    accountId,
    pair,
    side,
    positions
  );

  if (!form) return form;

  for (const position of positions) {
    const check = form.elements.namedItem("settle_" + position.id);
    const quantityInput = form.elements.namedItem(
      "quantity_" + position.id
    );
    const realizedInput = form.elements.namedItem(
      "realizedPnl_" + position.id
    );
    const closeRateInput = form.elements.namedItem(
      "closeRate_" + position.id
    );

    if (!check || !quantityInput ||
        !realizedInput || !closeRateInput) {
      continue;
    }

    const row = check.closest(".fx-settlement-position");
    if (!row) continue;

    const notice = document.createElement("div");
    notice.className = "help";
    notice.hidden = true;
    row.appendChild(notice);

    let manualOverride = false;
    let hasAutoValue = false;

    const clearAutoValue = () => {
      if (hasAutoValue) {
        realizedInput.value = "";
        hasAutoValue = false;
      }
    };

    const update = () => {
      if (!check.checked || manualOverride) return;

      const rawRate = closeRateInput.value.trim();
      if (rawRate === "") {
        clearAutoValue();
        notice.textContent = "";
        notice.hidden = true;
        return;
      }

      const quantity = toNumberOrNull(quantityInput.value);
      const closeRate = toNumberOrNull(rawRate);

      if (!Number.isSafeInteger(quantity) ||
          quantity <= 0 ||
          quantity > position.quantity ||
          closeRate === null ||
          closeRate <= 0) {
        clearAutoValue();
        notice.textContent = "数量または決済レートを確認してください。";
        notice.hidden = false;
        return;
      }

      try {
        const result = calcCloseRealized(
          position,
          quantity,
          closeRate
        );
        realizedInput.value = String(result.value);
        hasAutoValue = true;
        notice.textContent = result.notice ||
          "為替損益とスワップ分から自動計算しました。";
        notice.hidden = false;
      } catch (error) {
        clearAutoValue();
        notice.textContent =
          error.message || "確定損益を計算できませんでした。";
        notice.hidden = false;
      }
    };

    realizedInput.addEventListener("input",() => {
      if (hasAutoValue || realizedInput.value.trim() !== "") {
        manualOverride = true;
        notice.textContent =
          "確定損益を手修正したため、自動計算を停止しています。";
        notice.hidden = false;
      }
    });

    for (const input of [quantityInput,closeRateInput]) {
      input.addEventListener("input",update);
      input.addEventListener("change",update);
    }

    check.addEventListener("change",() => {
      if (check.checked) update();
    });
  }

  return form;
};
