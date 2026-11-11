"use strict";

/* ---------- データ管理画面 ---------- */

let dataDiagnosisResults = null;
let dataTestResults = null;
let dataTestLoading = false;
let fxMappingPreview = null;

function runDataSelfDiagnosis(data,serviceWorkerRegistered) {
  const items = [];
  const add = (name,status,detail) => items.push({name,status,detail});

  try {
    validateData(data);
    add("保存データの検証","ok","validateData に合格しました。");
  } catch (error) {
    add("保存データの検証","ng",error.message || "検証に失敗しました。");
  }

  try {
    const exported = JSON.stringify(data);
    const imported = JSON.parse(exported);
    if (exported === JSON.stringify(imported)) {
      add("書き出し・読み込みの往復","ok","メモリ上でJSONを往復し、内容が完全に一致しました。");
    } else {
      add("書き出し・読み込みの往復","ng","JSON往復後の内容が一致しません。");
    }
  } catch (error) {
    add("書き出し・読み込みの往復","ng",error.message || "JSONの往復に失敗しました。");
  }

  try {
    const accountIds = new Set(data.accounts.map(account => account.id));
    const loanIds = new Set(data.loans.map(loan => loan.id));
    const errors = [];

    for (const item of data.snapshots) {
      if (!accountIds.has(item.accountId)) errors.push("履歴 " + item.id + " の口座がありません。");
    }
    for (const item of data.holdings) {
      if (!accountIds.has(item.accountId)) errors.push("商品別保有 " + item.id + " の口座がありません。");
    }
    for (const item of data.fxPositions) {
      if (!accountIds.has(item.accountId)) errors.push("FX建玉 " + item.id + " の口座がありません。");
    }
    for (const item of data.loanSnapshots) {
      if (!loanIds.has(item.loanId)) errors.push("ローン履歴 " + item.id + " のローンがありません。");
    }

    add(
      "口座・ローンの参照整合",
      errors.length === 0 ? "ok" : "ng",
      errors.length === 0 ? "履歴・商品別保有・FX建玉・ローン履歴の参照先が存在します。" : errors.join(" ")
    );
  } catch (error) {
    add("口座・ローンの参照整合","ng",error.message || "参照整合を確認できません。");
  }

  try {
    const totals = calculateCategoryTotals(data);
    const diff30 = calculateDiff30(data);
    const errors = [];
    const sumFields = [
      ["effectivePrincipal","effectivePrincipal"],
      ["pnl","pnl"],
      ["totalAssets","value"],
      ["realizedPnlTotal","realizedPnlTotal"]
    ];

    for (const category of Object.keys(CATEGORY_LABELS)) {
      for (const [totalField,snapshotField] of sumFields) {
        let expectedTotal = 0;
        let includedCount = 0;

        for (const account of data.accounts) {
          if (getCategory(account) !== category) continue;
          const latest = getLatestSnapshot(data,account.id);
          if (!latest || !isFiniteMetricValue(latest[snapshotField])) continue;
          expectedTotal += latest[snapshotField];
          includedCount += 1;
        }

        const expected = includedCount > 0 ? expectedTotal : null;
        const actual = totals[category] ? totals[category][totalField] : undefined;
        if (actual !== expected) {
          errors.push(CATEGORY_LABELS[category] + "の" + totalField + "が口座別合計と一致しません。");
        }
      }
    }

    const bankAccounts = data.accounts.filter(account => getCategory(account) === "bank");
    const bankDiffs = diff30.accounts.filter(item =>
      item.comparable && bankAccounts.some(account => account.id === item.accountId)
    );
    const expectedBankChange = bankDiffs.length > 0
      ? bankDiffs.reduce((sum,item) => sum + item.difference,0)
      : null;

    if (totals.bank.bankBalance !== totals.bank.totalAssets) {
      errors.push("銀行残高と銀行総資産の合計が一致しません。");
    }
    if (totals.bank.bankChange !== expectedBankChange) {
      errors.push("銀行の30日前からの差が口座別合計と一致しません。");
    }
    if (totals.bank.bankComparedAccountCount !== bankDiffs.length) {
      errors.push("銀行の比較対象口座数が一致しません。");
    }
    if (totals.bank.bankExcludedAccountCount !== bankAccounts.length - bankDiffs.length) {
      errors.push("銀行の比較対象外口座数が一致しません。");
    }

    add(
      "分類別集計の整合",
      errors.length === 0 ? "ok" : "ng",
      errors.length === 0 ? "各分類の有効元本・損益・総資産と銀行の残高・30日前差が口座別合計と一致します。" : errors.join(" ")
    );
  } catch (error) {
    add("分類別集計の整合","ng",error.message || "分類別集計を確認できません。");
  }

  add(
    "版情報",
    "info",
    "APP_VERSION=" + APP_VERSION + " / SPEC_VERSION=" + SPEC_VERSION +
      " / schemaVersion=" + (data && data.schemaVersion)
  );

  add(
    "Service Worker登録",
    serviceWorkerRegistered ? "ok" : "ng",
    serviceWorkerRegistered ? "Service Workerの登録を確認しました。" : "Service Workerの登録を確認できません。"
  );

  const ngCount = items.filter(item => item.status === "ng").length;
  return {items,ngCount,allOk:ngCount === 0};
}

