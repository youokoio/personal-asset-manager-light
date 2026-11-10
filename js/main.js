"use strict";

/* ---------- アプリ状態・起動 ---------- */

let appData;
let currentTab = "dashboard";
let selectedAccountId = null;
let editingSnapshotId = null;
let messageText = "";
let errorText = "";
let deleteAllArmed = false;

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
    app.appendChild(el("div","error",errorText || "データを読み込めません。"));
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
    renderDataManagement();
  }
}

function closeHeaderMenu() {
  const menu = document.getElementById("header-menu");
  const button = document.getElementById("header-menu-button");
  if (menu) menu.hidden = true;
  if (button) button.setAttribute("aria-expanded","false");
}

/* ---------- ヘッダーメニュー ---------- */

const headerMenuButton = document.getElementById("header-menu-button");
const headerMenu = document.getElementById("header-menu");

headerMenuButton.addEventListener("click",() => {
  const willOpen = headerMenu.hidden;
  headerMenu.hidden = !willOpen;
  headerMenuButton.setAttribute("aria-expanded",String(willOpen));
});

headerMenu.addEventListener("click",event => {
  const button = event.target.closest("button[data-menu-action]");
  if (!button) return;
  if (button.dataset.menuAction === "open-data") {
    currentTab = "data";
    selectedAccountId = null;
    editingSnapshotId = null;
    deleteAllArmed = false;
    showMessage("");
    closeHeaderMenu();
    render();
    window.scrollTo(0,0);
  }
});

document.addEventListener("click",event => {
  if (!event.target.closest(".header-menu-wrap")) closeHeaderMenu();
});

/* ---------- 画面イベント ---------- */

document.querySelector(".bottom-nav").addEventListener("click",event => {
  const button = event.target.closest("button[data-tab]");
  if (!button) return;
  currentTab = button.dataset.tab;
  selectedAccountId = null;
  editingSnapshotId = null;
  deleteAllArmed = false;
  showMessage("");
  closeHeaderMenu();
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
  } else if (action === "export-json") {
    exportBackupJson().catch(error => {
      showMessage(error.message || "バックアップを書き出せませんでした。",true);
      render();
    });
  } else if (action === "delete-temp-backups") {
    deleteTemporaryBackups();
  } else if (action === "arm-delete-all") {
    deleteAllArmed = true;
    render();
  } else if (action === "confirm-delete-all") {
    deleteAllApplicationData();
  } else if (action === "cancel-delete-all") {
    deleteAllArmed = false;
    render();
  }
});

app.addEventListener("change",event => {
  if (event.target.id === "backup-file-input") {
    const file = event.target.files && event.target.files[0];
    importBackupFile(file);
  }
});

/* ---------- PWA ---------- */

if ("serviceWorker" in navigator) {
  window.addEventListener("load",() => {
    navigator.serviceWorker.register("./sw.js").catch(error => {
      console.error("Service Worker registration failed:",error);
    });
  });
}

render();
