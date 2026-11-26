function runStockOcrSelfDiagnosis(data) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(STOCK_OCR_RULES) ||
      STOCK_OCR_RULES.length !== 3) {
    errors.push("株式OCRの口座ルールが3口座分ありません。");
  }

  const requiredFunctions = [
    "parseStockOcrText",
    "stockOcrCalculateHoldingsTotalComparisonStock",
    "stockOcrCompareCardsStock",
    "saveStockOcrImportStock",
    "renderStockOcrUpdate"
  ];

  for (const name of requiredFunctions) {
    if (typeof globalThis[name] !== "function") {
      errors.push(name + " が読み込まれていません。");
    }
  }

  const usedAccounts = new Set();

  for (const rule of Array.isArray(STOCK_OCR_RULES)
    ? STOCK_OCR_RULES
    : []) {
    if (!rule || !Array.isArray(rule.accountNames) ||
        rule.accountNames.length !== 1 ||
        !Array.isArray(rule.formats) ||
        rule.formats.length !== 1) {
      errors.push("株式OCRの口座ルールの形式が正しくありません。");
      continue;
    }

    const accountName = rule.accountNames[0];
    if (usedAccounts.has(accountName)) {
      errors.push("株式OCRの口座ルールが重複しています：" + accountName);
    }
    usedAccounts.add(accountName);

    const matches = data.accounts.filter(account =>
      account.name === accountName &&
      account.category === "stock"
    );
    if (matches.length !== 1) {
      errors.push(
        accountName + " の株式口座が1件に特定できません。"
      );
    }

    const format = rule.formats[0];
    if (!format.identify ||
        !Array.isArray(format.identify.all) ||
        !format.cardStyle ||
        !format.fields) {
      errors.push(accountName + " のOCRルールが不足しています。");
    }
  }

  if (STOCK_OCR_RULES.length === 3) {
    for (let first = 0; first < STOCK_OCR_RULES.length; first += 1) {
      for (let second = first + 1;
           second < STOCK_OCR_RULES.length;
           second += 1) {
        if (STOCK_OCR_RULES[first].formats[0].fields ===
            STOCK_OCR_RULES[second].formats[0].fields) {
          errors.push("口座別のOCR項目定義が共有されています。");
        }
      }
    }
  }

  return {errors,warnings};
}
