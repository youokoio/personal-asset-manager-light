"use strict";

function registerInputTests(context) {
  const {assert,runTest,makeAccount,makeSnapshot} = context;

  /* ---------- S1g 入力補助テスト ---------- */

  runTest("S1g：株式の有効元本自動計算3例",() => {
    const account = makeAccount("stock-auto","架空証券口座","securities","stock");
    account.autoCalc = "principal";

    const cases = [
      {value:243723,pnl:33564,expected:210159},
      {value:5746195,pnl:2712811,expected:3033384},
      {value:4903591,pnl:2183640,expected:2719951}
    ];

    for (const item of cases) {
      const actual = calculateAutoCalcValue(account,item);
      assert(actual === item.expected,
        `有効元本の計算不一致：${item.value}−${item.pnl}=${actual}`);
    }
  });

  runTest("S1g：FX累計スワップ自動計算3口座",() => {
    const cases = [
      {
        name:"LIGHT FX",
        value:5098791,
        effectivePrincipal:1331457,
        pnl:-2376320,
        expected:6143654
      },
      {
        name:"クリック365",
        value:2584077,
        effectivePrincipal:276239,
        pnl:896000,
        expected:1411838
      },
      {
        name:"LION FX",
        value:2526224,
        effectivePrincipal:711119,
        pnl:924600,
        expected:890505
      }
    ];

    for (const item of cases) {
      const account = makeAccount(item.name,item.name,"fx","fx");
      account.autoCalc = "swap";
      const actual = calculateAutoCalcValue(account,item);
      assert(actual === item.expected,
        `${item.name}の累計スワップ計算が一致しません。`);
    }
  });

  runTest("S1g：口座分類ごとに自動計算の選択肢を制限",() => {
    const fx = makeAccount("fx","LIGHT FX","fx","fx");
    const central = makeAccount(
      "central","セントラル短資FX","fx","fx"
    );
    const stock = makeAccount(
      "stock","架空証券口座","securities","stock"
    );
    const crypto = makeAccount(
      "crypto","架空暗号資産口座","crypto","crypto"
    );
    const bank = makeAccount(
      "bank","架空銀行","bank","bank"
    );

    assert(
      JSON.stringify(getAllowedAutoCalcValues(fx)) ===
        JSON.stringify(["","swap"]),
      "通常のFX口座は「なし／swap」のみ選択できません。"
    );
    assert(
      JSON.stringify(getAllowedAutoCalcValues(central)) ===
        JSON.stringify([""]),
      "セントラル短資FXに自動計算の選択肢があります。"
    );
    assert(
      JSON.stringify(getAllowedAutoCalcValues(stock)) ===
        JSON.stringify(["","principal"]),
      "株式口座は「なし／principal」のみ選択できません。"
    );
    assert(
      JSON.stringify(getAllowedAutoCalcValues(crypto)) ===
        JSON.stringify([""]),
      "暗号資産口座に自動計算の選択肢があります。"
    );
    assert(
      JSON.stringify(getAllowedAutoCalcValues(bank)) ===
        JSON.stringify([""]),
      "銀行口座に自動計算の選択肢があります。"
    );
  });

  runTest("S1g：セントラル短資FXは自動計算しない",() => {
    const account = makeAccount(
      "central","セントラル短資FX","fx","fx"
    );
    account.autoCalc = null;

    const actual = calculateAutoCalcValue(account,{
      value:1000000,
      effectivePrincipal:500000,
      pnl:100000
    });

    assert(actual === null,
      "自動計算なしの口座で計算値が返されています。");
  });

  runTest("S1g：前回値は対象日より前の最新記録",() => {
    const data = {
      snapshots:[
        makeSnapshot(
          "oct31","a","2026-10-31",
          "2026-10-31T10:00:00.000Z",100
        ),
        makeSnapshot(
          "nov05","a","2026-11-05",
          "2026-11-05T10:00:00.000Z",200
        )
      ]
    };

    const onNov05 = getPreviousSnapshotForInput(
      data,"a","2026-11-05"
    );
    const onNov06 = getPreviousSnapshotForInput(
      data,"a","2026-11-06"
    );
    const editingNov05 = getPreviousSnapshotForInput(
      data,"a","2026-11-05","nov05"
    );
    const beforeOct31 = getPreviousSnapshotForInput(
      data,"a","2026-10-30"
    );

    assert(onNov05 && onNov05.id === "oct31",
      "11月5日の新規入力で10月31日の記録が前回になっていません。");
    assert(onNov06 && onNov06.id === "nov05",
      "11月6日の前回値に11月5日の記録が選ばれていません。");
    assert(editingNov05 && editingNov05.id === "oct31",
      "11月5日の編集中に10月31日の記録が選ばれていません。");
    assert(beforeOct31 === null,
      "対象日より前に記録がないのに前回値が返されています。");
  });

  runTest("S1g：対象日の初期値は端末日付",() => {
    const deviceDate = new Date(2026,10,11);
    assert(
      localDateString(deviceDate) === "2026-11-11",
      "端末日付から対象日を正しく作成できていません。"
    );
  });

  runTest("S1g：数値の3桁区切りとカンマ除去",() => {
    assert(
      formatInputNumber(1234567.89) === "1,234,567.89",
      "入力欄の3桁区切りが正しくありません。"
    );
    assert(
      toNumberOrNull("1,234,567.89") === 1234567.89,
      "カンマ付き入力を数値に戻せていません。"
    );
    assert(
      toNumberOrNull("-1,234.5") === -1234.5,
      "マイナス・小数の入力を正しく読み取れていません。"
    );
  });
}
