// 构建前把离线 OCR 要用的文件复制进 public/tesseract：识别引擎(worker)、wasm 核心、中文模型。
// 找不到本地模型包时，尝试从 GitHub 下载 tessdata_fast 的简体中文模型。
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const out = "public/tesseract";

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, acc);
    else acc.push(path);
  }
  return acc;
}

async function main() {
  mkdirSync(join(out, "core"), { recursive: true });
  mkdirSync(join(out, "lang"), { recursive: true });

  copyFileSync("node_modules/tesseract.js/dist/worker.min.js", join(out, "worker.min.js"));

  const coreDir = "node_modules/tesseract.js-core";
  let cores = readdirSync(coreDir).filter((name) => /^tesseract-core.*\.(js|wasm)$/.test(name));
  const lstm = cores.filter((name) => name.includes("lstm"));
  if (lstm.length > 0) cores = lstm;
  for (const name of cores) copyFileSync(join(coreDir, name), join(out, "core", name));

  const target = join(out, "lang", "chi_sim.traineddata.gz");
  const files = walk("node_modules/@tesseract.js-data/chi_sim").filter((file) => /chi_sim\.traineddata(\.gz)?$/.test(file));
  const found =
    files.find((file) => /fast/.test(file)) ?? files.find((file) => /best_int/.test(file)) ?? files[0];
  if (found) {
    if (found.endsWith(".gz")) copyFileSync(found, target);
    else writeFileSync(target, gzipSync(readFileSync(found)));
    console.log("OCR language data from", found);
    return;
  }
  const url = "https://github.com/tesseract-ocr/tessdata_fast/raw/main/chi_sim.traineddata";
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed: ${response.status}`);
  writeFileSync(target, gzipSync(Buffer.from(await response.arrayBuffer())));
  console.log("OCR language data downloaded from", url);
}

main().catch((error) => {
  console.warn("copy-ocr-assets failed (OCR will be unavailable):", error instanceof Error ? error.message : error);
});
