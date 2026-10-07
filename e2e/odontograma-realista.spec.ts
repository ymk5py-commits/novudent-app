import { test, expect, entrarDemo, USUARIOS_DEMO } from "./soporte";
import type { Locator, Page } from "@playwright/test";

/* Carta dental con el arte realista (esmalte, raíz, volumen). Cada plantilla SVG se clona una
   vez por pieza y sus dientes se pintan con degradés y patrones (`url(#…)`). Lo que se cuida:
   que ningún diente se quede sin relleno cuando se ocultan casillas (vista oclusal, muelas del
   juicio, la arcada que no se mira en el celular), que la grilla siga entera y que incisivos y
   caninos tengan su vista incisal en la fila oclusal. */

/** Abre la carta de la paciente de la demo (p1). Con `piezas`, antes le reemplaza el odontograma
 *  guardado (la demo corre sin Firebase: lo lee de la copia local). */
async function abrirCarta(page: Page, piezas?: Record<string, Record<string, unknown>>) {
  await entrarDemo(page, USUARIOS_DEMO.dentista);
  if (piezas) {
    await page.evaluate((teeth) => {
      const db = JSON.parse(localStorage.getItem("novudent.db.v4")!);
      db.patients.find((p: { id: string }) => p.id === "p1").odontogram = { version: "2.10", globals: {}, teeth };
      localStorage.setItem("novudent.db.v4", JSON.stringify(db));
    }, piezas);
  }
  await page.goto("/app/pacientes/p1#odontograma");
  await expect(page.locator(".tooth-tile.side-view svg")).toHaveCount(32);
  await expect(page.locator(".tooth-tile.occl-view svg")).toHaveCount(32);
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
    // Ya no hay casillas vacías: incisivos y caninos tienen su vista incisal.
    await expect(page.locator(".tooth-tile.occl-view")).toHaveCount(32);
    await expect(page.locator(".tooth-tile.occl-view[data-tooth]")).toHaveCount(32);
    await expect(page.locator(".tooth-tile.placeholder")).toHaveCount(0);
    expect(await piezasSinRelleno(page)).toEqual([]);
    // Las 64 casillas siguen en las 4 filas de 16 de siempre (mismo tamaño, mismos márgenes).
    const anchos = await page.locator(".tooth-tile.side-view").evaluateAll((ts) => ts.map((t) => Math.round(t.getBoundingClientRect().width)));
    expect(new Set(anchos).size).toBe(1);
    for (const n of [17, 11, 33, 46]) expect(await relleno(page, n, "side"), `pieza ${n}`).toBeGreaterThan(1.6);
    for (const n of [17, 36, 12, 23, 41, 33]) expect(await relleno(page, n, "occl"), `oclusal ${n}`).toBeGreaterThan(1.6);
  });

  test("vista incisal: la pieza ausente o el implante no muestran un diente, y tocarla elige la pieza", async ({ page }) => {
    await abrirCarta(page, {
      "11": { toothSelection: "tooth-base", caries: ["caries-lingual"] },
      "12": { toothSelection: "none" },
      "22": { toothSelection: "implant" },
      "32": { toothSelection: "no-tooth-after-extraction" },
      "43": { toothSelection: "tooth-under-gum" },
    });
    const incisal = (n: number) => page.locator(`.tooth-tile.occl-view[data-tooth="${n}"]`);
    // Qué capas dibujan algo en la vista incisal: el id de la capa de primer nivel (hija de
    // tooth/milktooth/restorations…) de cada forma que se ve.
    const capasVisibles = (n: number) => incisal(n).evaluate((tile) => {
      const svg = tile.querySelector(".tooth-svg svg")!;
      const capas = new Set<string>();
      svg.querySelectorAll("path, ellipse, circle, polygon, polyline, rect").forEach((f) => {
        if (!f.getClientRects().length || f.closest("defs, clipPath, pattern")) return;
        let capa: Element | null = f.parentElement;
        while (capa && capa.parentElement && !["tooth", "milktooth", "tooth-variants", "restorations", "surfaces", "plan", "base"].includes(capa.parentElement.id)) capa = capa.parentElement;
        capas.add(capa?.id || "(sin capa)");
      });
      return [...capas].sort();
    });
    for (const n of [12, 32, 43]) expect(await capasVisibles(n), `vista incisal de ${n}`).toEqual([]);
    expect(await capasVisibles(22), "vista incisal del implante").toEqual(["implant"]);
    for (const n of [21, 13, 33]) expect(await capasVisibles(n), `vista incisal de ${n}`).toEqual(["tooth-base"]);
    // La caries lingual (palatina), que la vista lateral no puede mostrar, se ve en la incisal.
    await expect(incisal(11).locator('[id="caries-lingual"]')).toBeVisible();

    // Tocar la vista incisal elige la pieza, igual que la oclusal de una muela: se resaltan sus dos
    // casillas, pero la incisal no suma un control al teclado (solo las laterales son opciones).
    await incisal(21).click();
    await expect(page.locator("#activeToothLabel")).toHaveText("2.1");
    await expect(page.locator('.tooth-tile.side-view[data-tooth="21"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('.tooth-tile[data-tooth="21"].active')).toHaveCount(2);
    await expect(page.locator(".tooth-tile.occl-view[role], .tooth-tile.occl-view[tabindex]")).toHaveCount(0);
    await expect(page.locator("#toothGrid").getByRole("option")).toHaveCount(32);
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

    // Cada vista oclusal/incisal queda en la columna de su pieza (antes las 6 casillas vacías de
    // arriba, sin clase de arcada, seguían visibles y corrían la fila de abajo 6 columnas).
    const columna = (sel: string) => page.locator(sel).evaluate((el) => Math.round(el.getBoundingClientRect().left));
    for (const n of [48, 41, 33]) {
      expect(await columna(`.tooth-tile.occl-view[data-tooth="${n}"]`), `columna de ${n}`).toBe(await columna(`.tooth-tile.side-view[data-tooth="${n}"]`));
    }

    await page.locator(".odon-arch-btn", { hasText: "Arcada superior" }).click();
    await expect(lateral(page, 46)).toBeHidden();
    expect(await piezasSinRelleno(page)).toEqual([]);
    for (const n of [18, 11, 23]) {
      expect(await columna(`.tooth-tile.occl-view[data-tooth="${n}"]`), `columna de ${n}`).toBe(await columna(`.tooth-tile.side-view[data-tooth="${n}"]`));
    }
  });
});
