"use strict";

/* ---------- アプリ状態・起動 ---------- */

let appData;
let currentTab = "dashboard";
let selectedAccountId = null;
let editingSnapshotId = null;
let messageText = "";
let errorText = "";

try {
  appData = loadData();
} catch (error) {
  errorText = error.message || "データを読み込めませんでした。";
}

/* ---------- FX・データタブ（後続段階） ---------- */

function renderPlaceholder(title,description) {
  app.appendChild(heading(title));
  const card = el("section","card");
  card.appendChild(el("div","notice",description));
  card.appendChild(el("div","help","この機能は後続の開発段階で実装します。"));
  app.appendChild(card);
}

/* ---------- 画面切り替え ---------- */

function render() {
  if (!appData) {
    clearApp();
    app.appendChild(el("div","error",
      errorText || "データを読み込めません。"
    ));
    updateNavigation();
    return;
  }

  updateNavigation();
  clearApp();
  addMessage(app);

  if (currentTab === "dashboard") {
    renderDashboard();
  } else if (currentTab === "accounts") {
    if (selectedAccountId) renderAccountDetail();
    else renderAccountList();
  } else if (currentTab === "fx") {
    renderPlaceholder("FX","FX口座の評価額履歴は「口座」から入力できます。建玉管理・スワップ推定・ロスカット計算は後続段階で実装します。");
  } else if (currentTab === "data") {
    renderPlaceholder("データ管理","JSONバックアップ・復元機能はS2で実装します。");
  }
}

/* ---------- イベント登録 ---------- */

document.querySelector(".bottom-nav").addEventListener("click",event => {
  const button = event.target.closest("button[data-tab]");
  if (!button) return;

  currentTab = button.dataset.tab;
  selectedAccountId = null;
  editingSnapshotId = null;
  showMessage("");
  render();
  window.scrollTo(0,0);
});

app.addEventListener("click",event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === "edit-snapshot") {
    editSnapshot(id);
  } else if (action === "delete-snapshot") {
    deleteSnapshot(id);
  } else if (action === "back-accounts") {
    selectedAccountId = null;
    editingSnapshotId = null;
    showMessage("");
    render();
  } else if (action === "cancel-edit") {
    editingSnapshotId = null;
    showMessage("");
    render();
  }
});

render();
