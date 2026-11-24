"use strict";

/* ---------- S11b 株式OCRの比較・保存テスト ---------- */

function stockOcrMakeCompareHoldingTest(
  id,accountId,name,wrapper,asOfDate,value,costBasis,pnl,quantity = null
) {
  return {
    id,
    accountId,
    name,
    wrapper,
    kind:"投信",
    asOfDate,
    recordedAt:asOfDate + "T10:00:00.000Z",
    value,
    quantity,
    costBasis,
    pnl,
    memo:"",
    createdAt:asOfDate + "T10:00:00.000Z",
    updatedAt:asOfDate + "T10:00:00.000Z"
  };
}

function stockOcrMakeCompareCardTest(
  name,wrapper,value,costBasis,pnl,quantity = null
) {
  return {
    status:"recognized",
    selected:true,
    name,
    wrapper,
    kind:"投信",
    value,
    costBasis,
    pnl,
    quantity
  };
}

function stockOcrMakeCompareDataTest(holdings,snapshots = []) {
  return {
    accounts:[{id:"account-a",category:"stock",name:"架空証券口座"}],
    holdings,
    snapshots
  };
}

function stockOcrWithFakeStorageTest(initialRaw,callback) {
  const originalStorage = globalThis.localStorage;
  const values = new Map();

  if (initialRaw !== null) {
    values.set(STORAGE_KEY,initialRaw);
  }

  globalThis.localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key,value) {
      values.set(key,String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };

  try {
    return callback(values);
  } finally {
    globalThis.localStorage = originalStorage;
  }
}

