"use strict";

function registerChartUiTests(context) {
  const {assert,runTest} = context;

  runTest("S14：ズーム範囲の基本計算",() => {
    const result = calculateChartZoomRange(
      {start:0,end:100},
      2,
      50,
      {start:0,end:100},
      1
    );

    assert(result.start === 25,
      "2倍拡大後の開始日が25日ではありません。");
    assert(result.end === 75,
      "2倍拡大後の終了日が75日ではありません。");
  });

  runTest("S14：ズーム範囲の拡大下限",() => {
    const result = calculateChartZoomRange(
      {start:0,end:100},
      100,
      50,
      {start:0,end:100},
      20
    );

    assert(result.end - result.start === 20,
      "拡大範囲が最小幅20日より小さくなっています。");
  });

  runTest("S14：ズーム範囲の縮小上限",() => {
    const result = calculateChartZoomRange(
      {start:20,end:80},
      0.1,
      50,
      {start:0,end:100},
      1
    );

    assert(result.start === 0,
      "縮小時の開始日が全期間の開始日ではありません。");
    assert(result.end === 100,
      "縮小時の終了日が全期間の終了日ではありません。");
  });

  runTest("S14：ズーム中心が期間の端に近い場合",() => {
    const result = calculateChartZoomRange(
      {start:0,end:100},
      2,
      5,
      {start:0,end:100},
      1
    );

    assert(result.start === 0,
      "開始日が全期間の開始日より前になっています。");
    assert(result.end === 50,
      "端に近い中心で範囲が正しく補正されていません。");
  });

  runTest("S14：記録点から拡大下限を計算",() => {
    const minimumSpan = getChartZoomMinimumSpan(
      [0,10,30,60],
      {start:0,end:100}
    );

    assert(minimumSpan === 10,
      "隣接する記録点の最小間隔10日が取得できていません。");
  });

  runTest("S14：記録点が少ない場合の拡大下限",() => {
    const minimumSpan = getChartZoomMinimumSpan(
      [10],
      {start:0,end:100}
    );

    assert(minimumSpan === 5,
      "記録点が少ない場合の全期間1/20が下限になっていません。");
  });

  runTest("S14：日付形式が不正な場合",() => {
    assert(
      getChartZoomTimestamp("2026-02-30") === null,
      "存在しない日付が有効な日付として扱われています。"
    );
    assert(
      getChartZoomTimestamp("2026/02/28") === null,
      "指定形式以外の日付が有効として扱われています。"
    );
  });

  runTest("S14：不正な倍率では現在範囲を維持",() => {
    const result = calculateChartZoomRange(
      {start:10,end:90},
      0,
      50,
      {start:0,end:100},
      1
    );

    assert(result.start === 10 && result.end === 90,
      "不正な倍率で現在の範囲が維持されていません。");
  });
}
