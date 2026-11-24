function stockOcrSplitRakutenCardsStock(lines,format) {
  const cards = [];
  const sectionLabel = "保有商品詳細（すべて）";
  const normalizedSection = stockOcrNormalizeTextStock(sectionLabel);
  let inSection = false;
  let current = null;

  for (const line of lines) {
    const text = stockOcrNormalizeTextStock(line.text);

    if (text === normalizedSection ||
        text === "保有商品詳細(すべて)") {
      inSection = true;
      continue;
    }
    if (!inSection) continue;

    if (stockOcrIsHeadingStock(text,format)) {
      if (current) cards.push(current);
      current = {
        heading:text,
        lineNumber:line.lineNumber,
        lines:[line]
      };
      continue;
    }

    if (current) current.lines.push(line);
  }

  if (current) cards.push(current);
  return cards;
}

function stockOcrSplitIdecoCardsStock(lines,format) {
  const heading = "● 外国株式";
  const start = lines.findIndex(line =>
    stockOcrNormalizeTextStock(line.text) === heading
  );
  if (start < 0) return [];

  const end = lines.findIndex((line,index) =>
    index > start &&
    ["元本確保型","投資信託"].includes(
      stockOcrNormalizeTextStock(line.text)
    )
  );

  const selected = lines.slice(start,end < 0 ? lines.length : end);
  return [{
    heading,
    lineNumber:selected[0].lineNumber,
    lines:selected
  }];
}

function stockOcrSplitDcCardsStock(lines,format) {
  const headings = format.cardStyle.startLabels || [];
  const codeRecords = [];

  for (let index = 0; index < lines.length; index += 1) {
    const text = stockOcrNormalizeTextStock(lines[index].text);
    const ascii = text.replace(/[（）]/g,match =>
      match === "（" ? "(" : ")"
    );
    const embeddedMatch = ascii.match(/^(.*?)\(([0-9]{5})\)$/);

    if (embeddedMatch && embeddedMatch[1].trim()) {
      codeRecords.push({
        nameIndex:index,
        embeddedName:embeddedMatch[1].trim(),
        code:embeddedMatch[2]
      });
      continue;
    }

    if (/^\([0-9]{5}\)$/.test(ascii)) {
      codeRecords.push({
        nameIndex:index - 1,
        embeddedName:null,
        code:ascii.slice(1,-1)
      });
    }
  }

  const cards = [];

  for (let index = 0; index < codeRecords.length; index += 1) {
    const record = codeRecords[index];
    const nameIndex = record.nameIndex;
    const nextNameIndex = index + 1 < codeRecords.length
      ? codeRecords[index + 1].nameIndex
      : lines.length;

    if (nameIndex < 0 || nextNameIndex <= nameIndex) continue;

    let heading = null;
    for (let cursor = 0; cursor < nameIndex; cursor += 1) {
      const candidate = stockOcrNormalizeTextStock(lines[cursor].text);
      if (headings.includes(candidate)) heading = candidate;
    }

    const cardLines = lines.slice(nameIndex,nextNameIndex);

    if (record.embeddedName) {
      const sourceLine = cardLines[0];
      cardLines[0] = {
        lineNumber:sourceLine.lineNumber,
        text:record.embeddedName
      };
      cardLines.splice(1,0,{
        lineNumber:sourceLine.lineNumber,
        text:"(" + record.code + ")"
      });
    }

    if (heading) {
      cardLines.unshift({
        lineNumber:lines[Math.max(0,nameIndex - 1)].lineNumber,
        text:heading
      });
    }

    cards.push({
      heading,
      lineNumber:lines[nameIndex].lineNumber,
      lines:cardLines
    });
  }

  if (cards.length === 0) {
    const headingLines = lines.filter(line =>
      headings.includes(stockOcrNormalizeTextStock(line.text))
    );
    return headingLines.map(line => ({
      heading:stockOcrNormalizeTextStock(line.text),
      lineNumber:line.lineNumber,
      lines:[line]
    }));
  }

  return cards;
}

function stockOcrSplitCardsStock(lines,rule,format) {
  if (rule.ruleId === "rakuten-securities") {
    return stockOcrSplitRakutenCardsStock(lines,format);
  }
  if (rule.ruleId === "ideco") {
    return stockOcrSplitIdecoCardsStock(lines,format);
  }
  if (rule.ruleId === "corporate-dc") {
    return stockOcrSplitDcCardsStock(lines,format);
  }
  return [];
}

function stockOcrExtractNameStock(lines,format,heading) {
  const stopLabels = new Set(
    (format.nameStopLabels || []).map(stockOcrNormalizeTextStock)
  );
  const ignore = new Set(
    (format.ignoreLines || []).map(stockOcrNormalizeTextStock)
  );
  const parts = [];
  let code = null;

  for (const line of lines) {
    const text = stockOcrNormalizeTextStock(line.text);
    if (!text || text === heading || stopLabels.has(text) ||
        ignore.has(text)) continue;
    if (stockOcrIsHeadingStock(text,format)) continue;
    if (stockOcrIsWrapperCandidateStock(text,format)) continue;
    if (stockOcrIsCodeLineStock(text,format)) {
      if (code !== null) {
        return stockOcrFieldStock(null,"multiple");
      }
      code = text.replace(/[（）]/g,match =>
        match === "（" ? "(" : ")"
      ).replace(/^\(|\)$/g,"");
      continue;
    }
    if (stockOcrIsPercentLineStock(text) ||
        stockOcrIsYenLineStock(text) ||
        stockOcrIsPlainAmountLineStock(text)) continue;
    if (/円|％|%/.test(text)) continue;
    if (/^\d/.test(text)) continue;
    if (format.nameLinePattern &&
        !new RegExp(format.nameLinePattern).test(text)) continue;
    parts.push(text);
  }

  const name = parts.join("").trim();
  if (!name) return stockOcrFieldStock(null,"missing");

  const finalName = code
    ? name + " (" + code + ")"
    : name;

  return stockOcrFieldStock(
    finalName,"recognized",stockOcrMaskStock(finalName),"screen"
  );
}
