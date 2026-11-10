"use strict";

/* ---------- データ管理画面 ---------- */

function formatBackupDate(value) {
  if (!value) return "未実施";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日時データが不正です";
  return date.toLocaleString("ja-JP");
}

function getTemporaryBackupKeys() {
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && key.startsWith("pam2_pre_")) keys.push(key);
  }
  return keys.sort();
}

function renderDataManagement() {
  app.appendChild(heading("データ管理"));

  const privacyNotice = el("div","notice",
    "バックアップJSONは暗号化されていない平文です。ファイルアプリまたはiCloud Driveなど、他人が見られない場所に保存してください。口座番号・契約番号・暗証番号・ログイン情報は、メモを含めて入力しないでください。"
  );
  app.appendChild(privacyNotice);

  const backupCard = el("section","card");
  backupCard.appendChild(el("h3","","JSONバックアップ"));
  backupCard.appendChild(el("p","metric-sub",
    `最終バックアップ：${formatBackupDate(appData.settings.lastBackupAt)}`
  ));
  backupCard.appendChild(makeButton("JSONを書き出す","export-json"));
  backupCard.appendChild(el("p","help",
    "共有シートでファイルアプリ等に保存します。共有機能が使えない場合はダウンロードします。"
  ));
  app.appendChild(backupCard);

  const restoreCard = el("section","card");
  restoreCard.appendChild(el("h3","","JSONから復元"));
  restoreCard.appendChild(el("p","help",
    "バックアップファイルを選択します。内容を検証し、復元前に現在のデータを一時保存します。復元すると現在のデータはバックアップ内容に置き換わります。"
  ));
  const fileField = el("div","field");
  const fileLabel = el("label","","バックアップJSONファイル");
  fileLabel.htmlFor = "backup-file-input";
  const fileInput = el("input","");
  fileInput.type = "file";
  fileInput.id = "backup-file-input";
  fileInput.name = "backupFile";
  fileInput.accept = ".json,application/json";
  fileField.append(fileLabel,fileInput);
  restoreCard.appendChild(fileField);
  restoreCard.appendChild(el("p","help",
    "対応形式：schemaVersion 1（移行後に検証）または現在のschemaVersion 2。"
  ));
  app.appendChild(restoreCard);

  const temporaryCard = el("section","card");
  temporaryCard.appendChild(el("h3","","一時バックアップ"));
  const temporaryKeys = getTemporaryBackupKeys();
  temporaryCard.appendChild(el("p","metric-sub",
    `保存数：${temporaryKeys.length}件`
  ));
  if (temporaryKeys.length > 0) {
    const list = el("ul","backup-key-list");
    for (const key of temporaryKeys) list.appendChild(el("li","",key));
    temporaryCard.appendChild(list);
    temporaryCard.appendChild(makeButton("一時バックアップをすべて削除","delete-temp-backups","secondary"));
  } else {
    temporaryCard.appendChild(el("p","empty","一時バックアップはありません。"));
  }
  app.appendChild(temporaryCard);

  const deleteCard = el("section","card");
  deleteCard.appendChild(el("h3","","全データ削除"));
  deleteCard.appendChild(el("p","help",
    "登録した口座履歴などの本体データを削除し、初期状態に戻します。一時バックアップ（pam2_pre_）は別に残ります。必要な場合は上の項目から削除してください。"
  ));
  if (!deleteAllArmed) {
    deleteCard.appendChild(makeButton("全削除の確認へ進む","arm-delete-all","danger"));
  } else {
    deleteCard.appendChild(el("div","error",
      "最終確認です。登録した履歴・入力内容は元に戻せません。"
    ));
    deleteCard.appendChild(makeButton("すべての本体データを削除する","confirm-delete-all","danger"));
    deleteCard.appendChild(makeButton("キャンセル","cancel-delete-all","secondary"));
  }
  app.appendChild(deleteCard);

  const versionCard = el("section","card");
  versionCard.appendChild(el("h3","","バージョン情報"));
  versionCard.appendChild(el("p","metric-sub",`アプリ版：${APP_VERSION}`));
  versionCard.appendChild(el("p","metric-sub",`仕様書版：${SPEC_VERSION}`));
  app.appendChild(versionCard);
}

function updateLastBackupAt(value) {
  appData.settings.lastBackupAt = value;
  saveData(appData);
}

async function exportBackupJson() {
  const now = new Date().toISOString();
  const exportData = JSON.parse(JSON.stringify(appData));
  exportData.settings.lastBackupAt = now;
  const json = JSON.stringify(exportData,null,2);
  const fileName = `pam2_backup_${localDateString()}.json`;
  const file = new File([json],fileName,{type:"application/json"});

  if (navigator.share && navigator.canShare && navigator.canShare({files:[file]})) {
    try {
      await navigator.share({title:"個人資産管理バックアップ",files:[file]});
    } catch (error) {
      if (error && error.name === "AbortError") return;
      throw error;
    }
  } else {
    const blob = new Blob([json],{type:"application/json;charset=utf-8"});
    const objectUrl = URL.createObjectURL(blob);
    const link = el("a","");
    link.href = objectUrl;
    link.download = fileName;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl),1000);
  }

  updateLastBackupAt(now);
  showMessage("バックアップを書き出しました。");
  render();
}

function importBackupFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const imported = prepareImportedData(parsed);
      const sourceVersion = parsed.schemaVersion;
      const confirmed = window.confirm(
        `schemaVersion ${sourceVersion} のバックアップを復元します。現在のデータは置き換わります。続けますか？`
      );
      if (!confirmed) return;

      const currentRaw = localStorage.getItem(STORAGE_KEY);
      if (currentRaw !== null) {
        localStorage.setItem("pam2_pre_import",currentRaw);
      }
      saveData(imported);
      appData = imported;
      deleteAllArmed = false;
      showMessage("バックアップを復元しました。");
      render();
    } catch (error) {
      showMessage(error.message || "JSONを読み込めませんでした。",true);
      render();
    }
  };
  reader.onerror = () => {
    showMessage("ファイルを読み込めませんでした。",true);
    render();
  };
  reader.readAsText(file);
}

function deleteTemporaryBackups() {
  const keys = getTemporaryBackupKeys();
  if (keys.length === 0) return;
  if (!window.confirm(`${keys.length}件の一時バックアップをすべて削除します。よろしいですか？`)) return;
  for (const key of keys) localStorage.removeItem(key);
  showMessage("一時バックアップを削除しました。");
  render();
}

function deleteAllApplicationData() {
  localStorage.removeItem(STORAGE_KEY);
  appData = createInitialData();
  saveData(appData);
  deleteAllArmed = false;
  showMessage("本体データを削除し、初期状態に戻しました。一時バックアップは残っています。");
  render();
}
