import {
  PAGE_WIDTH, PAGE_HEIGHT, TOTAL_ROWS, TOTAL_CELLS,
  makeCompositionRows, drawTextOverlay, resolveFontFamily,
} from "./layout.js";

const $ = id => document.getElementById(id);
const LOCAL_KEY = "essay-tracing-workbench-draft-v1";
const PREVIEW_DPI = 300;
let templatePdfBytes = null;
let templateImage = null;
let templatePdfError = null;
let templateImageError = null;
let currentFontBytes = null;
let currentFontFilename = "";
let currentFontFace = null;
let renderFrame = 0;
let toastTimer = null;
let lastComposition = null;

const defaultValues = {
  essayTitle: "在平凡中看见成长",
  essayBody: "成长不只发生在耀眼的时刻，也藏在一次次认真面对问题的过程中。遇到困难时，先停下来思考，再把问题拆成可以完成的小步骤，往往比急着放弃更有帮助。\n日常的努力不一定立刻看见结果，但练习、订正与反思会逐渐积累成真正的能力。把眼前的小事做好，就是在为下一次挑战准备底气。\n因此，我们不必要求自己一下子做到完美，而应在每次尝试后看见问题、及时调整。成长不是突然发生的奇迹，而是普通日子里的认真与坚持。",
  critiqueText: "优点：文章围绕成长展开，结构清楚，表达自然，能从日常学习中提炼观点。\n建议：可以增加一处更具体的经历，让论述更有画面感；部分抽象词语也可适当换成细节。",
  titleAlign: "center", bodyAlign: "left", indent: "2", paragraphGap: "0",
  fontSize: "12.5", gray: "68", fontStyle: "kai",
  critiqueMode: "card", critiquePlacement: "after", critiqueGap: "2",
  critiqueFontSize: "10", critiqueAlign: "left",
};

const settingIds = [
  "essayTitle", "essayBody", "critiqueText", "titleAlign", "bodyAlign", "indent", "paragraphGap",
  "fontSize", "gray", "fontStyle", "critiqueMode", "critiquePlacement", "critiqueGap", "critiqueFontSize", "critiqueAlign",
];

function setStatus(message, kind = "normal") {
  $("statusMessage").textContent = message;
  const footer = $("statusMessage").parentElement;
  footer.classList.toggle("warning", kind === "warning");
  footer.classList.toggle("error", kind === "error");
  $("statusDot").style.background = kind === "error" ? "#c45360" : kind === "warning" ? "#d29543" : "#45a880";
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2700);
}

function safeInt(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function getOptions() {
  return {
    titleAlign: $("titleAlign").value,
    bodyAlign: $("bodyAlign").value,
    indent: safeInt($("indent").value, 2, 0, 3),
    paragraphGap: safeInt($("paragraphGap").value, 0, 0, 3),
    fontSize: safeInt($("fontSize").value, 12.5, 8, 14),
    gray: safeInt($("gray").value, 68, 40, 90) / 100,
    fontStyle: $("fontStyle").value,
    customFontLoaded: Boolean(currentFontBytes),
    critiqueMode: $("critiqueMode").value,
    critiquePlacement: $("critiquePlacement").value,
    critiqueGap: safeInt($("critiqueGap").value, 2, 0, 5),
    critiqueFontSize: safeInt($("critiqueFontSize").value, 10, 8, 14),
    critiqueAlign: $("critiqueAlign").value,
  };
}

function getFormSnapshot() {
  const data = {};
  for (const id of settingIds) data[id] = $(id).value;
  return data;
}

function applyFormSnapshot(data = {}) {
  for (const id of settingIds) {
    if (data[id] !== undefined && $(id)) $(id).value = String(data[id]);
  }
  updateRangeLabels();
  updateFontStatus();
  renderNow();
  persistDraft();
}

function persistDraft() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ version: 1, ...getFormSnapshot() }));
  } catch (_error) {
    // Private browsing or restricted storage should not prevent core editing/export.
  }
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (draft && draft.version === 1) {
      applyFormSnapshot(draft);
      return true;
    }
  } catch (_error) {
    // Ignore a corrupted draft and continue with the built-in sample.
  }
  return false;
}

