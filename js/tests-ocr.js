"use strict";

function registerOcrTests(context) {
  const {assert,runTest} = context;
  const data = OCR_TEST_DATA;

  function getField(result,name) {
    return result.fields[name];
  }

  function parseManual(text,rule,date = "2026-11-20") {
    return parseOcrText(text,rule,null,{
      manualDate:date
    });
  }

  function assertIdentityUnconfirmed(result,message) {
    assert(result.identityReview.required === true,
      message + " 恒等式の確認が必要になっていません。");
    assert(result.identityReview.difference === 1,
      message + " 差額が1円ではありません。");

    for (const name of [
      "value",
      "effectivePrincipal",
      "pnl",
      "swapTotal"
    ]) {
      assert(getField(result,name).status === "identity-unconfirmed",
        message + " " + name + " が要確認になっていません。");
    }

    assert(isOcrResultAddable(result).allowed === false,
      message + " 恒等式未確認のまま表へ追加できます。");
  }

  runTest("S12d・1：4口座の正常解析",() => {
    const light = parseOcrText(data.normalText,data.lightFxRule);
    const central = parseManual(
      data.centralTanshiText,
      data.centralTanshiRule
    );
    const click365 = parseManual(
      data.click365Text,
      data.click365Rule
    );
    const lion = parseManual(
      data.lionFxText,
      data.lionFxRule
    );

    for (const [name,result] of [
      ["LIGHT FX",light],
      ["セントラル短資FX",central],
      ["クリック365",click365],
      ["LION FX",lion]
    ]) {
      assert(result.success === true,
        name + " の解析に失敗しています。");
      assert(result.status === "recognized",
        name + " の解析結果が認識済みではありません。");
      assert(getField(result,"value").value === 900000,
        name + " の総資産が900,000円ではありません。");
      assert(getField(result,"effectivePrincipal").value === 800000,
        name + " の有効元本が800,000円ではありません。");
      assert(getField(result,"pnl").value === -100000,
        name + " の評価損益が-100,000円ではありません。");
      assert(getField(result,"swapTotal").value === 200000,
        name + " の累計スワップが200,000円ではありません。");
      assert(getField(result,"realizedPnlTotal").value === null,
        name + " の累積確定損益がnullではありません。");
    }

    for (const result of [light,central,click365,lion]) {
      assert(
        800000 - 100000 + 200000 === 900000,
        "架空データの恒等式検算が一致しません。"
      );
      assert(result.identityReview.required === false,
        "正常値で恒等式の確認が必要になっています。");
    }
  });

  runTest("S12d・2：日付の取得元と追加可否",() => {
    const light = parseOcrText(data.normalText,data.lightFxRule);
    const centralWithoutDate = parseOcrText(
      "2026/11/20\n" + data.centralTanshiText,
      data.centralTanshiRule
    );
    const clickWithoutDate = parseOcrText(
      "2026/11/20\n" + data.click365Text,
      data.click365Rule
    );
    const lionWithoutDate = parseOcrText(
      "2026/11/20\n" + data.lionFxText,
      data.lionFxRule
    );

    assert(light.date.value === "2026-11-20",
      "LIGHT FXの画面日付を取得できていません。");
    assert(light.date.source === "screen",
      "LIGHT FXの日付取得元がscreenではありません。");
    assert(centralWithoutDate.date.value === null,
      "セントラル短資FXがOCR本文から日付を取得しています。");
    assert(clickWithoutDate.date.value === null,
      "クリック365がOCR本文から日付を取得しています。");
    assert(lionWithoutDate.date.value === null,
      "LION FXがOCR本文から日付を取得しています。");

    for (const result of [
      centralWithoutDate,
      clickWithoutDate,
      lionWithoutDate
    ]) {
      assert(result.date.source === "manual",
        "手入力対象口座の日付取得元がmanualではありません。");
      assert(isOcrResultAddable(result).allowed === false,
        "対象日が未入力なのに表へ追加できます。");
    }

    const centralWithDate = parseManual(
      data.centralTanshiText,
      data.centralTanshiRule
    );
    assert(centralWithDate.date.value === "2026-11-20",
      "手入力した対象日が反映されていません。");
    assert(isOcrResultAddable(centralWithDate).allowed === true,
      "対象日を入力した正常結果を表へ追加できません。");

    const noYear = parseOcrText(
      data.normalText.replace("2026/11/20","11/20"),
      data.lightFxRule
    );
    assert(noYear.date.value === null,
      "年のない日付を推測して取得しています。");
  });

  runTest("S12d・3：必須の総資産項目が欠落した場合",() => {
    const lightText = data.normalText.replace("純資産額\n","");
    const centralText = data.centralTanshiText.replace(
      "口座清算価値\n",
      ""
    );
    const clickText = data.click365Text.replace(
      "時価評価総額\n",
      ""
    );
    const lionText = data.lionFxText.replace(
      "有効証拠金\n",
      ""
    );

    const light = parseOcrText(lightText,data.lightFxRule);
    const central = parseManual(centralText,data.centralTanshiRule);
    const click365 = parseManual(clickText,data.click365Rule);
    const lion = parseManual(lionText,data.lionFxRule);

    for (const [name,result] of [
      ["LIGHT FX",light],
      ["セントラル短資FX",central],
      ["LION FX",lion]
    ]) {
      assert(getField(result,"value").value === null,
        name + " の総資産がnullではありません。");
      assert(getField(result,"value").status === "missing-required",
        name + " の総資産が未取得（必須）になっていません。");
      assert(isOcrResultAddable(result).allowed === false,
        name + " の必須項目欠落を表へ追加できます。");
    }

    assert(click365.blocks[0].status === "unconfirmed",
      "クリック365の必須ラベル欠落でブロック全体が未確定になっていません。");
    for (const name of [
      "value",
      "effectivePrincipal",
      "pnl",
      "swapTotal"
    ]) {
      assert(getField(click365,name).value === null,
        "クリック365の " + name + " に部分的な値が残っています。");
    }
    assert(isOcrResultAddable(click365).allowed === false,
      "クリック365の不完全なブロックを表へ追加できます。");
  });

  runTest("S12d・4：数値の読み取り失敗は該当項目だけ要確認",() => {
    const lightText = data.normalText.replace(
      "-100,000円",
      "-1,00S,000円"
    );
    const centralText = data.centralTanshiText.replace(
      "900,000円",
      "1,2S0,000円"
    );
    const clickText = data.click365Text.replace(
      "900,000円",
      "1,2S0,000円"
    );
    const lionText = data.lionFxText.replace(
      "900,000円",
      "1,2S0,000円"
    );

    const results = [
      parseOcrText(lightText,data.lightFxRule),
      parseManual(centralText,data.centralTanshiRule),
      parseManual(clickText,data.click365Rule),
      parseManual(lionText,data.lionFxRule)
    ];

    for (const result of results) {
      assert(getField(result,"value").value === null,
        "読めない総資産がnullになっていません。");
      assert(getField(result,"value").status === "unreadable",
        "読めない総資産が要確認になっていません。");
      assert(getField(result,"effectivePrincipal").value === 800000,
        "有効元本の正常値が変わっています。");
      assert(getField(result,"pnl").value === -100000,
        "評価損益の正常値が変わっています。");
      assert(getField(result,"swapTotal").value === 200000,
        "累計スワップの正常値が変わっています。");
    }
  });

  runTest("S12d・5：同じ項目の複数候補を自動選択しない",() => {
    const centralText =
      data.centralTanshiText +
      "\n口座清算価値\n900,001円";
    const central = parseManual(
      centralText,
      data.centralTanshiRule
    );

    const clickText =
      data.click365Text +
      "\n時価評価総額\n";
    const click365 = parseManual(
      clickText,
      data.click365Rule
    );

    assert(getField(central,"value").value === null,
      "セントラル短資FXの複数候補から値を選択しています。");
    assert(getField(central,"value").status === "multiple",
      "セントラル短資FXの複数候補が要確認になっていません。");
    assert(getField(central,"value").candidates.length === 2,
      "セントラル短資FXの候補が2件保持されていません。");

    assert(click365.blocks[0].status === "unconfirmed",
      "クリック365のブロック起点重複が未確定になっていません。");
    assert(isOcrResultAddable(click365).allowed === false,
      "クリック365の起点重複を表へ追加できます。");
  });

  runTest("S12d・6：余分な画面要素と未知行の扱い",() => {
    const clickWithIgnored =
      "余力確認\n戻る\n•ll 5G\n365株\n" +
      data.click365Text;
    const click = parseManual(
      clickWithIgnored,
      data.click365Rule
    );

    assert(click.blocks[0].status === "recognized",
      "指定したignoreLinesを読み飛ばせていません。");
    for (const name of [
      "value",
      "effectivePrincipal",
      "pnl",
      "swapTotal"
    ]) {
      assert(getField(click,name).value === 900000 ||
        name !== "value",
        "ignoreLinesにより総資産が変わっています。");
    }

    const unknownBlock = data.click365Text.replace(
      "口座残高\n",
      "不明な画面行\n口座残高\n"
    );
    const unknownBlockResult = parseManual(
      unknownBlock,
      data.click365Rule
    );
    assert(unknownBlockResult.blocks[0].status === "unconfirmed",
      "クリック365の未知行を含むブロックが未確定になっていません。");

    const unknownNextLine = data.centralTanshiText.replace(
      "口座清算価値\n900,000円",
      "口座清算価値\n不明な画面行\n900,000円"
    );
    const unknownNextResult = parseManual(
      unknownNextLine,
      data.centralTanshiRule
    );
    assert(getField(unknownNextResult,"value").value === null,
      "セントラル短資FXが次の行より先の値を補完しています。");
    assert(getField(unknownNextResult,"effectivePrincipal").value === 800000,
      "別項目の正常値が変わっています。");
  });

  runTest("S12d・7：項目名と値の行数が合わない場合",() => {
    const centralMissingValue = data.centralTanshiText.replace(
      "口座清算価値\n900,000円",
      "口座清算価値"
    );
    const centralMissingLabel = data.centralTanshiText.replace(
      "口座清算価値\n900,000円",
      "900,000円"
    );
    const centralA = parseManual(
      centralMissingValue,
      data.centralTanshiRule
    );
    const centralB = parseManual(
      centralMissingLabel,
      data.centralTanshiRule
    );

    assert(getField(centralA,"value").value === null,
      "次の項目名を総資産の値として使っています。");
    assert(getField(centralA,"effectivePrincipal").value === 800000,
      "次の項目の有効元本が変わっています。");
    assert(getField(centralB,"value").status === "missing-required",
      "項目名の欠落が未取得（必須）になっていません。");
    assert(getField(centralB,"effectivePrincipal").value === 800000,
      "項目名の欠落で前後の項目がずれています。");

    const clickMissingValue = data.click365Text.replace(
      "900,000円\n",
      ""
    );
    const clickExtraValue = data.click365Text + "\n999円";
    const clickMissingLabel = data.click365Text.replace(
      "時価評価総額\n",
      ""
    );

    for (const text of [
      clickMissingValue,
      clickExtraValue,
      clickMissingLabel
    ]) {
      const result = parseManual(text,data.click365Rule);
      assert(result.blocks[0].status === "unconfirmed",
        "クリック365の項目数・値数の不一致を検出できていません。");
      for (const name of [
        "value",
        "effectivePrincipal",
        "pnl",
        "swapTotal"
      ]) {
        assert(getField(result,name).value === null,
          "クリック365の不一致で " + name + " に値が残っています。");
      }
    }
  });

  runTest("S12d・8：クリック365の同じ種類の値の順序違い",() => {
    const swappedText = data.click365Text
      .replace("900,000円","__SWAP_VALUE__")
      .replace("800,000円","900,000円")
      .replace("__SWAP_VALUE__","800,000円");

    const result = parseManual(
      swappedText,
      data.click365Rule
    );

    assert(result.blocks[0].status === "recognized",
      "同じ種類の値の入れ替えでブロック構造まで不成立になっています。");
    assert(result.identityReview.required === true,
      "値の対応ずれによる恒等式の不一致を検出できていません。");
    assert(isOcrResultAddable(result).allowed === false,
      "値の対応ずれがある結果を表へ追加できます。");

    const extraAmount = data.click365Text.replace(
      "1,800,000円\n",
      "999円\n1,800,000円\n"
    );
    const extraResult = parseManual(
      extraAmount,
      data.click365Rule
    );
    assert(extraResult.blocks[0].status === "unconfirmed",
      "値のまとまり先頭の余分な金額を検出できていません。");
  });

  runTest("S12d・9：4口座すべてidentityStrictで1円差を要確認にする",() => {
    const lightText = data.normalText.replace(
      "900,000円",
      "900,001円"
    );
    const centralText = data.centralTanshiText.replace(
      "900,000円",
      "900,001円"
    );
    const clickText = data.click365Text.replace(
      "900,000円",
      "900,001円"
    );
    const lionText = data.lionFxText.replace(
      "900,000円",
      "900,001円"
    );

    const results = [
      parseOcrText(lightText,data.lightFxRule),
      parseManual(centralText,data.centralTanshiRule),
      parseManual(clickText,data.click365Rule),
      parseManual(lionText,data.lionFxRule)
    ];

    for (const [index,result] of results.entries()) {
      assertIdentityUnconfirmed(result,"口座番号 " + (index + 1));
    }
  });

  runTest("S12d・10：未認識テキストの行番号と数字の伏せ字",() => {
    const source =
      "口座番号 12345678\n" + data.normalText;
    const result = parseOcrText(source,data.lightFxRule);
    const line = result.unrecognizedLines.find(item =>
      item.text.includes("口座番号")
    );

    assert(line !== undefined,
      "未認識テキストが一覧にありません。");
    assert(line.lineNumber === 1,
      "未認識テキストの行番号が保持されていません。");
    assert(line.text === "口座番号 ●●●●●●●●",
      "8桁の数字が伏せ字になっていません。");
    assert(getField(result,"value").value === 900000,
      "未認識テキストが解析値に影響しています。");
  });

  runTest("S12d・11：解析結果にOCR原文を保存しない",() => {
    const sentinel = "OCR_RAW_SENTINEL_20261120";
    const source = data.normalText + "\n" + sentinel;
    const result = parseOcrText(source,data.lightFxRule);
    const serialized = JSON.stringify(result);

    assert(!serialized.includes(sentinel),
      "解析結果にOCR原文の識別文字列が残っています。");
    assert(!Object.prototype.hasOwnProperty.call(result,"ocrText") &&
      !Object.prototype.hasOwnProperty.call(result,"sourceText") &&
      !Object.prototype.hasOwnProperty.call(result,"rawText"),
      "解析結果にOCR原文保存用の項目があります。");
  });

  runTest("S12d・12：解析結果を一括入力の表へ渡せる条件",() => {
    const light = parseOcrText(data.normalText,data.lightFxRule);
    const central = parseManual(
      data.centralTanshiText,
      data.centralTanshiRule
    );
    const click365 = parseManual(
      data.click365Text,
      data.click365Rule
    );
    const lion = parseManual(
      data.lionFxText,
      data.lionFxRule
    );

    for (const result of [light,central,click365,lion]) {
      assert(isOcrResultAddable(result).allowed === true,
        "正常な4項目と対象日の結果を表へ追加できません。");
      assert(getField(result,"realizedPnlTotal").value === null,
        "累積確定損益がnullではありません。");
      assert(result.date.value === "2026-11-20",
        "対象日が正しくありません。");
    }
  });

  runTest("S12d・13：同一口座・同一対象日の重複候補を識別できる",() => {
    const first = parseOcrText(data.normalText,data.lightFxRule);
    const second = parseOcrText(data.normalText,data.lightFxRule);

    assert(first.date.value === second.date.value,
      "同じ対象日を解析できていません。");
    assert(first.fields.value.value === second.fields.value.value,
      "同じOCRテキストの解析値が一致しません。");
    assert(first.format.formatId === second.format.formatId,
      "同じ口座形式を特定できていません。");
  });

  runTest("S12d・14：口座ごとのルールが独立し、別口座テキストを識別しない",() => {
    const rules = [
      data.lightFxRule,
      data.centralTanshiRule,
      data.click365Rule,
      data.lionFxRule
    ];
    const texts = [
      data.normalText,
      data.centralTanshiText,
      data.click365Text,
      data.lionFxText
    ];

    for (let i = 0;i < rules.length;i++) {
      const copied = JSON.parse(JSON.stringify(rules[i]));
      copied.formats[0].fields.pnl.labels = ["変更テスト用ラベル"];

      const ownOriginal = identifyOcrFormats(texts[i],rules[i]);
      const ownChanged = identifyOcrFormats(texts[i],copied);

      assert(ownOriginal.status === "identified",
        "口座 " + (i + 1) + " の形式を特定できません。");
      assert(ownChanged.status === "identified",
        "複製したルールの識別結果が変わっています。");

      for (let j = 0;j < rules.length;j++) {
        if (i === j) continue;
        const otherBefore = identifyOcrFormats(texts[j],rules[j]);
        const otherAfter = identifyOcrFormats(texts[j],rules[j]);

        assert(otherBefore.status === otherAfter.status,
          "別口座 " + (j + 1) + " の識別結果が変わっています。");
      }
    }

    for (let i = 0;i < rules.length;i++) {
      for (let j = 0;j < rules.length;j++) {
        if (i === j) continue;
        const result = identifyOcrFormats(texts[j],rules[i]);
        assert(result.status === "unidentified",
          "別口座のテキストを口座 " + (i + 1) + " の形式として識別しています。");
      }
    }
  });

  runTest("S12d・15：LION FXのポジション損益とロック以外の行",() => {
    const result = parseManual(data.lionFxText,data.lionFxRule);

    assert(getField(result,"pnl").value === -100000,
      "評価損益ではなくポジション損益を取得できていません。");
    assert(getField(result,"swapTotal").value === 200000,
      "未実現スワップを取得できていません。");

    const changedSuffixText = data.lionFxText
      .replace("評価損益（ロック以外）\n\n100,000円",
        "評価損益（ロック以外）\n\n999,999円")
      .replace("ポジション損益（ロック以外）\n\n−100,000円",
        "ポジション損益（ロック以外）\n\n999,999円")
      .replace("未実現スワップ（ロック以外）\n200,000円",
        "未実現スワップ（ロック以外）\n999,999円");

    const changed = parseManual(changedSuffixText,data.lionFxRule);

    for (const name of [
      "value",
      "effectivePrincipal",
      "pnl",
      "swapTotal"
    ]) {
      assert(getField(changed,name).value === getField(result,name).value,
        "ロック以外の値の変更で " + name + " が変わっています。");
    }

    const noBlankLines = data.lionFxText.replace(/\n\n/g,"\n");
    const noBlankResult = parseManual(noBlankLines,data.lionFxRule);

    for (const name of [
      "value",
      "effectivePrincipal",
      "pnl",
      "swapTotal"
    ]) {
      assert(getField(noBlankResult,name).value === getField(result,name).value,
        "空行の有無でLION FXの " + name + " が変わっています。");
    }
  });

  runTest("S12d・16：セントラル短資FX固有の項目と並び順",() => {
    const original = parseManual(
      data.centralTanshiText,
      data.centralTanshiRule
    );

    const changedUnmapped = data.centralTanshiText
      .replace("当日損益\n0円","当日損益\n999,999円")
      .replace("出金依頼額\n0円","出金依頼額\n888,888円");
    const changedResult = parseManual(
      changedUnmapped,
      data.centralTanshiRule
    );

    for (const name of [
      "value",
      "effectivePrincipal",
      "pnl",
      "swapTotal"
    ]) {
      assert(getField(changedResult,name).value === getField(original,name).value,
        "対象外項目の変更で " + name + " が変わっています。");
    }

    const reordered =
      "口座内容照会\n" +
      "口座清算価値\n900,000円\n" +
      "通貨別\n" +
      "未決済スワップ\n200,000円\n" +
      "合計（円換算）\n" +
      "建玉評価損益\n-100,000円\n" +
      "口座資産\n800,000円\n" +
      "当日損益\n0円\n" +
      "出金依頼額\n0円";

    const reorderedResult = parseManual(
      reordered,
      data.centralTanshiRule
    );

    for (const name of [
      "value",
      "effectivePrincipal",
      "pnl",
      "swapTotal"
    ]) {
      assert(getField(reorderedResult,name).value === getField(original,name).value,
        "項目名と値のペアの並び替えで " + name + " が変わっています。");
    }
  });

  runTest("S12：金額の正規化",() => {
    for (const item of data.amountCases) {
      const result = normalizeOcrAmount(
        item.input,
        item.negativeMarks
      );

      assert(result.value === item.expected,
        "金額「" + item.input + "」の期待値が一致しません。");
    }
  });

  runTest("S12：日付の正規化と実在日チェック",() => {
    for (const item of data.dateCases) {
      const result = parseOcrDateCandidates(
        item.input,
        item.patterns
      );

      if (item.expected === null) {
        assert(
          result.length === 0 ||
          result.every(candidate => candidate.value === null),
          "日付「" + item.input + "」を誤って有効にしています。"
        );
      } else {
        assert(result.length === 1,
          "日付「" + item.input + "」の候補数が1件ではありません。");
        assert(result[0].value === item.expected,
          "日付「" + item.input + "」の変換結果が違います。");
      }
    }
  });

  runTest("S12：OCRルール自己診断の項目8",() => {
    const result = checkOcrRuleConsistency(
      [
        {name:"LIGHT FX"},
        {name:"セントラル短資FX"},
        {name:"クリック365"},
        {name:"LION FX"}
      ],
      OCR_ACCOUNT_RULES
    );

    assert(result.success === true,
      "実際の4口座名と解析ルールの整合がOKではありません。");
  });
}
