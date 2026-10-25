export const PAGE_WIDTH = 841.8900146484375;
export const PAGE_HEIGHT = 589.322998046875;
export const GRID_X_STARTS = [13.4702396393, 290.452, 569.1176];
export const GRID_TOP = 37.9887084961;
export const CELL_WIDTH = 15.352111799;
export const CELL_HEIGHT = 18.926934433;
export const CELL_DRAW_HEIGHT = 15.352111799;
export const COLS = 17;
export const ROWS_PER_COLUMN = 27;
export const COLUMN_COUNT = 3;
export const TOTAL_ROWS = ROWS_PER_COLUMN * COLUMN_COUNT;
export const TOTAL_CELLS = COLS * TOTAL_ROWS;

const blankRow = (kind = "blank") => ({ cells: Array(COLS).fill(""), kind });

function filledRow(text, startCell = 0, kind = "body") {
  const cells = Array(COLS).fill("");
  Array.from(text).forEach((character, index) => {
    const target = startCell + index;
    if (target >= 0 && target < COLS) cells[target] = character;
  });
  return { cells, kind };
}

export function splitParagraphs(value = "") {
  return String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .split("\n").map(line => line.trim()).filter(Boolean);
}

export function makeLayoutRows(title, body, options = {}) {
  const rows = [];
  const titleText = String(title || "").trim();
  const titleAlign = options.titleAlign || "center";
  const bodyAlign = options.bodyAlign || "left";
  const indent = Math.max(0, Math.min(COLS - 1, Number(options.indent ?? 2) || 0));
  const paragraphGap = Math.max(0, Math.min(3, Number(options.paragraphGap ?? 0) || 0));

  if (titleText) {
    const characters = Array.from(titleText);
    for (let i = 0; i < characters.length; i += COLS) {
      const chunk = characters.slice(i, i + COLS).join("");
      const offset = titleAlign === "left" ? 0 : Math.max(0, Math.floor((COLS - Array.from(chunk).length) / 2));
      rows.push(filledRow(chunk, offset, "title"));
    }
  }

  const paragraphs = splitParagraphs(body);
  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (paragraphIndex > 0 && paragraphGap > 0) {
      for (let i = 0; i < paragraphGap; i++) rows.push(blankRow());
    }
    const characters = Array.from(paragraph);
    if (bodyAlign === "center") {
      for (let i = 0; i < characters.length; i += COLS) {
        const chunk = characters.slice(i, i + COLS).join("");
        const offset = Math.max(0, Math.floor((COLS - Array.from(chunk).length) / 2));
        rows.push(filledRow(chunk, offset, "body"));
      }
      return;
    }
    let position = 0;
    let firstLine = true;
    while (position < characters.length) {
      const prefix = firstLine ? indent : 0;
      const available = COLS - prefix;
      const chunk = characters.slice(position, position + available).join("");
      rows.push(filledRow(chunk, prefix, "body"));
      position += Array.from(chunk).length;
      firstLine = false;
    }
  });
  return rows;
}

function makeCritiqueGridRows(text, align = "left") {
  const rows = [];
  const paragraphs = splitParagraphs(text);
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const chars = Array.from(paragraph);
    for (let position = 0; position < chars.length; position += COLS) {
      const chunk = chars.slice(position, position + COLS).join("");
      const offset = align === "center" ? Math.max(0, Math.floor((COLS - Array.from(chunk).length) / 2)) : 0;
      rows.push(filledRow(chunk, offset, "critique"));
    }
    if (paragraphIndex < paragraphs.length - 1) rows.push(blankRow());
  });
  return rows;
}

function estimateCritiqueBoxRows(text, fontSize, mode) {
  const width = COLS * CELL_WIDTH - 22;
  const charsPerLine = Math.max(7, Math.floor(width / Math.max(fontSize * 1.02, 1)));
  let wrappedLines = 0;
  const paragraphs = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  paragraphs.forEach(paragraph => {
    const clean = paragraph.trim();
    wrappedLines += clean ? Math.max(1, Math.ceil(Array.from(clean).length / charsPerLine)) : 1;
  });
  const titleHeight = fontSize * (mode === "card" ? 1.8 : 1.6);
  const totalHeight = 18 + titleHeight + Math.max(1, wrappedLines) * fontSize * 1.42 + 10;
  return Math.max(3, Math.min(ROWS_PER_COLUMN, Math.floor((totalHeight + CELL_HEIGHT - 1) / CELL_HEIGHT)));
}

