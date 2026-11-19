"use strict";

const OCR_TEST_DATA = {
  lightFxRule:{
    ruleId:"test-light-fx",
    accountNames:["LIGHT FX"],
    ruleVersion:"2026-11-20",
    note:"仕様書12-12の架空テスト用ルール",
    formats:[
      {
        formatId:"summary",
        label:"口座サマリー",
        identify:{
          all:["口座サマリー"],
          none:[]
        },
        date:{
          labels:[],
          patterns:["YYYY/M/D"],
          required:true
        },
        fields:{
          value:{
            labels:["純資産額"],
            layout:"sameLine",
            required:true
          },
          effectivePrincipal:{
            labels:["口座残高"],
            layout:"sameLine",
            required:true
          },
          pnl:{
            labels:["建玉評価損益"],
            layout:"sameLine",
            required:true
          },
          realizedPnlTotal:{
            labels:["累積確定損益"],
            layout:"sameLine",
            required:false
          },
          swapTotal:{
            labels:["スワップ"],
            layout:"sameLine",
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
    "口座サマリー\n" +
    "2026/11/19 15:30 現在\n" +
    "純資産額 1,246,912円\n" +
    "口座残高 1,500,000円\n" +
    "建玉評価損益 -265,433円\n" +
    "スワップ 12,345円",

  reversedText:
    "口座サマリー\n" +
    "2026/11/19 15:30 現在\n" +
    "スワップ 12,345円\n" +
    "建玉評価損益 -265,433円\n" +
    "口座残高 1,500,000円\n" +
    "純資産額 1,246,912円",

  otherAccountText:
    "口座清算価値\n" +
    "2026/11/19\n" +
    "3,210,000\n" +
    "口座資産\n" +
    "3,300,000\n" +
    "建玉評価損益\n" +
    "-100,000\n" +
    "未決済スワップ\n" +
    "10,000",

  cases:[
    {
      id:"normal",
      description:"正常・同じ行にラベルと値",
      text:
        "口座サマリー\n" +
        "2026/11/19 15:30 現在\n" +
        "純資産額 1,246,912円\n" +
        "口座残高 1,500,000円\n" +
        "建玉評価損益 -265,433円\n" +
        "スワップ 12,345円",
      expected:{
        date:"2026-11-19",
        value:1246912,
        effectivePrincipal:1500000,
        pnl:-265433,
        swapTotal:12345,
        status:"recognized"
      }
    },
    {
      id:"reversed-order",
      description:"項目の並び順が逆",
      text:
        "口座サマリー\n" +
        "2026/11/19 15:30 現在\n" +
        "スワップ 12,345円\n" +
        "建玉評価損益 -265,433円\n" +
        "口座残高 1,500,000円\n" +
        "純資産額 1,246,912円",
      expected:{
        date:"2026-11-19",
        value:1246912,
        effectivePrincipal:1500000,
        pnl:-265433,
        swapTotal:12345,
        status:"recognized"
      }
    },
    {
      id:"different-label",
      description:"別の項目名を誤って割り当てない",
      text:
        "口座サマリー\n" +
        "2026/11/19\n" +
        "純資産額 1,246,912円\n" +
        "未決済建玉評価損益 -265,433円",
      expected:{
        date:"2026-11-19",
        value:1246912,
        pnl:null,
        pnlStatus:"missing",
        unrecognizedContains:"未決済建玉評価損益"
      }
    },
    {
      id:"unreadable-number",
      description:"数値に英字が混在",
      text:
        "口座サマリー\n" +
        "2026/11/19\n" +
        "純資産額 1,246,912円\n" +
        "口座残高 1,500,000円\n" +
        "建玉評価損益 -265,4S3円\n" +
        "スワップ 12,345円",
      expected:{
        date:"2026-11-19",
        value:1246912,
        pnl:null,
        pnlStatus:"unreadable",
        pnlOriginal:"-265,4S3円",
        swapTotal:12345
      }
    },
    {
      id:"multiple-value",
      description:"総資産の候補が2件",
      text:
        "口座サマリー\n" +
        "2026/11/19\n" +
        "純資産額 1,246,912円\n" +
        "純資産額 1,246,921円",
      expected:{
        date:"2026-11-19",
        value:null,
        valueStatus:"multiple",
        candidateValues:[1246912,1246921]
      }
    },
    {
      id:"missing-required",
      description:"必須の総資産がない",
      text:
        "口座サマリー\n" +
        "2026/11/19\n" +
        "口座残高 1,500,000円\n" +
        "建玉評価損益 -265,433円",
      expected:{
        date:"2026-11-19",
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
        "2026/11/19\n" +
        "3,210,000\n" +
        "口座資産\n" +
        "3,300,000\n" +
        "建玉評価損益\n" +
        "-100,000\n" +
        "未決済スワップ\n" +
        "10,000",
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
