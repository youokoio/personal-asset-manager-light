"use strict";

function registerHoldingsTests(context) {
  const {assert,runTest,makeAccount,makeSnapshot} = context;

  function makeHolding(
    id,accountId,name,wrapper,kind,asOfDate,value
  ) {
    return {
      id,
      accountId,
      name,
      wrapper,
      kind,
      asOfDate,
      recordedAt:asOfDate + "T10:00:00.000Z",
      quantity:null,
      costBasis:null,
      value,
      pnl:null,
      memo:"",
      createdAt:asOfDate + "T10:00:00.000Z",
      updatedAt:asOfDate + "T10:00:00.000Z"
    };
  }

  runTest("S4：最新対象日の商品別保有とwrapper別小計",() => {
    const account = makeAccount(
      "holdings-stock",
      "楽天証券",
      "securities",
      "stock"
    );

    const data = {
      accounts:[account],
      snapshots:[],
      holdings:[
        makeHolding(
          "holding-a-old",
          account.id,
          "A",
          "NISAつみたて",
          "投信",
          "2026-10-31",
          100000
        ),
        makeHolding(
          "holding-b-old",
          account.id,
          "B",
          "特定",
          "投信",
          "2026-10-31",
          50000
        ),
        makeHolding(
          "holding-a-new",
          account.id,
          "A",
          "NISAつみたて",
          "投信",
          "2026-11-05",
          120000
        ),
        makeHolding(
          "holding-b-new",
          account.id,
          "B",
          "特定",
          "投信",
          "2026-11-05",
          55000
        ),
        makeHolding(
          "holding-c-new",
          account.id,
          "C",
          "NISA成長",
          "投信",
          "2026-11-05",
          30000
        )
      ]
    };

    const result = calculateHoldingsSummary(data,account.id);

    assert(result.asOfDate === "2026-11-05",
      "最新対象日が2026-11-05ではありません。");
    assert(result.wrapperTotals["NISAつみたて"] === 120000,
      "NISAつみたて小計が120,000円ではありません。");
    assert(result.wrapperTotals["特定"] === 55000,
      "特定小計が55,000円ではありません。");
    assert(result.wrapperTotals["NISA成長"] === 30000,
      "NISA成長小計が30,000円ではありません。");
    assert(result.total === 205000,
      "商品別合計が205,000円ではありません。");
    assert(result.holdings.length === 3,
      "最新対象日以外の商品が集計に含まれています。");
  });

  runTest("S4：snapshotがない場合は商品別合計を採用",() => {
    const account = makeAccount(
      "holdings-no-snapshot",
      "楽天証券",
      "securities",
      "stock"
    );

    const data = {
      accounts:[account],
      snapshots:[],
      holdings:[
        makeHolding(
          "holding-no-snapshot-a",
          account.id,
          "A",
          "NISAつみたて",
          "投信",
          "2026-11-05",
          120000
        ),
        makeHolding(
          "holding-no-snapshot-b",
          account.id,
          "B",
          "特定",
          "投信",
          "2026-11-05",
          55000
        ),
        makeHolding(
          "holding-no-snapshot-c",
          account.id,
          "C",
          "NISA成長",
          "投信",
          "2026-11-05",
          30000
        )
      ]
    };

    const result = calculateDashboard(data);

    assert(result.total === 205000,
      "snapshotがない口座の採用値が205,000円ではありません。");
    assert(result.includedAccountCount === 1,
      "商品別保有のある口座が1口座として集計されていません。");
  });

  runTest("S4：snapshotがある場合は口座評価額を採用し二重計上しない",() => {
    const account = makeAccount(
      "holdings-with-snapshot",
      "楽天証券",
      "securities",
      "stock"
    );

    const data = {
      accounts:[account],
      snapshots:[
        makeSnapshot(
          "holdings-account-snapshot",
          account.id,
          "2026-11-05",
          "2026-11-05T12:00:00.000Z",
          210000
        )
      ],
      holdings:[
        makeHolding(
          "holding-snapshot-a",
          account.id,
          "A",
          "NISAつみたて",
          "投信",
          "2026-11-05",
          120000
        ),
        makeHolding(
          "holding-snapshot-b",
          account.id,
          "B",
          "特定",
          "投信",
          "2026-11-05",
          55000
        ),
        makeHolding(
          "holding-snapshot-c",
          account.id,
          "C",
          "NISA成長",
          "投信",
          "2026-11-05",
          30000
        )
      ]
    };

    const summary = calculateHoldingsSummary(data,account.id);
    const dashboard = calculateDashboard(data);

    assert(summary.total === 205000,
      "商品別合計が205,000円ではありません。");
    assert(summary.accountValue === 210000,
      "口座評価額が210,000円ではありません。");
    assert(summary.difference === 5000,
      "差額が5,000円ではありません。");
    assert(dashboard.total === 210000,
      "採用値が210,000円ではありません。");
    assert(dashboard.total !== 415000,
      "口座評価額と商品別合計が二重計上されています。");
  });

  runTest("S4：GMOコインの商品別保有はwrapperなしで集計",() => {
    const account = makeAccount(
      "holdings-crypto",
      "GMOコイン",
      "crypto",
      "crypto"
    );

    const data = {
      accounts:[account],
      snapshots:[],
      holdings:[
        makeHolding(
          "holding-btc",
          account.id,
          "BTC",
          "なし",
          "暗号資産",
          "2026-11-05",
          287451
        ),
        makeHolding(
          "holding-sol",
          account.id,
          "SOL",
          "なし",
          "暗号資産",
          "2026-11-05",
          33634
        )
      ]
    };

    const result = calculateHoldingsSummary(data,account.id);

    assert(result.wrapperTotals["なし"] === 321085,
      "wrapper「なし」の小計が321,085円ではありません。");
    assert(result.total === 321085,
      "GMOコインの商品別合計が321,085円ではありません。");
  });

  runTest("S4：商品別保有の項目検証",() => {
    const data = createInitialData();
    const account = data.accounts.find(item =>
      item.name === "楽天証券"
    );

    const validHolding = makeHolding(
      "holding-validation",
      account.id,
      "架空投資信託",
      "NISAつみたて",
      "投信",
      "2026-11-05",
      100000
    );

    const validateHolding = holding => {
      const nextData = JSON.parse(JSON.stringify(data));
      nextData.holdings.push(holding);
      validateData(nextData);
    };

    validateHolding(validHolding);

    const invalidWrapper = {
      ...validHolding,
      wrapper:"NISA"
    };
    let wrapperRejected = false;
    try {
      validateHolding(invalidWrapper);
    } catch (error) {
      wrapperRejected = true;
    }
    assert(wrapperRejected,
      "定義されていないwrapperが拒否されていません。");

    const invalidAccount = {
      ...validHolding,
      accountId:"missing-account"
    };
    let accountRejected = false;
    try {
      validateHolding(invalidAccount);
    } catch (error) {
      accountRejected = true;
    }
    assert(accountRejected,
      "存在しないaccountIdが拒否されていません。");

    const invalidValue = {
      ...validHolding,
      value:"100000"
    };
    let valueRejected = false;
    try {
      validateHolding(invalidValue);
    } catch (error) {
      valueRejected = true;
    }
    assert(valueRejected,
      "数値でない評価額が拒否されていません。");

    const missingValue = {
      ...validHolding
    };
    delete missingValue.value;
    let missingValueRejected = false;
    try {
      validateHolding(missingValue);
    } catch (error) {
      missingValueRejected = true;
    }
    assert(missingValueRejected,
      "評価額未入力の商品別保有が拒否されていません。");

    const invalidKind = {
      ...validHolding,
      kind:"債券"
    };
    let kindRejected = false;
    try {
      validateHolding(invalidKind);
    } catch (error) {
      kindRejected = true;
    }
    assert(kindRejected,
      "定義されていないkindが拒否されていません。");

    const cryptoAccount = data.accounts.find(item =>
      item.name === "GMOコイン"
    );
    const validCrypto = makeHolding(
      "holding-validation-crypto",
      cryptoAccount.id,
      "BTC",
      "なし",
      "暗号資産",
      "2026-11-05",
      287451
    );
    validateHolding(validCrypto);
  });

  runTest("S4：商品別保有の重複判定キー",() => {
    const base = {
      accountId:"account-a",
      name:"eMAXIS Slim 先進国株式インデックス(除く日本)",
      wrapper:"NISAつみたて",
      asOfDate:"2026-11-05"
    };

    const baseKey = getHoldingImportKey(base);

    const sameKey = getHoldingImportKey({
      ...base
    });
    assert(baseKey === sameKey,
      "同じ口座・商品・wrapper・対象日が重複判定されていません。");

    const nameWithTrailingSpace = getHoldingImportKey({
      ...base,
      name:base.name + " "
    });
    assert(baseKey === nameWithTrailingSpace,
      "商品名末尾の空白を除いて重複判定できていません。");

    const differentWrapper = getHoldingImportKey({
      ...base,
      wrapper:"旧つみたてNISA"
    });
    assert(baseKey !== differentWrapper,
      "wrapperが異なる商品が重複扱いされています。");

    const differentDate = getHoldingImportKey({
      ...base,
      asOfDate:"2026-11-06"
    });
    assert(baseKey !== differentDate,
      "対象日が異なる商品が重複扱いされています。");

    const differentAccount = getHoldingImportKey({
      ...base,
      accountId:"account-b"
    });
    assert(baseKey !== differentAccount,
      "口座が異なる商品が重複扱いされています。");
  });
}
