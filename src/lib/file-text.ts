import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.js?url";
import { strFromU8, unzipSync } from "fflate";
import { type Progress, withTimeout } from "@/lib/async";
import { enhanceForOcr, imageToCanvas } from "@/lib/image";
import { recognizeCanvas } from "@/lib/ocr";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_BYTES = 30 * 1024 * 1024;
/** Word / TXT 没有“页”，取开头这么多字，相当于第一页。 */
const FIRST_PAGE_CHARS = 4000;
const IMAGE_EXT = /\.(jpe?g|png|webp|bmp|gif)$/;
/** 识别结果少于这个字数，就当作没读到。 */
const MIN_CHARS = 20;

type TextItem = { str?: string; transform?: number[]; hasEOL?: boolean };
type PdfPage = Awaited<ReturnType<PdfDoc["getPage"]>>;
type PdfDoc = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;

const countChars = (text: string): number => text.replace(/\s/g, "").length;

function pageText(items: TextItem[]): string {
  const lines: string[] = [];
  let line = "";
  let lastY: number | null = null;
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    const y = item.transform?.[5];
    if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 3) {
      lines.push(line);
      line = "";
    }
    line += item.str;
    if (item.hasEOL) {
      lines.push(line);
      line = "";
      lastY = null;
    } else if (y !== undefined) {
      lastY = y;
    }
  }
  lines.push(line);
  return lines.join("\n");
}

async function renderPage(page: PdfPage): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(3, 1500 / base.width) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("页面渲染失败，请重试。");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await withTimeout(page.render({ canvasContext: ctx, viewport }).promise, 30_000, "PDF 页面渲染超时。");
  return canvas;
}

async function ocrCanvas(canvas: HTMLCanvasElement, progress: Progress, from: number): Promise<string> {
  progress(from, "正在处理图像…");
  enhanceForOcr(canvas);
  const text = await recognizeCanvas(canvas, (fraction, label) => progress(from + (99 - from) * fraction, label));
  canvas.width = 0;
  canvas.height = 0;
  return text;
}

async function readPdf(file: File, progress: Progress): Promise<{ text: string; scanned: boolean }> {
  progress(5, "正在打开 PDF…");
  const buffer = await file.arrayBuffer();
  const doc = await withTimeout(
    pdfjs.getDocument({ data: new Uint8Array(buffer), cMapUrl: "./cmaps/", cMapPacked: true }).promise,
    25_000,
    "PDF 打开超时，文件可能损坏或有密码保护。",
  );
  const page = await withTimeout(doc.getPage(1), 15_000, "读取 PDF 第 1 页超时。");
  progress(15, "正在读取第 1 页…");
  const content = await withTimeout(page.getTextContent(), 15_000, "读取 PDF 文字超时。");
  const text = pageText(content.items as TextItem[]);
  if (countChars(text) >= MIN_CHARS) return { text, scanned: false };

  progress(20, "这是扫描件，转为图片识别…");
  const canvas = await renderPage(page);
  return { text: await ocrCanvas(canvas, progress, 25), scanned: true };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

function docxText(buffer: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(buffer), { filter: (entry) => entry.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("这个 Word 文件打不开，请另存为 .docx 或 PDF 后再试。");
  return decodeEntities(
    strFromU8(xml)
      .replace(/<w:tab\s*\/>/g, "\t")
      .replace(/<w:br\s*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

/**
 * 读出合同第 1 页的文字。PDF 取第 1 页（扫描件自动 OCR），图片整张识别，
 * Word / TXT 取开头一页的篇幅。progress 给出 0～100 的进度和当前步骤。
 */
export async function extractFileText(file: File, progress: Progress): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error("文件超过 30MB，太大了读不了。");
  const name = file.name.toLowerCase();
  let text = "";
  let scanned = false;

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    ({ text, scanned } = await readPdf(file, progress));
  } else if (file.type.startsWith("image/") || IMAGE_EXT.test(name)) {
    scanned = true;
    progress(8, "正在读取图片…");
    text = await ocrCanvas(await imageToCanvas(file), progress, 15);
  } else if (name.endsWith(".docx")) {
    progress(30, "正在读取 Word…");
    text = docxText(await file.arrayBuffer()).slice(0, FIRST_PAGE_CHARS);
  } else if (name.endsWith(".doc")) {
    throw new Error("旧版 .doc 读不了，请用 WPS/Word 另存为 .docx 或 PDF。");
  } else if (name.endsWith(".txt") || file.type.startsWith("text/")) {
    progress(30, "正在读取文本…");
    text = (await file.text()).slice(0, FIRST_PAGE_CHARS);
  } else {
    throw new Error("不支持这种文件，请选择 PDF、图片、Word(.docx) 或 TXT。");
  }

  if (countChars(text) < MIN_CHARS) {
    throw new Error(
      scanned
        ? "没有识别出文字。请确认图片清晰、光线充足、纸张放平，再试一次。"
        : "这份文件第 1 页读不到文字，请换一份或手动录入。",
    );
  }
  progress(99, "正在提取信息…");
  return text;
}
