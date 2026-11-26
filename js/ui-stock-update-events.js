/* ---------- S11b 画面イベント ---------- */

app.addEventListener("input",event => {
  const target = event.target;

  if (target.id === "stock-ocr-paste") {
    stockOcrUpdatePasteText = target.value;
  } else if (target.id === "stock-ocr-snapshot-value") {
    stockOcrUpdateSnapshotValue = target.value;
  }
});

app.addEventListener("change",event => {
  const target = event.target;

  if (target.dataset.stockOcrAccount === "true") {
    stockOcrUpdateAccountId = target.value;
    stockOcrUpdateCards = [];
    stockOcrUpdateComparison = null;
    stockOcrUpdateError = "";
    stockOcrUpdateMessage = "";
    render();
    return;
  }

  if (target.id === "stock-ocr-target-date") {
    stockOcrUpdateTargetDate = target.value;
    stockOcrUpdateRefreshComparison();
    render();
    return;
  }

  if (target.id === "stock-ocr-snapshot-enabled") {
    stockOcrUpdateSnapshotEnabled = target.checked;
    render();
    return;
  }

  if (target.dataset.stockOcrIndex !== undefined &&
      target.dataset.stockOcrSelect === "true") {
    const index = Number(target.dataset.stockOcrIndex);
    if (stockOcrUpdateCards[index]) {
      stockOcrUpdateCards[index].selected = target.checked;
      render();
    }
    return;
  }

  if (target.dataset.stockOcrIndex !== undefined &&
      target.dataset.stockOcrField) {
    stockOcrUpdateApplyCardEdit(
      Number(target.dataset.stockOcrIndex),
      target.dataset.stockOcrField,
      target.value
    );
  }
});

app.addEventListener("click",event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;

  if (action === "stock-ocr-back") {
    closeStockOcrUpdate();
    render();
    window.scrollTo(0,0);
  } else if (action === "stock-ocr-parse") {
    stockOcrUpdateParse();
  } else if (action === "stock-ocr-clear") {
    stockOcrUpdateClear();
  } else if (action === "stock-ocr-confirm-card") {
    stockOcrUpdateConfirmCard(Number(button.dataset.index));
  } else if (action === "stock-ocr-save") {
    stockOcrUpdateSave();
  }
});
