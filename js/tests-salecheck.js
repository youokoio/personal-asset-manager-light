"use strict";

/* ---------- S13d 売却・利確候補テスト ---------- */

function registerSaleCheckTests(context) {
  const {assert,runTest} = context;

  function makeSaleCheckData() {
    return {
      accounts:[
        {
          id:"stock-1",
          name:"楽天証券",
          category:"stock",
          type:"stock"
        }
      ],
      snapshots:[],
      holdings:[],
      contributions:[],
      saleChecks:[]
    };
  }

  function addSaleCheckSnapshot(
    data,id,accountId,date,principal,value
  ) {
    data.snapshots.push({
      id,
      accountId,
      asOfDate:date,
      recordedAt:date + "T12:00:00.000Z",
      value,
      effectivePrincipal:principal,
      cumulativeInvested:null,
      pnl:null,
      realizedPnlTotal:null,
      memo:""
    });
  }

  function addSaleCheckHolding(
    data,id,accountId,name,wrapper,date,costBasis,value
  ) {
    data.holdings.push({
      id,
      accountId,
      name,
      wrapper,
      asOfDate:date,
      recordedAt:date + "T12:00:00.000Z",
      costBasis,
      value,
      quantity:null,
      averageCost:null,
      memo:""
    });
  }

  function makeStandardSaleCheckData() {
    const data = makeSaleCheckData();
    const accountId = "stock-1";

    addSaleCheckHolding(
      data,"a-0331",accountId,"テスト投信A",
      "NISAつみたて","2026-03-31",300000,330000
    );
    addSaleCheckHolding(
      data,"a-0430",accountId,"テスト投信A",
      "NISAつみたて","2026-04-30",200000,215000
    );
    addSaleCheckHolding(
      data,"a-0531",accountId,"テスト投信A",
      "NISAつみたて","2026-05-31",260000,280000
    );

    addSaleCheckHolding(
      data,"b-0331",accountId,"テスト投信B",
      "特定","2026-03-31",150000,140000
    );
    addSaleCheckHolding(
      data,"b-0430",accountId,"テスト投信B",
      "特定","2026-04-30",100000,93000
    );
    addSaleCheckHolding(
      data,"b-0531",accountId,"テスト投信B",
      "特定","2026-05-31",100000,95000
    );

    addSaleCheckHolding(
      data,"d-0331",accountId,"テスト投信D",
      "特定","2026-03-31",200000,220000
    );
    addSaleCheckHolding(
      data,"d-0430",accountId,"テスト投信D",
      "特定","2026-04-30",200000,190000
    );
    addSaleCheckHolding(
      data,"d-0531",accountId,"テスト投信D",
      "特定","2026-05-31",200000,195000
    );

    addSaleCheckSnapshot(
      data,"s-0331",accountId,"2026-03-31",650000,690000
    );
    addSaleCheckSnapshot(
      data,"s-0430",accountId,"2026-04-30",500000,498000
    );
    addSaleCheckSnapshot(
      data,"s-0531",accountId,"2026-05-31",560000,570000
    );

    return data;
  }

  function findSaleCheckCandidate(result,level,productName) {
    return result.candidates.find(item =>
      item.level === level &&
      item.productName === productName
    ) || null;
  }

  function makeConfirmationInput(overrides = {}) {
    return {
      saleDate:"2026-04-15",
      realizedPnl:20000,
      proceeds:120000,
      source:"取引履歴",
      memo:"",
      ...overrides
    };
  }

  runTest("S13d K1：元本・評価額の両方が減少",() => {
    const data = makeStandardSaleCheckData();
    const before = JSON.stringify(data);
    const result = calculateSaleCheckCandidates(
      data,"2026-06-15"
    );

    assert(result.candidates.length === 3,
      "候補が3件ではありません。");

    assert(result.candidates.every(item =>
      item.toDate === "2026-04-30" &&
      item.gapDays === 30 &&
      item.status === "未確認"
    ),"候補の日付・間隔・状態が一致しません。");

    const a = findSaleCheckCandidate(result,"商品別","テスト投信A");
    const b = findSaleCheckCandidate(result,"商品別","テスト投信B");
    const account = findSaleCheckCandidate(result,"口座全体",null);

    assert(a && a.oldCostBasis === 300000 &&
      a.newCostBasis === 200000 &&
      a.oldValue === 330000 &&
      a.newValue === 215000,
      "テスト投信Aの候補値が一致しません。");

    assert(b && b.oldCostBasis === 150000 &&
      b.newCostBasis === 100000 &&
      b.oldValue === 140000 &&
      b.newValue === 93000,
      "テスト投信Bの候補値が一致しません。");

    assert(account && account.oldCostBasis === 650000 &&
      account.newCostBasis === 500000 &&
      account.oldValue === 690000 &&
      account.newValue === 498000,
      "口座全体の候補値が一致しません。");

    assert(JSON.stringify(data) === before,
      "候補検出によって保存データが変更されました。");
  });

  runTest("S13d K2：評価額だけの減少は候補にしない",() => {
    const data = makeStandardSaleCheckData();
    const result = calculateSaleCheckCandidates(
      data,"2026-06-15"
    );

    assert(!findSaleCheckCandidate(
      result,"商品別","テスト投信D"
    ),"取得額が変わらないDが候補になっています。");
  });

  runTest("S13d K3：再購入で過去候補の状態を変えない",() => {
    const data = makeStandardSaleCheckData();
    const first = calculateSaleCheckCandidates(
      data,"2026-06-15"
    );
    const prior = first.candidates.map(item => ({
      key:getSaleCheckCandidateKey(item),
      status:item.status
    }));

    data.saleChecks.push({
      id:"sale-a",
      accountId:"stock-1",
      level:"商品別",
      productName:"テスト投信A",
      wrapper:"NISAつみたて",
      toDate:"2026-04-30",
      fromDate:"2026-03-31",
      status:"利確確認済み",
      saleDate:"2026-04-15",
      realizedPnl:20000,
      proceeds:120000,
      source:"取引履歴",
      manual:false
    });

    const second = calculateSaleCheckCandidates(
      data,"2026-06-15"
    );

    assert(second.candidates.length === 3,
      "再購入後に候補数が変わりました。");

    const a = findSaleCheckCandidate(
      second,"商品別","テスト投信A"
    );
    assert(a && a.status === "利確確認済み",
      "過去候補の確認状態が保持されていません。");

    assert(a.toDate === "2026-04-30",
      "再購入後の候補日が変わっています。");

    for (const item of second.candidates) {
      const old = prior.find(entry =>
        entry.key === getSaleCheckCandidateKey(item)
      );
      assert(old !== undefined,
        "再購入で新しい候補が発生しています。");
    }
  });

  runTest("S13d K4：利益・損失の確認と参考損益",() => {
    const data = makeStandardSaleCheckData();
    const result = calculateSaleCheckCandidates(
      data,"2026-06-15"
    );
    const a = findSaleCheckCandidate(
      result,"商品別","テスト投信A"
    );
    const b = findSaleCheckCandidate(
      result,"商品別","テスト投信B"
    );

    const aCheck = validateSaleCheckConfirmation(
      data,a,
      makeConfirmationInput({
        saleDate:"2026-04-15",
        realizedPnl:20000,
        proceeds:120000
      })
    );

    const bCheck = validateSaleCheckConfirmation(
      data,b,
      makeConfirmationInput({
        saleDate:"2026-04-20",
        realizedPnl:-8000,
        proceeds:42000
      })
    );

    assert(aCheck.valid && bCheck.valid,
      "AまたはBの確認入力が有効になりません。");

    data.saleChecks.push(
      {...aCheck.record,id:"confirm-a"},
      {...bCheck.record,id:"confirm-b"}
    );

    const totals = calculateSaleCheckReferenceTotals(
      data.saleChecks,"stock-1"
    );

    assert(totals.productTotal === 12000,
      "参考損益が12,000円になっていません。");
    assert(totals.productCount === 2,
      "商品別の確認件数が2件ではありません。");
    assert(totals.accountTotal === 0,
      "口座全体の参考損益に商品別の損益が混入しています。");

    const snapshot = data.snapshots.find(item =>
      item.asOfDate === "2026-04-30"
    );
    assert(snapshot.realizedPnlTotal === null,
      "snapshots.realizedPnlTotal が変更されています。");

    assert(bCheck.record.realizedPnl < 0,
      "Bの損失が負数で保持されていません。");
  });

  runTest("S13d K5：解除済みは参考損益に含めない",() => {
    const data = makeStandardSaleCheckData();
    const result = calculateSaleCheckCandidates(
      data,"2026-06-15"
    );
    const account = findSaleCheckCandidate(
      result,"口座全体",null
    );

    data.saleChecks.push({
      id:"dismiss-account",
      accountId:"stock-1",
      level:"口座全体",
      productName:null,
      wrapper:null,
      toDate:account.toDate,
      fromDate:account.fromDate,
      status:"解除",
      dismissReason:"その他",
      manual:false
    });

    const status = getSaleCheckCandidateStatus(
      account,data.saleChecks
    );

    assert(status.status === "解除済み",
      "解除済みの状態になっていません。");

    data.saleChecks.push(
      {
        id:"confirm-a",
        accountId:"stock-1",
        level:"商品別",
        productName:"テスト投信A",
        wrapper:"NISAつみたて",
        toDate:"2026-04-30",
        fromDate:"2026-03-31",
        status:"利確確認済み",
        realizedPnl:20000,
        saleDate:"2026-04-15",
        source:"取引履歴",
        manual:false
      },
      {
        id:"confirm-b",
        accountId:"stock-1",
        level:"商品別",
        productName:"テスト投信B",
        wrapper:"特定",
        toDate:"2026-04-30",
        fromDate:"2026-03-31",
        status:"利確確認済み",
        realizedPnl:-8000,
        saleDate:"2026-04-20",
        source:"取引履歴",
        manual:false
      }
    );

    const totals = calculateSaleCheckReferenceTotals(
      data.saleChecks,"stock-1"
    );

    assert(totals.productTotal === 12000,
      "解除済みの口座全体記録が商品別合計に影響しています。");
    assert(totals.accountTotal === 0,
      "解除済みの口座全体記録が参考損益に含まれています。");

    const removed = data.saleChecks.filter(item =>
      item.id !== "dismiss-account"
    );
    const reverted = getSaleCheckCandidateStatus(
      account,removed
    );

    assert(reverted.status === "未確認",
      "解除記録を取り消した状態が未確認に戻りません。");
  });

  runTest("S13d K6：確定損益・情報源が必須",() => {
    const data = makeStandardSaleCheckData();
    const result = calculateSaleCheckCandidates(
      data,"2026-06-15"
    );
    const candidate = findSaleCheckCandidate(
      result,"商品別","テスト投信A"
    );

    const missingPnl = validateSaleCheckConfirmation(
      data,candidate,
      makeConfirmationInput({realizedPnl:null})
    );
    const missingSource = validateSaleCheckConfirmation(
      data,candidate,
      makeConfirmationInput({source:""})
    );

    assert(!missingPnl.valid && missingPnl.record === null,
      "確定損益が空欄でも有効になっています。");
    assert(!missingSource.valid && missingSource.record === null,
      "情報源が空欄でも有効になっています。");

    assert(candidate.status === "未確認",
      "入力エラーで候補の状態が変更されています。");
  });

  runTest("S13d K7：366日超の候補を過去に分類",() => {
    const candidate = {
      toDate:"2026-04-30",
      status:"未確認"
    };

    const oldResult = classifyOldSaleCheckCandidates(
      [candidate],"2027-06-15"
    );

    assert(oldResult.old.length === 1 &&
      oldResult.current.length === 0,
      "411日経過の候補が過去に分類されていません。");
    assert(oldResult.old[0].ageDays === 411,
      "経過日数が411日ではありません。");

    const currentResult = classifyOldSaleCheckCandidates(
      [candidate],"2026-06-15"
    );

    assert(currentResult.current.length === 1 &&
      currentResult.old.length === 0,
      "46日経過の候補が現在の候補に分類されていません。");
    assert(currentResult.current[0].ageDays === 46,
      "経過日数が46日ではありません。");
  });

  runTest("S13d K8：商品の消失と入れ替えヒント",() => {
    const data = makeSaleCheckData();
    const accountId = "stock-1";

    addSaleCheckHolding(
      data,"e-0331",accountId,"テスト投信E",
      "特定","2026-03-31",100000,105000
    );
    addSaleCheckHolding(
      data,"f-0430",accountId,"テスト投信F",
      "特定","2026-04-30",100000,100000
    );

    addSaleCheckSnapshot(
      data,"sw-0331",accountId,"2026-03-31",100000,105000
    );
    addSaleCheckSnapshot(
      data,"sw-0430",accountId,"2026-04-30",100000,100000
    );

    const result = calculateSaleCheckCandidates(
      data,"2026-06-15"
    );
    const candidate = findSaleCheckCandidate(
      result,"商品別","テスト投信E"
    );

    assert(result.candidates.length === 1 && candidate,
      "消失したEの候補が1件になっていません。");
    assert(candidate.kind === "disappearance" &&
      candidate.fromDate === "2026-03-31" &&
      candidate.toDate === "2026-04-30" &&
      candidate.gapDays === 30,
      "Eの消失候補の期間が一致しません。");
    assert(candidate.hints.includes("商品の入れ替えの可能性"),
      "商品の入れ替えヒントがありません。");
    assert(!findSaleCheckCandidate(
      result,"口座全体",null
    ),"口座全体の候補が誤って発生しています。");
  });

  runTest("S13d K9：0を数値として比較",() => {
    const data = makeSaleCheckData();
    const accountId = "stock-1";

    addSaleCheckSnapshot(
      data,"zero-0331",accountId,"2026-03-31",100000,105000
    );
    addSaleCheckSnapshot(
      data,"zero-0430",accountId,"2026-04-30",0,0
    );

    const result = calculateSaleCheckCandidates(
      data,"2026-06-15"
    );
    const candidate = findSaleCheckCandidate(
      result,"口座全体",null
    );

    assert(result.candidates.length === 1 && candidate,
      "0への減少が候補になっていません。");
    assert(candidate.oldCostBasis === 100000 &&
      candidate.newCostBasis === 0 &&
      candidate.oldValue === 105000 &&
      candidate.newValue === 0,
      "0が数値として保持されていません。");
  });

  runTest("S13d K10：比較記録不足・null・長い間隔",() => {
    const data = makeSaleCheckData();
    const accountId = "stock-1";

    addSaleCheckHolding(
      data,"one",accountId,"テスト投信G",
      "特定","2026-03-31",100000,100000
    );

    addSaleCheckHolding(
      data,"g-0331",accountId,"テスト投信G",
      "特定","2026-03-31",100000,100000
    );
    addSaleCheckHolding(
      data,"g-0430",accountId,"テスト投信G",
      "特定","2026-04-30",null,90000
    );

    addSaleCheckHolding(
      data,"h-0131",accountId,"テスト投信H",
      "特定","2026-01-31",200000,210000
    );
    addSaleCheckHolding(
      data,"h-0630",accountId,"テスト投信H",
      "特定","2026-06-30",150000,160000
    );

    const result = calculateSaleCheckCandidates(
      data,"2026-07-01"
    );

    assert(result.noComparison.some(item =>
      item.productName === "テスト投信G"
    ),"比較記録が1件だけのGに注意がありません。");

    assert(result.incomparableCount === 1,
      "nullを含む比較不可の件数が1件ではありません。");

    assert(!findSaleCheckCandidate(
      result,"商品別","テスト投信G"
    ),"nullの取得額を0としてGが候補になっています。");

    const h = findSaleCheckCandidate(
      result,"商品別","テスト投信H"
    );

    assert(h && h.gapDays === 150,
      "Hの間隔が150日ではありません。");
    assert(h.gapNote ===
      "間隔が長く、複数回の取引を含む可能性があります",
      "Hの長い間隔の注記がありません。");
  });

  runTest("S13d K11：口座間移動・積立のヒント",() => {
    const data = makeSaleCheckData();
    data.accounts.push({
      id:"stock-2",
      name:"iDeCo",
      category:"stock",
      type:"stock"
    });

    addSaleCheckSnapshot(
      data,"rakuten-0331","stock-1",
      "2026-03-31",100000,105000
    );
    addSaleCheckSnapshot(
      data,"rakuten-0430","stock-1",
      "2026-04-30",50000,52000
    );

    addSaleCheckSnapshot(
      data,"ideco-0331","stock-2",
      "2026-03-31",200000,210000
    );
    addSaleCheckSnapshot(
      data,"ideco-0430","stock-2",
      "2026-04-30",250000,262000
    );

    data.contributions.push({
      id:"contrib-apr",
      accountId:"stock-1",
      productName:null,
      wrapper:null,
      fromMonth:"2026-04",
      toMonth:"2026-04",
      status:"実行",
      cashAmount:30000,
      pointAmount:0
    });

    const result = calculateSaleCheckCandidates(
      data,"2026-06-15"
    );
    const candidate = findSaleCheckCandidate(
      result,"口座全体",null
    );

    assert(candidate,
      "楽天証券の口座全体候補がありません。");
    assert(candidate.hints.includes("口座間の移動の可能性"),
      "口座間の移動ヒントがありません。");
    assert(candidate.hints.includes(
      "積立があるため、実際の売却額は表示の減少より大きい可能性があります"
    ),"積立実行のヒントがありません。");
    assert(candidate.status === "未確認",
      "ヒントによって候補が自動解除されています。");
  });

  runTest("S13d K12：候補なしの利確確認記録",() => {
    const data = makeSaleCheckData();
    const accountId = "stock-1";

    addSaleCheckHolding(
      data,"i-0331",accountId,"テスト投信I",
      "特定","2026-03-31",100000,110000
    );
    addSaleCheckHolding(
      data,"i-0430",accountId,"テスト投信I",
      "特定","2026-04-30",130000,140000
    );

    const result = calculateSaleCheckCandidates(
      data,"2026-06-15"
    );

    assert(result.candidates.length === 0,
      "元本が増加したIが候補になっています。");

    const manualTarget = {
      accountId,
      level:"商品別",
      productName:"テスト投信I",
      wrapper:"特定",
      manual:true
    };

    const checked = validateSaleCheckConfirmation(
      data,
      manualTarget,
      makeConfirmationInput({
        saleDate:"2026-04-10",
        realizedPnl:5000,
        proceeds:null,
        source:"実現損益の画面"
      })
    );

    assert(checked.valid && checked.record,
      "候補なしの利確確認を記録できません。");
    assert(checked.record.manual === true &&
      checked.record.toDate === "2026-04-10" &&
      checked.record.fromDate === null,
      "候補なし記録のmanual・日付が正しくありません。");

    const status = getSaleCheckRecordStatus(checked.record);
    assert(status === "利確確認済み（候補なし）",
      "候補なし記録の状態表示が正しくありません。");

    assert(result.candidates.length === 0,
      "候補なしの記録によって候補件数が増えています。");
  });

  runTest("S13d K13：一部の商品だけを入力した日は注意表示",() => {
    const data = makeSaleCheckData();
    const accountId = "stock-1";

    addSaleCheckHolding(
      data,"a-0331",accountId,"テスト投信A",
      "特定","2026-03-31",200000,210000
    );
    addSaleCheckHolding(
      data,"b-0331",accountId,"テスト投信B",
      "特定","2026-03-31",100000,105000
    );
    addSaleCheckHolding(
      data,"b-0430",accountId,"テスト投信B",
      "特定","2026-04-30",100000,106000
    );

    addSaleCheckSnapshot(
      data,"sp-0331",accountId,"2026-03-31",300000,315000
    );
    addSaleCheckSnapshot(
      data,"sp-0430",accountId,"2026-04-30",300000,316000
    );

    const result = calculateSaleCheckCandidates(
      data,"2026-06-15"
    );

    assert(result.candidates.length === 0,
      "記録不足の日に候補が発生しています。");
    assert(result.warnings.length === 1,
      "記録不足の注意表示が1件ではありません。");
    assert(result.warnings[0].message ===
      "テスト投信Aの記録が 2026-04-30 にありません（入力漏れの可能性）",
      "記録不足の注意文が一致しません。");
  });

  runTest("S13d K14：口座全体の履歴がない日は注意表示",() => {
    const data = makeSaleCheckData();
    const accountId = "stock-1";

    addSaleCheckHolding(
      data,"e-0331",accountId,"テスト投信E",
      "特定","2026-03-31",100000,105000
    );
    addSaleCheckHolding(
      data,"f-0430",accountId,"テスト投信F",
      "特定","2026-04-30",100000,100000
    );

    addSaleCheckSnapshot(
      data,"sw-0331",accountId,"2026-03-31",100000,105000
    );

    const result = calculateSaleCheckCandidates(
      data,"2026-06-15"
    );

    assert(result.candidates.length === 0,
      "口座全体の履歴がない日に消失候補が発生しています。");
    assert(result.warnings.length === 1,
      "口座全体の履歴がない日の注意表示がありません。");
    assert(result.warnings[0].message ===
      "テスト投信Eの記録が 2026-04-30 にありません（入力漏れの可能性）",
      "K14の注意文が一致しません。");
  });

  runTest("S13d K15：5%境界は含み、超過は含まない",() => {
    function makeBoundaryData(totalAssets) {
      const data = makeSaleCheckData();
      const accountId = "stock-1";

      addSaleCheckHolding(
        data,"j-0331",accountId,"テスト投信J",
        "特定","2026-03-31",100000,100000
      );
      addSaleCheckHolding(
        data,"k-0331",accountId,"テスト投信K",
        "特定","2026-03-31",950000,950000
      );
      addSaleCheckHolding(
        data,"k-0430",accountId,"テスト投信K",
        "特定","2026-04-30",950000,950000
      );

      addSaleCheckSnapshot(
        data,"sj-0331",accountId,"2026-03-31",1050000,1050000
      );
      addSaleCheckSnapshot(
        data,"sj-0430",accountId,"2026-04-30",1050000,totalAssets
      );

      return data;
    }

    const within = calculateSaleCheckCandidates(
      makeBoundaryData(1000000),"2026-06-15"
    );

    assert(within.candidates.length === 1 &&
      findSaleCheckCandidate(within,"商品別","テスト投信J"),
      "差50,000円（総資産の5%）が候補になっていません。");

    const outside = calculateSaleCheckCandidates(
      makeBoundaryData(1000001),"2026-06-15"
    );

    assert(outside.candidates.length === 0,
      "差50,001円が許容範囲内として扱われています。");
    assert(outside.warnings.length === 1,
      "5%超過時の注意表示がありません。");
  });

  runTest("S13d 参考損益：商品別と口座全体を分ける",() => {
    const records = [
      {
        accountId:"stock-1",
        level:"商品別",
        status:"利確確認済み",
        realizedPnl:20000
      },
      {
        accountId:"stock-1",
        level:"商品別",
        status:"利確確認済み",
        realizedPnl:-8000
      },
      {
        accountId:"stock-1",
        level:"口座全体",
        status:"利確確認済み",
        realizedPnl:5000
      },
      {
        accountId:"stock-1",
        level:"口座全体",
        status:"解除",
        realizedPnl:9000
      },
      {
        accountId:"stock-2",
        level:"商品別",
        status:"利確確認済み",
        realizedPnl:100000
      }
    ];

    const totals = calculateSaleCheckReferenceTotals(
      records,"stock-1"
    );

    assert(totals.productTotal === 12000 &&
      totals.productCount === 2,
      "商品別参考損益が正しく集計されていません。");
    assert(totals.accountTotal === 5000 &&
      totals.accountCount === 1,
      "口座全体参考損益が正しく集計されていません。");
  });

  runTest("S13d 確認入力：売却日範囲外は警告のみ",() => {
    const data = makeStandardSaleCheckData();
    const result = calculateSaleCheckCandidates(
      data,"2026-06-15"
    );
    const candidate = findSaleCheckCandidate(
      result,"商品別","テスト投信A"
    );

    const checked = validateSaleCheckConfirmation(
      data,
      candidate,
      makeConfirmationInput({
        saleDate:"2026-05-10"
      })
    );

    assert(checked.valid,
      "期間外の日付だけで入力が無効になっています。");
    assert(checked.warnings.includes(
      "売却日が候補の対象期間外です。"
    ),"期間外の日付の警告がありません。");
  });

  runTest("S13d 確認入力：口座全体と商品別の二重計上警告",() => {
    const data = makeStandardSaleCheckData();
    const result = calculateSaleCheckCandidates(
      data,"2026-06-15"
    );
    const accountCandidate = findSaleCheckCandidate(
      result,"口座全体",null
    );

    data.saleChecks.push({
      id:"product-confirmed",
      accountId:"stock-1",
      level:"商品別",
      productName:"テスト投信A",
      wrapper:"NISAつみたて",
      toDate:"2026-04-30",
      fromDate:"2026-03-31",
      status:"利確確認済み",
      saleDate:"2026-04-15",
      realizedPnl:20000,
      source:"取引履歴",
      manual:false
    });

    const checked = validateSaleCheckConfirmation(
      data,
      accountCandidate,
      makeConfirmationInput()
    );

    assert(checked.valid,
      "二重計上の警告だけで入力が無効になっています。");
    assert(checked.warnings.some(message =>
      message.includes("二重計上の可能性")
    ),"二重計上の警告がありません。");
  });
}
