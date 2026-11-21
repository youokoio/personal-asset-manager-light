"use strict";

function registerContributionTests(context) {
  const {assert,runTest,makeAccount} = context;

  function makeData() {
    return {
      accounts:[
        makeAccount("stock-1","楽天証券","securities","stock")
      ],
      contributions:[],
      contributionPlans:[]
    };
  }

  function makeContribution(
    id,fromMonth,toMonth,cashAmount,pointAmount = 0,
    productName = "テスト投信A",wrapper = "NISAつみたて",
    status = "実行"
  ) {
    return {
      id,
      accountId:"stock-1",
      productName,
      wrapper,
      fromMonth,
      toMonth,
      status,
      cashAmount,
      pointAmount,
      memo:"",
      recordedAt:"2026-07-01T00:00:00.000Z",
      createdAt:"2026-07-01T00:00:00.000Z",
      updatedAt:null
    };
  }

  function makePlan(
    effectiveFrom,plannedCash,plannedPoint = 0,
    productName = "テスト投信A",wrapper = "NISAつみたて",
    status = "積立中"
  ) {
    return {
      id:"plan-" + effectiveFrom + "-" + String(productName),
      accountId:"stock-1",
      productName,
      wrapper,
      effectiveFrom,
      status,
      plannedCash,
      plannedPoint,
      memo:"",
      createdAt:"2026-01-01T00:00:00.000Z",
      updatedAt:null
    };
  }

  function findUnit(result,productName,wrapper = "NISAつみたて") {
    return result.units.find(item =>
      item.accountId === "stock-1" &&
      item.productName === productName &&
      item.wrapper === wrapper
    );
  }

  function findMonthRow(result,month,productName = "テスト投信A") {
    return result.monthlyRows.find(item =>
      item.type === "month" &&
      item.month === month &&
      item.productName === productName
    );
  }

  function assertThrows(callback,message) {
    let thrown = false;

    try {
      callback();
    } catch (error) {
      thrown = true;
    }

    assert(thrown,message);
  }

  runTest("S13b C1：毎月同額の累積積立額",() => {
    const data = makeData();

    for (let month = 1; month <= 6; month += 1) {
      const value = "2026-" + String(month).padStart(2,"0");
      data.contributions.push(
        makeContribution("c1-" + value,value,value,30000)
      );
    }

    const result = calculateContributionSummary(data,"2026-07");
    const unit = findUnit(result,"テスト投信A");

    assert(unit !== undefined,"商品別の集計単位がありません。");
    assert(unit.cumulativeAmount === 180000,
      "累積積立額が180000円になっていません。");
    assert(unit.cashTotal === 180000,
      "現金累計が180000円になっていません。");
    assert(unit.pointTotal === 0,
      "ポイント累計が0円になっていません。");
    assert(unit.missingMonthCount === 0,
      "未入力月が0か月になっていません。");
    assert(unit.currentMonthStatus === "未入力",
      "今月の状態が未入力になっていません。");

    const accountTotal = result.accountTotals.find(
      item => item.accountId === "stock-1"
    );

    assert(accountTotal !== undefined,"口座合計がありません。");
    assert(accountTotal.cumulativeAmount === 180000,
      "口座全体の累積積立額が180000円になっていません。");
  });

  runTest("S13b C2：途中で積立予定額を変更",() => {
    const data = makeData();

    data.contributionPlans.push(
      makePlan("2026-01",30000),
      makePlan("2026-04",50000)
    );

    for (let month = 1; month <= 6; month += 1) {
      const value = "2026-" + String(month).padStart(2,"0");
      const amount = month <= 3 ? 30000 : 50000;

      data.contributions.push(
        makeContribution("c2-" + value,value,value,amount)
      );
    }

    const result = calculateContributionSummary(data,"2026-07");
    const unit = findUnit(result,"テスト投信A");

    assert(unit.cumulativeAmount === 240000,
      "累積積立額が240000円になっていません。");

    for (let month = 1; month <= 6; month += 1) {
      const value = "2026-" + String(month).padStart(2,"0");
      const row = findMonthRow(result,value);
      const expected = month <= 3 ? 30000 : 50000;

      assert(row !== undefined,value + "の月別行がありません。");
      assert(row.plannedCash === expected,
        value + "の予定現金額が正しくありません。");
    }

    assert(unit.cumulativeAmount !== 300000,
      "予定額を月数分掛けた300000円になっています。");
  });

  runTest("S13b C3：ポイント分を含む累積積立額",() => {
    const data = makeData();

    data.contributions.push(
      makeContribution("c3-01","2026-01","2026-01",29000,1000),
      makeContribution("c3-02","2026-02","2026-02",30000,0),
      makeContribution("c3-03","2026-03","2026-03",25000,5000)
    );

    const result = calculateContributionSummary(data,"2026-04");
    const unit = findUnit(result,"テスト投信A");

    assert(unit.cashTotal === 84000,
      "現金累計が84000円になっていません。");
    assert(unit.pointTotal === 6000,
      "ポイント累計が6000円になっていません。");
    assert(unit.cumulativeAmount === 90000,
      "累積積立額が90000円になっていません。");
    assert(unit.missingMonthCount === 0,
      "未入力月が0か月になっていません。");
  });

  runTest("S13b C4：未実行と未入力の区別",() => {
    const data = makeData();

    data.contributionPlans.push(
      makePlan("2026-01",30000)
    );

    data.contributions.push(
      makeContribution("c4-01","2026-01","2026-01",30000),
      makeContribution(
        "c4-02","2026-02","2026-02",0,0,
        "テスト投信A","NISAつみたて","未実行"
      ),
      makeContribution("c4-03","2026-03","2026-03",30000),
      makeContribution("c4-05","2026-05","2026-05",30000)
    );

    const result = calculateContributionSummary(data,"2026-06");
    const unit = findUnit(result,"テスト投信A");

    assert(unit.cumulativeAmount === 90000,
      "累積積立額が90000円になっていません。");
    assert(unit.missingMonthCount === 1,
      "未入力月が1か月になっていません。");
    assert(unit.missingMonths.includes("2026-04"),
      "2026-04が未入力月として検出されていません。");

    const february = findMonthRow(result,"2026-02");
    const april = findMonthRow(result,"2026-04");

    assert(february !== undefined,"未実行の月別行がありません。");
    assert(february.status === "未実行",
      "2026-02が未実行として扱われていません。");
    assert(april !== undefined,"未入力の月別行がありません。");
    assert(april.status === "未入力",
      "2026-04が未入力として扱われていません。");
    assert(unit.currentMonthStatus === "未入力",
      "今月の状態が未入力になっていません。");
  });

  runTest("S13b C5：積立停止と再開",() => {
    const data = makeData();

    data.contributionPlans.push(
      makePlan("2026-01",30000),
      makePlan("2026-03",null,0,"テスト投信A","NISAつみたて","停止"),
      makePlan("2026-05",30000)
    );

    ["2026-01","2026-02","2026-05","2026-06"].forEach(
      (month,index) => {
        data.contributions.push(
          makeContribution("c5-" + index,month,month,30000)
        );
      }
    );

    const result = calculateContributionSummary(data,"2026-07");
    const unit = findUnit(result,"テスト投信A");

    assert(unit.cumulativeAmount === 120000,
      "累積積立額が120000円になっていません。");
    assert(unit.stoppedMonthCount === 2,
      "停止中の月が2か月になっていません。");
    assert(unit.stoppedMonths.includes("2026-03"),
      "2026-03が停止中として検出されていません。");
    assert(unit.stoppedMonths.includes("2026-04"),
      "2026-04が停止中として検出されていません。");
    assert(unit.missingMonthCount === 0,
      "停止中の月が未入力月に数えられています。");
  });

  runTest("S13b C6：期間まとめと月次実績の集計",() => {
    const data = makeData();

    data.contributions.push(
      makeContribution(
        "c6-period","2025-01","2025-12",360000,0
      ),
      makeContribution(
        "c6-month","2026-01","2026-01",30000,0
      )
    );

    const result = calculateContributionSummary(data,"2026-02");
    const unit = findUnit(result,"テスト投信A");

    assert(unit.cumulativeAmount === 390000,
      "累積積立額が390000円になっていません。");
    assert(unit.cashTotal === 390000,
      "現金累計が390000円になっていません。");
    assert(unit.missingMonthCount === 0,
      "期間まとめの範囲が未入力月に数えられています。");
    assert(unit.inputFromMonth === "2025-01",
      "入力開始月が2025-01になっていません。");
    assert(unit.inputToMonth === "2026-02",
      "入力済み期間の終点が今月になっていません。");

    const periodRows = result.monthlyRows.filter(
      item => item.type === "period"
    );
    const monthRows = result.monthlyRows.filter(
      item => item.type === "month"
    );

    assert(periodRows.length === 1,
      "期間まとめが1行になっていません。");
    assert(monthRows.length === 1,
      "月次実績が1行になっていません。");
  });

  runTest("S13b C7：実績がない単位は未入力",() => {
    const data = makeData();

    data.contributionPlans.push(
      makePlan("2026-01",30000)
    );

    const result = calculateContributionSummary(data,"2026-07");
    const unit = findUnit(result,"テスト投信A");

    assert(unit !== undefined,"予定だけの集計単位がありません。");
    assert(unit.status === "未入力",
      "実績がない単位の状態が未入力になっていません。");
    assert(unit.cumulativeAmount === null,
      "実績がない単位の累積積立額が0になっています。");
    assert(unit.cashTotal === null,
      "実績がない単位の現金累計が0になっています。");
    assert(unit.pointTotal === null,
      "実績がない単位のポイント累計が0になっています。");
  });

  runTest("S13b C8：口座全体と商品別の重複判定",() => {
    const data = makeData();

    data.contributions.push(
      makeContribution("c8-product","2026-03","2026-03",30000)
    );

    const accountWide = makeContribution(
      "c8-account","2026-03","2026-03",30000,0,null,null
    );

    const overlapData = {
      ...data,
      contributions:[...data.contributions,accountWide]
    };

    const overlapResult = calculateContributionSummary(
      overlapData,"2026-04"
    );

    assert(overlapResult.overlaps.length === 1,
      "口座全体と商品別の重複が1件検出されていません。");

    const separateProducts = makeData();

    separateProducts.contributions.push(
      makeContribution(
        "c8-a","2026-03","2026-03",30000,0,
        "テスト投信A","NISAつみたて"
      ),
      makeContribution(
        "c8-b","2026-03","2026-03",20000,0,
        "テスト投信B","特定"
      )
    );

    const separateResult = calculateContributionSummary(
      separateProducts,"2026-04"
    );

    assert(separateResult.overlaps.length === 0,
      "異なる商品同士が重複として検出されています。");
    assert(separateResult.units.length === 2,
      "異なる商品が2つの単位に分かれていません。");
  });

  runTest("S13b C9：訂正・削除後の再計算",() => {
    const data = makeData();

    for (let month = 1; month <= 6; month += 1) {
      const value = "2026-" + String(month).padStart(2,"0");
      data.contributions.push(
        makeContribution("c9-" + value,value,value,30000)
      );
    }

    const originalResult = calculateContributionSummary(
      data,"2026-07"
    );
    const originalUnit = findUnit(originalResult,"テスト投信A");

    assert(originalUnit.cumulativeAmount === 180000,
      "訂正前の累積積立額が180000円ではありません。");

    const correctedData = JSON.parse(JSON.stringify(data));
    correctedData.contributions[0].cashAmount = 33000;

    const correctedResult = calculateContributionSummary(
      correctedData,"2026-07"
    );
    const correctedUnit = findUnit(correctedResult,"テスト投信A");

    assert(correctedUnit.cumulativeAmount === 183000,
      "訂正後の累積積立額が183000円になっていません。");

    const deletedData = JSON.parse(JSON.stringify(data));
    deletedData.contributions = deletedData.contributions.filter(
      item => item.fromMonth !== "2026-02"
    );

    const deletedResult = calculateContributionSummary(
      deletedData,"2026-07"
    );
    const deletedUnit = findUnit(deletedResult,"テスト投信A");

    assert(deletedUnit.cumulativeAmount === 150000,
      "削除後の累積積立額が150000円になっていません。");
    assert(deletedUnit.missingMonthCount === 1,
      "削除した月が未入力月に戻っていません。");
    assert(deletedUnit.missingMonths.includes("2026-02"),
      "削除した2026-02が未入力として検出されていません。");
  });

  runTest("S13b C10：保有商品の取得額に影響されない",() => {
    const data = makeData();

    for (let month = 1; month <= 6; month += 1) {
      const value = "2026-" + String(month).padStart(2,"0");
      data.contributions.push(
        makeContribution("c10-" + value,value,value,30000)
      );
    }

    data.holdings = [
      {
        accountId:"stock-1",
        productName:"テスト投信A",
        wrapper:"NISAつみたて",
        costBasis:300000,
        value:330000
      }
    ];

    const before = calculateContributionSummary(data,"2026-07");
    const beforeUnit = findUnit(before,"テスト投信A");

    data.holdings[0].costBasis = 200000;

    const after = calculateContributionSummary(data,"2026-07");
    const afterUnit = findUnit(after,"テスト投信A");

    assert(beforeUnit.cumulativeAmount === 180000,
      "変更前の累積積立額が180000円ではありません。");
    assert(afterUnit.cumulativeAmount === 180000,
      "取得額の変更によって累積積立額が変わっています。");
  });

  runTest("S13b C11：期間まとめを月別一覧で1行表示",() => {
    const data = makeData();

    data.contributions.push(
      makeContribution(
        "c11-period","2025-01","2025-12",360000,0
      ),
      makeContribution(
        "c11-month","2026-01","2026-01",30000,0
      )
    );

    const result = calculateContributionSummary(data,"2026-02");
    const periodRows = result.monthlyRows.filter(
      item => item.type === "period"
    );
    const monthRows = result.monthlyRows.filter(
      item => item.type === "month"
    );

    assert(result.monthlyRows.length === 2,
      "月別一覧が期間まとめと月次実績の合計2行ではありません。");
    assert(periodRows.length === 1,
      "期間まとめの行が1行ではありません。");

    const period = periodRows[0];

    assert(period.fromMonth === "2025-01",
      "期間まとめの開始月が正しくありません。");
    assert(period.toMonth === "2025-12",
      "期間まとめの終了月が正しくありません。");
    assert(period.cashAmount === 360000,
      "期間まとめの現金分が360000円ではありません。");
    assert(period.pointAmount === 0,
      "期間まとめのポイント分が0円ではありません。");
    assert(period.totalAmount === 360000,
      "期間まとめの合計が360000円ではありません。");

    assert(monthRows.length === 1,
      "期間まとめの各月が月次行に展開されています。");
    assert(monthRows[0].month === "2026-01",
      "月次行が2026-01になっていません。");

    assert(!monthRows.some(item =>
      item.month >= "2025-01" && item.month <= "2025-12"
    ),"期間まとめの範囲内に月次行があります。");

    const unit = findUnit(result,"テスト投信A");

    assert(unit.cumulativeAmount === 390000,
      "期間まとめを含む累積積立額が390000円ではありません。");
    assert(unit.missingMonthCount === 0,
      "期間まとめの範囲が未入力月に数えられています。");
  });

  runTest("S13b C12：口座全体のwrapperと商品名の正規化",() => {
    const data = makeData();

    data.contributions.push(
      makeContribution(
        "c12-01","2026-03","2026-03",30000,0,null,null
      ),
      makeContribution(
        "c12-02","2026-04","2026-04",30000,0,null,null
      )
    );

    const result = calculateContributionSummary(data,"2026-05");
    const accountWideUnit = findUnit(result,null,null);

    assert(accountWideUnit !== undefined,
      "口座全体の単位がありません。");
    assert(accountWideUnit.cumulativeAmount === 60000,
      "口座全体の累積積立額が60000円ではありません。");
    assert(result.units.filter(item =>
      item.productName === null
    ).length === 1,"口座全体が複数の単位に分かれています。");

    const invalidContributionData = makeData();
    invalidContributionData.contributions.push(
      makeContribution(
        "c12-invalid","2026-03","2026-03",30000,0,
        null,"NISAつみたて"
      )
    );

    assertThrows(() => calculateContributionSummary(
      invalidContributionData,"2026-04"
    ),"口座全体でwrapperありの実績がエラーになっていません。");

    const invalidProductData = makeData();
    invalidProductData.contributions.push(
      makeContribution(
        "c12-invalid-product","2026-03","2026-03",30000,0,
        "テスト投信A",null
      )
    );

    assertThrows(() => calculateContributionSummary(
      invalidProductData,"2026-04"
    ),"商品別でwrapperなしの実績がエラーになっていません。");

    const invalidPlanData = makeData();
    invalidPlanData.contributionPlans.push(
      makePlan("2026-01",30000,0,null,"NISAつみたて")
    );

    assertThrows(() => calculateContributionSummary(
      invalidPlanData,"2026-04"
    ),"口座全体でwrapperありの予定がエラーになっていません。");

    const normalizedData = makeData();

    normalizedData.contributions.push(
      makeContribution(
        "c12-normalized","2026-03","2026-03",30000,0,
        "テスト投信A","NISAつみたて"
      )
    );
    normalizedData.contributionPlans.push(
      makePlan(
        "2026-01",30000,0," テスト投信A ","NISAつみたて"
      )
    );

    const normalizedResult = calculateContributionSummary(
      normalizedData,"2026-04"
    );
    const normalizedUnit = findUnit(
      normalizedResult,"テスト投信A","NISAつみたて"
    );

    assert(normalizedUnit !== undefined,
      "前後の空白を除いた商品名で同じ単位になっていません。");
    assert(normalizedUnit.currentPlan !== null,
      "正規化した商品名の積立予定が取得できていません。");
  });
}