function appendDataCheckResults(container,items) {
  const list = el("ul","backup-key-list");
  for (const item of items) {
    const label = item.status === "ok" ? "OK" : item.status === "ng" ? "NG" : "情報";
    list.appendChild(el("li","",label + "： " + item.name + " — " + item.detail));
  }
  container.appendChild(list);
}

function previewFxDataMappingAndRender() {
  fxMappingPreview = getFxDataMappingTargets(appData);
  showMessage(
    fxMappingPreview.length > 0
      ? fxMappingPreview.length + "件の読み替え対象を確認してください。"
      : "読み替え対象の履歴はありません。"
  );
  render();
}

function executeFxDataMappingAndRender() {
  try {
    if (fxMappingPreview === null) {
      throw new Error("先に対象履歴をプレビューしてください。");
    }

    const currentTargets = getFxDataMappingTargets(appData);
    if (JSON.stringify(currentTargets) !== JSON.stringify(fxMappingPreview)) {
      fxMappingPreview = currentTargets;
      showMessage("対象データが変わったため、プレビューを更新しました。内容を再確認してください。",true);
      render();
      return;
    }

    if (currentTargets.length === 0) {
      showMessage("読み替え対象の履歴はありません。");
      render();
      return;
    }

    const currentRaw = localStorage.getItem(STORAGE_KEY);
    if (currentRaw === null) {
      throw new Error("保存データを確認できないため、読み替えを中止しました。");
    }

    localStorage.setItem("pam2_pre_fxmap",currentRaw);

    const nextData = applyFxDataMapping(appData,currentTargets);
    saveData(nextData);
    appData = nextData;
    fxMappingPreview = null;
    showMessage("FXデータの読み替えを実行しました。");
  } catch (error) {
    showMessage(error.message || "FXデータの読み替えに失敗しました。",true);
  }

  render();
}

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

/*
 * JSONバックアップの準備
 * v1はv2へ移行してから検証する。
 * v2は複製してから検証する。
 * 元の読み込みデータは直接変更しない。
 */
