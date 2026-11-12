"use strict";

/* ---------- S3b 履歴一括入力：列定義 ---------- */

const BULK_IMPORT_FIELDS = [
  "asOfDate",
  "accountName",
  "value",
  "effectivePrincipal",
  "pnl",
  "realizedPnlTotal",
  "cash",
  "memo"
];

const BULK_IMPORT_HEADERS = [
  "対象日",
  "口座名",
  "総資産",
  "有効元本",
  "評価損益",
  "累積確定損益",
  "現金",
  "メモ"
];

const BULK_IMPORT_NUMERIC_FIELDS = [
  "value",
  "effectivePrincipal",
  "pnl",
  "realizedPnlTotal",
  "cash"
];

const BULK_IMPORT_MAX_ROWS = 500;

/* ---------- 日付・数値の正規化 ---------- */

function normalizeBulkFullWidthDigits(value) {
  return String(value).replace(/[０-９]/g,character =>
    String.fromCharCode(character.charCodeAt(0) - 0xFEE0)
  );
}

function normalizeBulkDate(value) {
  const source = String(value === null || value === undefined ? "" : value).trim();
  if (!source) return {value:null,error:null};

  let match = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (!match) {
    match = source.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  }

  if (!match) {
    match = source.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  }

  if (!match) {
    return {value:source,error:"対象日の形式が正しくありません。"};
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year,month - 1,day));

  if (date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day) {
    return {value:source,error:"実在しない日付です。"};
  }

  return {
    value:String(year).padStart(4,"0") + "-" +
      String(month).padStart(2,"0") + "-" +
      String(day).padStart(2,"0"),
    error:null
  };
}

function normalizeBulkNumber(value) {
  const source = normalizeBulkFullWidthDigits(
    value === null || value === undefined ? "" : value
  ).trim();

  if (!source) return {value:null,error:null};

  let normalized = source
    .replace(/,/g,"")
    .replace(/円/g,"")
    .replace(/¥/g,"")
    .trim();

  if (normalized.startsWith("+")) {
    normalized = normalized.slice(1);
  }

  normalized = normalized.replace(/^−/,"-");

  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    return {value:source,error:"数値形式が正しくありません。"};
  }

  const number = Number(normalized);
  if (!Number.isFinite(number)) {
    return {value:source,error:"数値として扱えません。"};
  }

  return {value:number,error:null};
}

/* ---------- 行の生成・解析 ---------- */

function createBulkImportRow(rowNumber) {
  return {
    id:"bulk-row-" + rowNumber,
    rowNumber,
    asOfDate:"",
    accountName:"",
    value:null,
    effectivePrincipal:null,
    pnl:null,
    realizedPnlTotal:null,
    cash:null,
    memo:"",
    parseErrors:{},
    status:"error",
    reasons:["未入力です。"],
    accountId:null
  };
}

function parseBulkImportRow(cells,rowNumber) {
  const row = createBulkImportRow(rowNumber);
  const parseErrors = {};

  for (let index = 0; index < BULK_IMPORT_FIELDS.length; index += 1) {
    const field = BULK_IMPORT_FIELDS[index];
    const raw = cells[index] === undefined ? "" : String(cells[index]);

    if (field === "asOfDate") {
      const result = normalizeBulkDate(raw);
      row.asOfDate = result.value === null ? "" : result.value;
      if (result.error) parseErrors.asOfDate = result.error;
    } else if (field === "accountName") {
      row.accountName = raw.trim();
    } else if (BULK_IMPORT_NUMERIC_FIELDS.includes(field)) {
      const result = normalizeBulkNumber(raw);
      row[field] = result.value;
      if (result.error) parseErrors[field] = result.error;
    } else {
      row[field] = raw;
    }
  }

  if (cells.length > BULK_IMPORT_FIELDS.length) {
    parseErrors.__extra = "列が8列を超えています。";
  }

  row.parseErrors = parseErrors;
  return row;
}

function parseBulkImportTsv(text,startRowNumber = 1) {
  const source = String(text === null || text === undefined ? "" : text);
  const lines = source.split(/\r\n|\n|\r/);
  const rows = [];
  let skippedHeader = false;

  for (const line of lines) {
    if (line.trim() === "") continue;

    const cells = line.split("\t");

    if (!skippedHeader &&
        String(cells[0] || "").trim() === "対象日") {
      skippedHeader = true;
      continue;
    }

    skippedHeader = true;

    rows.push(parseBulkImportRow(
      cells,
      startRowNumber + rows.length
    ));
  }

  if (rows.length > BULK_IMPORT_MAX_ROWS) {
    return {
      rows:[],
      error:"一度に展開できるのは500行までです。分割して貼り付けてください。"
    };
  }

  return {rows,error:null};
}

/* ---------- 行の編集・追加・削除 ---------- */

