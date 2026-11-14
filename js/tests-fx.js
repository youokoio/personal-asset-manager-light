"use strict";

function registerFxTests(context) {
  const {assert,runTest,makeAccount} = context;

  function makePosition(
    id,accountId,pair,side,quantity,openRate,swap,
    status = "保有中"
  ) {
    return {
      id,
      accountId,
      pair,
      side,
      quantity,
      openRate,
      swap,
      status
    };
  }

  function makeRate(accountId,pair,rate,asOfDate = "2026-11-05") {
    return {
      id:"rate-" + accountId + "-" + pair,
      accountId,
      pair,
      rate,
      asOfDate
    };
  }

  function makeData(positions,rates = []) {
    const accounts = [
      makeAccount("fx-a","架空FX口座A","fx","fx"),
      makeAccount("fx-b","架空FX口座B","fx","fx")
    ];

    return {
      accounts,
      fxPositions:positions,
      fxRates:rates
    };
  }

  runTest("S5a：FX集計の数量・平均約定レート・評価損益",() => {
    const accountId = "fx-a";

    const data = makeData([
      makePosition(
        "position-a",
        accountId,
        "TRY/JPY",
        "買",
        200000,
        150,
        1000
      ),
      makePosition(
        "position-b",
        accountId,
        "TRY/JPY",
        "買",
        200000,
        151,
        2000
      ),
      makePosition(
        "position-c",
        accountId,
        "TRY/JPY",
        "買",
        100000,
        152,
        500
      )
    ],[
      makeRate(accountId,"TRY/JPY",153)
    ]);

    const rows = calculateFxAggregateRows(data);

    assert(rows.length === 1,
      "同じ口座・通貨ペア・売買方向が1集計にまとまっていません。");

    const result = rows[0];

    assert(result.quantity === 500000,
      "建玉数量の合計が500,000通貨ではありません。");
    assert(result.positionCount === 3,
      "建玉件数が3件ではありません。");
    assert(Math.abs(result.averageOpenRate - 150.8) < 0.0000001,
      "加重平均約定レートが150.8ではありません。");
    assert(result.evaluationRate === 153,
      "評価レートが153ではありません。");
    assert(result.exchangeProfit === 1100000,
      "為替差損益が1,100,000円ではありません。");
    assert(result.swapTotal === 3500,
      "スワップ合計が3,500円ではありません。");
    assert(result.evaluationPnl === 1103500,
      "評価損益が1,103,500円ではありません。");
  });

  runTest("S5a：売り建玉の為替差損益",() => {
    const accountId = "fx-a";

    const data = makeData([
      makePosition(
        "position-sell",
        accountId,
        "USD/JPY",
        "売",
        10000,
        150,
        0
      )
    ],[
      makeRate(accountId,"USD/JPY",148)
    ]);

    const rows = calculateFxAggregateRows(data);

    assert(rows.length === 1,
      "売り建玉の集計が作成されていません。");
    assert(rows[0].exchangeProfit === 20000,
      "売り建玉の為替差益が20,000円ではありません。");
  });

  runTest("S5a：評価レート未入力は損益を未計算にする",() => {
    const accountId = "fx-a";

    const data = makeData([
      makePosition(
        "position-no-rate",
        accountId,
        "TRY/JPY",
        "買",
        10000,
        150,
        100
      )
    ]);

    const rows = calculateFxAggregateRows(data);

    assert(rows.length === 1,
      "評価レート未入力の建玉集計がありません。");
    assert(rows[0].evaluationRate === null,
      "評価レート未入力がnullになっていません。");
    assert(rows[0].exchangeProfit === null,
      "評価レート未入力なのに為替差損益が計算されています。");
    assert(rows[0].evaluationPnl === null,
      "評価レート未入力なのに評価損益が計算されています。");
  });

  runTest("S5a：一部スワップ未入力はスワップ合計を未入力にする",() => {
    const accountId = "fx-a";

    const data = makeData([
      makePosition(
        "position-swap-a",
        accountId,
        "TRY/JPY",
        "買",
        10000,
        150,
        100
      ),
      makePosition(
        "position-swap-b",
        accountId,
        "TRY/JPY",
        "買",
        10000,
        151,
        null
      )
    ],[
      makeRate(accountId,"TRY/JPY",152)
    ]);

    const rows = calculateFxAggregateRows(data);

    assert(rows.length === 1,
      "スワップ未入力の建玉集計がありません。");
    assert(rows[0].exchangeProfit === 30000,
      "為替差損益が30,000円ではありません。");
    assert(rows[0].swapTotal === null,
      "一部スワップ未入力なのにスワップ合計が数値になっています。");
    assert(rows[0].evaluationPnl === null,
      "スワップ未入力なのに評価損益が計算されています。");
  });

  runTest("S5a：決済済み建玉は集計対象外",() => {
    const accountId = "fx-a";

    const data = makeData([
      makePosition(
        "position-open",
        accountId,
        "TRY/JPY",
        "買",
        10000,
        150,
        100
      ),
      makePosition(
        "position-closed",
        accountId,
        "TRY/JPY",
        "買",
        20000,
        149,
        200,
        "決済済"
      )
    ],[
      makeRate(accountId,"TRY/JPY",151)
    ]);

    const rows = calculateFxAggregateRows(data);

    assert(rows.length === 1,
      "保有中建玉の集計が1件ではありません。");
    assert(rows[0].quantity === 10000,
      "決済済み建玉が数量に含まれています。");
    assert(rows[0].positionCount === 1,
      "決済済み建玉が件数に含まれています。");
    assert(rows[0].exchangeProfit === 10000,
      "保有中建玉だけの為替差損益が10,000円ではありません。");
  });

  runTest("S5a：口座別集計は対象口座だけを合算",() => {
    const data = makeData([
      makePosition(
        "position-account-a",
        "fx-a",
        "TRY/JPY",
        "買",
        10000,
        150,
        100
      ),
      makePosition(
        "position-account-b",
        "fx-b",
        "TRY/JPY",
        "買",
        20000,
        150,
        200
      )
    ],[
      makeRate("fx-a","TRY/JPY",151),
      makeRate("fx-b","TRY/JPY",152)
    ]);

    const result = calculateFxAccountAggregateSummary(data,"fx-a");

    assert(result.aggregateCount === 1,
      "口座Aの集計件数が1件ではありません。");
    assert(result.exchangeProfit === 10000,
      "口座Aの為替差損益が10,000円ではありません。");
    assert(result.status === "計算済",
      "口座Aの計算状態が「計算済」ではありません。");
  });

  runTest("S5a：建玉入力の正常値を受け入れる",() => {
    const position = {
      accountId:"fx-a",
      pair:"TRY/JPY",
      side:"買",
      openDate:"2026-11-05T09:30",
      quantity:200000,
      openRate:3.12,
      swap:1234
    };

    assert(validateFxPositionInput(position) === null,
      "正常な建玉データがエラーになっています。");
  });

  runTest("S5a：建玉入力の不正な通貨ペアを拒否する",() => {
    const position = {
      accountId:"fx-a",
      pair:"TRY/USD",
      side:"買",
      openDate:"2026-11-05",
      quantity:10000,
      openRate:3.12,
      swap:0
    };

    assert(
      validateFxPositionInput(position) ===
        "通貨ペアは英大文字3文字/JPYで入力してください。",
      "JPY以外の通貨ペアを正しく拒否できていません。"
    );
  });

  runTest("S5a：建玉数量は正の整数だけを受け入れる",() => {
    const base = {
      accountId:"fx-a",
      pair:"TRY/JPY",
      side:"買",
      openDate:"2026-11-05",
      openRate:3.12,
      swap:0
    };

    assert(
      validateFxPositionInput({...base,quantity:10000}) === null,
      "正の整数の数量が拒否されています。"
    );
    assert(
      validateFxPositionInput({...base,quantity:0}) !== null,
      "数量0が受け入れられています。"
    );
    assert(
      validateFxPositionInput({...base,quantity:10000.5}) !== null,
      "小数の数量が受け入れられています。"
    );
  });

  runTest("S5a：建玉スワップは数値または空欄を受け入れる",() => {
    const base = {
      accountId:"fx-a",
      pair:"TRY/JPY",
      side:"買",
      openDate:"2026-11-05",
      quantity:10000,
      openRate:3.12
    };

    assert(
      validateFxPositionInput({...base,swap:0}) === null,
      "スワップ0が拒否されています。"
    );
    assert(
      validateFxPositionInput({...base,swap:null}) === null,
      "スワップ未入力が拒否されています。"
    );
    assert(
      validateFxPositionInput({...base,swap:"未入力"}) !== null,
      "文字列のスワップが受け入れられています。"
    );
  });

  runTest("S5a：CSV日付の解析と実在日チェック",() => {
    assert(
      parseFxCsvDate("2026/11/05") === "2026-11-05",
      "YYYY/MM/DD形式の日付を変換できていません。"
    );
    assert(
      parseFxCsvDate("26-11-05 09:30") === "2026-11-05T09:30",
      "2桁年と時刻を含む日付を変換できていません。"
    );
    assert(
      parseFxCsvDate("2026/02/30") === null,
      "実在しない日付を拒否できていません。"
    );
    assert(
      parseFxCsvDate("2026/11/05 25:00") === null,
      "不正な時刻を拒否できていません。"
    );
  });

  runTest("S5a：CSVの引用符・BOM・改行を解析",() => {
    const source =
      "\uFEFF口座名,通貨ペア,メモ\r\n" +
      "\"架空FX口座A\",TRY/JPY,\"説明,追加\"\r\n" +
      "\"架空\"\"FX\"\"口座B\",USD/JPY,通常";

    const result = parseFxCsvText(source);

    assert(result.error === null,
      "正常なCSVで解析エラーが発生しています。");
    assert(result.rows.length === 3,
      "CSVの行数が3行になっていません。");
    assert(result.rows[0][0] === "口座名",
      "先頭のBOMを除去できていません。");
    assert(result.rows[1][2] === "説明,追加",
      "引用符内のカンマを正しく解析できていません。");
    assert(result.rows[2][0] === "架空\"FX\"口座B",
      "二重引用符を正しく解析できていません。");
  });

  runTest("S5a：閉じていないCSV引用符をエラーにする",() => {
    const result = parseFxCsvText(
      "口座名,通貨ペア\n\"架空FX口座A,TRY/JPY"
    );

    assert(result.error !== null,
      "閉じていない引用符を検出できていません。");
    assert(result.rows.length === 0,
      "不正なCSVから行が返されています。");
  });

  runTest("S5a：CSV取込で口座・日時・数値を変換する",() => {
    const accounts = [
      makeAccount("fx-a","架空FX口座A","fx","fx")
    ];

    const source =
      "口座名,通貨ペア,売買方向,約定日時,数量,約定レート,累計スワップ\n" +
      "架空FX口座A,TRY/JPY,買,2026/11/05 09:30,\"200,000\",3.12,\"1,234\"";

    const result = parseFxPositionCsv(source,accounts);

    assert(result.items.length === 1,
      "CSVから建玉1件を取り込めていません。");
    assert(result.errors.length === 0,
      "正常なCSVにエラーが発生しています。");
    assert(result.items[0].accountId === "fx-a",
      "口座名から口座IDへ変換できていません。");
    assert(result.items[0].openDate === "2026-11-05T09:30",
      "約定日時を正しく変換できていません。");
    assert(result.items[0].quantity === 200000,
      "カンマ付き数量を正しく変換できていません。");
    assert(result.items[0].openRate === 3.12,
      "約定レートを正しく変換できていません。");
    assert(result.items[0].swap === 1234,
      "カンマ付きスワップを正しく変換できていません。");
    assert(result.items[0].status === "保有中",
      "取り込んだ建玉の状態が保有中ではありません。");
  });

  runTest("S5a：CSVの空欄スワップをnullとして取り込む",() => {
    const accounts = [
      makeAccount("fx-a","架空FX口座A","fx","fx")
    ];

    const source =
      "口座名,通貨ペア,売買方向,約定日時,数量,約定レート,累計スワップ\n" +
      "架空FX口座A,TRY/JPY,買,2026-11-05,10000,3.12,";

    const result = parseFxPositionCsv(source,accounts);

    assert(result.items.length === 1,
      "スワップ空欄の建玉を取り込めていません。");
    assert(result.items[0].swap === null,
      "スワップ空欄がnullとして保持されていません。");
  });

  runTest("S5a：CSVの口座名・列見出しの誤りを検出",() => {
    const accounts = [
      makeAccount("fx-a","架空FX口座A","fx","fx")
    ];

    const unknownAccount =
      "口座名,通貨ペア,売買方向,約定日時,数量,約定レート,累計スワップ\n" +
      "存在しない口座,TRY/JPY,買,2026-11-05,10000,3.12,0";

    const accountResult = parseFxPositionCsv(
      unknownAccount,
      accounts
    );

    assert(accountResult.items.length === 0,
      "存在しない口座の建玉が取り込まれています。");
    assert(accountResult.errors.length === 1,
      "存在しない口座のエラー件数が1件ではありません。");

    const wrongHeader =
      "通貨ペア,口座名,売買方向,約定日時,数量,約定レート,累計スワップ\n" +
      "TRY/JPY,架空FX口座A,買,2026-11-05,10000,3.12,0";

    const headerResult = parseFxPositionCsv(
      wrongHeader,
      accounts
    );

    assert(headerResult.items.length === 0,
      "列順が違うCSVを取り込めています。");
    assert(headerResult.errors.length > 0,
      "列順が違うCSVのエラーがありません。");
  });

  runTest("S5a：CSV41件をすべて解析できる",() => {
    const accounts = [
      makeAccount("fx-a","架空FX口座A","fx","fx")
    ];

    const header =
      "口座名,通貨ペア,売買方向,約定日時,数量,約定レート,累計スワップ";

    const rows = [];

    for (let index = 0; index < 41; index += 1) {
      rows.push([
        "架空FX口座A",
        "TRY/JPY",
        "買",
        "2026-11-05",
        String(10000 + index),
        "3.12",
        "0"
      ].join(","));
    }

    const result = parseFxPositionCsv(
      [header,...rows].join("\n"),
      accounts
    );

    assert(result.items.length === 41,
      "CSVの41件すべてを取り込めていません。");
    assert(result.errors.length === 0,
      "正常な41件のCSVにエラーが発生しています。");
    assert(result.items[0].quantity === 10000,
      "1件目の数量が正しくありません。");
    assert(result.items[40].quantity === 10040,
      "41件目の数量が正しくありません。");
  });

  runTest("S5a追補：標準通貨ペアと口座固有ペアの候補",() => {
    const data = makeData([],[ 
      makeRate("fx-a","GBP/JPY",190),
      makeRate("fx-b","CAD/JPY",110)
    ]);
    data.fxPositions.push(
      makePosition("custom-position","fx-a","NZD/JPY","買",1000,90,0)
    );
    const options = buildPairOptions(data,"fx-a");
    for (const pair of [
      "TRY/JPY","ZAR/JPY","USD/JPY","EUR/JPY","AUD/JPY",
      "GBP/JPY","NZD/JPY",FX_OTHER_PAIR_OPTION
    ]) {
      assert(options.includes(pair),pair + "が候補にありません。");
    }
    assert(!options.includes("CAD/JPY"),
      "別口座の通貨ペアが候補に混入しています。");
  });

  runTest("S5a追補：数量単位を通貨数量へ変換",() => {
    const cases = [
      ["20","万通貨",200000],
      ["0.5","万通貨",5000],
      ["1.5","千通貨",1500],
      ["1.1","万通貨",11000],
      ["0.07","万通貨",700],
      ["1","通貨",1]
    ];
    for (const [value,unit,expected] of cases) {
      const result = convertFxQuantityInput(value,unit);
      assert(result.error === null,value + unit + "の変換でエラーになりました。");
      assert(result.quantity === expected,
        value + unit + "の変換結果が" + expected + "ではありません。");
    }
  });

  runTest("S5a追補：不正な数量入力を拒否",() => {
    for (const [value,unit] of [
      ["0.5","通貨"],["0","通貨"],["-1","通貨"],
      ["","万通貨"],["abc","万通貨"],["0.00001","万通貨"]
    ]) {
      const result = convertFxQuantityInput(value,unit);
      assert(result.error !== null,value + unit + "を拒否できていません。");
      assert(result.quantity === null,
        value + unit + "の不正値に数量が設定されています。");
    }
  });

  runTest("S5a追補：数量表示と編集時の単位復元",() => {
    assert(formatFxQuantity(200000) === "20万通貨",
      "200,000通貨が20万通貨と表示されていません。");
    assert(formatFxQuantity(5000) === "5千通貨",
      "5,000通貨が5千通貨と表示されていません。");
    assert(formatFxQuantity(10000) === "1万通貨",
      "10,000通貨が1万通貨と表示されていません。");
    assert(formatFxQuantity(1500) === "1,500通貨",
      "1,500通貨が1,500通貨と表示されていません。");
    const parts = getFxQuantityInputParts(15000);
    assert(parts.value === "15" && parts.unit === "千通貨",
      "15,000通貨の編集時入力が15千通貨になっていません。");
  });

  runTest("S5a追補：建玉データ確認日の任意入力",() => {
    const base = {
      accountId:"fx-a",pair:"TRY/JPY",side:"買",
      openDate:"2026-11-05",quantity:10000,openRate:3.12,swap:0
    };
    assert(validateFxPositionInput(base) === null,
      "データ確認日がない既存形式の建玉を受け入れていません。");
    assert(validateFxPositionInput({...base,asOfDate:null}) === null,
      "データ確認日nullを受け入れていません。");
    assert(validateFxPositionInput({...base,asOfDate:"2026-11-14"}) === null,
      "正しいデータ確認日を受け入れていません。");
    assert(validateFxPositionInput({...base,asOfDate:"2026-02-30"}) !== null,
      "実在しないデータ確認日を拒否できていません。");
  });

  runTest("S5a追補：旧7列CSVはデータ確認日nullで取り込む",() => {
    const accounts = [makeAccount("fx-a","架空FX口座A","fx","fx")];
    const source =
      "口座名,通貨ペア,売買方向,約定日時,数量,約定レート,累計スワップ\n" +
      "架空FX口座A,TRY/JPY,買,2026-11-05,10000,3.12,0";
    const result = parseFxPositionCsv(source,accounts);
    assert(result.errors.length === 0,"従来7列CSVにエラーが発生しています。");
    assert(result.items.length === 1,"従来7列CSVから建玉を取り込めていません。");
    assert(result.items[0].asOfDate === null,
      "従来7列CSVのデータ確認日がnullではありません。");
  });

  runTest("S5a追補：8列CSVのデータ確認日を解析",() => {
    const accounts = [makeAccount("fx-a","架空FX口座A","fx","fx")];
    const header =
      "口座名,通貨ペア,売買方向,約定日時,数量,約定レート,累計スワップ,データ確認日";
    const source = [
      header,
      "架空FX口座A,TRY/JPY,買,2026-11-05,10000,3.12,0,2026/11/14",
      "架空FX口座A,ZAR/JPY,売,2026-11-06,20000,1.80,0,"
    ].join("\n");
    const result = parseFxPositionCsv(source,accounts);
    assert(result.errors.length === 0,"正常な8列CSVにエラーが発生しています。");
    assert(result.items.length === 2,"8列CSVから2件を取り込めていません。");
    assert(result.items[0].asOfDate === "2026-11-14",
      "スラッシュ区切りのデータ確認日を変換できていません。");
    assert(result.items[1].asOfDate === null,
      "空欄のデータ確認日がnullになっていません。");
  });

  runTest("S5a追補：8列CSVの不正なデータ確認日を拒否",() => {
    const accounts = [makeAccount("fx-a","架空FX口座A","fx","fx")];
    const header =
      "口座名,通貨ペア,売買方向,約定日時,数量,約定レート,累計スワップ,データ確認日";
    for (const invalidDate of ["2026/02/30","2026-11-14T09:30"]) {
      const source = header + "\n" +
        "架空FX口座A,TRY/JPY,買,2026-11-05,10000,3.12,0," +
        invalidDate;
      const result = parseFxPositionCsv(source,accounts);
      assert(result.items.length === 0,
        invalidDate + "を含むCSVが取り込まれています。");
      assert(result.errors.length > 0,invalidDate + "のエラーがありません。");
    }
  });

  runTest("S5a追補：建玉フォーム（新規）の描画",() => {
    const originalAppData = appData;

    try {
      appData = makeData([],[]);

      const form = renderFxPositionForm("fx-a","TRY/JPY","買");

      assert(form && form.tagName === "FORM",
        "新規建玉フォームが描画されていません。");

      const pair = form.querySelector('select[name="pairChoice"]');
      const side = form.querySelector('select[name="side"]');
      const openDate = form.querySelector('[name="openDate"]');
      const asOfDate = form.querySelector('[name="asOfDate"]');
      const quantity = form.querySelector('[name="quantity"]');
      const quantityUnit = form.querySelector('select[name="quantityUnit"]');

      assert(pair && pair.value === "TRY/JPY",
        "新規フォームの通貨ペアが選択されていません。");
      assert(side && side.value === "買",
        "新規フォームの売買方向が選択されていません。");
      assert(openDate && openDate.type === "date",
        "新規フォームの約定日が日付入力ではありません。");
      assert(asOfDate && asOfDate.type === "date",
        "新規フォームのデータ確認日が日付入力ではありません。");
      assert(asOfDate.value === localDateString(),
        "新規フォームのデータ確認日が本日になっていません。");
      assert(quantity && quantity.value === "",
        "新規フォームの数量初期値が空欄ではありません。");
      assert(quantityUnit && quantityUnit.value === "万通貨",
        "新規フォームの数量単位初期値が万通貨ではありません。");
    } finally {
      appData = originalAppData;
    }
  });

  runTest("S5a追補：建玉フォーム（編集）の保存値描画",() => {
    const originalAppData = appData;

    try {
      const position = {
        id:"edit-position",
        accountId:"fx-a",
        pair:"GBP/JPY",
        side:"売",
        openDate:"2025-04-29T00:00:00.000Z",
        asOfDate:"2026-11-14",
        quantity:200000,
        openRate:3.7,
        swap:1234,
        status:"保有中",
        recordedAt:"2026-11-07T00:00:00.000Z",
        createdAt:"2026-11-07T00:00:00.000Z",
        updatedAt:"2026-11-07T00:00:00.000Z"
      };

      appData = makeData(
        [position],
        [makeRate("fx-a","GBP/JPY",3.15)]
      );

      const form = renderFxPositionForm(
        "fx-a",
        "GBP/JPY",
        "売",
        position
      );

      assert(form && form.tagName === "FORM",
        "編集建玉フォームが描画されていません。");

      const pair = form.querySelector('select[name="pairChoice"]');
      const side = form.querySelector('select[name="side"]');
      const openDate = form.querySelector('[name="openDate"]');
      const asOfDate = form.querySelector('[name="asOfDate"]');
      const quantity = form.querySelector('[name="quantity"]');
      const quantityUnit = form.querySelector('select[name="quantityUnit"]');
      const rate = form.querySelector('[name="openRate"]');
      const swap = form.querySelector('[name="swap"]');

      assert(pair && pair.value === "GBP/JPY",
        "編集フォームに保存済みの通貨ペアが表示されていません。");
      assert(side && side.value === "売",
        "編集フォームに保存済みの売買方向が表示されていません。");
      assert(openDate && openDate.value === "2025-04-29",
        "編集フォームに保存済みの約定日が表示されていません。");
      assert(asOfDate && asOfDate.value === "2026-11-14",
        "編集フォームに保存済みのデータ確認日が表示されていません。");
      assert(quantity && quantity.value === "20",
        "編集フォームの数量が20になっていません。");
      assert(quantityUnit && quantityUnit.value === "万通貨",
        "編集フォームの数量単位が万通貨になっていません。");
      assert(rate && rate.value === "3.7",
        "編集フォームに保存済みの約定レートが表示されていません。");
      assert(swap && swap.value === "1234",
        "編集フォームに保存済みの累計スワップが表示されていません。");
    } finally {
      appData = originalAppData;
    }
  });

}