function prepareImportedData(parsed) {
  if (!parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)) {
    throw new Error("JSONデータの形式が正しくありません。");
  }

  let imported;

  if (parsed.schemaVersion === 1) {
    const migratedV2 = migrateDataV1ToV2(parsed);
    imported = migrateDataV2ToV3(migratedV2);
  } else if (parsed.schemaVersion === 2) {
    imported = migrateDataV2ToV3(parsed);
  } else if (parsed.schemaVersion === SCHEMA_VERSION) {
    imported = JSON.parse(JSON.stringify(parsed));
  } else {
    throw new Error("対応していないデータ形式です。");
  }

  validateData(imported);
  return imported;
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

  /*
   * ファイル入力欄自身でchangeを受け取る。
   * app要素へのイベント委譲に依存しない。
   */
  fileInput.addEventListener("change",() => {
    const file = fileInput.files && fileInput.files[0];
    importBackupFile(file);
  });

  fileField.append(fileLabel,fileInput);
  restoreCard.appendChild(fileField);
  restoreCard.appendChild(el("p","help",
    "対応形式：schemaVersion 1・2（v3へ移行後に検証）または現在のschemaVersion 3。"
  ));
  app.appendChild(restoreCard);

  const mappingCard = el("section","card");
  mappingCard.appendChild(el("h3","","FXデータの読み替え"));
  mappingCard.appendChild(el("p","help",
    "FX口座の履歴で、有効元本が未設定かつ現金に数値があるものを、有効元本へ複写します。現金の値は残します。"
  ));
  mappingCard.appendChild(makeButton(
    "対象履歴をプレビュー",
    "preview-fx-mapping",
    "secondary"
  ));

  if (fxMappingPreview !== null) {
    if (fxMappingPreview.length === 0) {
      mappingCard.appendChild(el("p","empty","読み替え対象の履歴はありません。"));
    } else {
      mappingCard.appendChild(el("p","help",
        "次の履歴が対象です。内容を確認してから実行してください。"
      ));
      const previewList = el("ul","backup-key-list");
      for (const item of fxMappingPreview) {
        previewList.appendChild(el(
          "li",
          "",
          item.accountName + "｜" + formatDateWithWeekday(item.asOfDate) +
            "｜有効元本へ " + formatYen(item.cash)
        ));
      }
      mappingCard.appendChild(previewList);
      mappingCard.appendChild(makeButton(
        "この内容で読み替えを実行",
        "apply-fx-mapping"
      ));
    }
  }
  app.appendChild(mappingCard);

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

  const diagnosisCard = el("section","card");
  diagnosisCard.appendChild(el("h3","","自己診断"));
  diagnosisCard.appendChild(el("p","help","保存データを変更せず、仕様書13章の6項目を確認します。"));
  diagnosisCard.appendChild(makeButton("自己診断を実行","run-self-diagnosis"));
  if (dataDiagnosisResults) {
    diagnosisCard.appendChild(el(
      "p",
      dataDiagnosisResults.allOk ? "success" : "error",
      dataDiagnosisResults.allOk ? "全部OK" : "NGあり（" + dataDiagnosisResults.ngCount + "件）"
    ));
    appendDataCheckResults(diagnosisCard,dataDiagnosisResults.items);
  }
  app.appendChild(diagnosisCard);

  const testsCard = el("section","card");
  testsCard.appendChild(el("h3","","テスト実行"));
  testsCard.appendChild(el("p","help","ボタンを押したときだけ js/tests.js を読み込み、架空データでテストします。保存データは変更しません。"));
  const testButton = makeButton("テスト実行","run-tests");
  testButton.disabled = dataTestLoading;
  testsCard.appendChild(testButton);
  if (dataTestResults) {
    const passed = dataTestResults.filter(item => item.success).length;
    const failed = dataTestResults.length - passed;
    testsCard.appendChild(el(
      "p",
      failed === 0 ? "success" : "error",
      failed === 0 ? "全件合格（" + passed + "件）" : "不合格あり（" + failed + "件）"
    ));
    const list = el("ul","backup-key-list");
    for (const item of dataTestResults) {
      list.appendChild(el("li","",
        (item.success ? "合格" : "不合格") + "：" + item.name + " — " + item.message
      ));
    }
    testsCard.appendChild(list);
  } else if (dataTestLoading) {
    testsCard.appendChild(el("p","help","テストを読み込んでいます..."));
  }
  app.appendChild(testsCard);
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
      fxMappingPreview = null;
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