function updateRangeLabels() {
  $("fontSizeValue").textContent = `${Number($("fontSize").value).toFixed(1)} pt`;
  $("grayValue").textContent = `${$("gray").value}%`;
  $("bodyCount").textContent = `${Array.from($("essayBody").value).length} 字`;
}

function updateFontStatus(extra = "") {
  if (currentFontBytes) {
    $("fontStatus").textContent = `已加载本地字体：${currentFontFilename || "自定义字体"}。仅在当前设备使用，不会上传。`;
  } else {
    const labels = { kai: "楷体", song: "宋体", sans: "黑体" };
    $("fontStatus").textContent = `${extra || `优先使用设备上的${labels[$("fontStyle").value] || "楷体"}`}；不同设备的可用字体可能不同。`;
  }
}

function drawPreviewBase() {
  const canvas = $("previewCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!templateImage || !templateImage.complete || !templateImage.naturalWidth) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(templateImage, 0, 0, canvas.width, canvas.height);
}

function evaluateComposition() {
  const { rows, info } = makeCompositionRows($("essayTitle").value, $("essayBody").value, $("critiqueText").value, getOptions());
  return { rows, info };
}

function updateCompositionStatus(info) {
  const used = info.neededRows;
  $("rowsUsed").textContent = `${Math.min(used, TOTAL_ROWS)} / ${TOTAL_ROWS}`;
  $("rowsUsed").style.color = info.overflow || info.conflict ? "#ad6b20" : "#404f83";
  $("cellsUsed").textContent = String(TOTAL_CELLS);
  const warning = $("warningBox");
  if (info.conflict) {
    warning.hidden = false;
    warning.textContent = "点评位置冲突：正文占用了页底点评卡片的位置。请减少正文、缩短点评，或把点评位置改为「正文后留空」。目前不会允许导出。";
    setStatus("请先解决正文与页底点评的重叠问题。", "warning");
  } else if (info.overflow) {
    warning.hidden = false;
    warning.textContent = `内容需要约 ${info.neededRows} 行，但答题卡最多容纳 ${TOTAL_ROWS} 行。请缩短正文、减少段间距或精简点评后再导出。`;
    setStatus("内容超出答题卡容量，暂不能导出。", "warning");
  } else if (templateImageError) {
    warning.hidden = false;
    warning.textContent = `答题卡预览图加载失败：${templateImageError}。请确认 assets/answer-template-preview.png 已上传到仓库，并强制刷新页面。`;
    setStatus("答题卡预览图加载失败。", "error");
  } else if (templatePdfError) {
    warning.hidden = false;
    warning.textContent = `预览已经加载，但 PDF 模板读取失败：${templatePdfError}。请确认 assets/answer-template.pdf 已上传；暂时无法导出 PDF。`;
    setStatus("预览正常；PDF 模板未加载，暂不能导出。", "warning");
  } else {
    warning.hidden = true;
    warning.textContent = "";
    setStatus(`预览已更新 · ${info.chars} 字 · ${Math.min(used, TOTAL_ROWS)} / ${TOTAL_ROWS} 行。`, "normal");
  }
  $("exportPdf").disabled = Boolean(info.conflict || info.overflow || !templatePdfBytes);
}

function renderNow() {
  if (!templateImage) return;
  const canvas = $("previewCanvas");
  if (!canvas.width || !canvas.height) {
    canvas.width = templateImage.naturalWidth || 1516;
    canvas.height = templateImage.naturalHeight || 1061;
  }
  drawPreviewBase();
  const { rows, info } = evaluateComposition();
  const ctx = canvas.getContext("2d", { alpha: false });
  // The base has already been drawn; use a temporary transparent layer for the overlaid text.
  const overlay = document.createElement("canvas");
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  const overlayCtx = overlay.getContext("2d");
  drawTextOverlay(overlayCtx, rows, getOptions(), overlay.width, overlay.height);
  ctx.drawImage(overlay, 0, 0);
  $("paperWrap")?.classList.add("has-rendered");
  lastComposition = { rows, info };
  updateCompositionStatus(info);
  updateRangeLabels();
  persistDraft();
}

function scheduleRender() {
  cancelAnimationFrame(renderFrame);
  renderFrame = requestAnimationFrame(renderNow);
}

function base64FromBytes(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function bytesFromBase64(data) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function useCustomFont(bytes, filename) {
  if (currentFontFace) {
    document.fonts.delete(currentFontFace);
    currentFontFace = null;
  }
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const face = new FontFace("UploadedEssayFont", arrayBuffer);
  await face.load();
  // Replace any previous uploaded font so the newest selection is always used.
  document.fonts.add(face);
  currentFontFace = face;
  currentFontBytes = new Uint8Array(bytes);
  currentFontFilename = filename || "自定义字体";
  updateFontStatus();
  await document.fonts.ready;
  scheduleRender();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("浏览器无法生成 PNG 图片。")), "image/png");
  });
}

