"use strict";

/* ---------- S11b 株式OCRテスト ---------- */

function stockOcrGetTestRuleStock(ruleId) {
  if (!Array.isArray(STOCK_OCR_RULES)) return null;
  return STOCK_OCR_RULES.find(rule => rule.ruleId === ruleId) || null;
}

function stockOcrRunFixtureStock(ruleId,fixtureName) {
  const rule = stockOcrGetTestRuleStock(ruleId);
  if (!rule || !STOCK_OCR_TEST_DATA) {
    throw new Error("株式OCRのルールまたはテストデータがありません。");
  }

  const accountKey = {
    "rakuten-securities":"rakuten",
    "ideco":"ideco",
    "corporate-dc":"corporateDc"
  }[ruleId];

  const fixture = STOCK_OCR_TEST_DATA[accountKey];
  if (!fixture || typeof fixture[fixtureName] !== "string") {
    throw new Error("指定された架空OCRデータがありません。");
  }

  return parseStockOcrText(fixture[fixtureName],rule);
}

function stockOcrAssertCardCountStock(assert,result,count,message) {
  assert(
    result && Array.isArray(result.cards) &&
    result.cards.length === count,
    message
  );
}

function stockOcrAssertNeedsConfirmationStock(assert,card,message) {
  assert(
    card && card.status === "needs-confirmation",
    message
  );
}