function registerStockOcrComparisonTests(context) {
  const {assert,runTest} = context;

  runTest("S11b比較①：取得額の減少",() => {
    const previous = stockOcrMakeCompareHoldingTest(
      "previous-a","account-a","架空ファンドA",
      "NISAつみたて","2026-10-31",90000,100000,-10000
    );
    const card = stockOcrMakeCompareCardTest(
      "架空ファンドA","NISAつみたて",60000,70000,-10000
    );

    const result = stockOcrCompareCardsStock(
      stockOcrMakeCompareDataTest([previous]),"account-a",[card],"2026-11-30"
    );

    assert(result.cards[0].costDifference === -30000,
      "取得額の差が-30,000円になっていません。");
    assert(result.cards[0].comparison === "cost-decrease",
      "取得額の減少として判定されていません。");
  });

  runTest("S11b比較②：評価額のみの変化と数量差",() => {
    const previous = stockOcrMakeCompareHoldingTest(
      "previous-b","account-a","架空ファンドB",
      "特定","2026-10-31",100000,100000,0,10
    );
    const card = stockOcrMakeCompareCardTest(
      "架空ファンドB","特定",110000,100000,10000,12
    );

    const result = stockOcrCompareCardsStock(
      stockOcrMakeCompareDataTest([previous]),"account-a",[card],"2026-11-30"
    );

    assert(result.cards[0].comparison === "value-change",
      "取得額が同じ場合に評価額のみの変化になっていません。");
    assert(result.cards[0].quantityDifference === 2,
      "数量差が+2になっていません。");
  });

  runTest("S11b比較③：取得額の大幅増加",() => {
    const previous = stockOcrMakeCompareHoldingTest(
      "previous-c","account-a","架空ファンドC",
      "NISA成長","2026-10-31",100000,100000,0
    );
    const card = stockOcrMakeCompareCardTest(
      "架空ファンドC","NISA成長",160000,160000,0
    );

    const result = stockOcrCompareCardsStock(
      stockOcrMakeCompareDataTest([previous]),"account-a",[card],"2026-11-30"
    );

    assert(result.cards[0].costDifference === 60000,
      "取得額の増加が60,000円になっていません。");
    assert(result.cards[0].wrapperWarning === true,
      "取得額が50%を超えて増加した警告がありません。");
  });

  runTest("S11b比較④：取得額がnullの場合",() => {
    const previous = stockOcrMakeCompareHoldingTest(
      "previous-d","account-a","架空ファンドD",
      "特定","2026-10-31",100000,null,null
    );
    const card = stockOcrMakeCompareCardTest(
      "架空ファンドD","特定",90000,null,null
    );

    const result = stockOcrCompareCardsStock(
      stockOcrMakeCompareDataTest([previous]),"account-a",[card],"2026-11-30"
    );

    assert(result.cards[0].comparison === "unavailable",
      "取得額が不明な場合に比較不能になっていません。");
    assert(result.cards[0].costDifference === null,
      "取得額が不明なのに差額が計算されています。");
  });

  runTest("S11b比較⑤：新商品・類似候補・消失商品",() => {
    const previous = [
      stockOcrMakeCompareHoldingTest(
        "previous-e","account-a","架空インデックスファンド",
        "特定","2026-10-31",100000,90000,10000
      ),
      stockOcrMakeCompareHoldingTest(
        "previous-f","account-a","架空バランスファンド",
        "特定","2026-10-31",50000,50000,0
      )
    ];
    const exactCard = stockOcrMakeCompareCardTest(
      "架空インデックスファンド","特定",110000,100000,10000
    );
    const similarCard = stockOcrMakeCompareCardTest(
      "架空バランスファンド改","特定",60000,60000,0
    );

    const result = stockOcrCompareCardsStock(
      stockOcrMakeCompareDataTest(previous),"account-a",
      [exactCard,similarCard],"2026-11-30"
    );

    assert(result.cards[1].comparison === "new",
      "一致する商品がないカードが新商品として判定されていません。");
    assert(result.cards[1].similarNames.length > 0,
      "類似商品名の候補が表示されていません。");
    assert(result.missingHoldings.length === 1,
      "今回のカードにない過去商品が1件検出されていません。");
    assert(result.missingHoldings[0].name === "架空バランスファンド",
      "消失候補の商品名が一致しません。");
  });

  runTest("S11b比較⑥：口座全体の差額が5%以内",() => {
    const cards = [
      stockOcrMakeCompareCardTest(
        "架空商品G1","特定",500000,500000,0
      ),
      stockOcrMakeCompareCardTest(
        "架空商品G2","特定",450000,450000,0
      )
    ];
    const snapshots = [{
      accountId:"account-a",
      asOfDate:"2026-11-30",
      value:1000000
    }];

    const result = stockOcrCompareCardsStock(
      stockOcrMakeCompareDataTest([],snapshots),"account-a",
      cards,"2026-11-30"
    );

    assert(result.holdingsTotal === 950000,
      "商品別合計が950,000円になっていません。");
    assert(result.difference === 50000,
      "口座全体との差額が50,000円になっていません。");
    assert(result.differenceWarning === false,
      "差額5%を超えていないのに警告されています。");
  });

  runTest("S11b比較⑦：口座全体の差額が5%超",() => {
    const cards = [
      stockOcrMakeCompareCardTest(
        "架空商品H1","特定",500000,500000,0
      ),
      stockOcrMakeCompareCardTest(
        "架空商品H2","特定",450000,450000,0
      )
    ];
    const snapshots = [{
      accountId:"account-a",
      asOfDate:"2026-11-30",
      value:1000001
    }];

    const result = stockOcrCompareCardsStock(
      stockOcrMakeCompareDataTest([],snapshots),"account-a",
      cards,"2026-11-30"
    );

    assert(result.difference === 50001,
      "口座全体との差額が50,001円になっていません。");
    assert(result.differenceWarning === true,
      "差額5%超の警告がありません。");
  });

  runTest("S11b保存①：同じ対象日の重複を追加しない",() => {
    const data = createInitialData();
    const account = data.accounts.find(item =>
      item.name === "楽天証券"
    );
    assert(account !== undefined,"楽天証券口座がありません。");

    data.holdings.push(stockOcrMakeCompareHoldingTest(
      "existing-i",account.id,"架空ファンドＡ",
      "NISAつみたて","2026-11-30",100000,90000,10000
    ));

    const raw = JSON.stringify(data);
    const card = stockOcrMakeCompareCardTest(
      "架空ファンドA","NISAつみたて",110000,100000,10000
    );

    stockOcrWithFakeStorageTest(raw,values => {
      const result = saveStockOcrImportStock(
        account.id,"2026-11-30",[card],
        {idFactory:() => "unused-id"}
      );

      assert(result.saved === false,
        "同じ対象日の重複カードが保存扱いになっています。");
      assert(result.addedHoldings === 0,
        "重複カードが追加されています。");
      assert(values.get(STORAGE_KEY) === raw,
        "重複だけのときに保存データが変更されています。");
      assert(!values.has("pam2_pre_holdocr"),
        "追加がないのに一時バックアップが作成されています。");
    });
  });

  runTest("S11b保存②：追加保存とOCR原文の非保存",() => {
    const data = createInitialData();
    const account = data.accounts.find(item =>
      item.name === "楽天証券"
    );
    assert(account !== undefined,"楽天証券口座がありません。");

    const raw = JSON.stringify(data);
    const card = stockOcrMakeCompareCardTest(
      "架空ファンドJ","NISAつみたて",60000,70000,-10000,10
    );

    stockOcrWithFakeStorageTest(raw,values => {
      const result = saveStockOcrImportStock(
        account.id,"2026-11-30",[card],
        {idFactory:() => "fictional-holding-j"}
      );

      assert(result.saved === true,"商品別保有が保存されていません。");
      assert(result.addedHoldings === 1,
        "追加された商品別保有が1件ではありません。");
      assert(values.has("pam2_pre_holdocr"),
        "保存前の一時バックアップがありません。");

      const saved = JSON.parse(values.get(STORAGE_KEY));
      const added = saved.holdings.find(item =>
        item.id === "fictional-holding-j"
      );

      assert(added !== undefined,"追加した商品別保有が見つかりません。");
      assert(added.value === 60000,"評価額が一致しません。");
      assert(added.costBasis === 70000,"取得額が一致しません。");
      assert(added.pnl === -10000,"評価損益が一致しません。");

      const savedText = values.get(STORAGE_KEY);
      const backupText = values.get("pam2_pre_holdocr");

      assert(!savedText.includes("safeLines"),
        "OCRの行情報が保存データに残っています。");
      assert(!savedText.includes("originalText"),
        "OCR原文が保存データに残っています。");
      assert(!backupText.includes("safeLines"),
        "OCRの行情報が一時バックアップに残っています。");
      assert(!backupText.includes("originalText"),
        "OCR原文が一時バックアップに残っています。");
    });
  });

  runTest("S11b保存③：保存失敗時に既存データを維持",() => {
    const data = createInitialData();
    const account = data.accounts.find(item =>
      item.name === "楽天証券"
    );
    assert(account !== undefined,"楽天証券口座がありません。");

    const raw = JSON.stringify(data);
    const card = stockOcrMakeCompareCardTest(
      "架空ファンドK","NISA成長",80000,70000,10000
    );

    const originalValidate = globalThis.validateData;
    globalThis.validateData = () => {
      throw new Error("架空の保存検証エラー");
    };

    try {
      stockOcrWithFakeStorageTest(raw,values => {
        let rejected = false;
        try {
          saveStockOcrImportStock(
            account.id,"2026-11-30",[card],
            {idFactory:() => "fictional-holding-k"}
          );
        } catch (error) {
          rejected = true;
        }

        assert(rejected,"保存検証エラーが発生していません。");
        assert(values.get(STORAGE_KEY) === raw,
          "保存失敗時に既存データが変更されています。");
        assert(values.has("pam2_pre_holdocr"),
          "保存失敗時の一時バックアップがありません。");
      });
    } finally {
      globalThis.validateData = originalValidate;
    }
  });

  runTest("S11b保存④：口座全体snapshotの任意追加",() => {
    const data = createInitialData();
    const account = data.accounts.find(item =>
      item.name === "楽天証券"
    );
    assert(account !== undefined,"楽天証券口座がありません。");

    const raw = JSON.stringify(data);
    const cards = [
      stockOcrMakeCompareCardTest(
        "架空ファンドL1","NISAつみたて",70000,60000,10000
      ),
      stockOcrMakeCompareCardTest(
        "架空ファンドL2","特定",50000,40000,10000
      )
    ];

    stockOcrWithFakeStorageTest(raw,values => {
      const result = saveStockOcrImportStock(
        account.id,"2026-11-30",cards,
        {
          addAccountSnapshot:true,
          value:120000,
          effectivePrincipal:100000,
          pnl:5000,
          idFactory:(() => {
            let index = 0;
            return () => "fictional-snapshot-l-" + (++index);
          })()
        }
      );

      assert(result.addedSnapshot === true,
        "口座全体snapshotが追加されていません。");

      const saved = JSON.parse(values.get(STORAGE_KEY));
      const snapshot = saved.snapshots.find(item =>
        item.id === "fictional-snapshot-l-1"
      );

      assert(snapshot !== undefined,"snapshotが見つかりません。");
      assert(snapshot.value === 120000,
        "snapshotの評価額が120,000円ではありません。");
      assert(snapshot.effectivePrincipal === 100000,
        "snapshotの有効元本が100,000円ではありません。");
      assert(snapshot.pnl === 5000,
        "snapshotの評価損益が5,000円ではありません。");
      assert(snapshot.memo === "",
        "指定していないメモが追加されています。");
    });
  });

  runTest("S11b保存⑤：同じ日のsnapshotを上書きしない",() => {
    const data = createInitialData();
    const account = data.accounts.find(item =>
      item.name === "楽天証券"
    );
    assert(account !== undefined,"楽天証券口座がありません。");

    const existingSnapshot = {
      id:"existing-snapshot-m",
      accountId:account.id,
      asOfDate:"2026-11-30",
      recordedAt:"2026-11-30T10:00:00.000Z",
      value:999999,
      cumulativeInvested:null,
      effectivePrincipal:null,
      pnl:null,
      realizedPnlTotal:null,
      realizedPnlDaily:null,
      cash:null,
      swapTotal:null,
      requiredMargin:null,
      memo:"既存の架空履歴"
    };
    data.snapshots.push(existingSnapshot);

    const raw = JSON.stringify(data);
    const card = stockOcrMakeCompareCardTest(
      "架空ファンドM","特定",50000,45000,5000
    );

    stockOcrWithFakeStorageTest(raw,values => {
      const result = saveStockOcrImportStock(
        account.id,"2026-11-30",[card],
        {
          addAccountSnapshot:true,
          value:50000,
          idFactory:() => "fictional-holding-m"
        }
      );

      assert(result.addedHoldings === 1,
        "商品別保有の追加が行われていません。");
      assert(result.addedSnapshot === false,
        "同じ対象日のsnapshotが追加されています。");

      const saved = JSON.parse(values.get(STORAGE_KEY));
      const snapshots = saved.snapshots.filter(item =>
        item.accountId === account.id &&
        item.asOfDate === "2026-11-30"
      );

      assert(snapshots.length === 1,
        "同じ対象日のsnapshotが重複しています。");
      assert(snapshots[0].value === 999999,
        "既存snapshotの評価額が上書きされています。");
      assert(snapshots[0].memo === "既存の架空履歴",
        "既存snapshotのメモが変更されています。");
    });
  });
}
