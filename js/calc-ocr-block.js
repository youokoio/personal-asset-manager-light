"use strict";

function parseOcrBlockFields(lines,blocks,fieldRules) {
  const fields = {};
  const blockResults = [];
  const usedLineNumbers = new Set();
  const sourceLines = Array.isArray(lines) ? lines : [];
  const rules = Array.isArray(blocks) ? blocks : [];
  const definitions = fieldRules || {};
  const handledFields = new Set();

  for (const block of rules) {
    const entries = Array.isArray(block.entries) ? block.entries : [];
    const headings = normalizeOcrWordList(block.headingLabels)
      .map(value => normalizeOcrWidth(value));
    const ignored = normalizeOcrWordList(block.ignoreLines)
      .map(value => normalizeOcrWidth(value));
    const searchable = sourceLines.filter(line => {
      if (ignored.includes(normalizeOcrWidth(line.text))) {
        usedLineNumbers.add(line.lineNumber);
        return false;
      }
      return true;
    });
    const starts = [];

    if (entries.length > 0) {
      for (let i = 0; i < searchable.length; i += 1) {
        if (normalizeOcrWidth(searchable[i].text) ===
            normalizeOcrWidth(entries[0].label)) {
          starts.push(i);
        }
      }
    }

    let reason = null;
    let labelLines = [];
    let valueLines = [];
    let headingLines = [];
    let scannedLines = [];

    if (entries.length === 0) {
      reason = "ブロックの項目定義がありません。";
    } else if (starts.length === 0) {
      reason = "項目名のまとまりの起点がありません。";
      scannedLines = searchable.filter(line =>
        entries.some(entry =>
          normalizeOcrWidth(line.text) === normalizeOcrWidth(entry.label)
        )
      );
    } else if (starts.length > 1) {
      reason = "項目名のまとまりの起点が複数あります。";
      for (const start of starts) {
        scannedLines.push(...searchable.slice(
          start,
          Math.min(searchable.length,start + entries.length * 2 + headings.length + 1)
        ));
      }
    } else {
      let cursor = starts[0];

      for (const entry of entries) {
        while (cursor < searchable.length &&
               headings.includes(normalizeOcrWidth(searchable[cursor].text))) {
          headingLines.push(searchable[cursor]);
          cursor += 1;
        }

        const line = searchable[cursor];
        if (!line ||
            normalizeOcrWidth(line.text) !== normalizeOcrWidth(entry.label)) {
          reason = "項目名の順番または途中の行が一致しません。";
          if (line) scannedLines.push(line);
          break;
        }

        labelLines.push(line);
        scannedLines.push(line);
        cursor += 1;
      }

      if (!reason) {
        for (let i = 0; i < entries.length; i += 1) {
          const line = searchable[cursor + i];
          if (!line) {
            reason = "値のまとまりが不足しています。";
            break;
          }
          valueLines.push(line);
          scannedLines.push(line);
          if (!isOcrBlockValueKind(line.text,entries[i].kind)) {
            reason = "値の種類が一致しません。";
            break;
          }
        }
      }

      if (!reason) {
        const extraLine = searchable[cursor + entries.length];
        if (extraLine && /\d/.test(normalizeOcrWidth(extraLine.text))) {
          reason = "値のまとまりの後に余分な数値行があります。";
          scannedLines.push(extraLine);
        }
      }

      if (reason) {
        scannedLines.push(...labelLines,...valueLines);
        const start = starts[0];
        scannedLines.push(...searchable.slice(
          start,
          Math.min(searchable.length,start + entries.length * 2 + headings.length + 1)
        ));
      }
    }

    const blockFieldNames = entries
      .map(entry => entry.field)
      .filter(fieldName => typeof fieldName === "string" && fieldName);
    const uniqueCandidateLines = [];
    const seenLineNumbers = new Set();

    for (const line of scannedLines) {
      if (!seenLineNumbers.has(line.lineNumber)) {
        seenLineNumbers.add(line.lineNumber);
        uniqueCandidateLines.push({
          lineNumber:line.lineNumber,
          text:maskOcrSensitiveDigits(line.text)
        });
      }
    }

    if (reason) {
      for (const fieldName of blockFieldNames) {
        handledFields.add(fieldName);
        const fieldRule = definitions[fieldName] || {};
        fields[fieldName] = {
          field:fieldName,
          status:"block-unconfirmed",
          value:null,
          original:null,
          candidates:[],
          required:fieldRule.required === true,
          usedLineNumbers:[]
        };
      }

      blockResults.push({
        blockId:block.blockId || null,
        status:"unconfirmed",
        reason,
        candidateLines:uniqueCandidateLines
      });
      continue;
    }

    for (const line of [...labelLines,...valueLines,...headingLines]) {
      usedLineNumbers.add(line.lineNumber);
    }

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (typeof entry.field !== "string" || !entry.field) continue;

      const fieldName = entry.field;
      const fieldRule = definitions[fieldName] || {};
      const valueLine = valueLines[i];
      const parsed = entry.kind === "amount"
        ? normalizeOcrAmount(valueLine.text,fieldRule.negativeMarks)
        : {value:null,error:"共通項目は金額である必要があります。"};
      const used = [labelLines[i].lineNumber,valueLine.lineNumber];

      handledFields.add(fieldName);
      fields[fieldName] = {
        field:fieldName,
        status:parsed.error ? "unreadable" : "recognized",
        value:parsed.value,
        original:valueLine.text,
        candidates:[{
          lineNumber:labelLines[i].lineNumber,
          valueLineNumber:valueLine.lineNumber,
          label:entry.label,
          original:valueLine.text,
          value:parsed.value,
          error:parsed.error
        }],
        required:fieldRule.required === true,
        usedLineNumbers:used
      };
    }

    blockResults.push({
      blockId:block.blockId || null,
      status:"recognized",
      reason:null,
      candidateLines:[]
    });
  }

  for (const [fieldName,fieldRule] of Object.entries(definitions)) {
    if (fieldRule && fieldRule.layout === "block" &&
        !handledFields.has(fieldName)) {
      fields[fieldName] = {
        field:fieldName,
        status:"block-unconfirmed",
        value:null,
        original:null,
        candidates:[],
        required:fieldRule.required === true,
        usedLineNumbers:[]
      };
    }
  }

  return {
    fields,
    blockResults,
    usedLineNumbers:Array.from(usedLineNumbers)
  };
}

function isOcrBlockValueKind(value,kind) {
  const source = normalizeOcrWidth(value).trim();
  const hasDigit = /\d/.test(source);

  if (kind === "amount") return hasDigit;
  if (kind === "percent") return hasDigit && /[%％]$/.test(source);
  if (kind === "multiple") return hasDigit && /倍$/.test(source);
  if (kind === "text") return !hasDigit;
  return false;
}
