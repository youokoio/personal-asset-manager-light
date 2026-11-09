"use strict";

/* ---------- 口座一覧・詳細 ---------- */

function renderAccountList() {
  app.appendChild(heading("口座一覧"));

  const card = el("section","card");
  card.appendChild(el("div","help",
    "口座を選択すると、評価額履歴の追加・編集・削除ができます。"
  ));

  for (const account of appData.accounts) {
    const latest = getLatestSnapshot(appData,account.id);
    const line = el("div","account-row");

    const left = el("div");
    left.appendChild(el("div","account-name",account.name));
    left.appendChild(el("div","account-meta",TYPE_LABELS[account.type]));

    const right = el("div");
    right.appendChild(el("div","account-value",
      latest ? formatYen(latest.value) : "未入力"
    ));
    right.appendChild(el("div","account-meta",
      latest ? latest.asOfDate : "記録なし"
    ));

    line.append(left,right);
    line.style.cursor = "pointer";
    line.addEventListener("click",() => {
      selectedAccountId = account.id;
      render();
    });
    card.appendChild(line);
  }

  app.appendChild(card);
}

function renderSnapshotRow(snapshot) {
  const row = el("div","snapshot-row");

  const top = el("div","snapshot-top");
  top.appendChild(el("div","snapshot-date",snapshot.asOfDate));
  top.appendChild(el("div","snapshot-value",formatYen(snapshot.value)));
  row.appendChild(top);

  const metaParts = [];
  if (snapshot.pnl !== null && snapshot.pnl !== undefined) {
    metaParts.push("損益 " + formatSignedYen(snapshot.pnl));
  }
  if (snapshot.cash !== null && snapshot.cash !== undefined) {
    metaParts.push("現金 " + formatYen(snapshot.cash));
  }
  if (snapshot.principal !== null && snapshot.principal !== undefined) {
    metaParts.push("元本 " + formatYen(snapshot.principal));
  }
  if (snapshot.swapTotal !== null && snapshot.swapTotal !== undefined) {
    metaParts.push("累計スワップ " + formatYen(snapshot.swapTotal));
  }
  if (snapshot.requiredMargin !== null && snapshot.requiredMargin !== undefined) {
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

function renderSnapshotForm(account) {
  const existing = editingSnapshotId
    ? appData.snapshots.find(s => s.id === editingSnapshotId)
    : null;

  const snapshots = getAccountSnapshots(appData,account.id);
  const defaultDate = existing
    ? existing.asOfDate
    : snapshots.length ? snapshots[0].asOfDate : localDateString();

  const form = document.createElement("form");
  form.id = "snapshot-form";
  form.appendChild(el("h3","",existing ? "履歴を編集" : "評価額を追加"));

  form.appendChild(makeField("対象日","asOfDate",defaultDate,{
    type:"date",
    required:true,
    help:"評価額の対象日です。入力した日とは別に記録します。"
  }));

  form.appendChild(makeField("評価額（円）","value",
    existing ? existing.value : "",{
      required:true,
      inputmode:"decimal"
    }
  ));

  form.appendChild(makeField("現金（円・任意）","cash",
    existing ? existing.cash : "",{inputmode:"decimal"}
  ));

  form.appendChild(makeField("評価損益（円・任意）","pnl",
    existing ? existing.pnl : "",{inputmode:"decimal"}
  ));

  form.appendChild(makeField("元本（円・任意）","principal",
    existing ? existing.principal : "",{inputmode:"decimal"}
  ));

  if (account.type === "fx") {
    form.appendChild(makeField("累計スワップ（円・任意）","swapTotal",
      existing ? existing.swapTotal : "",{inputmode:"decimal"}
    ));
    form.appendChild(makeField("必要証拠金（円・任意）","requiredMargin",
      existing ? existing.requiredMargin : "",{inputmode:"decimal"}
    ));
  }

  form.appendChild(makeField("メモ（任意）","memo",
    existing ? existing.memo : "",{textarea:true}
  ));

  form.appendChild(el("div","help",
    "口座番号・契約番号・暗証番号・ログイン情報は入力しないでください。"
  ));

  const actions = el("div","actions");
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = existing ? "変更を保存" : "追加する";
  actions.appendChild(save);

  if (existing) {
    actions.appendChild(makeButton("編集を中止","cancel-edit","secondary"));
  }
  form.appendChild(actions);

  form.addEventListener("submit",handleSnapshotSubmit);
  return form;
}

function renderAccountDetail() {
  const account = appData.accounts.find(a => a.id === selectedAccountId);
  if (!account) {
    selectedAccountId = null;
    renderAccountList();
    return;
  }

  const back = makeButton("← 口座一覧へ","back-accounts","secondary");
  app.appendChild(back);

  app.appendChild(heading(account.name));

  const latest = getLatestSnapshot(appData,account.id);
  const info = el("section","card");
  info.appendChild(el("div","metric-label","最新評価額"));
  info.appendChild(el("div","metric-value",
    latest ? formatYen(latest.value) : "未入力"
  ));
  info.appendChild(el("div","metric-sub",
    latest ? "対象日：" + latest.asOfDate : "評価額の記録がありません"
  ));
  app.appendChild(info);

  const formCard = el("section","card");
  formCard.appendChild(renderSnapshotForm(account));
  app.appendChild(formCard);

  const historyCard = el("section","card");
  historyCard.appendChild(el("h3","","評価額履歴"));

  const snapshots = getAccountSnapshots(appData,account.id);
  if (!snapshots.length) {
    historyCard.appendChild(el("div","empty","履歴はまだありません。"));
  } else {
    for (const snapshot of snapshots) {
      historyCard.appendChild(renderSnapshotRow(snapshot));
    }
  }

  app.appendChild(historyCard);
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
    showMessage("評価額を数値で入力してください。",true);
    render();
    return;
  }

  const account = appData.accounts.find(a => a.id === selectedAccountId);
  if (!account) return;

  const now = new Date().toISOString();

  const snapshot = {
    id:editingSnapshotId || createId(),
    accountId:account.id,
    asOfDate,
    recordedAt:now,
    value,
    cash:toNumberOrNull(values.get("cash")),
    pnl:toNumberOrNull(values.get("pnl")),
    principal:toNumberOrNull(values.get("principal")),
    swapTotal:account.type === "fx"
      ? toNumberOrNull(values.get("swapTotal"))
      : null,
    requiredMargin:account.type === "fx"
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
    appData.snapshots[index] = snapshot;
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
