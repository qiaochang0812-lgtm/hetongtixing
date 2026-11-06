// 把 pdf.js 的中文字体映射表复制到 public/cmaps，读不带内嵌字体的中文 PDF 时要用；缺了也不影响构建。
import { cpSync, existsSync } from "node:fs";

try {
  if (existsSync("node_modules/pdfjs-dist/cmaps")) {
    cpSync("node_modules/pdfjs-dist/cmaps", "public/cmaps", { recursive: true });
  }
} catch (error) {
  console.warn("copy-cmaps skipped:", error instanceof Error ? error.message : error);
}
