
"use strict";

const STOCK_OCR_TEST_DATA = {
  rakuten: {
    normal: [
      "保有商品詳細（すべて）",
      "時価評価額",
      "国内株式",
      "架空テクノロジー",
      "1234",
      "NISA成長投資枠",
      "120,000円",
      "+20,000円",
      "+20.00%",
      "投資信託",
      "架空・全世界株式インデックス・ファンド",
      "NISAつみたて投資枠",
      "300,000円",
      "-10,000円",
      "-3.23%",
      "参考為替レート",
      "留意事項"
    ].join("\n"),

    reordered: [
      "保有商品詳細（すべて）",
      "時価評価額",
      "投資信託",
      "架空・先進国株式インデックス・ファンド",
      "NISA成長投資",
      "-5,000円",
      "95,000円",
      "-5.00%",
      "国内株式",
      "架空テクノロジー",
      "1234",
      "特定",
      "+2,000円",
      "52,000円",
      "+4.00%"
    ].join("\n"),

    unknownWrapper: [
      "保有商品詳細（すべて）",
      "時価評価額",
      "投資信託",
      "架空・国内債券ファンド",
      "未登録の投資枠",
      "80,000円",
      "+1,000円",
      "+1.27%"
    ].join("\n"),

    foreignCurrency: [
      "保有商品詳細（すべて）",
      "時価評価額",
      "米国株式",
      "FICTIONAL CORP",
      "A123",
      "特定",
      "150.00 USD",
      "+10.00 USD"
    ].join("\n"),

    missingAmount: [
      "保有商品詳細（すべて）",
      "時価評価額",
      "投資信託",
      "架空・バランスファンド",
      "NISA成長投資枠",
      "評価損益",
      "+3,000円"
    ].join("\n"),

    duplicateCard: [
      "保有商品詳細（すべて）",
      "時価評価額",
      "国内株式",
      "架空テクノロジー",
      "1234",
      "特定",
      "50,000円",
      "+5,000円",
      "国内株式",
      "架空テクノロジー",
      "1234",
      "特定",
      "55,000円",
      "+10,000円"
    ].join("\n")
  },

  ideco: {
    normal: [
      "● 外国株式",
      "架空・S&P500インデックス・ファンド",
      "構成比",
      "時価評価額",
      "評価損益",
      "詳細",
      "保有数量",
      "平均取得単価",
      "基準価額",
      "100.0%",
      "246,000円",
      "+24,000円（+10.80％）",
      "V",
      "12,000口",
      "18,500.00円",
      "20,500円"
    ].join("\n"),

    reordered: [
      "● 外国株式",
      "架空・先進国株式ファンド",
      "時価評価額",
      "評価損益",
      "構成比",
      "詳細",
      "平均取得単価",
      "保有数量",
      "基準価額",
      "120,000円",
      "-6,000円（-4.76％）",
      "100.0%",
      "15,000口",
      "8,000.00円",
      "7,600円"
    ].join("\n"),

    headingOnly: [
      "● 外国株式",
      "架空・商品名未確定ファンド"
    ].join("\n"),

    corruptedQuantity: [
      "● 外国株式",
      "架空・バランスファンド",
      "時価評価額",
      "評価損益",
      "保有数量",
      "平均取得単価",
      "基準価額",
      "100,000円",
      "+5,000円（+5.26％）",
      "12,345日",
      "8,000円",
      "8,400円"
    ].join("\n"),

    foreignCurrency: [
      "● 外国株式",
      "架空・海外株式ファンド",
      "時価評価額",
      "評価損益",
      "100.00 USD",
      "+5.00 USD"
    ].join("\n")
  },

  corporateDc: {
    normal: [
      "元本確保型",
      "架空DC定期預金（1年）（00001）",
      "評価額",
      "取得価額累計",
      "5,500円",
      "5,500円",
      "投資信託",
      "架空・DC外国債券インデックスファンド",
      "（00002）",
      "評価額",
      "取得価額累計",
      "評価損益",
      "700,000円",
      "550,000円",
      "150,000円"
    ].join("\n"),

    reordered: [
      "投資信託",
      "架空・DC外国株式インデックスファンド",
      "（00003）",
      "評価損益",
      "評価額",
      "取得価額累計",
      "+200,000円",
      "1,000,000円",
      "800,000円"
    ].join("\n"),

    headingOnly: [
      "投資信託",
      "架空・商品名未確定ファンド"
    ].join("\n"),

    principalProtectedWithPnl: [
      "元本確保型",
      "架空DC定期預金（3年）（00004）",
      "評価額",
      "取得価額累計",
      "評価損益",
      "10,000円",
      "9,000円",
      "+1,000円"
    ].join("\n"),

    foreignCurrency: [
      "投資信託",
      "架空・DC海外資産ファンド",
      "（00005）",
      "評価額",
      "取得価額累計",
      "1,000.00 USD",
      "900.00 USD"
    ].join("\n"),

    duplicateCard: [
      "元本確保型",
      "架空DC定期預金（1年）（00001）",
      "評価額",
      "取得価額累計",
      "5,500円",
      "5,500円",
      "元本確保型",
      "架空DC定期預金（1年）（00001）",
      "評価額",
      "取得価額累計",
      "6,000円",
      "6,000円"
    ].join("\n")
  },

  calculations: {
    costBasisFromPnl: {
      value: 60000,
      pnl: -10000,
      expectedCostBasis: 70000
    },
    acquisitionDecrease: {
      previousCostBasis: 100000,
      currentCostBasis: 70000,
      expectedDifference: -30000
    },
    acquisitionIncreaseWarning: {
      previousCostBasis: 100000,
      currentCostBasis: 160000,
      expectedDifference: 60000,
      expectedChangeRate: 0.6,
      expectedWarning: true
    },
    inconsistentPnl: {
      value: 60000,
      costBasis: 70000,
      pnl: -9999,
      expectedStatus: "要確認"
    },
    totalDifferenceNoWarning: {
      holdingsTotal: 950000,
      accountTotal: 1000000,
      expectedDifference: 50000,
      expectedWarning: false
    },
    totalDifferenceWarning: {
      holdingsTotal: 950000,
      accountTotal: 1000001,
      expectedDifference: 50001,
      expectedWarning: true
    },
    quantityChange: {
      previousQuantity: 10,
      currentQuantity: 12,
      expectedDifference: 2
    },
    quantityUnavailable: {
      previousQuantity: null,
      currentQuantity: 12,
      expectedDifference: null
    }
  }
};