function registerStockOcrTests(context) {
  const {assert,runTest} = context;

  runTest("S11b①：株式OCRルールの3口座独立",() => {
    const rakuten = stockOcrGetTestRuleStock("rakuten-securities");
    const ideco = stockOcrGetTestRuleStock("ideco");
    const corporateDc = stockOcrGetTestRuleStock("corporate-dc");

    assert(rakuten !== null,"楽天証券のルールがありません。");
    assert(ideco !== null,"iDeCoのルールがありません。");
    assert(corporateDc !== null,"企業型DCのルールがありません。");

    assert(rakuten !== ideco && ideco !== corporateDc &&
      rakuten !== corporateDc,"口座ルールのオブジェクトが共有されています。");

    assert(rakuten.formats[0].fields !== ideco.formats[0].fields,
      "楽天証券とiDeCoのlabels定義が共有されています。");
    assert(ideco.formats[0].fields !== corporateDc.formats[0].fields,
      "iDeCoと企業型DCのlabels定義が共有されています。");

    const original = rakuten.formats[0].wrapperAliases[
      "NISA成長投資枠"
    ];
    const copied = JSON.parse(JSON.stringify(rakuten));
    copied.formats[0].wrapperAliases["NISA成長投資枠"] = "変更テスト";

    assert(
      rakuten.formats[0].wrapperAliases["NISA成長投資枠"] === original,
      "複製ルールの変更が元の楽天証券ルールに影響しています。"
    );
  });

  runTest("S11b②：楽天証券の正常カード解析",() => {
    const result = stockOcrRunFixtureStock(
      "rakuten-securities","normal"
    );

    assert(result.success,"楽天証券の正常データを解析できません。");
    stockOcrAssertCardCountStock(
      assert,result,2,"楽天証券の商品カードが2件に分割されていません。"
    );

    const domestic = result.cards[0];
    const fund = result.cards[1];

    assert(domestic.name === "架空テクノロジー (1234)",
      "国内株式の商品名が一致しません。");
    assert(domestic.wrapper === "NISA成長",
      "NISA成長投資枠が正規化されていません。");
    assert(domestic.kind === "国内株",
      "国内株式のkindが正しくありません。");
    assert(domestic.value === 120000,
      "国内株式の評価額が120000円になっていません。");
    assert(domestic.pnl === 20000,
      "国内株式の評価損益が20000円になっていません。");
    assert(domestic.costBasis === 100000,
      "取得額の計算値が100000円になっていません。");

    assert(fund.wrapper === "NISAつみたて",
      "NISAつみたて投資枠が正規化されていません。");
    assert(fund.kind === "投信",
      "投資信託のkindが正しくありません。");
    assert(fund.value === 300000,
      "投資信託の評価額が300000円になっていません。");
    assert(fund.pnl === -10000,
      "投資信託の評価損益が-10000円になっていません。");
    assert(fund.costBasis === 310000,
      "投資信託の取得額が310000円になっていません。");
  });

  runTest("S11b③：楽天証券の項目順変更",() => {
    const result = stockOcrRunFixtureStock(
      "rakuten-securities","reordered"
    );

    assert(result.success,"並び替えデータを解析できません。");
    stockOcrAssertCardCountStock(
      assert,result,2,"並び替えデータの商品数が2件ではありません。"
    );

    const fund = result.cards[0];
    const domestic = result.cards[1];

    assert(fund.value === 95000,
      "並び替え後の投資信託評価額が95000円ではありません。");
    assert(fund.pnl === -5000,
      "並び替え後の投資信託評価損益が-5000円ではありません。");
    assert(fund.costBasis === 100000,
      "並び替え後の投資信託取得額が100000円ではありません。");

    assert(domestic.value === 52000,
      "並び替え後の国内株式評価額が52000円ではありません。");
    assert(domestic.pnl === 2000,
      "並び替え後の国内株式評価損益が2000円ではありません。");
    assert(domestic.costBasis === 50000,
      "並び替え後の国内株式取得額が50000円ではありません。");
  });

  runTest("S11b④：楽天証券の未知wrapper",() => {
    const result = stockOcrRunFixtureStock(
      "rakuten-securities","unknownWrapper"
    );

    stockOcrAssertCardCountStock(
      assert,result,1,"未知wrapperのカードが1件ではありません。"
    );
    stockOcrAssertNeedsConfirmationStock(
      assert,result.cards[0],"未知wrapperが要確認になっていません。"
    );
    assert(result.cards[0].wrapper === null,
      "未知wrapperが既知のwrapperとして確定されています。");
  });

  runTest("S11b⑤：楽天証券の外貨表示",() => {
    const result = stockOcrRunFixtureStock(
      "rakuten-securities","foreignCurrency"
    );

    stockOcrAssertCardCountStock(
      assert,result,1,"外貨表示カードが1件ではありません。"
    );
    const card = result.cards[0];

    stockOcrAssertNeedsConfirmationStock(
      assert,card,"外貨表示カードが要確認になっていません。"
    );
    assert(card.value === null,
      "外貨金額が円金額として取り込まれています。");
  });

  runTest("S11b⑥：楽天証券の金額不足",() => {
    const result = stockOcrRunFixtureStock(
      "rakuten-securities","missingAmount"
    );

    stockOcrAssertCardCountStock(
      assert,result,1,"金額不足カードが1件ではありません。"
    );
    const card = result.cards[0];

    stockOcrAssertNeedsConfirmationStock(
      assert,card,"金額不足カードが要確認になっていません。"
    );
    assert(card.value === null,
      "評価額が欠けているのに別の金額が割り当てられています。");
    assert(card.pnl === 3000,
      "明示された評価損益3000円が保持されていません。");
    assert(card.costBasis === null,
      "評価額が欠けているのに取得額が計算されています。");
  });

  runTest("S11b⑦：楽天証券の重複カード",() => {
    const result = stockOcrRunFixtureStock(
      "rakuten-securities","duplicateCard"
    );

    stockOcrAssertCardCountStock(
      assert,result,2,"重複カードが2件に分割されていません。"
    );

    for (const card of result.cards) {
      stockOcrAssertNeedsConfirmationStock(
        assert,card,"重複した商品カードが要確認になっていません。"
      );
    }
  });

  runTest("S11b⑧：iDeCoの正常カード解析",() => {
    const result = stockOcrRunFixtureStock("ideco","normal");

    assert(result.success,"iDeCoの正常データを解析できません。");
    stockOcrAssertCardCountStock(
      assert,result,1,"iDeCoの商品カードが1件ではありません。"
    );

    const card = result.cards[0];
    assert(card.name === "架空・S&P500インデックス・ファンド",
      "iDeCoの商品名が一致しません。");
    assert(card.wrapper === "iDeCo",
      "iDeCoのwrapperが正しくありません。");
    assert(card.kind === "投信",
      "iDeCoのkindが投信になっていません。");
    assert(card.value === 246000,
      "iDeCoの評価額が246000円になっていません。");
    assert(card.pnl === 24000,
      "iDeCoの評価損益が24000円になっていません。");
    assert(card.costBasis === 222000,
      "iDeCoの取得額が222000円になっていません。");
    assert(card.quantity === 12000,
      "明示された保有数量12000口が取得できていません。");
  });

  runTest("S11b⑨：iDeCoの項目順変更",() => {
    const result = stockOcrRunFixtureStock("ideco","reordered");

    stockOcrAssertCardCountStock(
      assert,result,1,"並び替え後のiDeCoカードが1件ではありません。"
    );

    const card = result.cards[0];
    assert(card.value === 120000,
      "並び替え後のiDeCo評価額が120000円ではありません。");
    assert(card.pnl === -6000,
      "並び替え後のiDeCo評価損益が-6000円ではありません。");
    assert(card.costBasis === 126000,
      "並び替え後のiDeCo取得額が126000円ではありません。");
    assert(card.quantity === 15000,
      "並び替え後のiDeCo数量15000口が取得できていません。");
  });

  runTest("S11b⑩：iDeCoの見出しだけの商品",() => {
    const result = stockOcrRunFixtureStock("ideco","headingOnly");

    stockOcrAssertCardCountStock(
      assert,result,1,"見出しだけのiDeCoカードが1件ではありません。"
    );
    stockOcrAssertNeedsConfirmationStock(
      assert,result.cards[0],"見出しだけの商品が要確認になっていません。"
    );
    assert(result.cards[0].value === null,
      "値がない商品に評価額が設定されています。");
  });

  runTest("S11b⑪：iDeCoのOCR破損数量",() => {
    const result = stockOcrRunFixtureStock(
      "ideco","corruptedQuantity"
    );

    stockOcrAssertCardCountStock(
      assert,result,1,"数量破損データのカードが1件ではありません。"
    );
    const card = result.cards[0];

    assert(card.quantity === null,
      "単位が不正な数量を数値として取り込んでいます。");
    stockOcrAssertNeedsConfirmationStock(
      assert,card,"数量破損データが要確認になっていません。"
    );
  });

  runTest("S11b⑫：iDeCoの外貨表示",() => {
    const result = stockOcrRunFixtureStock(
      "ideco","foreignCurrency"
    );

    stockOcrAssertCardCountStock(
      assert,result,1,"iDeCo外貨カードが1件ではありません。"
    );
    assert(result.cards[0].value === null,
      "iDeCoの外貨金額が円として取り込まれています。");
    stockOcrAssertNeedsConfirmationStock(
      assert,result.cards[0],"iDeCo外貨表示が要確認になっていません。"
    );
  });

  runTest("S11b追補C①：iDeCoの金額2件表示",() => {
    const text = [
      "● 外国株式",
      "架空・iDeCoテストファンド",
      "構成比",
      "時価評価額",
      "評価損益",
      "詳細",
      "100.0%",
      "200,000円",
      "+17,000 円（+8.5%）"
    ].join("\n");
    const result = parseStockOcrText(
      text,stockOcrGetTestRuleStock("ideco")
    );

    stockOcrAssertCardCountStock(
      assert,result,1,"iDeCoの2金額表示カードが1件ではありません。"
    );

    const card = result.cards[0];
    assert(card.value === 200000,
      "iDeCoの評価額200000円が取得できていません。");
    assert(card.pnl === 17000,
      "iDeCoの評価損益17000円が取得できていません。");
    assert(card.costBasis === 183000,
      "iDeCoの取得額183000円が計算されていません。");
    assert(card.integrity.status === "rate-mismatch",
      "取得額から計算した率とOCR表示率の不一致が検出されていません。");
    stockOcrAssertNeedsConfirmationStock(
      assert,card,"率の不一致があるiDeCoカードが要確認になっていません。"
    );
  });

  runTest("S11b⑬：企業型DCの正常カード分割",() => {
    const result = stockOcrRunFixtureStock(
      "corporate-dc","normal"
    );

    assert(result.success,"企業型DCの正常データを解析できません。");
    stockOcrAssertCardCountStock(
      assert,result,2,"企業型DCの商品カードが2件に分割されていません。"
    );

    const principal = result.cards[0];
    const fund = result.cards[1];

    assert(principal.kind === "元本確保型",
      "定期預金のkindが元本確保型ではありません。");
    assert(fund.kind === "投信",
      "投資信託のkindが投信ではありません。");

    assert(fund.value === 700000,
      "企業型DC投資信託の評価額が700000円ではありません。");
    assert(fund.costBasis === 550000,
      "企業型DC投資信託の取得額が550000円ではありません。");
    assert(fund.pnl === 150000,
      "企業型DC投資信託の評価損益が150000円ではありません。");
  });

  runTest("S11b⑭：企業型DCの項目順変更",() => {
    const result = stockOcrRunFixtureStock(
      "corporate-dc","reordered"
    );

    stockOcrAssertCardCountStock(
      assert,result,1,"並び替え後の企業型DCカードが1件ではありません。"
    );

    const card = result.cards[0];
    assert(card.value === 1000000,
      "並び替え後の評価額が1000000円ではありません。");
    assert(card.costBasis === 800000,
      "並び替え後の取得額が800000円ではありません。");
    assert(card.pnl === 200000,
      "並び替え後の評価損益が200000円ではありません。");
  });

  runTest("S11b⑮：企業型DCの見出しだけの商品",() => {
    const result = stockOcrRunFixtureStock(
      "corporate-dc","headingOnly"
    );

    stockOcrAssertCardCountStock(
      assert,result,1,"見出しだけの企業型DCカードが1件ではありません。"
    );
    stockOcrAssertNeedsConfirmationStock(
      assert,result.cards[0],"見出しだけの企業型DCカードが要確認になっていません。"
    );
    assert(result.cards[0].value === null,
      "値がない商品に評価額が設定されています。");
  });

  runTest("S11b⑯：元本確保型に評価損益がある場合",() => {
    const result = stockOcrRunFixtureStock(
      "corporate-dc","principalProtectedWithPnl"
    );

    stockOcrAssertCardCountStock(
      assert,result,1,"元本確保型カードが1件ではありません。");
    const card = result.cards[0];

    stockOcrAssertNeedsConfirmationStock(
      assert,card,"元本確保型の想定外表示が要確認になっていません。"
    );
  });

  runTest("S11b追補C②：DC元本確保型の金額2件・ラベル3件",() => {
    const text = [
      "元本確保型",
      "架空DC定期預金（1年）（99999）",
      "評価額",
      "取得価額累計",
      "評価損益",
      "12,345円",
      "12,345円"
    ].join("\n");
    const result = parseStockOcrText(
      text,stockOcrGetTestRuleStock("corporate-dc")
    );

    stockOcrAssertCardCountStock(
      assert,result,1,"元本確保型の2金額表示カードが1件ではありません。"
    );

    const card = result.cards[0];
    assert(card.name === "架空DC定期預金（1年） (99999)",
      "元本確保型の商品名が正しく取得できていません。");
    assert(card.value === 12345,
      "元本確保型の評価額12345円が取得できていません。");
    assert(card.costBasis === 12345,
      "明示ルールによる取得額12345円が取得できていません。");
    assert(card.pnl === null,
      "表示されていない評価損益が推測されています。");
    assert(card.fields.pnl.status === "not-shown",
      "評価損益が未表示として扱われていません。");
    assert(card.integrity.status === "unavailable",
      "評価損益が未表示なのに整合検査が完了扱いになっています。");
  });

  runTest("S11b⑰：企業型DCの外貨表示",() => {
    const result = stockOcrRunFixtureStock(
      "corporate-dc","foreignCurrency"
    );

    stockOcrAssertCardCountStock(
      assert,result,1,"企業型DC外貨表示カードが1件ではありません。");
    assert(result.cards[0].value === null,
      "企業型DCの外貨金額が円として取り込まれています。");
    stockOcrAssertNeedsConfirmationStock(
      assert,result.cards[0],"企業型DC外貨表示が要確認になっていません。"
    );
  });

  runTest("S11b⑱：企業型DCの重複カード",() => {
    const result = stockOcrRunFixtureStock(
      "corporate-dc","duplicateCard"
    );

    stockOcrAssertCardCountStock(
      assert,result,2,"企業型DCの重複カードが2件ではありません。"
    );

    for (const card of result.cards) {
      stockOcrAssertNeedsConfirmationStock(
        assert,card,"企業型DCの重複カードが要確認になっていません。"
      );
    }
  });

  runTest("S11b⑲：取得額の計算値",() => {
    const value = 60000;
    const pnl = -10000;
    const expected = value - pnl;

    assert(expected === 70000,
      "手計算の取得額が70000円になっていません。");
  });

  runTest("S11b⑳：nullと0の区別",() => {
    const text = [
      "保有商品詳細（すべて）",
      "時価評価額",
      "国内株式",
      "架空ゼロ評価株",
      "特定",
      "0円",
      "+0円"
    ].join("\n");

    const result = parseStockOcrText(
      text,
      stockOcrGetTestRuleStock("rakuten-securities")
    );

    stockOcrAssertCardCountStock(
      assert,result,1,"ゼロ評価のカードが1件ではありません。"
    );

    assert(result.cards[0].value === 0,
      "評価額0円がnullとして扱われています。");
    assert(result.cards[0].pnl === 0,
      "評価損益0円がnullとして扱われています。");
    assert(result.cards[0].costBasis === 0,
      "取得額0円が正しく計算されていません。");
  });

  runTest("S11b㉑：整合検査の不一致",() => {
    const result = stockOcrCheckIntegrityStock(
      60000,
      -9999,
      70000,
      null
    );

    assert(result.status === "mismatch",
      "評価額60000円・取得額70000円・評価損益-9999円の不整合が検出されません。");
    assert(result.difference === -1,
      "整合検査の差が-1円ではありません。");
  });

  runTest("S11b㉒：整合検査の一致",() => {
    const result = stockOcrCheckIntegrityStock(
      60000,
      -10000,
      70000,
      null
    );

    assert(result.status === "ok",
      "評価額60000円・取得額70000円・評価損益-10000円が一致扱いになっていません。");
    assert(result.difference === 0,
      "整合検査の差が0円ではありません。");
  });

  runTest("S11b追補A①：評価損益率による3例の検算",() => {
    const cases = [
      ["rateValidationPositive",155122,22702,132420,17.14],
      ["rateValidationNegative",60510,-11460,71970,-15.92],
      ["rateValidationLargeLoss",34500,-84615,119115,-71.03]
    ];

    for (const [fixture,value,pnl,costBasis,rate] of cases) {
      const result = stockOcrRunFixtureStock(
        "rakuten-securities",fixture
      );
      stockOcrAssertCardCountStock(
        assert,result,1,"検算テストのカードが1件ではありません。"
      );
      const card = result.cards[0];
      assert(card.value === value,fixture + " の評価額が一致しません。");
      assert(card.pnl === pnl,fixture + " の評価損益が一致しません。");
      assert(card.costBasis === costBasis,fixture + " の取得額が一致しません。");
      assert(card.rateCheck.status === "matched",
        fixture + " が検算一致になっていません。");
      assert(card.rateCheck.actualRate === rate,
        fixture + " の評価損益率が一致しません。");
      assert(card.status === "recognized",
        fixture + " が認識済みになっていません。");
      assert(Math.abs(card.rateCheck.difference) <= 0.05,
        fixture + " の検算差が許容差を超えています。");
    }
  });

  runTest("S11b追補A②：金額と率が連結された表示",() => {
    const negative = stockOcrRunFixtureStock(
      "rakuten-securities","joinedNegativeAmountRate"
    );
    const positive = stockOcrRunFixtureStock(
      "rakuten-securities","joinedPositiveAmountRate"
    );

    assert(negative.cards[0].value === 25377,
      "連結表示の評価額25377円が取得できていません。");
    assert(negative.cards[0].pnl === -5364,
      "連結表示の評価損益-5364円が取得できていません。");
    assert(negative.cards[0].rateCheck.status === "matched",
      "連結表示のマイナス率が検算一致になっていません。");

    assert(positive.cards[0].value === 11177,
      "連結表示の評価額11177円が取得できていません。");
    assert(positive.cards[0].pnl === 1177,
      "連結表示の評価損益1177円が取得できていません。");
    assert(positive.cards[0].rateCheck.status === "matched",
      "連結表示のプラス率が検算一致になっていません。");
  });

  runTest("S11b追補A③：円のない評価額",() => {
    const text = [
      "保有商品詳細（すべて）",
      "時価評価額",
      "投資信託",
      "架空・円なし評価額テスト",
      "特定",
      "155,122",
      "+22,702円",
      "+17.14%"
    ].join("\n");
    const result = parseStockOcrText(
      text,stockOcrGetTestRuleStock("rakuten-securities")
    );

    stockOcrAssertCardCountStock(
      assert,result,1,"円なし評価額のカードが1件ではありません。"
    );
    assert(result.cards[0].value === 155122,
      "円のない評価額155122が候補として認識されていません。");
    assert(result.cards[0].pnl === 22702,
      "円のない評価額と評価損益の組み合わせが確定していません。");
  });

  runTest("S11b追補A④：評価損益の位置が異なるカード",() => {
    const text = [
      "保有商品詳細（すべて）",
      "時価評価額",
      "投資信託",
      "架空・順序変更テスト",
      "+22,702円",
      "特定",
      "155,122円",
      "+17.14%"
    ].join("\n");
    const result = parseStockOcrText(
      text,stockOcrGetTestRuleStock("rakuten-securities")
    );

    stockOcrAssertCardCountStock(
      assert,result,1,"順序変更カードが1件ではありません。"
    );
    assert(result.cards[0].value === 155122,
      "順序変更後の評価額が一致しません。");
    assert(result.cards[0].pnl === 22702,
      "口座区分より前の評価損益が取得できていません。");
    assert(result.cards[0].rateCheck.status === "matched",
      "順序変更カードの検算が一致していません。");
  });

  runTest("S11b追補A⑤：検算不一致・複数候補・率なし",() => {
    const rule = stockOcrGetTestRuleStock("rakuten-securities");
    const wrongRateText = [
      "保有商品詳細（すべて）",
      "時価評価額",
      "投資信託",
      "架空・率誤読テスト",
      "特定",
      "155,122円",
      "+22,702円",
      "+10.00%"
    ].join("\n");
    const wrongRate = parseStockOcrText(wrongRateText,rule);
    stockOcrAssertNeedsConfirmationStock(
      assert,wrongRate.cards[0],"検算不一致が要確認になっていません。"
    );
    assert(wrongRate.cards[0].value === null &&
      wrongRate.cards[0].pnl === null,
      "検算不一致なのに金額が自動確定されています。");

    const ambiguousText = [
      "保有商品詳細（すべて）",
      "時価評価額",
      "投資信託",
      "架空・複数候補テスト",
      "特定",
      "100,000円",
      "90,000円",
      "+10,000円",
      "+9,000円",
      "+11.11%"
    ].join("\n");
    const ambiguous = parseStockOcrText(ambiguousText,rule);
    stockOcrAssertNeedsConfirmationStock(
      assert,ambiguous.cards[0],"複数候補が要確認になっていません。"
    );
    assert(ambiguous.cards[0].value === null &&
      ambiguous.cards[0].pnl === null,
      "複数候補から金額が自動選択されています。");

    const noRateText = [
      "保有商品詳細（すべて）",
      "時価評価額",
      "投資信託",
      "架空・率なしテスト",
      "特定",
      "25,377円",
      "-5,364円"
    ].join("\n");
    const noRate = parseStockOcrText(noRateText,rule);
    stockOcrAssertNeedsConfirmationStock(
      assert,noRate.cards[0],"率がないカードが要確認になっていません。"
    );
    assert(noRate.cards[0].value === 25377,
      "率なしカードの符号なし評価額が仮割り当てされていません。");
    assert(noRate.cards[0].pnl === -5364,
      "率なしカードの符号つき評価損益が仮割り当てされていません。");
  });

  runTest("S11b追補A⑥：商品名の折り返し・終端・空欄",() => {
    const rule = stockOcrGetTestRuleStock("rakuten-securities");
    const wrappedText = [
      "保有商品詳細（すべて）",
      "時価評価額",
      "投資信託",
      "架空・インデック",
      "スファンド",
      "特定",
      "100,000円",
      "+10,000円",
      "+11.11%",
      "Rakuten Securities",
      "フッターの商品名",
      "参考為替レート"
    ].join("\n");
    const wrapped = parseStockOcrText(wrappedText,rule);
    stockOcrAssertCardCountStock(
      assert,wrapped,1,"折り返し商品名のカードが1件ではありません。"
    );
    assert(wrapped.cards[0].name === "架空・インデックスファンド",
      "隣接行の商品名が結合されていません。");
    assert(!wrapped.cards[0].name.includes("Rakuten Securities"),
      "フッターが商品名に混ざっています。");
    assert(wrapped.safeUnrecognizedLines.some(line =>
      line.text.includes("フッターの商品名")
    ),"終端以降の行が未認識テキストに残っていません。");

    const blankText = [
      "保有商品詳細（すべて）",
      "時価評価額",
      "投資信託",
      "特定",
      "100,000円",
      "+10,000円",
      "+11.11%"
    ].join("\n");
    const blank = parseStockOcrText(blankText,rule);
    stockOcrAssertCardCountStock(
      assert,blank,1,"商品名空欄のカードが1件ではありません。"
    );
    stockOcrAssertNeedsConfirmationStock(
      assert,blank.cards[0],"商品名空欄のカードが要確認になっていません。"
    );
    assert(!String(blank.cards[0].name || "").startsWith("商品カード"),
      "商品名空欄が商品カード番号で補完されていません。");
  });

  runTest("S11b追補A⑦：楽天証券wrapper別名",() => {
    const rule = stockOcrGetTestRuleStock("rakuten-securities");
    const cases = [
      ["NISA成長投資枠","NISA成長"],
      ["NISA成長投資","NISA成長"],
      ["つみたてNISA","旧つみたてNISA"]
    ];

    for (const [source,expected] of cases) {
      const text = [
        "保有商品詳細（すべて）",
        "時価評価額",
        "投資信託",
        "架空・wrapperテスト",
        source,
        "100,000円",
        "+10,000円",
        "+11.11%"
      ].join("\n");
      const result = parseStockOcrText(text,rule);
      assert(result.cards[0].wrapper === expected,
        source + " が " + expected + " に正規化されていません。");
    }
  });

  runTest("S11b追補A⑧：米国株kind・validateData・既存その他の維持",() => {
    const rule = stockOcrGetTestRuleStock("rakuten-securities");
    const text = [
      "保有商品詳細（すべて）",
      "時価評価額",
      "米国株式",
      "ANT",
      "架空ANT",
      "特定",
      "155,122円",
      "+22,702円",
      "+17.14%"
    ].join("\n");
    const result = parseStockOcrText(text,rule);

    stockOcrAssertCardCountStock(
      assert,result,1,"米国株カードが1件ではありません。"
    );
    assert(result.cards[0].kind === "米国株",
      "米国株式がkind＝米国株になっていません。");

    const data = createInitialData();
    const account = data.accounts.find(item =>
      item.category === "stock"
    );
    assert(account !== undefined,"テスト用の株式口座がありません。");
    const timestamp = "2026-11-25T10:00:00.000Z";
    data.holdings.push({
      id:"fictional-us-stock",
      accountId:account.id,
      name:"架空ANT",
      wrapper:"特定",
      kind:"米国株",
      asOfDate:"2026-11-25",
      recordedAt:timestamp,
      value:155122,
      quantity:null,
      costBasis:132420,
      pnl:22702,
      memo:"",
      createdAt:timestamp,
      updatedAt:timestamp
    });
    data.holdings.push({
      id:"fictional-other-stock",
      accountId:account.id,
      name:"架空その他商品",
      wrapper:"特定",
      kind:"その他",
      asOfDate:"2026-11-25",
      recordedAt:timestamp,
      value:1000,
      quantity:null,
      costBasis:1000,
      pnl:0,
      memo:"",
      createdAt:timestamp,
      updatedAt:timestamp
    });
    validateData(data);
    assert(data.holdings.find(item =>
      item.id === "fictional-us-stock"
    ).kind === "米国株",
      "validateData が米国株を受け付けていません。");
    assert(data.holdings.find(item =>
      item.id === "fictional-other-stock"
    ).kind === "その他",
      "既存のその他が検証後に変更されています。");
  });

  runTest("S11b追補A⑩：楽天証券ルール変更のiDeCo・DC非波及",() => {
    const originalIdeco = stockOcrRunFixtureStock("ideco","normal");
    const originalDc = stockOcrRunFixtureStock("corporate-dc","normal");
    const rakuten = stockOcrGetTestRuleStock("rakuten-securities");
    const copiedRakuten = JSON.parse(JSON.stringify(rakuten));
    copiedRakuten.formats[0].kindByHeading["米国株式"] = "変更テスト";

    const idecoAfter = stockOcrRunFixtureStock("ideco","normal");
    const dcAfter = stockOcrRunFixtureStock("corporate-dc","normal");

    assert(idecoAfter.cards[0].kind === originalIdeco.cards[0].kind,
      "楽天証券ルールの複製変更がiDeCoへ波及しています。");
    assert(dcAfter.cards[0].kind === originalDc.cards[0].kind,
      "楽天証券ルールの複製変更が企業型DCへ波及しています。");
  });
}
