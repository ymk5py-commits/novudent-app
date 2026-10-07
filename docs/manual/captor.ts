/** El `Captor` de verdad: recorre la app con Playwright y saca las capturas del manual (docs/manual/salida/capturas/<id>/<nombre>.png).
 *  Solo lo cargan los runners `*.manual.ts`: los capítulos reciben la interfaz (`contenido/tipos.ts`), no esta clase. */
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, entrarDemo, USUARIOS_DEMO } from "../../e2e/soporte";
import type { Captor, OpcionesFoto, RolId } from "./contenido/tipos";

export const SALIDA = resolve(__dirname, "salida");
export const CARPETA_CAPTURAS = join(SALIDA, "capturas");

/** Alto de la ventana con la que se sacan las capturas (el ancho es el de la configuración: 1280). */
const ALTO = 760;

const USUARIO_DEL_ROL: Record<RolId, string> = {
  admin: USUARIOS_DEMO.admin,
  cashier: USUARIOS_DEMO.caja,
  receptionist: USUARIOS_DEMO.recepcionista,
  dentist: USUARIOS_DEMO.dentista,
  assistant: USUARIOS_DEMO.asistente,
};

interface Caja { x: number; y: number; width: number; height: number }

/** Lo que nunca puede salir en una captura: nombres de otro sistema, el pie de soporte de la demo, direcciones locales y etiquetas que solo
 *  confunden a una clínica de Paraguay. Si una captura lo muestra, falla con un mensaje que dice cómo taparlo (`ocultar` o un recorte más chico). */
const PROHIBIDO = "Dentalink|Plataforma de soporte|localhost|Reiniciar demo|Sin conexión|ATHENA";

const lista = <T,>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

export class CaptorPW implements Captor {
  readonly expect = expect;
  readonly carpeta: string;

  constructor(readonly page: Page, readonly procId: string) {
    this.carpeta = join(CARPETA_CAPTURAS, procId);
    // Cada corrida empieza de cero: una captura que ya no se pide no se queda dando vueltas.
    rmSync(this.carpeta, { recursive: true, force: true });
    mkdirSync(this.carpeta, { recursive: true });
  }

  async entrar(rol: RolId, ruta?: string) {
    await entrarDemo(this.page, USUARIO_DEL_ROL[rol]);
    await this.esperarApp();
    if (ruta) await this.ir(ruta);
  }

  async ir(ruta: string) {
    await this.page.goto(ruta);
    await this.esperarApp();
  }

  private async esperarApp() {
    await this.page.getByText("Cargando Novudent…").waitFor({ state: "detached", timeout: 20_000 }).catch(() => {});
    await this.page.waitForLoadState("domcontentloaded");
  }

  async menu(): Promise<string[]> {
    const textos = await this.page.getByRole("navigation").first().locator("a, button").allInnerTexts();
    // «Chat\n1\n, 1 mensaje sin leer»: de cada entrada vale solo la primera línea.
    return textos.map((t) => t.split("\n")[0].trim()).filter(Boolean);
  }

  /** Lo que se le saca a la pantalla para que el manual no mienta ni distraiga: el botón flotante de Ayuda tapa la esquina y,
   *  como las capturas se sacan con Firebase cortado, la insignia diría «Sin conexión» cuando en la clínica dice «En línea». */
  private async pulir(conAyuda: boolean) {
    await this.page.evaluate((conAyuda) => {
      let estilo = document.getElementById("manual-pulido") as HTMLStyleElement | null;
      if (!estilo) { estilo = document.createElement("style"); estilo.id = "manual-pulido"; document.head.appendChild(estilo); }
      // Sin scroll suave: la captura mide la página en el instante, no a mitad de camino.
      estilo.textContent = "html{scroll-behavior:auto!important}" + (conAyuda ? "" : 'button[aria-label="Ayuda de Novum"][class*="fixed"]{display:none!important}');
      // «Reiniciar demo» solo existe en la demo: en una clínica real no está.
      for (const b of Array.from(document.querySelectorAll("button"))) {
        if (b.textContent?.trim() === "Reiniciar demo") (b as HTMLElement).style.display = "none";
      }
      for (const s of Array.from(document.querySelectorAll("span"))) {
        if (s.children.length === 1 && s.textContent?.trim() === "Sin conexión") {
          s.className = s.className.replace("text-amber-200", "text-emerald-200");
          s.firstElementChild!.className = s.firstElementChild!.className.replace("bg-amber-300", "bg-emerald-300");
          s.lastChild!.textContent = "En línea";
        }
      }
    }, conAyuda);
  }

