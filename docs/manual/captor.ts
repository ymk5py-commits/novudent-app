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
    // Si lo que hay que mostrar no entra en la ventana (una tarjeta alta), se agranda la ventana lo que haga falta (hasta 3000 px):
    // arriba del todo, así el menú fijo no tapa el borde de lo que se muestra.
    let vista = page.viewportSize() ?? { width: 1280, height: ALTO };
    const scrolleada = (await page.evaluate(() => window.scrollY)) > 0;
    // El menú de arriba es fijo: si la página está scrolleada, lo que quede debajo de él (los primeros 124 px) saldría tapado.
    const sobresale = () => [...marcas, ...recortes].some((c) => c.y + c.height > vista.height - 1 || c.y < -1 || (scrolleada && c.y < 124));
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

    if (marcas.length) {
      await page.evaluate((marcas) => {
        document.querySelectorAll("[data-manual-marca]").forEach((n) => n.remove());
        // Todo lo que ocupa lugar en pantalla: cada renglón de texto y cada control. Un número no puede tapar nada de eso.
        const ocupado: { left: number; right: number; top: number; bottom: number }[] = [];
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
        const libre = (x: number, y: number, lado: number) =>
          !ocupado.some((q) => x < q.right + 3 && x + lado > q.left - 3 && y < q.bottom + 3 && y + lado > q.top - 3);
        marcas.forEach((m, i) => {
          const caja = document.createElement("div");
          caja.setAttribute("data-manual-marca", "1");
          caja.style.cssText = `position:fixed;left:${m.x - 4}px;top:${m.y - 4}px;width:${m.width + 8}px;height:${m.height + 8}px;border:3px solid #E5252A;border-radius:7px;box-shadow:0 0 0 2px rgba(255,255,255,.92);pointer-events:none;z-index:2147483646`;
          document.body.appendChild(caja);
          if (marcas.length > 1) {
            const L = 24;
            // Dónde poner el número: al costado, en una esquina de afuera… el primer lugar que no tape nada.
            const candidatos: [number, number][] = [
              [m.x - 36, m.y + m.height / 2 - L / 2],
              [m.x - 24, m.y - 28],
              [m.x + m.width, m.y - 28],
              [m.x + m.width + 12, m.y + m.height / 2 - L / 2],
              [m.x - 24, m.y + m.height + 4],
              [m.x + m.width, m.y + m.height + 4],
            ];
            const enVentana = ([x, y]: [number, number]) => x >= 2 && y >= 2 && x + L <= window.innerWidth - 2 && y + L <= window.innerHeight - 2;
            const [nx, ny] = candidatos.find((p) => enVentana(p) && libre(p[0], p[1], L))
              ?? candidatos.find(enVentana)
              ?? [m.x + 6, m.y + m.height / 2 - L / 2]; // último recurso: adentro del recuadro
            const n = document.createElement("div");
            n.setAttribute("data-manual-marca", "1");
            n.textContent = String(i + 1);
            n.style.cssText = `position:fixed;left:${nx}px;top:${ny}px;width:${L}px;height:${L}px;border-radius:50%;background:#E5252A;color:#fff;font:700 14px/${L}px Inter,Arial,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff;pointer-events:none;z-index:2147483647`;
            document.body.appendChild(n);
          }
        });
      }, marcas);
    }

    // El recorte es la unión de lo que se pidió recortar y de lo resaltado, con margen (y lugar para el número).
    const cajas = [...recortes, ...marcas];
    let clip: Caja | undefined;
    if (cajas.length && !o.pantalla) {
      const extra = marcas.length > 1 ? 34 : 6; // lugar para los números, que van afuera del recuadro
      const x0 = Math.max(0, Math.min(...cajas.map((c) => c.x)) - margen - extra);
      const y0 = Math.max(0, Math.min(...cajas.map((c) => c.y)) - margen - (marcas.length > 1 ? 30 : 6));
      const x1 = Math.min(vista.width, Math.max(...cajas.map((c) => c.x + c.width)) + margen + extra);
      const y1 = Math.min(vista.height, Math.max(...cajas.map((c) => c.y + c.height)) + margen + 6);
      clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    }
    await page.screenshot({ path: join(this.carpeta, `${nombre}.png`), type: "png", ...(clip ? { clip } : {}) });
    if (marcas.length) await page.evaluate(() => document.querySelectorAll("[data-manual-marca]").forEach((n) => n.remove()));
  }
}
