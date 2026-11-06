/** 图片转画布：长边限制在 maxEdge 以内（手机照片动辄几千万像素，不缩小会又慢又容易内存溢出）。 */
export async function imageToCanvas(file: Blob, maxEdge = 1800): Promise<HTMLCanvasElement> {
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
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("图片处理失败，请重试。");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** 转灰度并拉伸对比度（按 1%～99% 分位），拍照偏暗、偏灰、有阴影时识别率明显更好。 */
export function enhanceForOcr(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const gray = new Uint8ClampedArray(data.length / 4);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
    const value = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    gray[j] = value;
    hist[gray[j]] += 1;
  }
  const total = gray.length;
  let low = 0;
  let high = 255;
  for (let sum = 0; low < 255; low += 1) {
    sum += hist[low];
    if (sum >= total * 0.01) break;
  }
  for (let sum = 0; high > 0; high -= 1) {
    sum += hist[high];
    if (sum >= total * 0.01) break;
  }
  const span = Math.max(1, high - low);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
    const value = Math.min(255, Math.max(0, ((gray[j] - low) * 255) / span));
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  ctx.putImageData(image, 0, 0);
}