  async foto(nombre: string, o: OpcionesFoto = {}) {
    const { page } = this;
    const margen = o.margen ?? 14;
    const original = page.viewportSize() ?? { width: 1280, height: ALTO };
    try {
      if (o.alto && o.alto !== original.height) await page.setViewportSize({ width: original.width, height: o.alto });
      await this.sacar(nombre, o, margen);
    } finally {
      // Lo que se agrandó para que entre algo alto no se arrastra a la captura siguiente.
      if (page.viewportSize()?.height !== original.height) await page.setViewportSize(original);
    }
  }

  private async sacar(nombre: string, o: OpcionesFoto, margen: number) {
    const { page } = this;
    await page.evaluate(() => document.fonts.ready);
    await this.pulir(!!o.conAyuda);
    // Sin foco ni mouse encima: la captura no muestra un botón «apretado» o iluminado que no es el que se explica.
    if (!o.conFoco) {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
      const v = page.viewportSize() ?? { width: 1280, height: ALTO };
      await page.mouse.move(4, v.height - 4);
    }
    await page.waitForTimeout(o.esperar ?? 450);

    const aMarcar = lista(o.resaltar);
    const aRecortar = lista(o.recorte);
    const primero: Locator | undefined = aMarcar[0] ?? aRecortar[0];

    const medir = async (l: Locator, para: string): Promise<Caja> => {
      const b = await l.first().boundingBox();
      if (!b) throw new Error(`[${this.procId}/${nombre}] no se ve lo que hay que ${para}`);
      return b;
    };
    const medirSinScroll = async () => {
      const marcas: Caja[] = [];
      for (const l of aMarcar) marcas.push(await medir(l, "resaltar"));
      const recortes: Caja[] = [];
      for (const l of aRecortar) recortes.push(await medir(l, "recortar"));
      return { marcas, recortes };
    };
    // Lo que hay que mostrar tiene que estar a la vista antes de medirlo.
    if (primero) await primero.first().scrollIntoViewIfNeeded();
    let { marcas, recortes } = await medirSinScroll();

    // Si lo que hay que mostrar no entra en la ventana (una tarjeta alta), se agranda la ventana lo que haga falta (hasta 3000 px),
    // arriba del todo: así el menú fijo de la página no tapa el borde de lo que se muestra.
    let vista = page.viewportSize() ?? { width: 1280, height: ALTO };
    const scrolleada = (await page.evaluate(() => window.scrollY)) > 0;
    const lugarParaNumeros = marcas.length > 1 ? 30 : 0;
    const sobresale = () => [...marcas, ...recortes].some((c) =>
      c.y + c.height > vista.height - 1 || c.y < -1 || (scrolleada && c.y - margen - lugarParaNumeros < 124)); // 124 px: el menú fijo
    if (!o.alto && sobresale()) {
      await page.evaluate(() => window.scrollTo(0, 0));
      ({ marcas, recortes } = await medirSinScroll());
      const fondo = Math.max(...[...marcas, ...recortes].map((c) => c.y + c.height));
      await page.setViewportSize({ width: vista.width, height: Math.min(3000, Math.ceil(fondo + margen + 30)) });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      ({ marcas, recortes } = await medirSinScroll());
      vista = page.viewportSize() ?? vista;
    }
    for (const c of [...marcas, ...recortes]) {
      if (c.y + c.height > vista.height + 1 || c.y < -1) {
        throw new Error(`[${this.procId}/${nombre}] lo que hay que mostrar no entra en la pantalla (y=${Math.round(c.y)}, alto=${Math.round(c.height)} de ${vista.height}): usá un recorte más chico o \`alto\``);
      }
    }

    // Un recorte dentro de un diálogo deja ver, en sus bordes, pedazos de la pantalla de atrás oscurecida (letras cortadas por la
    // mitad): se pinta el fondo liso mientras se saca la foto. Con `pantalla` el fondo oscurecido es justo lo que se quiere ver.
    let fondoLiso = false;
    if (!o.pantalla) {
      for (const l of [...aRecortar, ...aMarcar]) {
        if (await l.first().evaluate((el) => !!el.closest('[role="dialog"]'))) { fondoLiso = true; break; }
      }
    }
    if (fondoLiso) await page.evaluate(aplanarFondoDeDialogos, true);

    // Se dibujan los recuadros y los números, y se anota dónde quedó cada número para recortar con lugar para ellos.
    const numeros: Caja[] = marcas.length ? await page.evaluate(dibujarMarcas, marcas) : [];

    // El recorte es la unión de lo que se pidió recortar, lo resaltado (con su borde) y los números, más el margen.
    const BORDE = 8; // recuadro: 4 px de separación + 3 de borde + 1 de aire
    const cajas: Caja[] = [
      ...recortes,
      ...marcas.map((m) => ({ x: m.x - BORDE, y: m.y - BORDE, width: m.width + 2 * BORDE, height: m.height + 2 * BORDE })),
      ...numeros,
    ];
    let clip: Caja | undefined;
    if (cajas.length && !o.pantalla) {
      const x0 = Math.max(0, Math.min(...cajas.map((c) => c.x)) - margen);
      const y0 = Math.max(0, Math.min(...cajas.map((c) => c.y)) - margen);
      const x1 = Math.min(vista.width, Math.max(...cajas.map((c) => c.x + c.width)) + margen);
      const y1 = Math.min(vista.height, Math.max(...cajas.map((c) => c.y + c.height)) + margen);
      clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    }
    const aOcultar = lista(o.ocultar);
    for (const l of aOcultar) await l.evaluateAll(esconder, true);
    try {
      const zona = clip ?? { x: 0, y: 0, width: vista.width, height: vista.height };
      const intrusos = await page.evaluate(buscarTextoProhibido, { zona, patron: PROHIBIDO });
      if (intrusos.length) {
        throw new Error(`[${this.procId}/${nombre}] la captura muestra texto que no tiene que salir: «${[...new Set(intrusos)].join("», «")}». Taparlo con \`ocultar\` o achicar el recorte.`);
      }
      await page.screenshot({ path: join(this.carpeta, `${nombre}.png`), type: "png", ...(clip ? { clip } : {}) });
    } finally {
      for (const l of aOcultar) await l.evaluateAll(esconder, false).catch(() => {});
      if (marcas.length) await page.evaluate(() => document.querySelectorAll("[data-manual-marca]").forEach((n) => n.remove()));
      if (fondoLiso) await page.evaluate(aplanarFondoDeDialogos, false);
    }
  }
}

