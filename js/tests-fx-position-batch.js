function registerFxPositionBatchTests(context) {
  const {runTest,assert,makeAccount} = context;

  function makePosition(
    id,pair = "TRY/JPY",side = "買",quantity = 100000,swap = 1000
  ) {
    return {
      id,
      accountId:"fx-batch-test",
      pair,
      side,
      openDate:"2026-10-01",
      asOfDate:"2026-11-05",
      quantity,
      openRate:3.2,
      swap,
      status:"保有中",
      closeDate:null,
      closeRate:null,
      realizedPnl:null,
      recordedAt:"2026-10-01T00:00:00.000Z",
      createdAt:"2026-10-01T00:00:00.000Z",
      updatedAt:"2026-11-05T00:00:00.000Z"
    };
  }

  function makeData(positions = [makePosition("L1")]) {
    return {
      accounts:[makeAccount("fx-batch-test","架空FX口座","fx","fx")],
      fxPositions:positions,
      fxRates:[],
      fxSwapLedger:[]
    };
  }

  function makeRow(position,overrides = {}) {
    return {
      id:position.id,
      _rowKey:"row-" + position.id,
      openDate:position.openDate,
      pair:position.pair,
      side:position.side,
      quantity:String(position.quantity),
      openRate:String(position.openRate),
      swap:position.swap === null ? "" : String(position.swap),
      ...overrides
    };
  }

  runTest("14-5 建玉一括編集の正常行検証",() => {
    const data = makeData();
    const result = validateFxPositionBatchRows(
      data,"fx-batch-test","TRY/JPY","買",
      [makeRow(data.fxPositions[0])]
    );
    assert(result.valid && result.errors.length === 0,
      "正しい建玉行はエラーなしで検証を通過する必要があります。");
  });

  runTest("14-5 建玉一括編集の入力エラー検出",() => {
    const data = makeData();
    const invalid = makeRow(data.fxPositions[0],{
      openDate:"2026-02-30",
      pair:"try/jpy",
      side:"保有",
      quantity:"0",
      openRate:"0",
      swap:"abc"
    });
    const result = validateFxPositionBatchRows(
      data,"fx-batch-test","TRY/JPY","買",[invalid]
    );
    const fields = new Set(result.errors.map(item => item.field));
    assert(!result.valid &&
      ["openDate","pair","side","quantity","openRate","swap"]
        .every(field => fields.has(field)),
      "約定日・通貨ペア・売買方向・数量・約定レート・スワップの各エラーを検出する必要があります。");
  });

  runTest("14-5 既存建玉の複数項目編集と手動スワップ修正",() => {
    const original = makePosition("L1");
    const data = makeData([original]);
    const next = buildFxPositionBatchData(
      data,"fx-batch-test","TRY/JPY","買",
      [makeRow(original,{
        openDate:"2026-10-02",
        quantity:"150000",
        openRate:"3.25",
        swap:"1250"
      })],[],{
        now:"2026-11-15T00:00:00.000Z",
        asOfDate:"2026-11-15",
        idFactory:() => "unused-id"
      }
    );
    const updated = next.fxPositions[0];
    assert(updated.openDate === "2026-10-02" &&
      updated.quantity === 150000 &&
      updated.openRate === 3.25 &&
      updated.swap === 1250,
      "編集した約定日・数量・約定レート・累計スワップを反映する必要があります。");
    assert(next.fxSwapLedger.length === 0,
      "累計スワップの手動修正だけでは調整を記録してはいけません。");
    assert(original.openDate === "2026-10-01" &&
      original.quantity === 100000 && original.swap === 1000,
      "変更前の元データを変更してはいけません。");
  });

  runTest("14-5 建玉の追加・削除とスワップ調整",() => {
    const first = makePosition("L1","TRY/JPY","買",100000,1000);
    const second = makePosition("L2","TRY/JPY","買",50000,700);
    const data = makeData([first,second]);
    const next = buildFxPositionBatchData(
      data,"fx-batch-test","TRY/JPY","買",
      [
        makeRow(first),
        {
          _rowKey:"new-row-1",
          openDate:"2026-11-10",
          pair:"USD/JPY",
          side:"買",
          quantity:"20000",
          openRate:"155.5",
          swap:"500"
        }
      ],["L2"],{
        now:"2026-11-15T00:00:00.000Z",
        asOfDate:"2026-11-15",
        idFactory:(() => {
          let index = 0;
          return () => "batch-id-" + (++index);
        })()
      }
    );
    const added = next.fxPositions.find(item => item.id === "batch-id-2");
    const deletedAdjustment = next.fxSwapLedger.find(item =>
      item.reason === "削除"
    );
    const addedAdjustment = next.fxSwapLedger.find(item =>
      item.reason === "追加"
    );
    assert(next.fxPositions.length === 2 &&
      !next.fxPositions.some(item => item.id === "L2") &&
      added && added.pair === "USD/JPY" && added.quantity === 20000,
      "削除した建玉を除き、新規建玉を1件追加する必要があります。");
    assert(deletedAdjustment && deletedAdjustment.amount === -700 &&
      deletedAdjustment.pair === "TRY/JPY" &&
      addedAdjustment && addedAdjustment.amount === 500 &&
      addedAdjustment.pair === "USD/JPY",
      "削除−700円、新規追加＋500円の調整を記録する必要があります。");
    assert(next.fxRates.some(item =>
      item.accountId === "fx-batch-test" &&
      item.pair === "USD/JPY" && item.rate === null
    ),"新しい通貨ペアの評価レートをnullで追加する必要があります。");
    assert(data.fxPositions.length === 2 && data.fxSwapLedger.length === 0,
      "追加・削除時も元データを変更してはいけません。");
  });

  runTest("14-5 通貨ペア・売買方向の移動調整",() => {
    const original = makePosition("L1","TRY/JPY","買",100000,900);
    const data = makeData([original]);
    const next = buildFxPositionBatchData(
      data,"fx-batch-test","TRY/JPY","買",
      [makeRow(original,{pair:"USD/JPY",side:"売"})],[],{
        now:"2026-11-15T00:00:00.000Z",
        asOfDate:"2026-11-15",
        idFactory:(() => {
          let index = 0;
          return () => "move-id-" + (++index);
        })()
      }
    );
    const oldAdjustment = next.fxSwapLedger.find(item =>
      item.pair === "TRY/JPY"
    );
    const newAdjustment = next.fxSwapLedger.find(item =>
      item.pair === "USD/JPY"
    );
    assert(next.fxPositions[0].pair === "USD/JPY" &&
      next.fxPositions[0].side === "売",
      "建玉の通貨ペア・売買方向を変更する必要があります。");
    assert(oldAdjustment && oldAdjustment.amount === -900 &&
      newAdjustment && newAdjustment.amount === 900 &&
      oldAdjustment.reason === "移動" &&
      newAdjustment.reason === "移動",
      "移動元−900円・移動先＋900円の調整を記録する必要があります。");
    assert(next.fxRates.some(item => item.pair === "USD/JPY"),
      "移動先の通貨ペアを評価レート一覧に追加する必要があります。");
  });

  runTest("14-5 一括保存の検証失敗時に元データを保護",() => {
    const original = makePosition("L1");
    const data = makeData([original]);
    let failed = false;
    try {
      buildFxPositionBatchData(
        data,"fx-batch-test","TRY/JPY","買",
        [makeRow(original,{quantity:"-1",swap:"2500"})],[],{
          idFactory:() => "must-not-be-used"
        }
      );
    } catch (error) {
      failed = true;
    }
    assert(failed,"不正な数量を含む一括編集は保存用データを作成せずエラーにする必要があります。");
    assert(data.fxPositions.length === 1 &&
      data.fxPositions[0].quantity === 100000 &&
      data.fxPositions[0].swap === 1000 &&
      data.fxSwapLedger.length === 0 &&
      data.fxRates.length === 0,
      "検証失敗時に元データを変更してはいけません。");
  });

  runTest("14-5 決済済みの読み取り専用行を変更しない",() => {
    const open = makePosition("L1");
    const settled = {
      ...makePosition("L2"),
      status:"決済済",
      closeDate:"2026-11-01",
      closeRate:3.3,
      realizedPnl:500
    };
    const data = makeData([open,settled]);
    const next = buildFxPositionBatchData(
      data,"fx-batch-test","TRY/JPY","買",
      [
        makeRow(open),
        {
          ...makeRow(settled),
          readOnly:true,
          quantity:"999999",
          swap:"999999"
        }
      ],[],{
        now:"2026-11-15T00:00:00.000Z",
        asOfDate:"2026-11-15",
        idFactory:() => "unused-id"
      }
    );
    const result = next.fxPositions.find(item => item.id === "L2");
    assert(result.quantity === 100000 && result.swap === 1000 &&
      result.status === "決済済" && result.realizedPnl === 500,
      "決済済みの読み取り専用行は変更せず保持する必要があります。");
  });
}
