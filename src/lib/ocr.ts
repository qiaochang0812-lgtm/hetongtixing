import { createWorker, type Worker } from "tesseract.js";
import { withTimeout } from "@/lib/async";

/** fraction：0～1，整个 OCR 过程（含冷启动）的进度。 */
export type OcrReport = (fraction: number, label: string) => void;

const IDLE_MS = 120_000;
let engine: Promise<Worker> | null = null;
let report: OcrReport | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

const abs = (path: string): string => new URL(path, document.baseURI).href;

const STAGES: Record<string, [number, number, string]> = {
  "loading tesseract core": [0, 0.15, "正在加载识别引擎…"],
  "initializing tesseract": [0.15, 0.2, "正在初始化识别引擎…"],
  "loading language traineddata": [0.2, 0.35, "正在加载中文识别模型…"],
  "initializing api": [0.35, 0.4, "正在初始化识别引擎…"],
  "recognizing text": [0.4, 1, "正在识别文字…"],
};

async function check(path: string, what: string): Promise<boolean> {
  try {
    const res = await withTimeout(fetch(abs(path)), 10_000, `${what}读取超时`);
    const type = res.headers.get("content-type") ?? "";
    void res.body?.cancel();
    return res.ok && !type.includes("text/html");
  } catch {
    return false;
  }
}

/** 先确认打包进应用的识别组件都在，缺了就直接说缺什么，不让 worker 无声卡死。 */
async function preflight(): Promise<void> {
  if (!(await check("tesseract/worker.min.js", "识别引擎"))) {
    throw new Error("应用里缺少识别引擎文件（tesseract/worker.min.js），请重新构建应用。");
  }
  const core =
    (await check("tesseract/core/tesseract-core-simd-lstm.wasm.js", "识别核心")) ||
    (await check("tesseract/core/tesseract-core-lstm.wasm.js", "识别核心"));
  if (!core) throw new Error("应用里缺少识别核心文件（tesseract/core），请重新构建应用。");
  if (!(await check("tesseract/lang/chi_sim.traineddata.gz", "中文模型"))) {
    throw new Error("应用里缺少中文识别模型（tesseract/lang），请重新构建应用。");
  }
}

async function startEngine(): Promise<Worker> {
  await preflight();
  const worker = await withTimeout(
    createWorker("chi_sim", 1, {
      workerPath: abs("tesseract/worker.min.js"),
      corePath: abs("tesseract/core"),
      langPath: abs("tesseract/lang"),
      workerBlobURL: false,
      cacheMethod: "none",
      gzip: true,
      logger: (message: { status: string; progress: number }) => {
        const stage = STAGES[message.status];
        if (stage && report) report(stage[0] + (stage[1] - stage[0]) * (message.progress || 0), stage[2]);
      },
    }),
    60_000,
    "识别引擎启动超时（60 秒）。手机内存不足时会这样，请关闭其他应用后重试。",
  );
  try {
    await worker.setParameters({ tessedit_do_invert: "0", user_defined_dpi: "150" });
  } catch {
    // 参数只是加速用，失败不影响识别
  }
  return worker;
}

function getEngine(): Promise<Worker> {
  if (!engine) {
    engine = startEngine().catch((error) => {
      engine = null;
      throw error;
    });
  }
  return engine;
}

export function closeOcr(): void {
  if (idleTimer) clearTimeout(idleTimer);
  const current = engine;
  engine = null;
  void current?.then((worker) => worker.terminate()).catch(() => undefined);
}

/** 点“上传合同”时就先启动引擎，用户选文件的这几秒里它已经在加载了。 */
export function warmOcr(): void {
  if (idleTimer) clearTimeout(idleTimer);
  void getEngine().catch(() => undefined);
  idleTimer = setTimeout(closeOcr, IDLE_MS);
}

export async function recognizeCanvas(canvas: HTMLCanvasElement, onReport: OcrReport): Promise<string> {
  report = onReport;
  if (idleTimer) clearTimeout(idleTimer);
  try {
    const worker = await getEngine();
    onReport(0.4, "正在识别文字…");
    const { data } = await withTimeout(
      worker.recognize(canvas),
      150_000,
      "识别超时（超过 2 分半钟），请换一张更清晰的图片再试。",
    ).catch((error) => {
      closeOcr();
      throw error;
    });
    return data.text ?? "";
  } finally {
    report = null;
    idleTimer = setTimeout(closeOcr, IDLE_MS);
  }
}