/** Corre EN la página (sobre cada elemento que encontró el locator): esconde o vuelve a mostrar, sin mover nada. */
function esconder(els: Element[], esconder: boolean): void {
  for (const el of els) {
    const e = el as HTMLElement;
    if (esconder) { e.dataset.manualOculto = e.style.visibility || "-"; e.style.visibility = "hidden"; }
    else if (e.dataset.manualOculto !== undefined) { e.style.visibility = e.dataset.manualOculto === "-" ? "" : e.dataset.manualOculto; delete e.dataset.manualOculto; }
  }
}

/** Corre EN la página: los textos prohibidos que se ven dentro de `zona` (no los escondidos, ni los que tapa otro elemento). */
function buscarTextoProhibido({ zona, patron }: { zona: { x: number; y: number; width: number; height: number }; patron: string }): string[] {
  const re = new RegExp(patron, "i");
  const hallados: string[] = [];
  const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
    const texto = n.textContent ?? "";
    if (!re.test(texto)) continue;
    const el = n.parentElement;
    if (!el || el.closest("[data-manual-marca]") || el.closest("script,style,noscript")) continue;
    if (getComputedStyle(el).visibility === "hidden" || el.getClientRects().length === 0) continue;
    const rango = document.createRange();
    rango.selectNodeContents(n);
    for (const r of Array.from(rango.getClientRects())) {
      if (r.width === 0 || r.height === 0) continue;
      const dentro = r.right > zona.x && r.left < zona.x + zona.width && r.bottom > zona.y && r.top < zona.y + zona.height;
      if (!dentro) continue;
      // Si lo tapa otro elemento (el fondo liso de un diálogo, un menú), en la foto no se ve.
      const arriba = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1));
      if (arriba && !el.contains(arriba) && !arriba.contains(el)) continue;
      hallados.push(texto.trim().slice(0, 60));
      break;
    }
  }
  return hallados;
}

/** Corre EN la página: pinta (o devuelve a como estaba) el fondo oscurecido que rodea a cada diálogo abierto. */
function aplanarFondoDeDialogos(aplanar: boolean): void {
  for (const d of Array.from(document.querySelectorAll('[role="dialog"]'))) {
    const fondo = d.parentElement;
    if (!fondo || fondo.getAttribute("role") !== "presentation") continue;
    fondo.style.background = aplanar ? "#EEF2F8" : "";
    fondo.style.backdropFilter = aplanar ? "none" : "";
  }
}

/** Corre EN la página: dibuja un recuadro rojo sobre cada caja y, si son varias, un número al lado de cada una. El número se pone
 *  donde no tape texto ni controles ni otro recuadro ni otro número; si no hay lugar libre, donde tape menos. Devuelve dónde quedó cada número. */
