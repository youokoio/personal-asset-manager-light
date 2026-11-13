"use strict";

function runAllTests() {
  const results = [];

  function assert(condition,message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function runTest(name,testFunction) {
    try {
      testFunction();
      results.push({name,success:true,message:"合格"});
    } catch (error) {
      results.push({
        name,
        success:false,
        message:error.message
      });
    }
  }

  function makeAccount(id,name,type,category) {
    return {
      id,
      name,
      type,
      category,
      sortOrder:0,
      memo:"",
      lossCutRatio:null,
      marginRatePct:null,
      fieldLabels:{
        value:null,
        effectivePrincipal:null,
        pnl:null,
        swapTotal:null
      },
      autoCalc:null,
      createdAt:"2026-01-01T00:00:00.000Z",
      updatedAt:"2026-01-01T00:00:00.000Z"
    };
  }

  function makeSnapshot(
    id,accountId,asOfDate,recordedAt,value,extra = {}
  ) {
    return {
      id,
      accountId,
      asOfDate,
      recordedAt,
      value,
      cumulativeInvested:null,
      effectivePrincipal:null,
      pnl:null,
      realizedPnlTotal:null,
      memo:"",
      ...extra
    };
  }

  const context = {
    assert,
    runTest,
    makeAccount,
    makeSnapshot
  };

  registerMigrationTests(context);
  registerSummaryTests(context);
  registerInputTests(context);
  registerBulkTests(context);
  registerChartTests(context);
  registerHoldingsTests(context);

  return results;
}

if (document.body && document.body.dataset.testRunner === "true") {
  const results = runAllTests();
  const resultsElement = document.getElementById("test-results");
  const summaryElement = document.getElementById("test-summary");

  for (const result of results) {
    const item = document.createElement("li");
    item.textContent = `${result.success ? "合格" : "不合格"}：${result.name} — ${result.message}`;
    resultsElement.appendChild(item);
  }

  const passed = results.filter(result => result.success).length;
  const failed = results.length - passed;
  summaryElement.textContent = `${passed}件合格 / ${failed}件不合格（全${results.length}件）`;
}
