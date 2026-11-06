import { createWorker, type Worker } from "tesseract.js";

function abs(path: string): string {
  return new URL(path, document.baseURI).href;
}

export type OcrSession = {
  recognize: (canvas: HTMLCanvasElement) => Promise<string>;
  close: () => Promise<void>;
};

/** 离线中文识别：引擎、模型都打包在应用里（见 scripts/copy-ocr-assets.mjs），不联网。 */
export async function openOcr(): Promise<OcrSession> {
  const worker: Worker = await createWorker("chi_sim", 1, {
    workerPath: abs("tesseract/worker.min.js"),
    corePath: abs("tesseract/core"),
    langPath: abs("tesseract/lang"),
    workerBlobURL: false,
    cacheMethod: "none",
    gzip: true,
  });
  return {
    recognize: async (canvas) => {
      const { data } = await worker.recognize(canvas);
      return data.text ?? "";
    },
    close: async () => {
      try {
        await worker.terminate();
      } catch {
        // ignore
      }
    },
  };
}

/** 照片通常有几千万像素，缩到长边 2200 以内，识别更快也不容易内存溢出。 */
export async function imageToCanvas(file: Blob, maxEdge = 2200): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("这种图片格式读不了，请换成 JPG 或 PNG。");
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("图片处理失败，请重试。");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}