export function makeCompositionRows(title, body, critique, options = {}) {
  const baseRows = makeLayoutRows(title, body, options);
  const cleanCritique = String(critique || "").trim();
  const info = {
    bodyRows: baseRows.length,
    critiqueRows: 0,
    neededRows: baseRows.length,
    conflict: false,
    overflow: false,
    chars: Array.from(String(title || "").trim()).length + splitParagraphs(body).reduce((n, p) => n + Array.from(p).length, 0) + Array.from(cleanCritique).length,
  };
  if (!cleanCritique) {
    info.overflow = baseRows.length > TOTAL_ROWS;
    return { rows: baseRows, info };
  }

  const mode = options.critiqueMode || "grid";
  const placement = options.critiquePlacement || "after";
  const gap = Math.max(0, Math.min(5, Number(options.critiqueGap ?? 2) || 0));
  const critiqueFontSize = Number(options.critiqueFontSize ?? 10) || 10;
  const critiqueAlign = options.critiqueAlign || "left";
  const isGrid = mode === "grid";
  const critiqueRows = isGrid ? makeCritiqueGridRows(cleanCritique, critiqueAlign) : [];
  const span = isGrid ? critiqueRows.length : estimateCritiqueBoxRows(cleanCritique, critiqueFontSize, mode);
  info.critiqueRows = span;

  if (placement === "bottom") {
    const start = TOTAL_ROWS - span;
    if (baseRows.length > start) {
      info.conflict = true;
      info.neededRows = Math.max(baseRows.length, TOTAL_ROWS);
      info.overflow = baseRows.length > TOTAL_ROWS;
      return { rows: baseRows.slice(0, TOTAL_ROWS), info };
    }
    const result = baseRows.slice();
    while (result.length < start) result.push(blankRow());
    if (isGrid) result.push(...critiqueRows);
    else {
      result.push({ ...blankRow("critique_box_start"), noteText: cleanCritique, noteRows: span, noteMode: mode });
      for (let i = 1; i < span; i++) result.push(blankRow("critique_box_cont"));
    }
    info.neededRows = TOTAL_ROWS;
    return { rows: result, info };
  }

  const result = baseRows.slice();
  for (let i = 0; i < gap; i++) result.push(blankRow());
  if (isGrid) result.push(...critiqueRows);
  else {
    const rowInColumn = result.length % ROWS_PER_COLUMN;
    if (rowInColumn + span > ROWS_PER_COLUMN) {
      const pad = ROWS_PER_COLUMN - rowInColumn;
      for (let i = 0; i < pad; i++) result.push(blankRow());
    }
    result.push({ ...blankRow("critique_box_start"), noteText: cleanCritique, noteRows: span, noteMode: mode });
    for (let i = 1; i < span; i++) result.push(blankRow("critique_box_cont"));
  }
  info.neededRows = result.length;
  info.overflow = result.length > TOTAL_ROWS;
  return { rows: result, info };
}

function chooseFontFamily(style, customLoaded) {
  if (customLoaded) return '"UploadedEssayFont", serif';
  if (style === "song") return '"Songti SC", "SimSun", "Noto Serif CJK SC", serif';
  if (style === "sans") return '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  return '"WorkbenchKai", "KaiTi", "STKaiti", "Kaiti SC", "KaiTi_GB2312", "AR PL UKai CN", serif';
}

function textBaselineForCenter(ctx, character, centerY, fontPx) {
  const metrics = ctx.measureText(character || "汉");
  const ascent = metrics.actualBoundingBoxAscent || fontPx * 0.78;
  const descent = metrics.actualBoundingBoxDescent || fontPx * 0.12;
  return centerY + (ascent - descent) / 2;
}

function wrapCanvasText(ctx, text, maxWidth) {
  const result = [];
  const paragraphs = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const paragraph of paragraphs) {
    if (!paragraph) { result.push(""); continue; }
    let line = "";
    for (const character of Array.from(paragraph)) {
      if (line && ctx.measureText(line + character).width > maxWidth) {
        result.push(line);
        line = character;
      } else line += character;
    }
    if (line) result.push(line);
  }
  return result;
}

