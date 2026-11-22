"use strict";

function renderSnapshotRow(snapshot) {
  const row = el("div","snapshot-row");

  const top = el("div","snapshot-top");
  top.appendChild(el("div","snapshot-date",
    formatDateWithWeekday(snapshot.asOfDate)));
  top.appendChild(el("div","snapshot-value",formatYen(snapshot.value)));
  row.appendChild(top);

  const metaParts = [];
  if (snapshot.pnl !== null && snapshot.pnl !== undefined) {
    metaParts.push("評価損益 " + formatSignedYen(snapshot.pnl));
  }
  if (snapshot.cash !== null && snapshot.cash !== undefined) {
    metaParts.push("現金 " + formatYen(snapshot.cash));
  }
  if (snapshot.effectivePrincipal !== null &&
      snapshot.effectivePrincipal !== undefined) {
    metaParts.push("有効元本 " + formatYen(snapshot.effectivePrincipal));
  } else if (snapshot.principal !== null &&
             snapshot.principal !== undefined) {
    metaParts.push("元本 " + formatYen(snapshot.principal));
  }
  if (snapshot.realizedPnlDaily !== null &&
      snapshot.realizedPnlDaily !== undefined) {
    metaParts.push("その日の確定損益 " +
      formatSignedYen(snapshot.realizedPnlDaily));
  }
  if (snapshot.realizedPnlTotal !== null &&
      snapshot.realizedPnlTotal !== undefined) {
    metaParts.push("累積確定損益 基準値 " +
      formatSignedYen(snapshot.realizedPnlTotal));
  }
  if (snapshot.swapTotal !== null && snapshot.swapTotal !== undefined) {
    metaParts.push("累計スワップ " + formatYen(snapshot.swapTotal));
  }
  if (snapshot.requiredMargin !== null &&
      snapshot.requiredMargin !== undefined) {
    metaParts.push("必要証拠金 " + formatYen(snapshot.requiredMargin));
  }
  if (metaParts.length) {
    row.appendChild(el("div","snapshot-meta",metaParts.join(" ／ ")));
  }
  if (snapshot.memo) {
    row.appendChild(el("div","snapshot-meta","メモ：" + snapshot.memo));
  }

  const actions = el("div","actions");
  const edit = makeButton("編集","edit-snapshot","secondary small");
  edit.dataset.id = snapshot.id;
  const remove = makeButton("削除","delete-snapshot","danger small");
  remove.dataset.id = snapshot.id;
  actions.append(edit,remove);
  row.appendChild(actions);

  return row;
}

/* ---------- 保存操作 ---------- */

function handleSnapshotSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const values = new FormData(form);

  const asOfDate = String(values.get("asOfDate") || "");
  const value = toNumberOrNull(values.get("value"));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    showMessage("対象日を正しく入力してください。",true);
    render();
    return;
  }

  if (value === null) {
    showMessage("金額を数値で入力してください。",true);
    render();
    return;
  }

  const account = appData.accounts.find(a => a.id === selectedAccountId);
  if (!account) return;

  const category = getCategory(account);
  const isBank = category === "bank";
  const isFx = category === "fx";
  const now = new Date().toISOString();

  const previousSnapshot = editingSnapshotId
    ? appData.snapshots.find(s => s.id === editingSnapshotId)
    : null;

  const snapshot = {
    id:editingSnapshotId || createId(),
    accountId:account.id,
    asOfDate,
    recordedAt:now,
    value,
    cash:isBank
      ? null
      : isFx
        ? previousSnapshot
          ? previousSnapshot.cash ?? null
          : null
        : toNumberOrNull(values.get("cash")),
    pnl:isBank ? null : toNumberOrNull(values.get("pnl")),
    principal:previousSnapshot
      ? previousSnapshot.principal ?? null
      : null,
    cumulativeInvested:previousSnapshot
      ? previousSnapshot.cumulativeInvested ?? null
      : null,
    effectivePrincipal:isBank
      ? null
      : toNumberOrNull(values.get("effectivePrincipal")),
    realizedPnlTotal:isBank
      ? null
      : toNumberOrNull(values.get("realizedPnlTotal")),
    realizedPnlDaily:isFx
      ? toNumberOrNull(values.get("realizedPnlDaily"))
      : null,
    swapTotal:isFx
      ? toNumberOrNull(values.get("swapTotal"))
      : null,
    requiredMargin:isFx
      ? toNumberOrNull(values.get("requiredMargin"))
      : null,
    memo:String(values.get("memo") || "")
  };

  if (editingSnapshotId) {
    const index = appData.snapshots.findIndex(s => s.id === editingSnapshotId);
    if (index < 0) {
      showMessage("編集対象の履歴が見つかりません。",true);
      render();
      return;
    }
    appData.snapshots[index] = {
      ...previousSnapshot,
      ...snapshot,
      recordedAt:previousSnapshot.recordedAt,
      updatedAt:now
    };
  } else {
    appData.snapshots.push(snapshot);
  }

  account.updatedAt = now;

  try {
    saveData(appData);
    editingSnapshotId = null;
    showMessage("保存しました。");
  } catch (error) {
    showMessage(error.message || "保存に失敗しました。",true);
  }

  render();
}

function editSnapshot(id) {
  const snapshot = appData.snapshots.find(s => s.id === id);
  if (!snapshot) return;
  selectedAccountId = snapshot.accountId;
  editingSnapshotId = id;
  showMessage("");
  render();
  window.scrollTo(0,0);
}

function deleteSnapshot(id) {
  const snapshot = appData.snapshots.find(s => s.id === id);
  if (!snapshot) return;

  if (!window.confirm(
    "この評価額履歴を削除しますか？\nこの操作は取り消せません。"
  )) return;

  appData.snapshots = appData.snapshots.filter(s => s.id !== id);

  const account = appData.accounts.find(a => a.id === snapshot.accountId);
  if (account) account.updatedAt = new Date().toISOString();

  try {
    saveData(appData);
    editingSnapshotId = null;
    showMessage("履歴を削除しました。");
  } catch (error) {
    showMessage(error.message || "削除に失敗しました。",true);
  }

  render();
}
