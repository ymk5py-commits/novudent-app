/** Calcula el tamaño destino encajando el lado más largo en maxDim (sin agrandar). Puro. */
export function fitDimensions(w: number, h: number, maxDim: number): { w: number; h: number } {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { w: 0, h: 0 };
  const longest = Math.max(w, h);
  if (longest <= maxDim) return { w: Math.round(w), h: Math.round(h) };
  const scale = maxDim / longest;
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/** Lee un File de imagen, lo redimensiona en canvas y devuelve un data URL JPEG.
 *  Wrapper fino sobre fitDimensions (no testeado: usa APIs del browser). */
export async function resizeToDataUrl(
  file: File,
  opts: { maxDim?: number; quality?: number } = {}
): Promise<string> {
  const { maxDim = 1400, quality = 0.8 } = opts;
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("Imagen inválida"));
    im.src = dataUrl;
  });
  const { w, h } = fitDimensions(img.naturalWidth, img.naturalHeight, maxDim);
  if (!w || !h) return dataUrl;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Tamaño aproximado en bytes de un data URL base64. Puro. */
export function dataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.floor(b64.length * 0.75);
}
