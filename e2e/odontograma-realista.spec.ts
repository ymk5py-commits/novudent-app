import { test, expect, entrarDemo, USUARIOS_DEMO } from "./soporte";
import type { Locator, Page } from "@playwright/test";

/* Carta dental con el arte realista (esmalte, raíz, volumen). Cada plantilla SVG se clona una
   vez por pieza y sus dientes se pintan con degradés y patrones (`url(#…)`). Lo que se cuida:
   que ningún diente se quede sin relleno cuando se ocultan casillas (vista oclusal, muelas del
   juicio, la arcada que no se mira en el celular) y que la grilla siga entera. */

async function abrirCarta(page: Page) {
  await entrarDemo(page, USUARIOS_DEMO.dentista);
  await page.goto("/app/pacientes/p1#odontograma");
  await expect(page.locator(".tooth-tile.side-view svg")).toHaveCount(32);
}

/** Piezas visibles cuyo relleno apunta a un degradé/patrón que el navegador no puede pintar.
 *  `url(#id)` resuelve contra el PRIMER elemento del documento con ese id; si ese elemento
 *  está en una casilla oculta (display:none), Chrome no lo pinta y el diente queda vacío. */
function piezasSinRelleno(page: Page) {
  return page.evaluate(() => {
    const seVe = (el: Element) => el.getClientRects().length > 0;
    const malas: string[] = [];
    document.querySelectorAll<HTMLElement>(".tooth-tile[data-tooth]").forEach((tile) => {
      const svg = tile.querySelector(".tooth-svg svg");
      if (!svg || !seVe(tile) || getComputedStyle(svg).opacity === "0") return;
      const vista = tile.classList.contains("occl-view") ? "oclusal" : "lateral";
      let pintadas = 0;
      svg.querySelectorAll("path, rect, ellipse, circle, polygon").forEach((el) => {
        if (!seVe(el)) return;
        const m = /url\("?#([^")]+)"?\)/.exec(getComputedStyle(el).fill);
        if (!m) return;
        pintadas++;
        const destino = document.getElementById(m[1]);
        const casilla = destino?.closest(".tooth-tile");
        if (!destino || !casilla || !seVe(casilla)) malas.push(`${tile.dataset.tooth} ${vista}: #${el.id || el.tagName} → #${m[1]}`);
      });
      if (!pintadas && tile.querySelector('[id="tooth-base"][data-active="1"]')) malas.push(`${tile.dataset.tooth} ${vista}: sin degradés`);
    });
    return malas;
  });
}

/** Fracción de píxeles «de diente» (marfil o raíz: cálidos y no blancos) en una captura. */
async function calidos(page: Page, loc: Locator) {
  const png = (await loc.screenshot({ animations: "disabled" })).toString("base64");
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] - data[i + 2] >= 6 && data[i] + data[i + 1] + data[i + 2] < 750) n++;
    return n / (data.length / 4);
  }, png);
}

/** Cuánto más «diente» hay en la captura con el relleno que sin él (el mismo SVG con
 *  `fill:none` en todo lo que pinta con url(#…): queda el contorno y las líneas). Un diente bien
 *  pintado da más del doble; uno que perdió el degradé da ~1. No depende del tamaño de pantalla. */
async function relleno(page: Page, n: number, vista: "side" | "occl") {
  const svg = page.locator(`.tooth-tile.${vista}-view[data-tooth="${n}"] .tooth-svg svg`);
  await svg.scrollIntoViewIfNeeded();
  const lleno = await calidos(page, svg);
  const estilos = await svg.evaluate((s) => [...s.querySelectorAll<SVGElement>("*")].map((e) => {
    const antes = e.getAttribute("style");
    if (/url\(/.test(getComputedStyle(e).fill)) e.style.setProperty("fill", "none", "important");
    return antes;
  }));
  const vacio = await calidos(page, svg);
  await svg.evaluate((s, estilos) => [...s.querySelectorAll("*")].forEach((e, i) => {
    if (estilos[i] === null) e.removeAttribute("style");
    else e.setAttribute("style", estilos[i]!);
  }), estilos);
  return lleno / Math.max(vacio, 0.001);
}

const lateral = (page: Page, n: number) => page.locator(`.tooth-tile.side-view[data-tooth="${n}"]`);

test.describe("Carta dental realista", () => {
  test("las 32 piezas laterales y las 32 casillas oclusales, todas con relleno", async ({ page }) => {
    await abrirCarta(page);
    await expect(page.locator(".tooth-tile.occl-view")).toHaveCount(32);
    expect(await piezasSinRelleno(page)).toEqual([]);
    // Las 64 casillas siguen en las 4 filas de 16 de siempre (mismo tamaño, mismos márgenes).
    const anchos = await page.locator(".tooth-tile.side-view").evaluateAll((ts) => ts.map((t) => Math.round(t.getBoundingClientRect().width)));
    expect(new Set(anchos).size).toBe(1);
    for (const n of [17, 11, 33, 46]) expect(await relleno(page, n, "side"), `pieza ${n}`).toBeGreaterThan(1.6);
    for (const n of [17, 36]) expect(await relleno(page, n, "occl"), `oclusal ${n}`).toBeGreaterThan(1.6);
  });

  test("ocultar y mostrar la vista oclusal y las muelas del juicio no deja dientes sin relleno", async ({ page }) => {
    await abrirCarta(page);
    await page.locator("#btnOcclView").click();
    await page.locator("#btnWisdomVisible").click();
    await expect(page.locator(".tooth-tile.occl-view.occl-hidden")).toHaveCount(32);
    await expect(lateral(page, 18)).toHaveClass(/wisdom-hidden/);
    expect(await piezasSinRelleno(page)).toEqual([]);
    for (const n of [17, 27, 37, 47, 13, 42]) expect(await relleno(page, n, "side"), `pieza ${n}`).toBeGreaterThan(1.6);

    await page.locator("#btnOcclView").click();
    await page.locator("#btnWisdomVisible").click();
    await expect(page.locator(".tooth-tile.occl-view.occl-hidden")).toHaveCount(0);
    expect(await piezasSinRelleno(page)).toEqual([]);
    for (const n of [18, 27, 45]) expect(await relleno(page, n, "occl"), `oclusal ${n}`).toBeGreaterThan(1.6);
  });

  test("celular: mirar una sola arcada no deja sin relleno a la otra", async ({ page, isMobile }) => {
    test.skip(!isMobile, "el selector de arcada es solo táctil");
    await abrirCarta(page);
    await page.locator(".odon-arch-btn", { hasText: "Arcada inferior" }).click();
    await expect(lateral(page, 16)).toBeHidden();
    expect(await piezasSinRelleno(page)).toEqual([]);
    for (const n of [46, 41, 33]) expect(await relleno(page, n, "side"), `pieza ${n}`).toBeGreaterThan(1.6);
    for (const n of [46, 35]) expect(await relleno(page, n, "occl"), `oclusal ${n}`).toBeGreaterThan(1.6);

    await page.locator(".odon-arch-btn", { hasText: "Arcada superior" }).click();
    await expect(lateral(page, 46)).toBeHidden();
    expect(await piezasSinRelleno(page)).toEqual([]);
  });
});
