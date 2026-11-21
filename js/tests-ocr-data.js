"use strict";

const OCR_TEST_DATA = {
  lightFxRule:{
    ruleId:"test-light-fx",
    accountNames:["LIGHT FX"],
    ruleVersion:"2026-11-21",
    note:"S12dの架空テスト用LIGHT FXルール",
    formats:[
      {
        formatId:"account-inquiry",
        label:"口座照会",
        identify:{
          all:["口座残高","建玉評価損益","純資産額"],
          none:[]
        },
        date:{
          source:"screen",
          labels:[],
          patterns:["YYYY/M/D"],
          required:true
        },
        identityStrict:true,
        fields:{
          value:{
            labels:["純資産額"],
            layout:"nextLine",
            required:true
          },
          effectivePrincipal:{
            labels:["口座残高"],
            layout:"nextLine",
            required:true
          },
          pnl:{
            labels:["建玉評価損益"],
            layout:"nextLine",
            required:true
          },
          realizedPnlTotal:{
            show:false
          },
          swapTotal:{
            labels:["スワップ"],
            layout:"nextLine",
            required:true
          }
        }
      }
    ]
  },

  centralTanshiRule:{
    ruleId:"test-central-tanshi-fx",
    accountNames:["セントラル短資FX"],
    ruleVersion:"2026-11-21",
    note:"S12dの架空テスト用セントラル短資FXルール",
    formats:[
      {
        formatId:"account-inquiry",
        label:"口座内容照会",
        identify:{
          all:["口座資産","口座清算価値","未決済スワップ"],
          none:[]
        },
        date:{
          source:"manual",
          labels:[],
          patterns:[],
          required:true
        },
        identityStrict:true,
        fields:{
          value:{
            labels:["口座清算価値"],
            layout:"nextLine",
            required:true
          },
          effectivePrincipal:{
            labels:["口座資産"],
            layout:"nextLine",
            required:true
          },
          pnl:{
            labels:["建玉評価損益"],
            layout:"nextLine",
            required:true
          },
          realizedPnlTotal:{
            show:false
          },
          swapTotal:{
            labels:["未決済スワップ"],
            layout:"nextLine",
            required:true
          }
        }
      }
    ]
  },

  click365Rule:{
    ruleId:"test-click365",
    accountNames:["クリック365"],
    ruleVersion:"2026-11-21",
    note:"S12dの架空テスト用クリック365ルール",
    formats:[
      {
        formatId:"account-block",
        label:"口座情報",
        identify:{
          all:["時価評価総額","未決済建玉評価損益","累計スワップ"],
          none:[]
        },
        date:{
          source:"manual",
          labels:[],
          patterns:[],
          required:true
        },
        identityStrict:true,
        fields:{
          value:{
            labels:["時価評価総額"],
            layout:"block",
            blockId:"account",
            required:true
          },
          effectivePrincipal:{
            labels:["口座残高"],
            layout:"block",
            blockId:"account",
            required:true
          },
          pnl:{
            labels:["未決済建玉評価損益"],
            layout:"block",
            blockId:"account",
            required:true
          },
          realizedPnlTotal:{
            show:false
          },
          swapTotal:{
            labels:["累計スワップ"],
            layout:"block",
            blockId:"account",
            required:true
          }
        },
        blocks:[
          {
            blockId:"account",
            entries:[
              {label:"取引余力",field:null,kind:"amount"},
              {label:"振替可能額",field:null,kind:"amount"},
              {label:"証拠金維持率",field:null,kind:"percent"},
              {label:"拘束証拠金",field:null,kind:"amount"},
              {label:"必要証拠金",field:null,kind:"amount"},
              {label:"注文中証拠金",field:null,kind:"amount"},
              {label:"時価評価総額",field:"value",kind:"amount"},
              {label:"建玉評価総額",field:null,kind:"amount"},
              {label:"未決済建玉評価損益",field:"pnl",kind:"amount"},
              {label:"累計スワップ",field:"swapTotal",kind:"amount"},
              {label:"口座残高",field:"effectivePrincipal",kind:"amount"},
              {label:"現金残高",field:null,kind:"amount"},
              {label:"既決済取引損益",field:null,kind:"amount"},
              {label:"スワップ損益",field:null,kind:"amount"},
              {label:"手数料合計",field:null,kind:"amount"}
            ],
            headingLabels:[],
            ignoreLines:["余力確認","戻る","•ll 5G","365株"]
          }
        ]
      }
    ]
  },

  lionFxRule:{
    ruleId:"test-lion-fx",
    accountNames:["LION FX"],
    ruleVersion:"2026-11-21",
    note:"S12dの架空テスト用LION FXルール",
    formats:[
      {
        formatId:"account-inquiry",
        label:"口座/入出金",
        identify:{
          all:["有効証拠金","預託証拠金","未実現スワップ"],
          none:[]
        },
        date:{
          source:"manual",
          labels:[],
          patterns:[],
          required:true
        },
        identityStrict:true,
        fields:{
          value:{
            labels:["有効証拠金"],
            layout:"nextLine",
            required:true
          },
          effectivePrincipal:{
            labels:["預託証拠金"],
            layout:"nextLine",
            required:true
          },
          pnl:{
            labels:["ポジション損益"],
            layout:"nextLine",
            required:true
          },
          realizedPnlTotal:{
            show:false
          },
          swapTotal:{
            labels:["未実現スワップ"],
            layout:"nextLine",
            required:true
          }
        }
      }
    ]
  },

  otherAccountRule:{
    ruleId:"test-other-account",
    accountNames:["架空口座A"],
    ruleVersion:"2026-11-20",
    note:"仕様書12-12の別口座形式テスト用",
    formats:[
      {
        formatId:"settlement",
        label:"口座清算価値",
        identify:{
          all:["口座清算価値"],
          none:[]
        },
        date:{
          source:"screen",
          labels:[],
          patterns:["YYYY/M/D"],
          required:true
        },
        fields:{
          value:{
            labels:["口座清算価値"],
            layout:"nextLine",
            required:true
          },
          effectivePrincipal:{
            labels:["口座資産"],
            layout:"nextLine",
            required:true
          },
          pnl:{
            labels:["建玉評価損益"],
            layout:"nextLine",
            required:true
          },
          realizedPnlTotal:{
            show:false
          },
          swapTotal:{
            labels:["未決済スワップ"],
            layout:"nextLine",
            required:true
          }
        }
      }
    ]
  },

  normalText:
    "口座照会\n" +
    "口座残高\n" +
    "800,000円\n" +
    "約定評価損益\n" +
    "0円\n" +
    "建玉評価損益\n" +
    "-100,000円\n" +
    "スワップ\n" +
    "200,000円\n" +
    "純資産額\n" +
    "900,000円\n" +
    "0円\n" +
    "振替画面\n" +
    "更新日時\n" +
    "2026/11/20 18:54:58",

  reversedText:
    "口座照会\n" +
    "口座残高\n" +
    "800,000円\n" +
    "建玉評価損益\n" +
    "-100,000円\n" +
    "スワップ\n" +
    "200,000円\n" +
    "純資産額\n" +
    "900,000円\n" +
    "必要証拠金\n" +
    "10,000円\n" +
    "2026/11/20 18:54:58",

  centralTanshiText:
    "口座内容照会\n" +
    "合計（円換算）\n" +
    "通貨別\n" +
    "口座資産\n" +
    "800,000円\n" +
    "当日損益\n" +
    "0円\n" +
    "建玉評価損益\n" +
    "-100,000円\n" +
    "未決済スワップ\n" +
    "200,000円\n" +
    "出金依頼額\n" +
    "0円\n" +
    "口座清算価値\n" +
    "900,000円\n" +
    "証拠金維持率\n" +
    "900.00%",

  click365Text:
    "365FX\n" +
    "口座情報\n" +
    "取引余力\n" +
    "振替可能額\n" +
    "証拠金維持率\n" +
    "拘束証拠金\n" +
    "必要証拠金\n" +
    "注文中証拠金\n" +
    "時価評価総額\n" +
    "建玉評価総額\n" +
    "未決済建玉評価損益\n" +
    "累計スワップ\n" +
    "口座残高\n" +
    "現金残高\n" +
    "既決済取引損益\n" +
    "スワップ損益\n" +
    "手数料合計\n" +
    "余力確認\n" +
    "戻る\n" +
    "•ll 5G\n" +
    "365株\n" +
    "1,800,000円\n" +
    "100,000円\n" +
    "1,000.00%\n" +
    "200,000円\n" +
    "200,000円\n" +
    "0円\n" +
    "900,000円\n" +
    "500,000円\n" +
    "-100,000円\n" +
    "200,000円\n" +
    "800,000円\n" +
    "800,000円\n" +
    "0円\n" +
    "0円\n" +
    "0円",

  lionFxText:
    "口座/入出金\n" +
    "預託証拠金\n" +
    "\n" +
    "800,000円\n" +
    "有効証拠金\n" +
    "900,000円\n" +
    "必要証拠金\n" +
    "100,000円\n" +
    "発注証拠金\n" +
    "0円\n" +
    "評価損益\n" +
    "100,000円\n" +
    "評価損益（ロック以外）\n" +
    "\n" +
    "100,000円\n" +
    "ポジション損益\n" +
    "−100,000円\n" +
    "ポジション損益（ロック以外）\n" +
    "\n" +
    "−100,000円\n" +
    "未実現スワップ\n" +
    "200,000円\n" +
    "未実現スワップ（ロック以外）\n" +
    "200,000円",

  otherAccountText:
    "口座清算価値\n" +
    "3,210,000\n" +
    "口座資産\n" +
    "3,300,000\n" +
    "建玉評価損益\n" +
    "-100,000\n" +
    "未決済スワップ\n" +
    "10,000\n" +
    "2026/11/19",

  cases:[
    {
      id:"normal",
      description:"LIGHT FX・ラベルと値が別行・日時が末尾",
      text:
        "口座残高\n" +
        "800,000円\n" +
        "約定評価損益\n" +
        "0円\n" +
        "建玉評価損益\n" +
        "-100,000円\n" +
        "スワップ\n" +
        "200,000円\n" +
        "純資産額\n" +
        "900,000円\n" +
        "0円\n" +
        "振替画面\n" +
        "更新日時\n" +
        "2026/11/20 18:54:58",
      expected:{
        date:"2026-11-20",
        value:900000,
        effectivePrincipal:800000,
        pnl:-100000,
        swapTotal:200000,
        status:"recognized",
        unrecognizedContains:"約定評価損益"
      }
    },
    {
      id:"reversed-order",
      description:"項目の並び順が異なっても取得できる",
      text:
        "口座残高\n" +
        "800,000円\n" +
        "建玉評価損益\n" +
        "-100,000円\n" +
        "スワップ\n" +
        "200,000円\n" +
        "純資産額\n" +
        "900,000円\n" +
        "必要証拠金\n" +
        "10,000円\n" +
        "2026/11/20 18:54:58",
      expected:{
        date:"2026-11-20",
        value:900000,
        effectivePrincipal:800000,
        pnl:-100000,
        swapTotal:200000,
        status:"recognized"
      }
    },
    {
      id:"different-label",
      description:"別の項目名を誤って割り当てない",
      text:
        "口座残高\n" +
        "800,000円\n" +
        "純資産額\n" +
        "900,000円\n" +
        "未決済建玉評価損益\n" +
        "-100,000円\n" +
        "スワップ\n" +
        "200,000円\n" +
        "2026/11/20",
      expected:{
        date:"2026-11-20",
        value:900000,
        pnl:null,
        pnlStatus:"missing-required",
        unrecognizedContains:"未決済建玉評価損益"
      }
    },
    {
      id:"unreadable-number",
      description:"数値に英字が混在",
      text:
        "口座残高\n" +
        "800,000円\n" +
        "純資産額\n" +
        "900,000円\n" +
        "建玉評価損益\n" +
        "-1,00S,000円\n" +
        "スワップ\n" +
        "200,000円\n" +
        "2026/11/20",
      expected:{
        date:"2026-11-20",
        value:900000,
        pnl:null,
        pnlStatus:"unreadable",
        pnlOriginal:"-1,00S,000円",
        swapTotal:200000
      }
    },
    {
      id:"multiple-value",
      description:"総資産の候補が2件",
      text:
        "口座残高\n" +
        "800,000円\n" +
        "純資産額\n" +
        "900,000円\n" +
        "純資産額\n" +
        "900,001円\n" +
        "建玉評価損益\n" +
        "-100,000円\n" +
        "スワップ\n" +
        "200,000円\n" +
        "2026/11/20",
      expected:{
        date:"2026-11-20",
        value:null,
        valueStatus:"multiple",
        candidateValues:[900000,900001]
      }
    },
    {
      id:"missing-required",
      description:"必須の総資産がない",
      text:
        "口座残高\n" +
        "800,000円\n" +
        "建玉評価損益\n" +
        "-100,000円\n" +
        "スワップ\n" +
        "200,000円\n" +
        "2026/11/20",
      expected:{
        date:"2026-11-20",
        value:null,
        valueStatus:"missing-required",
        canAdd:false
      }
    },
    {
      id:"other-account-next-line",
      description:"別口座・ラベルの次の行から取得",
      text:
        "口座清算価値\n" +
        "3,210,000\n" +
        "口座資産\n" +
        "3,300,000\n" +
        "建玉評価損益\n" +
        "-100,000\n" +
        "未決済スワップ\n" +
        "10,000\n" +
        "2026/11/19",
      rule:"otherAccountRule",
      expected:{
        date:"2026-11-19",
        value:3210000,
        effectivePrincipal:3300000,
        pnl:-100000,
        swapTotal:10000,
        status:"recognized"
      }
    }
  ],

  amountCases:[
    {
      input:"12,345.6円",
      negativeMarks:[],
      expected:12345.6
    },
    {
      input:"▲265,433",
      negativeMarks:["▲"],
      expected:-265433
    },
    {
      input:"▲265,433",
      negativeMarks:[],
      expected:null
    },
    {
      input:"12,34",
      negativeMarks:[],
      expected:null
    },
    {
      input:"+1,000",
      negativeMarks:[],
      expected:1000
    },
    {
      input:"−500",
      negativeMarks:[],
      expected:-500
    },
    {
      input:"－500",
      negativeMarks:[],
      expected:-500
    },
    {
      input:"1,2345",
      negativeMarks:[],
      expected:null
    },
    {
      input:"265,4S3",
      negativeMarks:[],
      expected:null
    },
    {
      input:"500-",
      negativeMarks:[],
      expected:null
    }
  ],

  dateCases:[
    {
      input:"2026/11/19",
      patterns:["YYYY/M/D"],
      expected:"2026-11-19"
    },
    {
      input:"2026-11-19",
      patterns:["YYYY-MM-DD"],
      expected:"2026-11-19"
    },
    {
      input:"2026年11月19日",
      patterns:["YYYY年M月D日"],
      expected:"2026-11-19"
    },
    {
      input:"11/19 15:30 現在",
      patterns:["YYYY/M/D"],
      expected:null
    },
    {
      input:"2026年11月31日",
      patterns:["YYYY年M月D日"],
      expected:null
    }
  ],

  ruleIsolation:{
    sourceRule:"lightFxRule",
    copiedRule:"lightFxRule",
    otherRule:"otherAccountRule",
    changedLabel:"建玉評価損益（変更テスト）",
    expected:{
      otherAccountResultUnchanged:true
    }
  },

  maskingCases:[
    {
      input:"取引番号123456789012",
      expected:"取引番号●●●●●●●●●●●●"
    },
    {
      input:"金額1234567",
      expected:"金額1234567"
    }
  ]
};
