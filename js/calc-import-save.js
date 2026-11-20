"use strict";

/* ---------- 承認後の保存 ---------- */

function saveBulkImportRows(data,rows,storage,options = {}) {
  if (!storage ||
      typeof storage.getItem !== "function" ||
      typeof storage.setItem !== "function") {
    throw new Error("保存先が正しくありません。");
  }

  const plannedRows = rows.filter(row => row.status === "planned");
  if (plannedRows.length === 0) {
    throw new Error("取り込む行がありません。");
  }

  const currentRaw = storage.getItem(STORAGE_KEY);
  if (currentRaw === null) {
    throw new Error("現在の保存データを確認できないため、中止しました。");
  }

  storage.setItem("pam2_pre_bulk",currentRaw);

  const nextData = JSON.parse(JSON.stringify(data));
  const now = options.recordedAt || new Date().toISOString();
  const idFactory = options.idFactory || createId;

  for (const row of plannedRows) {
    const account = nextData.accounts.find(item =>
      item.id === row.accountId
    );

    if (!account) {
      throw new Error("取り込み先の口座が見つかりません。");
    }

    nextData.snapshots.push({
      id:idFactory(),
      accountId:account.id,
      asOfDate:row.asOfDate,
      recordedAt:now,
      value:row.value,
      cumulativeInvested:null,
      effectivePrincipal:row.effectivePrincipal,
      pnl:row.pnl,
      realizedPnlTotal:row.realizedPnlTotal,
      cash:row.cash,
      swapTotal:account.type === "fx" ? row.swapTotal : null,
      requiredMargin:null,
      principal:null,
      memo:String(row.memo || "")
    });
  }

  validateData(nextData);
  storage.setItem(STORAGE_KEY,JSON.stringify(nextData));

  return {
    data:nextData,
    addedCount:plannedRows.length
  };
}