let pdfLibPromise = null;
async function ensurePdfLib() {
  if (window.PDFLib?.PDFDocument) return window.PDFLib;
  if (!pdfLibPromise) {
    pdfLibPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onload = () => window.PDFLib?.PDFDocument
        ? resolve(window.PDFLib)
        : reject(new Error("PDF 导出组件已下载，但无法初始化。"));
      script.onerror = () => reject(new Error("无法加载 PDF 导出组件。请检查网络后重试；实时预览不受影响。"));
      document.head.appendChild(script);
    }).catch(error => {
      pdfLibPromise = null;
      throw error;
    });
  }
  return pdfLibPromise;
}

async function exportPdf() {
  // Re-read the live fields synchronously so the just-edited value cannot lag a pending animation frame.
  renderNow();
  if (!templatePdfBytes) throw new Error("答题卡 PDF 模板尚未加载完成，请稍后重试。");
  const { rows, info } = lastComposition || evaluateComposition();
  if (info.conflict || info.overflow) throw new Error("内容与点评区存在冲突或超出格数，请先根据预览下方的提示调整。 ");

  const exportScale = PREVIEW_DPI / 72;
  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.width = Math.round(PAGE_WIDTH * exportScale);
  overlayCanvas.height = Math.round(PAGE_HEIGHT * exportScale);
  const overlayCtx = overlayCanvas.getContext("2d", { alpha: true });
  if (!overlayCtx) throw new Error("浏览器无法创建 PDF 导出画布。");
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  await document.fonts.ready;
  drawTextOverlay(overlayCtx, rows, getOptions(), overlayCanvas.width, overlayCanvas.height);
  const overlayBlob = await canvasBlob(overlayCanvas);
  const overlayBytes = new Uint8Array(await overlayBlob.arrayBuffer());

  const PDFLib = await ensurePdfLib();
  const pdfDoc = await PDFLib.PDFDocument.load(templatePdfBytes);
  const page = pdfDoc.getPages()[0];
  const embeddedOverlay = await pdfDoc.embedPng(overlayBytes);
  page.drawImage(embeddedOverlay, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  pdfDoc.setTitle("作文描摹工作台 - A3 作文答题卡");
  pdfDoc.setAuthor("旷淡");
  pdfDoc.setSubject("本地生成的作文描摹答题卡");
  const output = await pdfDoc.save({ useObjectStreams: true });
  const blob = new Blob([output], { type: "application/pdf" });
  downloadBlob(blob, "作文描摹答题卡.pdf");
  // Release a relatively large temporary canvas promptly on mobile browsers.
  overlayCanvas.width = 1; overlayCanvas.height = 1;
  setStatus(`PDF 已生成 · A3 横向 · ${PREVIEW_DPI} DPI 文字叠层。`, "normal");
  showToast("PDF 已生成。若 iPhone 显示预览，可使用分享菜单存入「文件」。");
}

function setDefaultContent() {
  for (const [id, value] of Object.entries(defaultValues)) $(id).value = value;
  scheduleRender();
}

async function loadTemplateAssets() {
  // Load the PNG preview independently of the PDF template. A failed PDF request must
  // never prevent the live canvas from appearing (the previous Promise.all did so).
  // Resolve from the page URL rather than the module URL so Pages deployments
  // under /<repository>/ and custom-domain root deployments both work.
  const imageUrl = new URL("./assets/answer-template-preview.png", document.baseURI).href;
  const pdfUrl = new URL("./assets/answer-template.pdf", document.baseURI).href;
  setStatus("正在读取答题卡预览图……", "normal");

  try {
    const image = new Image();
    image.decoding = "async";
    const imageLoaded = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error(`预览图加载超时：${imageUrl}`)), 12000);
      image.onload = () => { clearTimeout(timeoutId); resolve(image); };
      image.onerror = () => { clearTimeout(timeoutId); reject(new Error(`无法读取 ${imageUrl}`)); };
    });
    image.src = imageUrl;
    templateImage = await imageLoaded;
    // Do not await decode(): some mobile browser versions can leave this promise pending.
    // onload already guarantees the image resource is available to drawImage().
    if (typeof templateImage.decode === "function") templateImage.decode().catch(() => {});
    templateImageError = null;
    const canvas = $("previewCanvas");
    canvas.width = templateImage.naturalWidth || 1516;
    canvas.height = templateImage.naturalHeight || 1061;
    renderNow();
    setStatus("答题卡预览图已加载，正在读取 PDF 模板……", "normal");
  } catch (error) {
    templateImageError = error.message || "未知图片加载错误";
    console.error("Answer-card preview image failed:", error);
    const canvas = $("previewCanvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      canvas.width = 900;
      canvas.height = 630;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#9b3440";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("答题卡预览加载失败", 36, 56);
      ctx.fillStyle = "#5b6474";
      ctx.font = "16px sans-serif";
      ctx.fillText("请确认 assets 文件夹完整上传，并刷新页面。", 36, 90);
      $("paperWrap")?.classList.add("has-rendered");
    }
  }

  const pdfController = new AbortController();
  const pdfTimeoutId = setTimeout(() => pdfController.abort(), 12000);
  try {
    const pdfResponse = await fetch(pdfUrl, { cache: "no-cache", signal: pdfController.signal });
    if (!pdfResponse.ok) throw new Error(`HTTP ${pdfResponse.status}（${pdfUrl}）`);
    templatePdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
    templatePdfError = null;
  } catch (error) {
    templatePdfBytes = null;
    templatePdfError = error.name === "AbortError" ? `读取 PDF 模板超时（${pdfUrl}）` : (error.message || "未知 PDF 加载错误");
    console.error("Answer-card PDF template failed:", error);
  } finally {
    clearTimeout(pdfTimeoutId);
  }

  if (templateImage && !templateImageError) {
    const { info } = evaluateComposition();
    updateCompositionStatus(info);
    if (!templatePdfError && window.PDFLib?.PDFDocument) {
      setStatus("答题卡预览已就绪；排版和 PDF 生成均在本机进行。", "normal");
    }
  } else {
    setStatus("无法显示答题卡，请查看下方提示并确认 assets 文件已上传。", "error");
    $("warningBox").hidden = false;
    $("warningBox").textContent = `答题卡预览图加载失败：${templateImageError || "未知错误"}。请确认项目目录中保留 assets 文件夹，并通过 GitHub Pages 或本地 Web 服务器打开页面。`;
  }
}