function dibujarMarcas(marcas: { x: number; y: number; width: number; height: number }[]): { x: number; y: number; width: number; height: number }[] {
  document.querySelectorAll("[data-manual-marca]").forEach((n) => n.remove());
  type R = { left: number; right: number; top: number; bottom: number };
  // Todo lo que ocupa lugar en pantalla: cada renglón de texto y cada control.
  const ocupado: R[] = [];
  const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
    const padre = n.parentElement;
    if (!n.textContent?.trim() || !padre || padre.closest("[data-manual-marca]")) continue;
    const est = getComputedStyle(padre);
    if (est.visibility === "hidden" || est.display === "none") continue;
    const rango = document.createRange();
    rango.selectNodeContents(n);
    for (const q of Array.from(rango.getClientRects())) if (q.width > 0 && q.height > 0) ocupado.push(q);
  }
  for (const el of Array.from(document.querySelectorAll("input, select, textarea, img, svg, button"))) {
    if (el.closest("[data-manual-marca]")) continue;
    const q = el.getBoundingClientRect();
    if (q.width > 0 && q.height > 0) ocupado.push(q);
  }
  // Los recuadros rojos también ocupan lugar (para que un número no caiga encima del recuadro de otro elemento).
  const recuadros: R[] = marcas.map((m) => ({ left: m.x - 8, right: m.x + m.width + 8, top: m.y - 8, bottom: m.y + m.height + 8 }));
  const puestos: R[] = [];

  const L = 24;
  const solape = (a: R, b: R) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? w * h : 0;
  };
  const margenDe = (x: number, y: number): R => ({ left: x - 3, right: x + L + 3, top: y - 3, bottom: y + L + 3 });
  const dibujados: { x: number; y: number; width: number; height: number }[] = [];

  marcas.forEach((m, i) => {
    const caja = document.createElement("div");
    caja.setAttribute("data-manual-marca", "1");
    caja.style.cssText = `position:fixed;left:${m.x - 4}px;top:${m.y - 4}px;width:${m.width + 8}px;height:${m.height + 8}px;border:3px solid #E5252A;border-radius:7px;box-shadow:0 0 0 2px rgba(255,255,255,.92);pointer-events:none;z-index:2147483646`;
    document.body.appendChild(caja);
    if (marcas.length < 2) return;

    const cy = m.y + m.height / 2 - L / 2;
    const cx = m.x + m.width / 2 - L / 2;
    const candidatos: [number, number][] = [
      [m.x - 38, cy],                       // al costado izquierdo
      [m.x - 26, m.y - 30],                 // esquina de arriba a la izquierda, afuera
      [m.x + m.width + 2, m.y - 30],        // esquina de arriba a la derecha, afuera
      [m.x + m.width + 14, cy],             // al costado derecho
      [cx, m.y - 34],                       // arriba, al medio
      [m.x - 26, m.y + m.height + 6],       // esquina de abajo a la izquierda
      [m.x + m.width + 2, m.y + m.height + 6],
      [cx, m.y + m.height + 8],             // abajo, al medio
      [m.x - 62, cy],                       // más lejos, a la izquierda
      [m.x + m.width + 38, cy],             // más lejos, a la derecha
      [m.x + 6, cy],                        // último recurso: adentro del recuadro
    ];
    const enVentana = ([x, y]: [number, number]) => x >= 2 && y >= 2 && x + L <= window.innerWidth - 2 && y + L <= window.innerHeight - 2;
    // Lo que tapa cada lugar: texto o controles (peso 1), otro recuadro rojo (peso 3) y otro número (peso 10).
    const costo = ([x, y]: [number, number]) => {
      const c = margenDe(x, y);
      const propio = recuadros[i];
      return ocupado.reduce((s, q) => s + solape(c, q), 0)
        + 3 * recuadros.reduce((s, q, k) => s + (k === i ? 0 : solape(c, q)), 0)
        + 3 * solape(c, { left: propio.left + 5, right: propio.right - 5, top: propio.top + 5, bottom: propio.bottom - 5 })
        + 10 * puestos.reduce((s, q) => s + solape(c, q), 0);
    };
    const posibles = candidatos.filter(enVentana);
    const [nx, ny] = (posibles.length ? posibles : candidatos).reduce((mejor, p) => (costo(p) < costo(mejor) ? p : mejor));
    puestos.push(margenDe(nx, ny));

    const n = document.createElement("div");
    n.setAttribute("data-manual-marca", "1");
    n.textContent = String(i + 1);
    n.style.cssText = `position:fixed;left:${nx}px;top:${ny}px;width:${L}px;height:${L}px;border-radius:50%;background:#E5252A;color:#fff;font:700 14px/${L}px Inter,Arial,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff;pointer-events:none;z-index:2147483647`;
    document.body.appendChild(n);
    dibujados.push({ x: nx - 2, y: ny - 2, width: L + 4, height: L + 4 });
  });
  return dibujados;
}