function updateBulkImportRow(rows,rowId,field,value) {
  if (!BULK_IMPORT_FIELDS.includes(field)) return rows;

  return rows.map(row => {
    if (row.id !== rowId) return row;

    const next = {
      ...row,
      parseErrors:{...row.parseErrors}
    };

    if (field === "asOfDate") {
      const result = normalizeBulkDate(value);
      next.asOfDate = result.value === null ? "" : result.value;
      if (result.error) {
        next.parseErrors.asOfDate = result.error;
      } else {
        delete next.parseErrors.asOfDate;
      }
    } else if (BULK_IMPORT_NUMERIC_FIELDS.includes(field)) {
      const result = normalizeBulkNumber(value);
      next[field] = result.value === null && String(value).trim() !== ""
        ? String(value)
        : result.value;
      if (result.error) {
        next.parseErrors[field] = result.error;
      } else {
        delete next.parseErrors[field];
      }
    } else {
      next[field] = String(value);
    }

    return next;
  });
}

function addBulkImportRow(rows) {
  if (rows.length >= BULK_IMPORT_MAX_ROWS) {
    return rows;
  }
  return [...rows,createBulkImportRow(rows.length + 1)];
}

function deleteBulkImportRow(rows,rowId) {
  return rows
    .filter(row => row.id !== rowId)
    .map((row,index) => ({...row,rowNumber:index + 1}));
}

/* ---------- 行ごとの検証・重複判定 ---------- */

function classifyBulkImportRows(rows,accounts,snapshots) {
  const accountByName = new Map(
    accounts.map(account => [account.name,account])
  );

  const existingKeys = new Set(
    snapshots.map(snapshot =>
      snapshot.accountId + "|" + snapshot.asOfDate
    )
  );

  const seenKeys = new Set();

  return rows.map(sourceRow => {
    const row = {
      ...sourceRow,
      parseErrors:{...(sourceRow.parseErrors || {})},
      reasons:[],
      accountId:null,
      status:"planned"
    };

    if (row.parseErrors.__extra) {
      row.reasons.push(row.parseErrors.__extra);
    }

    for (const [field,message] of Object.entries(row.parseErrors)) {
      if (field !== "__extra") row.reasons.push(message);
    }

    if (!row.asOfDate) {
      row.reasons.push("対象日が未入力です。");
    } else if (!row.parseErrors.asOfDate) {
      const dateResult = normalizeBulkDate(row.asOfDate);
      if (dateResult.error) row.reasons.push(dateResult.error);
      else row.asOfDate = dateResult.value;
    }

    const accountName = String(row.accountName || "").trim();
    if (!accountName) {
      row.reasons.push("口座名が未入力です。");
    } else {
      const account = accountByName.get(accountName);
      if (!account) {
        row.reasons.push("該当する口座名がありません。");
      } else {
        row.accountId = account.id;
      }
    }

    if (row.value === null || row.value === "") {
      row.reasons.push("総資産が未入力です。");
    } else if (typeof row.value !== "number" ||
               !Number.isFinite(row.value)) {
      row.reasons.push("総資産が数値ではありません。");
    }

    for (const field of BULK_IMPORT_NUMERIC_FIELDS) {
      const value = row[field];
      if (value === null || value === "") continue;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        row.reasons.push(BULK_IMPORT_HEADERS[
          BULK_IMPORT_FIELDS.indexOf(field)
        ] + "が数値ではありません。");
      }
    }

    const account = row.accountId
      ? accounts.find(item => item.id === row.accountId)
      : null;

    if (account && account.type === "bank") {
      const prohibitedFields = [
        "effectivePrincipal",
        "pnl",
        "realizedPnlTotal",
        "cash"
      ];
      if (prohibitedFields.some(field =>
        row[field] !== null && row[field] !== ""
      )) {
        row.reasons.push(
          "銀行口座は総資産・メモ以外の金額項目を使えません。"
        );
      }
    }

    if (account && account.type === "fx" &&
        row.realizedPnlTotal !== null &&
        row.realizedPnlTotal !== "") {
      row.reasons.push(
        "FX口座では累積確定損益を入力できません。"
      );
    }

    const canCheckDuplicate =
      row.accountId && row.asOfDate &&
      !row.parseErrors.asOfDate;

    if (row.reasons.length === 0 && canCheckDuplicate) {
      const key = row.accountId + "|" + row.asOfDate;

      if (existingKeys.has(key) || seenKeys.has(key)) {
        row.status = "duplicate";
        row.reasons.push("同じ口座・対象日の履歴が既にあります。");
      } else {
        row.status = "planned";
      }
    } else {
      row.status = "error";
    }

    if (canCheckDuplicate) {
      seenKeys.add(row.accountId + "|" + row.asOfDate);
    }

    return row;
  });
}

function summarizeBulkImportRows(rows) {
  return rows.reduce((summary,row) => {
    if (row.status === "planned") summary.planned += 1;
    else if (row.status === "duplicate") summary.duplicate += 1;
    else summary.error += 1;
    return summary;
  },{
    planned:0,
    error:0,
    duplicate:0
  });
}

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
      swapTotal:null,
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