function triggerTextFileImport(file) {
  if (!file) return;
  file.text().then(text => {
    $("essayBody").value = text.replace(/^\uFEFF/, "");
    scheduleRender();
    showToast(`已导入 ${file.name}`);
  }).catch(() => showToast("TXT 文件读取失败，请检查文件编码。"));
}

function saveProject() {
  const project = {
    app: "作文描摹工作台",
    projectVersion: 1,
    savedAt: new Date().toISOString(),
    values: getFormSnapshot(),
    // Font bytes are only serialized into this user-initiated file. They are never sent to a server.
    customFont: currentFontBytes ? { filename: currentFontFilename, dataBase64: base64FromBytes(currentFontBytes) } : null,
  };
  const data = new Blob([JSON.stringify(project, null, 2)], { type: "application/json;charset=utf-8" });
  downloadBlob(data, "作文描摹项目.json");
  showToast(currentFontBytes ? "项目已保存（包含所选字体数据）。" : "项目已保存。所选系统字体由打开项目的设备决定。");
}

async function openProjectFile(file) {
  if (!file) return;
  try {
    const project = JSON.parse(await file.text());
    const values = project.values || project;
    if (!values || typeof values !== "object") throw new Error("文件中没有可识别的项目设置。");
    applyFormSnapshot(values);
    if (project.customFont?.dataBase64) {
      await useCustomFont(bytesFromBase64(project.customFont.dataBase64), project.customFont.filename || "项目字体");
      showToast("项目已打开，包含自定义字体。 ");
    } else {
      currentFontBytes = null;
      currentFontFilename = "";
      if (currentFontFace) {
        document.fonts.delete(currentFontFace);
        currentFontFace = null;
      }
      updateFontStatus("项目已打开");
      scheduleRender();
      showToast("项目已打开。若原来使用自定义字体，请重新选择字体文件。 ");
    }
  } catch (error) {
    showToast(`打开项目失败：${error.message || "文件格式不正确"}`);
  }
}

