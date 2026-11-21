
"use strict";

/* ---------- S12c OCR画面・一括入力連携の描画テスト ---------- */

function registerBulkOcrRenderTests(context) {
  const {assert,runTest} = context;

  function withBulkOcrTestState(callback) {
    const saved = {
      appData,
      bulkImportRows,
      bulkImportPasteText,
      bulkImportLastResult,
      bulkImportActiveTab,
      bulkOcrAccountId,
      bulkOcrFormatId,
      bulkOcrManualDate,
      bulkOcrPasteText,
      bulkOcrResult,
      bulkOcrRule,
      bulkOcrAccount,
      bulkOcrWarnings,
      bulkOcrDateConflict
    };

    const previousRender = globalThis.render;
    const hadRenderProperty =
      Object.prototype.hasOwnProperty.call(globalThis,"render");

    const hasMessageBinding = typeof messageText !== "undefined";
    const hasErrorBinding = typeof errorText !== "undefined";
    const hadMessageProperty =
      Object.prototype.hasOwnProperty.call(globalThis,"messageText");
    const hadErrorProperty =
      Object.prototype.hasOwnProperty.call(globalThis,"errorText");

    const previousMessage = hasMessageBinding
      ? messageText
      : globalThis.messageText;
    const previousError = hasErrorBinding
      ? errorText
      : globalThis.errorText;

    const dateRule = OCR_ACCOUNT_RULES[0].formats[0].date;
    const hadDateSource =
      Object.prototype.hasOwnProperty.call(dateRule,"source");
    const previousDateSource = dateRule.source;

    try {
      appData = createInitialData();

      const account = appData.accounts.find(item =>
        item.name === "LIGHT FX"
      );
      assert(account,"テスト用のLIGHT FX口座がありません。");

      appData.snapshots = [];
      bulkImportRows = [];
      bulkImportPasteText = "";
      bulkImportLastResult = null;
      bulkImportActiveTab = "ocr";

      bulkOcrAccountId = account.id;
      bulkOcrFormatId = "";
      bulkOcrManualDate = "";
      bulkOcrPasteText = "";
      bulkOcrResult = null;
      bulkOcrRule = null;
      bulkOcrAccount = null;
      bulkOcrWarnings = [];
      bulkOcrDateConflict = null;

      if (hasMessageBinding) {
        messageText = "";
      } else {
        globalThis.messageText = "";
      }

      if (hasErrorBinding) {
        errorText = "";
      } else {
        globalThis.errorText = "";
      }

      globalThis.render = function() {
        app.replaceChildren();
        renderBulkInput();
      };

      return callback(account);
    } finally {
      app.replaceChildren();

      appData = saved.appData;
      bulkImportRows = saved.bulkImportRows;
      bulkImportPasteText = saved.bulkImportPasteText;
      bulkImportLastResult = saved.bulkImportLastResult;
      bulkImportActiveTab = saved.bulkImportActiveTab;

      bulkOcrAccountId = saved.bulkOcrAccountId;
      bulkOcrFormatId = saved.bulkOcrFormatId;
      bulkOcrManualDate = saved.bulkOcrManualDate;
      bulkOcrPasteText = saved.bulkOcrPasteText;
      bulkOcrResult = saved.bulkOcrResult;
      bulkOcrRule = saved.bulkOcrRule;
      bulkOcrAccount = saved.bulkOcrAccount;
      bulkOcrWarnings = saved.bulkOcrWarnings;
      bulkOcrDateConflict = saved.bulkOcrDateConflict;

      if (hadRenderProperty) {
        globalThis.render = previousRender;
      } else {
        delete globalThis.render;
      }

      if (hasMessageBinding) {
        messageText = previousMessage;
      } else if (hadMessageProperty) {
        globalThis.messageText = previousMessage;
      } else {
        delete globalThis.messageText;
      }

      if (hasErrorBinding) {
        errorText = previousError;
      } else if (hadErrorProperty) {
        globalThis.errorText = previousError;
      } else {
        delete globalThis.errorText;
      }

      if (hadDateSource) {
        dateRule.source = previousDateSource;
      } else {
        delete dateRule.source;
      }
    }
  }

  function renderBulkOcrTestScreen() {
    app.replaceChildren();
    renderBulkInput();
  }

  function clickBulkOcrAction(action) {
    const button = app.querySelector(
      "[data-action='" + action + "']"
    );
    assert(button,"操作ボタンがありません：" + action);
    button.click();
    return button;
  }

  function makeBulkOcrTestResult(options = {}) {
    const fields = {
      value:{
        field:"value",
        status:"recognized",
        value:100000,
        original:"100,000円",
        candidates:[],
        required:true,
        usedLineNumbers:[]
      },
      effectivePrincipal:{
        field:"effectivePrincipal",
        status:"recognized",
        value:80000,
        original:"80,000円",
        candidates:[],
        required:true,
        usedLineNumbers:[]
      },
      pnl:{
        field:"pnl",
        status:"recognized",
        value:-5000,
        original:"-5,000円",
        candidates:[],
        required:true,
        usedLineNumbers:[]
      },
      realizedPnlTotal:{
        field:"realizedPnlTotal",
        status:"not-shown",
        value:null,
        original:null,
        candidates:[],
        required:false,
        usedLineNumbers:[]
      },
      swapTotal:{
        field:"swapTotal",
        status:"recognized",
        value:25000,
        original:"25,000円",
        candidates:[],
        required:true,
        usedLineNumbers:[]
      }
    };

    return {
      success:true,
      status:"recognized",
      format:{
        formatId:"account-inquiry",
        label:"口座照会"
      },
      fields,
      date:{
        source:"screen",
        status:"recognized",
        value:"2026-11-19",
        original:"2026/11/19",
        candidates:[],
        required:true
      },
      blocks:[],
      unrecognizedLines:[],
      reasons:[],
      identityStrict:false,
      identityReview:{
        required:false,
        confirmed:false,
        difference:null
      },
      ...options
    };
  }

  function parseNormalOcrText() {
    bulkOcrPasteText = OCR_TEST_DATA.normalText;
    renderBulkOcrTestScreen();
    clickBulkOcrAction("bulk-ocr-parse");

    assert(bulkOcrResult && bulkOcrResult.success,
      "通常のOCRテキストを解析できません。");
  }

  runTest("S12c①：OCRルールのある口座だけを選択肢に表示",() => {
    withBulkOcrTestState(() => {
      const options = getBulkOcrAccountOptions();

      assert(options.length > 0,
        "OCR対応口座がありません。");

      for (const item of options) {
        assert(
          OCR_ACCOUNT_RULES.some(rule =>
            (rule.accountNames || []).includes(item.account.name)
          ),
          "ルールのない口座が選択肢に含まれています。"
        );
      }

      renderBulkOcrTestScreen();

      const select = app.querySelector("#bulk-ocr-account");
      assert(select,"口座選択欄がありません。");
      assert(select.options.length === options.length,
        "口座選択肢の数が一致しません。");
      assert(
        !Array.from(select.options).some(option =>
          option.textContent === "楽天証券"
        ),
        "OCRルールのない楽天証券が表示されています。"
      );
    });
  });

  runTest("S12c②：解析結果のカードを表示",() => {
    withBulkOcrTestState(() => {
      parseNormalOcrText();

      assert(
        app.querySelector(".bulk-ocr-results"),
        "解析結果の領域が表示されていません。"
      );
      assert(
        app.querySelector(".bulk-ocr-results").textContent.includes("総資産"),
        "総資産の結果カードがありません。"
      );
      assert(
        app.querySelector(".bulk-ocr-results").textContent.includes("有効元本"),
        "有効元本の結果カードがありません。"
      );
    });
  });

  runTest("S12c③：要確認・必須項目未取得では表へ追加できない",() => {
    withBulkOcrTestState(() => {
      const unreadable = OCR_TEST_DATA.cases.find(item =>
        item.id === "unreadable-number"
      );
      assert(unreadable,"数値読み取り失敗のテストデータがありません。");

      bulkOcrPasteText = unreadable.text;
      renderBulkOcrTestScreen();
      clickBulkOcrAction("bulk-ocr-parse");

      assert(
        bulkOcrResult.fields.pnl.status === "unreadable",
        "不正な数値が要確認になっていません。"
      );

      const addButton = app.querySelector(
        "[data-action='bulk-ocr-add']"
      );
      assert(addButton && addButton.disabled,
        "要確認が残っているのに表へ追加できます。");
    });
  });

  runTest("S12c④：候補選択・数値入力で表へ追加可能になる",() => {
    withBulkOcrTestState(() => {
      const result = makeBulkOcrTestResult();
      result.fields.value.status = "unreadable";
      result.fields.value.value = null;
      result.fields.value.original = "-";
      result.fields.value.candidates = [{
        lineNumber:1,
        original:"100,000円",
        value:100000,
        error:null
      }];

      bulkOcrResult = result;
      renderBulkOcrTestScreen();

      let addButton = app.querySelector(
        "[data-action='bulk-ocr-add']"
      );
      assert(addButton.disabled,
        "未確定の候補があるのに表へ追加できます。");

      clickBulkOcrAction("bulk-ocr-candidate");

      addButton = app.querySelector(
        "[data-action='bulk-ocr-add']"
      );
      assert(
        bulkOcrResult.fields.value.status === "recognized",
        "候補選択後に認識済みになっていません。"
      );
      assert(addButton && !addButton.disabled,
        "候補選択後も表へ追加できません。");

      const secondResult = makeBulkOcrTestResult();
      secondResult.fields.value.status = "unreadable";
      secondResult.fields.value.value = null;
      secondResult.fields.value.candidates = [];

      bulkOcrResult = secondResult;
      renderBulkOcrTestScreen();

      const input = app.querySelector(
        "[data-bulk-ocr-field='value']"
      );
      assert(input,"総資産の手入力欄がありません。");

      input.value = "100000";
      input.dispatchEvent(new Event("input",{bubbles:true}));

      addButton = app.querySelector(
        "[data-action='bulk-ocr-add']"
      );
      assert(
        bulkOcrResult.fields.value.value === 100000,
        "手入力した数値が反映されていません。"
      );
      assert(addButton && !addButton.disabled,
        "手入力後も表へ追加できません。");
    });
  });

  runTest("S12c⑤：表へ追加すると1行増え、OCR入力と結果を消去",() => {
    withBulkOcrTestState(() => {
      parseNormalOcrText();

      clickBulkOcrAction("bulk-ocr-add");

      assert(bulkImportRows.length === 1,
        "表に1行追加されていません。");
      assert(bulkImportRows[0].accountName === "LIGHT FX",
        "追加行の口座名が一致しません。");
      assert(bulkImportRows[0].memo === "",
        "追加行のメモが空欄ではありません。");
      assert(bulkImportRows[0].status === "planned",
        "追加行が取込予定になっていません。");
      assert(bulkOcrPasteText === "",
        "追加後もOCR原文が残っています。");
      assert(bulkOcrResult === null,
        "追加後も解析結果が残っています。");
      assert(
        !app.querySelector(".bulk-ocr-results"),
        "追加後も解析結果の画面が残っています。"
      );
    });
  });

  runTest("S12c⑥：タブ切り替えで一括入力の表が消えない",() => {
    withBulkOcrTestState(() => {
      parseNormalOcrText();
      clickBulkOcrAction("bulk-ocr-add");

      assert(bulkImportRows.length === 1,
        "事前の表への追加に失敗しました。");

      clickBulkOcrAction("bulk-tab-tsv");

      assert(bulkImportActiveTab === "tsv",
        "TSVタブに切り替わっていません。");
      assert(bulkImportRows.length === 1,
        "TSVタブへの切り替えで表の行が消えています。");
      assert(app.querySelector("#bulk-import-paste"),
        "TSVタブの入力欄がありません。");
      assert(app.querySelector(".bulk-table"),
        "TSVタブで既存の表が表示されていません。");

      clickBulkOcrAction("bulk-tab-ocr");

      assert(bulkImportActiveTab === "ocr",
        "OCRタブに戻っていません。");
      assert(bulkImportRows.length === 1,
        "OCRタブに戻ったとき表の行が消えています。");
    });
  });

  runTest("S12c⑦：TSVタブの入力欄と展開処理を維持",() => {
    withBulkOcrTestState(account => {
      bulkImportActiveTab = "tsv";
      renderBulkOcrTestScreen();

      const pasteArea = app.querySelector("#bulk-import-paste");
      assert(pasteArea,"従来のTSV入力欄がありません。");

      assert(
        app.querySelector("[data-action='bulk-expand']"),
        "従来の表に展開ボタンがありません。"
      );
      assert(
        app.querySelector("[data-action='bulk-clear-table']"),
        "従来の表を全消去ボタンがありません。"
      );

      pasteArea.value = [
        "対象日\t口座名\t総資産\t有効元本\t評価損益\t累積確定損益\t現金\tメモ\t累計スワップ",
        "2026-11-19\t" + account.name + "\t100000\t80000\t-5000\t\t\tTSVテスト\t25000"
      ].join("\n");
      pasteArea.dispatchEvent(new Event("input",{bubbles:true}));

      expandBulkImportText();

      assert(bulkImportRows.length === 1,
        "TSVから表に1行展開されていません。");
      assert(bulkImportRows[0].accountName === account.name,
        "TSVの口座名が保持されていません。");
      assert(bulkImportRows[0].status === "planned",
        "TSVの行が取込予定になっていません。");
    });
  });

  runTest("S12c⑧：OCR原文を保存データ・ログ・一時バックアップへ残さない",() => {
    withBulkOcrTestState(() => {
      const sentinel = "OCR_PRIVATE_SENTINEL_73194628";
      const pasteAreaText = sentinel + "\n解析用の架空テキスト";

      const storageBefore = [];
      try {
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          storageBefore.push([
            key,
            localStorage.getItem(key)
          ]);
        }
      } catch (error) {
        throw new Error("テスト用localStorageを確認できません。");
      }

      bulkOcrPasteText = pasteAreaText;
      renderBulkOcrTestScreen();

      const pasteArea = app.querySelector("#bulk-ocr-paste");
      pasteArea.value = pasteAreaText;
      pasteArea.dispatchEvent(new Event("input",{bubbles:true}));

      assert(!JSON.stringify(appData).includes(sentinel),
        "OCR原文が保存データに含まれています。");

      assert(
        !String(localStorage.getItem(STORAGE_KEY) || "").includes(sentinel),
        "OCR原文がpam2に含まれています。"
      );
      assert(
        !String(localStorage.getItem("pam2_pre_bulk") || "").includes(sentinel),
        "OCR原文がpam2_pre_bulkに含まれています。"
      );

      let logText = "";
      try {
        if (typeof errlog !== "undefined") {
          logText += JSON.stringify(errlog);
        }
      } catch (error) {
        logText += "";
      }

      assert(!logText.includes(sentinel),
        "OCR原文がerrlogに含まれています。");

      const storageAfter = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        storageAfter.push([
          key,
          localStorage.getItem(key)
        ]);
      }

      assert(
        JSON.stringify(storageAfter) === JSON.stringify(storageBefore),
        "OCR原文の入力によってlocalStorageが変更されています。"
      );
    });
  });

  runTest("S12c⑨：貼り付けた文字列をHTMLとして挿入しない",() => {
    withBulkOcrTestState(() => {
      const unsafeText =
        OCR_TEST_DATA.normalText +
        "\n<img src=x onerror=alert(1)>";

      bulkOcrPasteText = unsafeText;
      renderBulkOcrTestScreen();

      const pasteArea = app.querySelector("#bulk-ocr-paste");
      pasteArea.value = unsafeText;
      pasteArea.dispatchEvent(new Event("input",{bubbles:true}));

      clickBulkOcrAction("bulk-ocr-parse");

      assert(!app.querySelector("img"),
        "貼り付け文字列からimg要素が生成されています。");
      assert(!app.querySelector("script"),
        "貼り付け文字列からscript要素が生成されています。");
      assert(
        app.textContent.includes("<img src=x onerror=alert(1)>"),
        "未認識テキストが文字列として表示されていません。"
      );
      assert(
        !app.innerHTML.includes("<img src=x onerror=alert(1)>"),
        "貼り付け文字列がHTMLとして挿入されています。"
      );
    });
  });

  runTest("S12c⑩：未確定ブロックは警告・候補を表示し、全項目空欄で追加不可",() => {
    withBulkOcrTestState(() => {
      const result = makeBulkOcrTestResult({
        format:{
          formatId:"account-block",
          label:"口座情報"
        },
        blocks:[{
          blockId:"account",
          status:"unconfirmed",
          reason:"項目名の順番が一致しません。",
          candidateLines:[{
            lineNumber:1,
            text:"口座資産"
          }]
        }],
        unrecognizedLines:[{
          lineNumber:1,
          text:"口座資産"
        }]
      });

      for (const name of [
        "value",
        "effectivePrincipal",
        "pnl",
        "realizedPnlTotal",
        "swapTotal"
      ]) {
        result.fields[name].status =
          name === "realizedPnlTotal"
            ? "not-shown"
            : "block-unconfirmed";
        result.fields[name].value = null;
        result.fields[name].original = null;
        result.fields[name].candidates = [];
      }

      bulkOcrResult = result;
      renderBulkOcrTestScreen();

      assert(
        app.textContent.includes("対応を確定できませんでした"),
        "ブロック未確定の警告がありません。"
      );
      assert(
        app.textContent.includes("口座資産"),
        "候補行が表示されていません。"
      );

      for (const name of [
        "value",
        "effectivePrincipal",
        "pnl",
        "realizedPnlTotal",
        "swapTotal"
      ]) {
        assert(result.fields[name].value === null,
          name + "に未確定の値が入っています。");
      }

      const addButton = app.querySelector(
        "[data-action='bulk-ocr-add']"
      );
      assert(addButton && addButton.disabled,
        "未確定ブロックを表へ追加できます。");
    });
  });

  runTest("S12c⑪：恒等式の要確認は確定操作まで追加不可",() => {
    withBulkOcrTestState(() => {
      const result = makeBulkOcrTestResult({
        identityStrict:true,
        identityReview:{
          required:true,
          confirmed:false,
          difference:1
        }
      });

      for (const name of [
        "value",
        "effectivePrincipal",
        "pnl",
        "swapTotal"
      ]) {
        result.fields[name].status = "identity-unconfirmed";
      }

      bulkOcrResult = result;
      renderBulkOcrTestScreen();

      let addButton = app.querySelector(
        "[data-action='bulk-ocr-add']"
      );
      assert(addButton && addButton.disabled,
        "恒等式の確認前に表へ追加できます。");

      assert(
        app.querySelector("[data-action='bulk-ocr-confirm-identity']"),
        "「このままで確定」ボタンがありません。"
      );

      clickBulkOcrAction("bulk-ocr-confirm-identity");

      addButton = app.querySelector(
        "[data-action='bulk-ocr-add']"
      );
      assert(bulkOcrResult.identityReview.confirmed,
        "恒等式の確定状態が記録されていません。");
      assert(addButton && !addButton.disabled,
        "確定操作後も表へ追加できません。");
    });
  });

  runTest("S12c⑫：manual口座は対象日未入力で追加不可、入力後は追加可能",() => {
    withBulkOcrTestState(() => {
      OCR_ACCOUNT_RULES[0].formats[0].date.source = "manual";

      bulkOcrPasteText = OCR_TEST_DATA.normalText;
      renderBulkOcrTestScreen();

      const dateInput = app.querySelector("#bulk-ocr-date");
      assert(dateInput && dateInput.required,
        "manual口座の対象日が必須になっていません。");

      clickBulkOcrAction("bulk-ocr-parse");

      assert(
        bulkOcrResult.date.status === "manual-required",
        "対象日未入力がmanual-requiredになっていません。"
      );

      let addButton = app.querySelector(
        "[data-action='bulk-ocr-add']"
      );
      assert(addButton && addButton.disabled,
        "対象日未入力なのに表へ追加できます。");

      const dateAfterParse = app.querySelector("#bulk-ocr-date");
      dateAfterParse.value = "2026-11-19";
      dateAfterParse.dispatchEvent(
        new Event("change",{bubbles:true})
      );

      addButton = app.querySelector(
        "[data-action='bulk-ocr-add']"
      );
      assert(
        bulkOcrResult.date.status === "recognized",
        "対象日入力後に日付が認識済みになっていません。"
      );
      assert(addButton && !addButton.disabled,
        "対象日入力後も表へ追加できません。");
    });
  });
}
