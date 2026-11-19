function registerLoanTests(context) {
  const {runTest,assert} = context;

  runTest("S9 7-5-1：毎月返済の元利内訳",() => {
    const result = calculateLoanMonthlyBreakdown(
      20000000,1.0,56000
    );
    assert(result && result.interest === 16666 &&
      result.principal === 39334,
      "20,000,000×1.0%÷12＝16,666円、56,000−16,666＝39,334円である必要があります。");
  });

  runTest("S9 7-5-2：未払利息の警告",() => {
    const result = calculateLoanMonthlyBreakdown(
      30000000,4.0,90000
    );
    assert(result && result.interest === 100000 &&
      result.principal === -10000 && result.unpaidInterest === true,
      "30,000,000×4.0%÷12＝100,000円、90,000−100,000＝−10,000円で未払利息警告が必要です。");
  });

  runTest("S9 7-5-3：3か月後の残高予測",() => {
    const result = calculateLoanForecast(
      10000000,1.2,50000,3
    );
    assert(result && result.months.length === 3,
      "3回分の返済予測が必要です。");
    const months = result.months;
    assert(months[0].interest === 10000 &&
      months[1].interest === 9960 &&
      months[2].interest === 9919,
      "各月の利息は10,000円・9,960円・9,919円である必要があります。");
    assert(months[0].nextBalance === 9960000 &&
      months[1].nextBalance === 9919960 &&
      months[2].nextBalance === 9879879,
      "3回返済後の残高は9,960,000円・9,919,960円・9,879,879円である必要があります。");
  });

  runTest("S9 7-5-4：見直し後の新返済額",() => {
    const result = calculateLoanNewMonthlyPayment(
      20000000,300,1.0,56000,false
    );
    assert(result && result.calculatedPayment === 75375 &&
      result.monthlyPayment === 75375 && result.capped === false,
      "残高20,000,000円・残り300か月・年利1.0%の返済額は75,375円である必要があります。");
  });

  runTest("S9 7-5-5：125%ルールの上限",() => {
    const result = calculateLoanNewMonthlyPayment(
      30000000,300,3.0,100000,true
    );
    assert(result && result.calculatedPayment === 142264 &&
      result.monthlyPayment === 125000 && result.capped === true &&
      result.capAmount === 125000,
      "算出額142,264円に対し、100,000円×125%＝125,000円を上限とし警告する必要があります。");
  });

  runTest("S9：2ローン合計の元利内訳",() => {
    const data = {
      loans:[
        {
          id:"loan-1",
          name:"架空ローンA",
          startDate:"2020-01-01",
          startAmount:20000000,
          rateType:"変動",
          finalDueDate:"2050-01-01",
          repayDay:28,
          monthlyPayment:56000,
          reviewDate:"2028-12-28",
          rule5y:true,
          rule125:true,
          memo:""
        },
        {
          id:"loan-2",
          name:"架空ローンB",
          startDate:"2020-01-01",
          startAmount:10000000,
          rateType:"変動",
          finalDueDate:"2050-01-01",
          repayDay:28,
          monthlyPayment:50000,
          reviewDate:"2028-12-28",
          rule5y:true,
          rule125:true,
          memo:""
        }
      ],
      loanSnapshots:[
        {
          id:"loan-snapshot-1",
          loanId:"loan-1",
          asOfDate:"2026-11-01",
          recordedAt:"2026-11-01T00:00:00.000Z",
          balance:20000000,
          rate:1.0
        },
        {
          id:"loan-snapshot-2",
          loanId:"loan-2",
          asOfDate:"2026-11-01",
          recordedAt:"2026-11-01T00:00:00.000Z",
          balance:10000000,
          rate:1.2
        }
      ]
    };
    const result = calculateLoanCombinedSummary(data);
    assert(result.complete && result.loanCount === 2 &&
      result.monthlyPayment === 106000 &&
      result.interest === 26666 &&
      result.principal === 79334,
      "返済額56,000＋50,000＝106,000円、利息16,666＋10,000＝26,666円、元金39,334＋40,000＝79,334円である必要があります。");
  });
}