async function handleFontFile(file) {
  if (!file) return;
  const extension = file.name.split(".").pop().toLowerCase();
  if (!["ttf", "otf"].includes(extension)) {
    showToast("请选择 TTF 或 OTF 字体文件。 ");
    return;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await useCustomFont(bytes, file.name);
    showToast("字体已在本机加载。导出 PDF 时会按当前字体绘制文字。 ");
  } catch (error) {
    console.error(error);
    showToast("字体加载失败。请换用有效的 TTF 或 OTF 文件；部分 TTC 字体集合不支持。 ");
  } finally {
    $("fontImport").value = "";
  }
}

function bindEvents() {
  for (const id of settingIds) {
    $(id).addEventListener("input", scheduleRender);
    $(id).addEventListener("change", scheduleRender);
  }
  $("fontSize").addEventListener("input", updateRangeLabels);
  $("gray").addEventListener("input", updateRangeLabels);
  $("fontStyle").addEventListener("change", () => { updateFontStatus(); scheduleRender(); });
  $("resetFont").addEventListener("click", () => {
    if (currentFontFace) document.fonts.delete(currentFontFace);
    currentFontFace = null;
    currentFontBytes = null;
    currentFontFilename = "";
    updateFontStatus();
    scheduleRender();
    showToast("已恢复使用当前设备的字体。 ");
  });
  $("critiquePlacement").addEventListener("change", () => {
    $("critiqueGapSetting").style.opacity = $("critiquePlacement").value === "bottom" ? ".45" : "1";
    scheduleRender();
  });
  $("clearBody").addEventListener("click", () => { $("essayBody").value = ""; scheduleRender(); $("essayBody").focus(); });
  $("clearCritique").addEventListener("click", () => { $("critiqueText").value = ""; scheduleRender(); });
  $("refreshPreview").addEventListener("click", () => { renderNow(); showToast("预览已刷新"); });
  $("txtImport").addEventListener("change", event => { triggerTextFileImport(event.target.files?.[0]); event.target.value = ""; });
  $("fontImport").addEventListener("change", event => handleFontFile(event.target.files?.[0]));
  $("projectImport").addEventListener("change", event => { openProjectFile(event.target.files?.[0]); event.target.value = ""; });
  $("saveProject").addEventListener("click", saveProject);
  $("exportPdf").addEventListener("click", async () => {
    const button = $("exportPdf");
    button.disabled = true;
    const oldContent = button.innerHTML;
    button.textContent = "正在生成 PDF…";
    try { await exportPdf(); }
    catch (error) {
      console.error(error);
      showToast(error.message || "导出失败，请刷新页面后重试。");
      setStatus(error.message || "PDF 导出失败。", "error");
    } finally {
      button.innerHTML = oldContent;
      if (lastComposition) $("exportPdf").disabled = Boolean(lastComposition.info.conflict || lastComposition.info.overflow || !templatePdfBytes);
    }
  });
  window.addEventListener("resize", () => {
    // Canvas scales with CSS; its internal coordinate system stays tied to the template.
  }, { passive: true });
}

async function initialize() {
  bindEvents();
  updateRangeLabels();
  const restored = restoreDraft();
  if (!restored) setDefaultContent();
  // If opened as a standalone web app, the same responsive layout still follows viewport width and aspect ratio.
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("./sw.js").catch(error => console.warn("Service worker registration skipped:", error));
  }
  await loadTemplateAssets();
  if (restored) showToast("已恢复本机上次编辑的内容。 ");
}

initialize();