function drawCritiqueBox(ctx, overallRow, row, options, sx, sy) {
  const column = Math.floor(overallRow / ROWS_PER_COLUMN);
  const rowInColumn = overallRow % ROWS_PER_COLUMN;
  const x0 = GRID_X_STARTS[column] + 1.4;
  const y0 = GRID_TOP + rowInColumn * CELL_HEIGHT + 1.4;
  const x1 = GRID_X_STARTS[column] + COLS * CELL_WIDTH - 1.4;
  const y1 = GRID_TOP + (rowInColumn + row.noteRows) * CELL_HEIGHT - 1.4;
  const px = x0 * sx, py = y0 * sy, pw = (x1 - x0) * sx, ph = (y1 - y0) * sy;
  const isSticky = row.noteMode === "sticky";
  ctx.save();
  ctx.fillStyle = isSticky ? "#fff9ca" : "#fbfcff";
  ctx.strokeStyle = isSticky ? "#d1ad47" : "#93a4d0";
  ctx.lineWidth = Math.max(0.8 * sx, 0.5);
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeRect(px, py, pw, ph);

  const headerSize = Math.max(7.5, Math.min(11.5, Number(options.critiqueFontSize || 10) + 0.5));
  ctx.fillStyle = "#111111";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 ${headerSize * sy}px ${chooseFontFamily(options.fontStyle, options.customFontLoaded)}`;
  const headerY = py + 8 * sy + headerSize * sy;
  ctx.fillText("范文点评", px + 8 * sx, headerY);
  let bodyY = headerY + 5 * sy;
  if (!isSticky) {
    const lineY = headerY + 5 * sy;
    ctx.strokeStyle = "#8b9ac1";
    ctx.lineWidth = Math.max(.8 * sx, .5);
    ctx.beginPath(); ctx.moveTo(px + 7 * sx, lineY); ctx.lineTo(px + pw - 7 * sx, lineY); ctx.stroke();
    bodyY = lineY + 5 * sy;
  }
  const bodyX = px + 8 * sx;
  const bodyWidth = pw - 16 * sx;
  const bodyBottom = py + ph - 6 * sy;
  let fontSize = Number(options.critiqueFontSize || 10);
  let lines = [];
  while (fontSize >= 6) {
    ctx.font = `${fontSize * sy}px ${chooseFontFamily(options.fontStyle, options.customFontLoaded)}`;
    lines = wrapCanvasText(ctx, row.noteText, bodyWidth);
    const maxLineH = fontSize * 1.25 * sy;
    if (bodyY + lines.length * maxLineH <= bodyBottom + 0.1 * sy) break;
    fontSize -= 0.5;
  }
  ctx.textAlign = options.critiqueAlign === "center" ? "center" : "left";
  const lineHeight = fontSize * 1.25 * sy;
  const textX = options.critiqueAlign === "center" ? bodyX + bodyWidth / 2 : bodyX;
  ctx.font = `${fontSize * sy}px ${chooseFontFamily(options.fontStyle, options.customFontLoaded)}`;
  for (let i = 0; i < lines.length; i++) {
    if (bodyY + (i + 1) * lineHeight > bodyBottom + lineHeight) break;
    const y = bodyY + i * lineHeight;
    if (lines[i]) ctx.fillText(lines[i], textX, y + fontSize * sy * 0.85);
  }
  ctx.restore();
}

export function drawTextOverlay(ctx, rows, options, canvasWidth, canvasHeight) {
  const sx = canvasWidth / PAGE_WIDTH;
  const sy = canvasHeight / PAGE_HEIGHT;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, TOTAL_ROWS); rowIndex++) {
    const row = rows[rowIndex];
    if (row.kind === "critique_box_start") {
      drawCritiqueBox(ctx, rowIndex, row, options, sx, sy);
      continue;
    }
    if (row.kind === "critique_box_cont") continue;
    const columnIndex = Math.floor(rowIndex / ROWS_PER_COLUMN);
    const rowInColumn = rowIndex % ROWS_PER_COLUMN;
    const xStart = GRID_X_STARTS[columnIndex];
    const centerY = (GRID_TOP + rowInColumn * CELL_HEIGHT + CELL_DRAW_HEIGHT / 2) * sy;
    const isCritique = row.kind === "critique";
    const size = Number(isCritique ? options.critiqueFontSize : options.fontSize) || (isCritique ? 10 : 12.5);
    const fontPx = size * sy;
    const gray = isCritique ? 0 : Math.max(0, Math.min(1, Number(options.gray ?? 0.68)));
    const channel = Math.round(gray * 255);
    ctx.fillStyle = `rgb(${channel}, ${channel}, ${channel})`;
    ctx.font = `${fontPx}px ${chooseFontFamily(options.fontStyle, options.customFontLoaded)}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    row.cells.forEach((character, cellIndex) => {
      if (!character || character.trim() === "") return;
      const centerX = (xStart + (cellIndex + 0.5) * CELL_WIDTH) * sx;
      const baselineY = textBaselineForCenter(ctx, character, centerY, fontPx);
      ctx.fillText(character, centerX, baselineY);
    });
  }
}

export function resolveFontFamily(style, customLoaded = false) {
  return chooseFontFamily(style, customLoaded);
}
