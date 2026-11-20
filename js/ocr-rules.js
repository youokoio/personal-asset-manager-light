"use strict";

const OCR_ACCOUNT_RULES = Object.freeze([
  {
    ruleId:"light-fx",
    accountNames:["LIGHT FX"],
    ruleVersion:"2026-11-20",
    note:"LIGHT FXの口座照会画面。項目名と金額が別行に表示される形式。",
    formats:[
      {
        formatId:"account-inquiry",
        label:"口座照会",
        identify:{
          all:["口座残高","建玉評価損益","純資産額"],
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
  }
]);
