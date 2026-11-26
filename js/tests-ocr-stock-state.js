
"use strict";

/* ---------- S11b追補C：snapshot・候補状態テスト ---------- */

function registerStockOcrStateTests(context) {
  const {assert,runTest} = context;

  function makeStockOcrStateCardStock(overrides = {}) {
    return {
      name:"架空インデックスファンド",
      wrapper:"NISA成長",
      kind:"投信",
      value:1234567,
      pnl:123456,
      costBasis:1111111,
      quantity:null,
      rate:null,
      status:"recognized",
      selected:true,
      duplicate:false,
      batchDuplicate:false,
      fields:{
        name:{value:"架空インデックスファンド",status:"recognized"},
        wrapper:{value:"NISA成長",status:"recognized"},
        kind:{value:"投信",status:"recognized"},
        value:{value:1234567,status:"recognized"},
        pnl:{value:123456,status:"recognized"},
        costBasis:{value:1111111,status:"calculated"}
      },
      reasons:[],
      ...overrides
    };
  }

  function makeStockOcrStateDataStock(accountName) {
    const data = createInitialData();
    const account = data.accounts.find(item =>
      item.name === accountName &&
      item.category === "stock"
    );
    assert(account !== undefined,
      accountName + " の株式口座がありません。");
    return {data,account};
  }

  function makeStockOcrStateStorageStock(data,failOnMainWrite = false) {
    const values = new Map([
      [STORAGE_KEY,JSON.stringify(data)]
    ]);
    const storage = {
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key,value) {
        if (failOnMainWrite && key === STORAGE_KEY) {
          throw new Error("保存失敗テスト");
        }
        values.set(key,String(value));
      }
    };
    return {storage,values};
  }

  function makeStockOcrStateIdFactoryStock() {
    let count = 0;
    return () => "fictional-stock-ocr-" + (++count);
  }

  function getStockOcrStateAccountCasesStock() {
    return [
      {
        name:"楽天証券",
        wrapper:"NISA成長",
        kind:"投信"
      },
      {
        name:"iDeCo",
        wrapper:"iDeCo",
        kind:"投信"
      },
      {
        name:"企業型DC",
        wrapper:"企業型DC",
        kind:"投信"
      }
    ];
  }

  runTest("S11b追補C：snapshot①〜⑨・3口座の自動合計",() => {
    for (const item of getStockOcrStateAccountCasesStock()) {
      const {data,account} =
        makeStockOcrStateDataStock(item.name);
      const cards = [
        makeStockOcrStateCardStock({
          wrapper:item.wrapper,
          kind:item.kind,
          value:6400000,
          costBasis:6000000,
          pnl:400000
        }),
        makeStockOcrStateCardStock({
          name:"架空バランスファンド",
          wrapper:item.wrapper,
          kind:item.kind,
          value:20000,
          costBasis:18000,
          pnl:2000
        })
      ];

      const state = stockOcrBuildAccountSnapshotStateStock(
        data,account.id,"2026-11-26",cards
      );

      assert(state.canAutoFill,
        item.name + " の全確定カードで自動入力できません。");
      assert(state.autoValue === 6420000,
        item.name + " の評価額合計が6420000円ではありません。");

      const built = stockOcrBuildAccountSnapshotStock(
        data,account.id,"2026-11-26",cards,{
          id:"fictional-snapshot-" + item.name,
          recordedAt:"2026-11-26T10:00:00.000Z"
        }
      );

      assert(built.eligible,
        item.name + " のsnapshotを生成できません。");
      assert(built.snapshot.value === 6420000,
        item.name + " のsnapshot評価額が一致しません。");
      assert(built.snapshot.effectivePrincipal === 6018000,
        item.name + " の有効元本合計が一致しません。");
      assert(built.snapshot.pnl === 402000,
        item.name + " の評価損益合計が一致しません。");
      assert(built.snapshot.memo === "",
        item.name + " のmemoが空ではありません。");
      assert(!Object.prototype.hasOwnProperty.call(
        built.snapshot,"source"
      ),item.name + " のsnapshotに出所が追加されています。");
    }
  });

  runTest("S11b追補C：snapshot③・未確定カードでは自動入力しない",() => {
    const {data,account} =
      makeStockOcrStateDataStock("楽天証券");
    const cards = [
      makeStockOcrStateCardStock(),
      makeStockOcrStateCardStock({
        status:"needs-confirmation",
        value:null
      })
    ];

    const state = stockOcrBuildAccountSnapshotStateStock(
      data,account.id,"2026-11-26",cards
    );

    assert(!state.canAutoFill,
      "未確定カードがあるのに自動入力可能になっています。");
    assert(state.autoValue === null,
      "未確定カードを含む合計が自動入力されています。");
  });

  runTest("S11b追補C：snapshot④・保存対象を外した場合",() => {
    const {data,account} =
      makeStockOcrStateDataStock("楽天証券");
    const cards = [
      makeStockOcrStateCardStock(),
      makeStockOcrStateCardStock({
        name:"架空除外ファンド",
        selected:false
      })
    ];

    const state = stockOcrBuildAccountSnapshotStateStock(
      data,account.id,"2026-11-26",cards
    );

    assert(!state.canAutoFill,
      "保存対象を外したカードがあるのに自動入力可能です。");
    assert(state.autoValue === null,
      "保存対象を外したカードを含む合計が返されています。");
  });

  runTest("S11b追補C：snapshot・対象日なしでは自動入力しない",() => {
    const {data,account} =
      makeStockOcrStateDataStock("楽天証券");
    const state = stockOcrBuildAccountSnapshotStateStock(
      data,account.id,"",[
        makeStockOcrStateCardStock()
      ]
    );

    assert(!state.canAutoFill,
      "対象日がないのに自動入力可能になっています。");
    assert(state.autoValue === null,
      "対象日がないのに評価額が返されています。");
  });

  runTest("S11b追補C：snapshot・手入力値は条件未達でも生成可能",() => {
    const {data,account} =
      makeStockOcrStateDataStock("楽天証券");
    const cards = [
      makeStockOcrStateCardStock({
        status:"needs-confirmation",
        value:null
      })
    ];

    const built = stockOcrBuildAccountSnapshotStock(
      data,account.id,"2026-11-26",cards,{
        id:"fictional-manual-snapshot",
        recordedAt:"2026-11-26T10:00:00.000Z",
        value:6400000
      }
    );

    assert(built.eligible,
      "手入力値によるsnapshotが生成できません。");
    assert(built.snapshot.value === 6400000,
      "手入力した評価額が保存値になっていません。");
    assert(built.snapshot.effectivePrincipal === null,
      "条件未達なのに有効元本が自動計算されています。");
    assert(built.snapshot.pnl === null,
      "条件未達なのに評価損益が自動計算されています。");
  });

  runTest("S11b追補C：snapshot①・同日履歴を追加し既存値を保持",() => {
    const {data,account} =
      makeStockOcrStateDataStock("楽天証券");
    const oldSnapshot = {
      id:"fictional-old-snapshot",
      accountId:account.id,
      asOfDate:"2026-11-26",
      recordedAt:"2026-11-26T09:00:00.000Z",
      value:6400000,
      cash:null,
      pnl:null,
      principal:null,
      cumulativeInvested:null,
      effectivePrincipal:null,
      realizedPnlTotal:null,
      realizedPnlDaily:null,
      swapTotal:null,
      requiredMargin:null,
      memo:""
    };
    data.snapshots.push(oldSnapshot);

    const {storage,values} =
      makeStockOcrStateStorageStock(data);
    const cards = [
      makeStockOcrStateCardStock({
        value:6420000,
        costBasis:6000000,
        pnl:420000
      })
    ];

    const result = saveStockOcrImportStock(
      account.id,"2026-11-26",cards,{
        storage,
        addAccountSnapshot:true,
        recordedAt:"2026-11-26T10:00:00.000Z",
        idFactory:makeStockOcrStateIdFactoryStock()
      }
    );

    const saved = JSON.parse(values.get(STORAGE_KEY));
    const sameDate = saved.snapshots.filter(snapshot =>
      snapshot.accountId === account.id &&
      snapshot.asOfDate === "2026-11-26"
    );
    const latest = getAccountSnapshots(
      saved,account.id
    ).find(snapshot => snapshot.asOfDate === "2026-11-26");

    assert(result.addedSnapshot,
      "口座全体snapshotが追加されていません。");
    assert(sameDate.length === 2,
      "同日のsnapshotが2件残っていません。");
    assert(sameDate.some(snapshot =>
      snapshot.id === oldSnapshot.id &&
      snapshot.value === 6400000
    ),"先のsnapshotが変更されています。");
    assert(latest && latest.value === 6420000,
      "後から登録したsnapshotが採用されていません。");
  });

  runTest("S11b追補C：snapshot⑧・保存失敗時に本体データを変更しない",() => {
    const {data,account} =
      makeStockOcrStateDataStock("楽天証券");
    const before = JSON.stringify(data);
    const {storage,values} =
      makeStockOcrStateStorageStock(data,true);

    let failed = false;
    try {
      saveStockOcrImportStock(
        account.id,"2026-11-26",[
          makeStockOcrStateCardStock()
        ],{
          storage,
          addAccountSnapshot:true,
          recordedAt:"2026-11-26T10:00:00.000Z",
          idFactory:makeStockOcrStateIdFactoryStock()
        }
      );
    } catch (error) {
      failed = true;
    }

    assert(failed,"保存失敗を検出できません。");
    assert(values.get(STORAGE_KEY) === before,
      "保存失敗で本体データが変更されています。");
    assert(values.has("pam2_pre_holdocr"),
      "保存前バックアップが作成されていません。");
    assert(values.get("pam2_pre_holdocr") === before,
      "保存前バックアップの内容が一致しません。");
  });

  runTest("S11b追補C：snapshot⑨・チェックを外すと追加しない",() => {
    const {data,account} =
      makeStockOcrStateDataStock("楽天証券");
    const {storage,values} =
      makeStockOcrStateStorageStock(data);
    const before = JSON.parse(values.get(STORAGE_KEY));

    const result = saveStockOcrImportStock(
      account.id,"2026-11-26",[
        makeStockOcrStateCardStock()
      ],{
        storage,
        addAccountSnapshot:false,
        recordedAt:"2026-11-26T10:00:00.000Z",
        idFactory:makeStockOcrStateIdFactoryStock()
      }
    );

    const saved = JSON.parse(values.get(STORAGE_KEY));
    assert(!result.addedSnapshot,
      "チェックを外したのにsnapshotが追加されています。");
    assert(saved.snapshots.length === before.snapshots.length,
      "チェックを外したのにsnapshotsが増えています。");
  });

  runTest("S11b追補C：候補①・評価額と評価損益の候補を選択",() => {
    const card = makeStockOcrStateCardStock({
      status:"needs-confirmation",
      value:null,
      pnl:null,
      costBasis:null,
      fields:{
        name:{value:"架空インデックスファンド",status:"recognized"},
        wrapper:{value:"NISA成長",status:"recognized"},
        kind:{value:"投信",status:"recognized"},
        value:{value:null,status:"multiple"},
        pnl:{value:null,status:"multiple"},
        costBasis:{value:null,status:"missing"}
      },
      reasons:[
        "評価額と評価損益の組み合わせが複数あります。候補を確認してください。"
      ],
      amountCandidates:[
        {value:1234567,original:"1,234,567円"},
        {value:1284567,original:"1,284,567円"},
        {value:123456,original:"+123,456円"},
        {value:128456,original:"+128,456円"}
      ],
      candidatePairs:[
        {
          valueOriginal:"1,234,567円",
          pnlOriginal:"+123,456円",
          expectedRate:11.11,
          signInferred:false
        },
        {
          valueOriginal:"1,284,567円",
          pnlOriginal:"+128,456円",
          expectedRate:11.11,
          signInferred:false
        }
      ]
    });

    const options = stockOcrGetCandidateOptionsStateStock(
      card,"amountPair"
    );
    assert(options.length === 2,
      "金額候補が2件表示される状態ではありません。");

    const selected = stockOcrSelectCandidateStateStock(
      card,"amountPair",0
    );

    assert(selected.value === 1234567,
      "選択した評価額が反映されていません。");
    assert(selected.pnl === 123456,
      "選択した評価損益が反映されていません。");
    assert(selected.costBasis === 1111111,
      "取得額が評価額－評価損益になっていません。");
    assert(selected.candidateSelections.amountPair !== undefined,
      "選択状態が保持されていません。");
    assert(selected.status === "recognized",
      "整合する候補が確定扱いになっていません。");
    assert(card.value === null,
      "候補選択で元のカードが変更されています。");
  });

  runTest("S11b追補C：候補②・別候補の押し直し",() => {
    const card = makeStockOcrStateCardStock({
      status:"needs-confirmation",
      value:null,
      pnl:null,
      costBasis:null,
      fields:{
        name:{value:"架空インデックスファンド",status:"recognized"},
        wrapper:{value:"NISA成長",status:"recognized"},
        kind:{value:"投信",status:"recognized"},
        value:{value:null,status:"multiple"},
        pnl:{value:null,status:"multiple"},
        costBasis:{value:null,status:"missing"}
      },
      reasons:[
        "評価額と評価損益の組み合わせが複数あります。候補を確認してください。"
      ],
      amountCandidates:[
        {value:1234567,original:"1,234,567円"},
        {value:1284567,original:"1,284,567円"},
        {value:123456,original:"+123,456円"},
        {value:128456,original:"+128,456円"}
      ],
      candidatePairs:[
        {
          valueOriginal:"1,234,567円",
          pnlOriginal:"+123,456円",
          expectedRate:11.11,
          signInferred:false
        },
        {
          valueOriginal:"1,284,567円",
          pnlOriginal:"+128,456円",
          expectedRate:11.11,
          signInferred:false
        }
      ]
    });

    const first = stockOcrSelectCandidateStateStock(
      card,"amountPair",0
    );
    const second = stockOcrSelectCandidateStateStock(
      first,"amountPair",1
    );

    assert(second.value === 1284567,
      "押し直した候補の評価額が反映されていません。");
    assert(second.pnl === 128456,
      "押し直した候補の評価損益が反映されていません。");
  });

  runTest("S11b追補C：候補②・選択解除で要確認に戻る",() => {
    const card = makeStockOcrStateCardStock({
      status:"needs-confirmation",
      value:null,
      pnl:null,
      costBasis:null,
      fields:{
        name:{value:"架空インデックスファンド",status:"recognized"},
        wrapper:{value:"NISA成長",status:"recognized"},
        kind:{value:"投信",status:"recognized"},
        value:{value:null,status:"multiple"},
        pnl:{value:null,status:"multiple"},
        costBasis:{value:null,status:"missing"}
      },
      reasons:[
        "評価額と評価損益の組み合わせが複数あります。候補を確認してください。"
      ],
      amountCandidates:[
        {value:1234567,original:"1,234,567円"},
        {value:123456,original:"+123,456円"}
      ],
      candidatePairs:[
        {
          valueOriginal:"1,234,567円",
          pnlOriginal:"+123,456円",
          expectedRate:11.11,
          signInferred:false
        }
      ]
    });

    const selected = stockOcrSelectCandidateStateStock(
      card,"amountPair",0
    );
    const cleared = stockOcrClearCandidateStateStock(
      selected,"amountPair"
    );

    assert(cleared.value === null,
      "解除後も候補評価額が残っています。");
    assert(cleared.pnl === null,
      "解除後も候補評価損益が残っています。");
    assert(!cleared.candidateSelections,
      "解除後も候補選択状態が残っています。");
    assert(cleared.status === "needs-confirmation",
      "解除後に要確認へ戻っていません。");
  });

  runTest("S11b追補C：候補③・候補がない項目は選択肢なし",() => {
    const card = makeStockOcrStateCardStock({
      nameCandidates:[],
      wrapperCandidates:[]
    });

    assert(stockOcrGetCandidateOptionsStateStock(
      card,"name"
    ).length === 0,
    "商品名候補がないのに候補が生成されています。");
    assert(stockOcrGetCandidateOptionsStateStock(
      card,"wrapper"
    ).length === 0,
    "wrapper候補がないのに候補が生成されています。");
  });

  runTest("S11b追補C：候補⑤・商品名候補の選択と解除",() => {
    const card = makeStockOcrStateCardStock({
      status:"needs-confirmation",
      name:null,
      fields:{
        name:{value:null,status:"multiple"},
        wrapper:{value:"NISA成長",status:"recognized"},
        kind:{value:"投信",status:"recognized"},
        value:{value:1234567,status:"recognized"},
        pnl:{value:123456,status:"recognized"},
        costBasis:{value:1111111,status:"calculated"}
      },
      reasons:["商品名を確定できません。"],
      nameCandidates:[
        "架空インデックスファンド",
        "架空バランスファンド"
      ]
    });

    const options = stockOcrGetCandidateOptionsStateStock(
      card,"name"
    );
    assert(options.length === 2,
      "商品名候補が2件取得できていません。");

    const selected = stockOcrSelectCandidateStateStock(
      card,"name",1
    );
    assert(selected.name === "架空バランスファンド",
      "選択した商品名が反映されていません。");
    assert(selected.status === "recognized",
      "商品名の選択後に確定扱いになっていません。");

    const cleared = stockOcrClearCandidateStateStock(
      selected,"name"
    );
    assert(cleared.name === null,
      "商品名候補の解除で元の値に戻っていません。");
    assert(cleared.status === "needs-confirmation",
      "商品名候補の解除後に要確認へ戻っていません。");
  });

  runTest("S11b追補C：候補⑤・wrapper候補の選択と解除",() => {
    const card = makeStockOcrStateCardStock({
      status:"needs-confirmation",
      wrapper:null,
      fields:{
        name:{value:"架空インデックスファンド",status:"recognized"},
        wrapper:{value:null,status:"multiple"},
        kind:{value:"投信",status:"recognized"},
        value:{value:1234567,status:"recognized"},
        pnl:{value:123456,status:"recognized"},
        costBasis:{value:1111111,status:"calculated"}
      },
      reasons:["wrapperを確定できません。"],
      wrapperCandidates:["NISA成長","特定"]
    });

    const selected = stockOcrSelectCandidateStateStock(
      card,"wrapper",1
    );
    assert(selected.wrapper === "特定",
      "選択したwrapperが反映されていません。");

    const cleared = stockOcrClearCandidateStateStock(
      selected,"wrapper"
    );
    assert(cleared.wrapper === null,
      "wrapper候補の解除で元の値に戻っていません。");
    assert(cleared.status === "needs-confirmation",
      "wrapper候補の解除後に要確認へ戻っていません。");
  });

  runTest("S11b追補C：候補④・整合検査不一致は確定しない",() => {
    const card = makeStockOcrStateCardStock({
      status:"needs-confirmation",
      value:null,
      pnl:null,
      costBasis:null,
      rate:0,
      fields:{
        name:{value:"架空インデックスファンド",status:"recognized"},
        wrapper:{value:"NISA成長",status:"recognized"},
        kind:{value:"投信",status:"recognized"},
        value:{value:null,status:"multiple"},
        pnl:{value:null,status:"multiple"},
        costBasis:{value:null,status:"missing"}
      },
      reasons:[
        "評価額と評価損益の組み合わせが複数あります。候補を確認してください。"
      ],
      amountCandidates:[
        {value:1234567,original:"1,234,567円"},
        {value:123456,original:"+123,456円"}
      ],
      candidatePairs:[
        {
          valueOriginal:"1,234,567円",
          pnlOriginal:"+123,456円",
          expectedRate:11.11,
          signInferred:false
        }
      ]
    });

    const selected = stockOcrSelectCandidateStateStock(
      card,"amountPair",0
    );

    assert(selected.status === "needs-confirmation",
      "整合検査に失敗する候補が確定扱いになっています。");
    assert(selected.reasons.length > 0,
      "整合検査の不一致理由が残っていません。");
  });

  runTest("S11b追補C：候補⑥・再解析時の選択リセット",() => {
    const card = makeStockOcrStateCardStock({
      candidateSelections:{
        name:{value:"架空インデックスファンド",label:"架空インデックスファンド"}
      },
      candidateOriginals:{
        name:null,
        wrapper:"NISA成長",
        value:1234567,
        pnl:123456,
        costBasis:1111111,
        costBasisSource:"value-minus-pnl",
        fields:{
          name:{value:null,status:"multiple"},
          wrapper:{value:"NISA成長",status:"recognized"},
          kind:{value:"投信",status:"recognized"},
          value:{value:1234567,status:"recognized"},
          pnl:{value:123456,status:"recognized"},
          costBasis:{value:1111111,status:"calculated"}
        },
        reasons:["商品名を確定できません。"]
      });

    const reset = stockOcrResetCandidateStateStock(card);

    assert(!reset.candidateSelections,
      "再解析相当のリセット後も選択状態が残っています。");
    assert(!reset.candidateOriginals,
      "再解析相当のリセット後も選択前データが残っています。");
    assert(reset.name === null,
      "再解析相当のリセットで元の商品名に戻っていません。");
    assert(reset.status === "needs-confirmation",
      "再解析相当のリセット後に要確認へ戻っていません。");
  });

  runTest("S11b追補C：候補⑦・重複カードは候補対象外",() => {
    const card = makeStockOcrStateCardStock({
      duplicate:true,
      nameCandidates:["架空候補A","架空候補B"],
      wrapperCandidates:["NISA成長","特定"]
    });

    assert(stockOcrGetCandidateOptionsStateStock(
      card,"name"
    ).length === 0,
    "重複カードの商品名候補が選択可能です。");
    assert(stockOcrGetCandidateOptionsStateStock(
      card,"wrapper"
    ).length === 0,
    "重複カードのwrapper候補が選択可能です。");
  });

  runTest("S11b追補C：候補⑨・選択情報はholdingへ保存しない",() => {
    const {data,account} =
      makeStockOcrStateDataStock("楽天証券");
    const card = makeStockOcrStateCardStock({
      candidateSelections:{
        name:{value:"架空インデックスファンド",label:"架空インデックスファンド"}
      },
      candidateOriginals:{
        name:"架空インデックスファンド"
      },
      amountCandidates:[
        {value:1234567,original:"1,234,567円"}
      ],
      candidatePairs:[
        {valueOriginal:"1,234,567円",pnlOriginal:"+123,456円"}
      ],
      rawText:"保存してはいけない架空OCR原文"
    });
    const {storage,values} =
      makeStockOcrStateStorageStock(data);

    saveStockOcrImportStock(
      account.id,"2026-11-26",[card],{
        storage,
        recordedAt:"2026-11-26T10:00:00.000Z",
        idFactory:makeStockOcrStateIdFactoryStock()
      }
    );

    const saved = JSON.parse(values.get(STORAGE_KEY));
    const holding = saved.holdings.find(item =>
      item.name === card.name &&
      item.accountId === account.id
    );

    assert(holding !== undefined,
      "商品別holdingが保存されていません。");
    for (const key of [
      "candidateSelections",
      "candidateOriginals",
      "amountCandidates",
      "candidatePairs",
      "rawText"
    ]) {
      assert(!Object.prototype.hasOwnProperty.call(holding,key),
        key + " がholdingへ保存されています。");
    }
  });
}
