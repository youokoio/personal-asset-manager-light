"use strict";

function registerOcrTests(context) {
  const {assert,runTest} = context;
  const data = OCR_TEST_DATA;

  function getField(result,name) {
    return result.fields[name];
  }

  function assertBlockUnconfirmed(result,message) {
    assert(result.blocks.length === 1,
      message + " ブロック結果が1件ではありません。");
    assert(result.blocks[0].status === "unconfirmed",
      message + " ブロック全体が未確定になっていません。");

    for (const name of [
      "value",
      "effectivePrincipal",
      "pnl",
      "swapTotal"
    ]) {
      assert(getField(result,name).value === null,
        message + " " + name + " に部分的な値が残っています。");
      assert(getField(result,name).status === "block-unconfirmed",
        message + " " + name + " が未確定になっていません。");
    }
  }

  runTest("S12：OCR形式の識別（一致なし・1件・複数）",() => {
    const normal = identifyOcrFormats(
      data.normalText,
      data.lightFxRule
    );

    assert(normal.status === "identified",
      "一致する形式を1件に特定できていません。");
    assert(normal.format.formatId === "account-inquiry",
      "特定した形式が正しくありません。");

    const none = identifyOcrFormats(
      "別の画面です",
      data.lightFxRule
    );

    assert(none.status === "unidentified",
      "一致しない形式を正しく判定できていません。");

    const multipleRule = {
      formats:[
        {
          formatId:"a",
          label:"形式A",
          identify:{all:["口座サマリー"],none:[]}
        },
        {
          formatId:"b",
          label:"形式B",
          identify:{all:["口座サマリー"],none:[]}
        }
      ]
    };

    const multiple = identifyOcrFormats(
      "口座サマリー\n" + data.normalText,
      multipleRule
    );

    assert(multiple.status === "multiple",
      "複数形式への一致を検出できていません。");
    assert(multiple.matches.length === 2,
      "一致した形式をすべて保持できていません。");
  });

  runTest("S12：OCR正常解析・ラベルと値が別行",() => {
    const result = parseOcrText(
      data.normalText,
      data.lightFxRule
    );

    assert(result.success === true,
      "正常なOCRテキストの解析に失敗しています。");
    assert(result.status === "recognized",
      "正常な解析結果が認識済みになっていません。");
    assert(result.date.value === "2026-11-19",
      "対象日が2026-11-19になっていません。");
    assert(getField(result,"value").value === 100000,
      "総資産が100,000円になっていません。");
    assert(getField(result,"effectivePrincipal").value === 80000,
      "有効元本が80,000円になっていません。");
    assert(getField(result,"pnl").value === -5000,
      "評価損益が-5,000円になっていません。");
    assert(getField(result,"swapTotal").value === 25000,
      "累計スワップが25,000円になっていません。");
    assert(
      80000 - 5000 + 25000 === 100000,
      "架空データの総資産の検算値が一致しません。"
    );
  });

  runTest("S12：OCR項目の並び順が違っても同じ結果",() => {
    const result = parseOcrText(
      data.reversedText,
      data.lightFxRule
    );

    assert(result.status === "recognized",
      "並び順を変えたテキストを認識できていません。");
    assert(getField(result,"value").value === 100000,
      "並び順の変更で総資産が変わっています。");
    assert(getField(result,"pnl").value === -5000,
      "並び順の変更で評価損益が変わっています。");
    assert(getField(result,"swapTotal").value === 25000,
      "並び順の変更で累計スワップが変わっています。");
  });

  runTest("S12：異なる項目名を誤って割り当てない",() => {
    const item = data.cases.find(value =>
      value.id === "different-label"
    );
    const result = parseOcrText(item.text,data.lightFxRule);
    const pnl = getField(result,"pnl");

    assert(pnl.value === null,
      "別の項目名を評価損益に割り当てています。");
    assert(pnl.status === "missing-required",
      "必須の評価損益が未取得（必須）になっていません。");
    assert(
      result.unrecognizedLines.some(line =>
        line.text.includes("未決済建玉評価損益")
      ),
      "認識できない項目名が未認識行に残っていません。"
    );
  });

  runTest("S12：数値として読めない値はnullで原文を保持",() => {
    const item = data.cases.find(
      value => value.id === "unreadable-number"
    );

    const result = parseOcrText(item.text,data.lightFxRule);
    const pnl = getField(result,"pnl");

    assert(pnl.value === null,
      "読めない数値がnullになっていません。");
    assert(pnl.status === "unreadable",
      "読めない数値が要確認になっていません。");
    assert(pnl.original === "-5,00S円",
      "確認用の原文が保持されていません。");
    assert(getField(result,"value").value === 100000,
      "別項目の正常値が変わっています。");
  });

  runTest("S12：同一項目の複数候補を自動選択しない",() => {
    const item = data.cases.find(
      value => value.id === "multiple-value"
    );

    const result = parseOcrText(item.text,data.lightFxRule);
    const value = getField(result,"value");

    assert(value.value === null,
      "複数候補から値を自動選択しています。");
    assert(value.status === "multiple",
      "複数候補が確認対象になっていません。");
    assert(value.candidates.length === 2,
      "候補2件を保持できていません。");
    assert(value.candidates[0].value === 100000,
      "1件目の候補値が正しくありません。");
    assert(value.candidates[1].value === 100001,
      "2件目の候補値が正しくありません。");
  });

  runTest("S12：必須項目がない場合は未取得（必須）",() => {
    const item = data.cases.find(
      value => value.id === "missing-required"
    );

    const result = parseOcrText(item.text,data.lightFxRule,"account-inquiry");
    const value = getField(result,"value");

    assert(value.value === null,
      "必須項目の欠落がnullになっていません。");
    assert(value.status === "missing-required",
      "必須項目の欠落が正しく表示されていません。");
    assert(result.status === "needs-confirmation",
      "必須項目の欠落が確認対象になっていません。");
  });

  runTest("S12：別口座の次行形式を共通項目に変換",() => {
    const result = parseOcrText(
      data.otherAccountText,
      data.otherAccountRule
    );

    assert(result.status === "recognized",
      "次行形式のテキストを認識できていません。");
    assert(result.date.value === "2026-11-19",
      "別口座の対象日が正しくありません。");
    assert(getField(result,"value").value === 3210000,
      "総資産が3,210,000円になっていません。");
    assert(getField(result,"effectivePrincipal").value === 3300000,
      "有効元本が3,300,000円になっていません。");
    assert(getField(result,"pnl").value === -100000,
      "評価損益が-100,000円になっていません。");
    assert(getField(result,"swapTotal").value === 10000,
      "累計スワップが10,000円になっていません。");
    assert(
      3300000 - 100000 + 10000 === 3210000,
      "別口座の総資産の検算値が一致しません。"
    );
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

  runTest("S12：日付が複数ある場合は未選択",() => {
    const text = data.normalText + "\n2026/11/18";

    const result = parseOcrText(text,data.lightFxRule);

    assert(result.date.status === "multiple",
      "複数の日付を確認対象にできていません。");
    assert(result.date.value === null,
      "複数の日付から自動選択しています。");
    assert(result.date.candidates.length === 2,
      "日付候補を2件保持できていません。");
  });

  runTest("S12：解析形式を明示選択できる",() => {
    const rule = {
      formats:[
        {
          formatId:"a",
          label:"形式A",
          identify:{all:["共通語"],none:[]},
          date:{patterns:["YYYY/M/D"],required:true},
          fields:{
            value:{labels:["総資産"],required:true}
          }
        },
        {
          formatId:"b",
          label:"形式B",
          identify:{all:["共通語"],none:[]},
          date:{patterns:["YYYY/M/D"],required:true},
          fields:{
            value:{labels:["資産合計"],required:true}
          }
        }
      ]
    };

    const result = parseOcrText(
      "共通語\n2026/11/19\n総資産 100",
      rule,
      "a"
    );

    assert(result.success === true,
      "形式を指定した解析に失敗しています。");
    assert(result.format.formatId === "a",
      "指定した形式Aを使っていません。");
    assert(getField(result,"value").value === 100,
      "指定した形式の値を取得できていません。");
  });

  runTest("S12：口座ごとの解析ルールが独立している",() => {
    const originalLightResult = parseOcrText(
      data.normalText,
      data.lightFxRule
    );

    const copiedRule = JSON.parse(
      JSON.stringify(data.lightFxRule)
    );

    copiedRule.formats[0].fields.pnl.labels = [
      data.ruleIsolation.changedLabel
    ];

    const changedLightResult = parseOcrText(
      data.normalText,
      copiedRule
    );

    const otherBefore = parseOcrText(
      data.otherAccountText,
      data.otherAccountRule
    );

    const otherAfter = parseOcrText(
      data.otherAccountText,
      data.otherAccountRule
    );

    assert(
      originalLightResult.fields.pnl.value === -5000,
      "複製前のLIGHT FXルールの結果が正しくありません。"
    );
    assert(
      changedLightResult.fields.pnl.value === null,
      "複製ルールの変更が解析結果に反映されていません。"
    );
    assert(
      otherBefore.fields.value.value === otherAfter.fields.value.value,
      "別口座の総資産の解析結果が変わっています。"
    );
    assert(
      otherBefore.fields.pnl.value === otherAfter.fields.pnl.value,
      "別口座の評価損益の解析結果が変わっています。"
    );
    assert(
      data.lightFxRule.formats[0].fields.pnl.labels[0] === "建玉評価損益",
      "元のルールが変更されています。"
    );
  });

  runTest("S12：未認識行の行番号と伏せ字",() => {
    const result = parseOcrText(
      data.normalText + "\n取引番号123456789012",
      data.lightFxRule
    );

    const line = result.unrecognizedLines.find(item =>
      item.text.includes("取引番号")
    );

    assert(line !== undefined,
      "未認識行が一覧にありません。");
    assert(line.lineNumber === 18,
      "未認識行の元の行番号が保持されていません。");
    assert(
      line.text === "取引番号●●●●●●●●●●●●",
      "8桁以上の数字が伏せ字になっていません。"
    );
  });

  runTest("S12：OCR原文を未認識行にそのまま残さない",() => {
    const source = data.normalText + "\n取引番号123456789012";
    const result = parseOcrText(source,data.lightFxRule,"account-inquiry");
    const serialized = JSON.stringify(result);

    assert(!serialized.includes("123456789012"),
      "解析結果に伏せ字前の連続数字が残っています。");
  });

  runTest("S12b2：セントラル短資FXのブロック形式を解析",() => {
    const result = parseOcrText(
      data.blockCentralTanshiText,
      data.blockCentralTanshiRule
    );

    assert(result.blocks.length === 1,
      "ブロック結果が1件ではありません。");
    assert(result.blocks[0].status === "recognized",
      "項目名のまとまりと値のまとまりを認識できていません。");
    assert(getField(result,"value").value === 1750000,
      "口座清算価値が1,750,000円になっていません。");
    assert(getField(result,"effectivePrincipal").value === 2000000,
      "口座資産が2,000,000円になっていません。");
    assert(getField(result,"pnl").value === -400000,
      "建玉評価損益が-400,000円になっていません。");
    assert(getField(result,"swapTotal").value === 150000,
      "未決済スワップが150,000円になっていません。");
    assert(
      2000000 - 400000 + 150000 === 1750000,
      "セントラル短資FXの恒等式検算が一致しません。"
    );
  });

  runTest("S12b2：クリック365のブロック形式と無視行",() => {
    const result = parseOcrText(
      data.blockClick365Text,
      data.blockClick365Rule
    );

    assert(result.blocks.length === 1,
      "ブロック結果が1件ではありません。");
    assert(result.blocks[0].status === "recognized",
      "クリック365の項目名と値のまとまりを認識できていません。");
    assert(getField(result,"value").value === 2000000,
      "時価評価総額が2,000,000円になっていません。");
    assert(getField(result,"effectivePrincipal").value === 500000,
      "口座残高が500,000円になっていません。");
    assert(getField(result,"pnl").value === 500000,
      "未決済建玉評価損益が500,000円になっていません。");
    assert(getField(result,"swapTotal").value === 1000000,
      "累計スワップが1,000,000円になっていません。");
    assert(
      500000 + 500000 + 1000000 === 2000000,
      "クリック365の恒等式検算が一致しません。"
    );
    assert(
      result.unrecognizedLines.every(line =>
        !["余力確認","戻る","三、365株"].includes(line.text)
      ),
      "ignoreLinesで指定した画面要素が未認識行に残っています。"
    );
  });

  runTest("S12b2：ブロックのラベル欠落は全項目未確定",() => {
    const text = data.blockCentralTanshiText.replace(
      "建玉評価損益\n",
      ""
    );
    const result = parseOcrText(
      text,
      data.blockCentralTanshiRule
    );

    assertBlockUnconfirmed(result,"ラベル欠落");
  });

  runTest("S12b2：項目名のまとまり内の不明行は全項目未確定",() => {
    const text = data.blockCentralTanshiText.replace(
      "当日損益\n",
      "当日損益\n不明な項目\n"
    );
    const result = parseOcrText(
      text,
      data.blockCentralTanshiRule
    );

    assertBlockUnconfirmed(result,"項目名のまとまり内の不明行");
  });

  runTest("S12b2：ignoreLinesを追加しても解析値は変わらない",() => {
    const base = parseOcrText(
      data.blockClick365Text,
      data.blockClick365Rule
    );
    const textWithIgnoredLines =
      "余力確認\n戻る\n三、365株\n" +
      data.blockClick365Text;
    const withIgnored = parseOcrText(
      textWithIgnoredLines,
      data.blockClick365Rule
    );

    for (const name of [
      "value",
      "effectivePrincipal",
      "pnl",
      "swapTotal"
    ]) {
      assert(
        getField(base,name).value === getField(withIgnored,name).value,
        "ignoreLinesの追加で" + name + "の値が変わっています。"
      );
    }
    assert(withIgnored.blocks[0].status === "recognized",
      "ignoreLinesを追加した結果、ブロックが未確定になっています。");
  });

  runTest("S12b2：ブロックの値不足・余分な数値行は全項目未確定",() => {
    const missingText = data.blockCentralTanshiText.replace(
      "1,250,000円\n",
      ""
    );
    const missingResult = parseOcrText(
      missingText,
      data.blockCentralTanshiRule
    );

    assertBlockUnconfirmed(missingResult,"値不足");

    const extraText = data.blockCentralTanshiText + "\n999円";
    const extraResult = parseOcrText(
      extraText,
      data.blockCentralTanshiRule
    );

    assertBlockUnconfirmed(extraResult,"余分な数値行");
  });

  runTest("S12b2：値の種類が違う場合は全項目未確定",() => {
    const text = data.blockCentralTanshiText.replace(
      "900%\n",
      "900円\n"
    );
    const result = parseOcrText(
      text,
      data.blockCentralTanshiRule
    );

    assertBlockUnconfirmed(result,"値の種類違い");
  });

  runTest("S12b2：ブロックの起点が2件ある場合は全項目未確定",() => {
    const text =
      data.blockCentralTanshiText +
      "\n口座資産";
    const result = parseOcrText(
      text,
      data.blockCentralTanshiRule
    );

    assertBlockUnconfirmed(result,"起点重複");
  });

  runTest("S12b2：金額の読取失敗は該当項目だけ",() => {
    const text = data.blockCentralTanshiText.replace(
      "2,000,000円\n",
      "2,00S,000円\n"
    );
    const result = parseOcrText(
      text,
      data.blockCentralTanshiRule
    );

    assert(result.blocks[0].status === "recognized",
      "金額の読取失敗でブロック全体が未確定になっています。");
    assert(getField(result,"effectivePrincipal").value === null,
      "読めない金額が数値として取得されています。");
    assert(getField(result,"effectivePrincipal").status === "unreadable",
      "読めない金額がunreadableになっていません。");
    assert(getField(result,"value").value === 1750000,
      "総資産の正常値が失われています。");
    assert(getField(result,"pnl").value === -400000,
      "評価損益の正常値が失われています。");
    assert(getField(result,"swapTotal").value === 150000,
      "累計スワップの正常値が失われています。");
  });
}
