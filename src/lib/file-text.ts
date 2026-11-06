import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.js?url";
import { strFromU8, unzipSync } from "fflate";
import { imageToCanvas, openOcr } from "@/lib/ocr";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_BYTES = 30 * 1024 * 1024;

type TextItem = { str?: string; transform?: number[]; hasEOL?: boolean };

type PdfDoc = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;

async function openPdf(buffer: ArrayBuffer): Promise<PdfDoc> {
  return pdfjs.getDocument({
    data: new Uint8Array(buffer),
    cMapUrl: "./cmaps/",
    cMapPacked: true,
  }).promise;
}

async function pdfText(doc: PdfDoc): Promise<string> {
  const pages = Math.min(doc.numPages, 80);
  const out: string[] = [];
  for (let index = 1; index <= pages; index += 1) {
    const page = await doc.getPage(index);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let line = "";
    let lastY: number | null = null;
    for (const item of content.items as TextItem[]) {
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
        continue;
      }
      if (y !== undefined) lastY = y;
    }
    lines.push(line);
    out.push(lines.join("\n"));
  }
  return out.join("\n");
}

/** 扫描版 PDF 没有文字层：把页面画成图再识别。页数多时只读开头 4 页和最后 2 页（日期、金额、落款都在这些位置）。 */
async function pdfOcr(doc: PdfDoc, onStatus: (message: string) => void): Promise<string> {
  const total = doc.numPages;
  const wanted: number[] = [];
  for (let i = 1; i <= total; i += 1) {
    if (total <= 6 || i <= 4 || i > total - 2) wanted.push(i);
  }
  const ocr = await openOcr();
  try {
    const out: string[] = [];
    for (let i = 0; i < wanted.length; i += 1) {
      onStatus(`正在识别扫描件第 ${i + 1}/${wanted.length} 页，请稍候…`);
      const page = await doc.getPage(wanted[i]);
      const viewport = page.getViewport({ scale: 2.2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("页面渲染失败，请重试。");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      out.push(await ocr.recognize(canvas));
      canvas.width = 0;
      canvas.height = 0;
    }
    return out.join("\n");
  } finally {
    await ocr.close();
  }
}

async function imageOcr(file: Blob, onStatus: (message: string) => void): Promise<string> {
  onStatus("正在识别图片，请稍候…");
  const canvas = await imageToCanvas(file);
  const ocr = await openOcr();
  try {
    return await ocr.recognize(canvas);
  } finally {
    await ocr.close();
  }
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
  const files = unzipSync(new Uint8Array(buffer), { filter: (file) => file.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("这个 Word 文件打不开，请另存为 .docx 或 PDF 后再试。");
  const text = strFromU8(xml)
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text);
}

const IMAGE_EXT = /\.(jpe?g|png|webp|bmp|gif)$/;

/** 读出合同文件里的文字。支持 PDF（含扫描版）、图片（JPG/PNG）、Word(.docx)、TXT。 */
export async function extractFileText(file: File, onStatus: (message: string) => void = () => {}): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error("文件超过 30MB，太大了读不了。");
  const name = file.name.toLowerCase();
  let text = "";
  let scanned = false;
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const doc = await openPdf(await file.arrayBuffer());
    text = await pdfText(doc);
    if (text.replace(/\s/g, "").length < 20) {
      scanned = true;
      text = await pdfOcr(doc, onStatus);
    }
  } else if (file.type.startsWith("image/") || IMAGE_EXT.test(name)) {
    scanned = true;
    text = await imageOcr(file, onStatus);
  } else if (name.endsWith(".docx")) {
    text = docxText(await file.arrayBuffer());
  } else if (name.endsWith(".doc")) {
    throw new Error("旧版 .doc 读不了，请用 WPS/Word 另存为 .docx 或 PDF。");
  } else if (name.endsWith(".txt") || file.type.startsWith("text/")) {
    text = await file.text();
  } else {
    throw new Error("不支持这种文件，请选择 PDF、图片、Word(.docx) 或 TXT。");
  }
  if (text.replace(/\s/g, "").length < 20) {
    throw new Error(
      scanned
        ? "没有识别出文字。请确认图片清晰、光线充足、纸张放平，再试一次。"
        : "这份文件里读不到文字，请换一份或手动录入。",
    );
  }
  return text;
}
