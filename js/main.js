"use strict";

/* ---------- アプリ状態・起動 ---------- */

let appData;
let currentTab = "home";
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

  if (currentTab === "home") {
    renderDashboard();
  } else if (["fx","stock","crypto","bank"].includes(currentTab)) {
    if (selectedAccountId) {
      renderAccountDetail();
    } else {
      renderCategoryAccountList(currentTab);
    }
  } else if (currentTab === "data") {
    renderDataManagement();
  } else if (currentTab === "bulk") {
    renderBulkInput();
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
  } else if (button.dataset.menuAction === "open-bulk") {
    currentTab = "bulk";
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

  if (action === "open-account") {
    selectedAccountId = id;
    render();
  } else if (action === "edit-snapshot") {
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
  } else if (action === "run-self-diagnosis") {
    runSelfDiagnosisAndRender();
  } else if (action === "run-tests") {
    runTestsAndRender();
  } else if (action === "preview-fx-mapping") {
    previewFxDataMappingAndRender();
  } else if (action === "apply-fx-mapping") {
    executeFxDataMappingAndRender();
  } else if (action === "bulk-expand") {
    expandBulkImportText();
  } else if (action === "bulk-clear-table") {
    clearBulkImportTable();
  } else if (action === "bulk-add-row") {
    addBulkImportEmptyRow();
  } else if (action === "bulk-delete-row") {
    removeBulkImportRow(id);
  } else if (action === "bulk-import-save") {
    executeBulkImport();
  }
});

app.addEventListener("change",event => {
  const input = event.target.closest(
    "input[data-bulk-row-id][data-bulk-field]"
  );
  if (!input) return;

  editBulkImportCell(
    input.dataset.bulkRowId,
    input.dataset.bulkField,
    input.value
  );
});

/* ---------- S2b 自己診断・テスト実行 ---------- */

async function runSelfDiagnosisAndRender() {
  let registered = false;
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      registered = Boolean(registration);
    }
  } catch (error) {
    registered = false;
  }

  dataDiagnosisResults = runDataSelfDiagnosis(appData,registered);
  showMessage("");
  render();
}

function runTestsAndRender() {
  if (typeof runAllTests === "function") {
    dataTestResults = runAllTests();
    dataTestLoading = false;
    render();
    return;
  }

  if (dataTestLoading) return;
  dataTestLoading = true;
  render();

  const script = document.createElement("script");
  script.src = "./js/tests.js";
  script.onload = () => {
    dataTestLoading = false;
    if (typeof runAllTests === "function") {
      dataTestResults = runAllTests();
    } else {
      dataTestResults = [{
        name:"テスト関数の読み込み",
        success:false,
        message:"runAllTests() が見つかりません。"
      }];
    }
    render();
  };
  script.onerror = () => {
    dataTestLoading = false;
    dataTestResults = [{
      name:"テストファイルの読み込み",
      success:false,
      message:"js/tests.js を読み込めませんでした。"
    }];
    render();
  };
  document.head.appendChild(script);
}

/* ---------- PWA ---------- */

if ("serviceWorker" in navigator) {
  window.addEventListener("load",() => {
    navigator.serviceWorker.register("./sw.js").catch(error => {
      console.error("Service Worker registration failed:",error);
    });
  });
}

render();
