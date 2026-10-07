/** Arma el HTML del manual de procedimientos a partir de los capítulos (`contenido/`), las capturas que existen y
 *  la matriz de permisos de `lib/rbac.ts`. Puro: no toca el disco ni la app; el generador (`generar.manual.ts`)
 *  escribe el resultado y lo pasa a PDF con WeasyPrint. Ver docs/superpowers/specs/2026-10-07-manual-de-procedimientos-design.md. */
import { ROLE_DESCRIPCION, ROLE_LABEL, can, type Permission } from "../../lib/rbac";
import { PERMISOS_EN_PALABRAS } from "./permisos";
import type { Aviso, Capitulo, CapituloId, Procedimiento, RolId } from "./contenido/tipos";

/** El orden en que se leen los capítulos: de lo que sabe hacer todo el mundo a lo que solo hace la administración. */
export const ORDEN_CAPITULOS: CapituloId[] = ["todos", "receptionist", "cashier", "dentist", "assistant", "admin"];

export const TITULO_CAPITULO: Record<CapituloId, string> = {
  todos: "Para todos",
  receptionist: "Recepcionista",
  cashier: "Recepción y caja",
  dentist: "Dentista",
  assistant: "Asistente de doctores",
  admin: "Administrador",
};

const ROLES_EN_ORDEN: RolId[] = ["receptionist", "cashier", "dentist", "assistant", "admin"];
const CLAVES_PERMISO = Object.keys(PERMISOS_EN_PALABRAS) as Permission[];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Texto del manual → HTML. Primero se escapa todo (lo que escriba una persona nunca es HTML) y después se leen las marcas:
 *  **negrita**, «Botón» (se dibuja como botón) y [[id]] (referencia a otro procedimiento, con su página). */
export function marcar(texto: string, titulos: ReadonlyMap<string, string> = new Map()): string {
  return esc(texto)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/«([^»]+)»/g, '<span class="boton">$1</span>')
    .replace(/\[\[([a-z0-9-]+)\]\]/g, (_m, id: string) =>
      titulos.has(id) ? `<a class="ref" href="#proc-${id}">${esc(titulos.get(id)!)}</a>` : `[[${id}]]`);
}

const todosLosTextos = (p: Procedimiento): string[] => [
  p.titulo, p.paraQue, ...(p.antes ?? []), ...p.pasos.map((x) => x.texto), ...(p.avisos ?? []).map((a) => a.texto),
];

/** Todo lo que está mal en el contenido, en frases que se entienden. Vacío = se puede armar el manual. */
/** Los roles que `capturar` nombra al hacer `c.entrar("rol", …)`. Se leen del código de la función: solo cuentan los que están escritos
 *  a mano (un rol que viaja en una variable no se puede saber sin correr la captura). */
function rolesConLosQueEntra(p: Procedimiento): RolId[] {
  if (!p.capturar) return [];
  const roles = [...String(p.capturar).matchAll(/\.entrar\(\s*(["'`])([a-z]+)\1/g)].map((m) => m[2]);
  return [...new Set(roles)] as RolId[];
}

export function validar(capitulos: readonly Capitulo[], opciones: { ignorarReferencias?: boolean } = {}): string[] {
  const problemas: string[] = [];
  const ids = new Set<string>();
  const roles = new Set<string>(ROLES_EN_ORDEN);
  const capitulosValidos = new Set<string>(ORDEN_CAPITULOS);
  const vistos = new Set<string>();

  for (const cap of capitulos) {
    if (!capitulosValidos.has(cap.id)) problemas.push(`Capítulo «${cap.id}» no existe`);
    if (vistos.has(cap.id)) problemas.push(`Capítulo «${cap.id}» repetido`);
    vistos.add(cap.id);
    if (!cap.intro.trim()) problemas.push(`Capítulo «${cap.id}»: falta la introducción`);
    for (const p of cap.procedimientos) ids.add(p.id);
  }
  const repetidos = new Set<string>();
  for (const cap of capitulos) {
    for (const p of cap.procedimientos) {
      if (repetidos.has(p.id)) problemas.push(`Procedimiento «${p.id}» repetido`);
      repetidos.add(p.id);
    }
  }

  for (const cap of capitulos) {
    for (const p of cap.procedimientos) {
      const donde = `«${p.id}»`;
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) problemas.push(`${donde}: el id va en minúsculas con guiones`);
      if (p.capitulo !== cap.id) problemas.push(`${donde}: dice que es del capítulo «${p.capitulo}» pero está en «${cap.id}»`);
      if (!p.titulo.trim()) problemas.push(`${donde}: falta el título`);
      if (!p.paraQue.trim()) problemas.push(`${donde}: falta «para qué sirve»`);
      if (p.roles.length === 0) problemas.push(`${donde}: falta decir qué roles lo hacen`);
      for (const r of [...p.roles, ...(p.verComo ?? [])]) if (!roles.has(r)) problemas.push(`${donde}: el rol «${r}» no existe`);
      if (p.pasos.length === 0) problemas.push(`${donde}: no tiene pasos`);

      const capturas = new Set<string>();
      p.pasos.forEach((paso, i) => {
        if (!paso.texto.trim()) problemas.push(`${donde} paso ${i + 1}: está vacío`);
        if (paso.captura) {
          if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(paso.captura)) problemas.push(`${donde} paso ${i + 1}: el nombre de la captura va en minúsculas con guiones`);
          if (capturas.has(paso.captura)) problemas.push(`${donde} paso ${i + 1}: la captura «${paso.captura}» ya se usó en otro paso`);
          capturas.add(paso.captura);
        }
      });
      if (capturas.size > 0 && !p.capturar) problemas.push(`${donde}: tiene capturas pero no tiene cómo sacarlas (falta \`capturar\`)`);
      // La captura se saca entrando como alguien: si ese rol ni lo hace (`roles`) ni se muestra a propósito (`verComo`), el manual
      // enseña la pantalla de quien no corresponde.
      for (const rol of rolesConLosQueEntra(p)) if (!p.roles.includes(rol) && !(p.verComo ?? []).includes(rol)) problemas.push(`${donde}: la captura entra como «${rol}», que no está en \`roles\` ni en \`verComo\``);
      for (const a of p.avisos ?? []) if (!a.texto.trim()) problemas.push(`${donde}: hay un aviso vacío`);

      for (const t of todosLosTextos(p)) {
        if ((t.match(/\*\*/g) ?? []).length % 2 !== 0) problemas.push(`${donde}: \`**\` sin cerrar en «${t.slice(0, 50)}…»`);
        if ((t.match(/«/g) ?? []).length !== (t.match(/»/g) ?? []).length) problemas.push(`${donde}: «» sin cerrar en «${t.slice(0, 50)}…»`);
        for (const m of t.matchAll(/\[\[([^\]]*)\]\]/g)) if (!opciones.ignorarReferencias && !ids.has(m[1])) problemas.push(`${donde}: la referencia [[${m[1]}]] no apunta a ningún procedimiento`);
        if (/dentalink/i.test(t)) problemas.push(`${donde}: el manual no nombra a otros sistemas`);
        if (/\b(TODO|XXX|FIXME)\b/.test(t) || /lorem ipsum/i.test(t)) problemas.push(`${donde}: quedó una marca de borrador («${t.slice(0, 40)}…»)`);
      }
    }
  }
  return problemas;
}

/** Capturas que se nombran en un paso y no existen, y capturas que existen y ningún paso nombra. */
export function revisarCapturas(capitulos: readonly Capitulo[], existentes: Readonly<Record<string, readonly string[]>>): { faltan: string[]; sobran: string[] } {
  const faltan: string[] = [];
  const sobran: string[] = [];
  for (const cap of capitulos) {
    for (const p of cap.procedimientos) {
      const hay = new Set(existentes[p.id] ?? []);
      const piden = new Set(p.pasos.flatMap((x) => (x.captura ? [x.captura] : [])));
      for (const n of piden) if (!hay.has(n)) faltan.push(`${p.id}/${n}`);
      for (const n of hay) if (!piden.has(n)) sobran.push(`${p.id}/${n}`);
    }
  }
  return { faltan, sobran };
}

/** Una captura de pantalla entera (1280 px de ventana con zoom 1,5 = 1920 px) ocupa el ancho de la página: 150 mm. Todas las
 *  capturas se ponen a esa misma escala, así un recorte chico queda chico y el texto se lee igual de grande en todas. */
export const PX_POR_MM = 12.8;
const ANCHO_MAX_MM = 150;
const ALTO_MAX_MM = 112;

/** El ancho (mm) con el que se imprime una captura de `ancho` × `alto` píxeles. */
export function anchoEnMm(ancho: number, alto: number): number {
  const w = ancho / PX_POR_MM;
  const h = alto / PX_POR_MM;
  return Math.round(w * Math.min(1, ANCHO_MAX_MM / w, ALTO_MAX_MM / h) * 10) / 10;
}

export interface Entrada {
  capitulos: readonly Capitulo[];
  /** Capturas que existen: id del procedimiento → nombres (sin extensión). */
  capturas: Readonly<Record<string, readonly string[]>>;
  /** De dónde se carga la imagen, visto desde el HTML. */
  rutaCaptura: (procId: string, nombre: string) => string;
  /** Tamaño en píxeles de una captura (se lee del PNG); sin esto la imagen sale con el ancho de la columna. */
  tamano?: (procId: string, nombre: string) => { ancho: number; alto: number } | null;
  /** «7 de octubre de 2026». */
  fecha: string;
  /** El menú que ve cada rol, leído de la app al sacar las capturas. */
  menus?: Partial<Record<RolId, readonly string[]>>;
  /** SVG del logotipo en blanco (portada). */
  logoSvg: string;
  css: string;
}

const AVISO_TITULO: Record<Aviso["tipo"], string> = { ojo: "Ojo", tip: "Tip", revisar: "Para revisar" };

const quienLoHace = (p: Procedimiento) => p.roles.map((r) => ROLE_LABEL[r]).join(" · ");

export function montarHtml(e: Entrada): string {
  const todos = e.capitulos.flatMap((c) => c.procedimientos);
  const titulos = new Map(todos.map((p) => [p.id, p.titulo]));
  const m = (t: string) => marcar(t, titulos);
  const porId = new Map(e.capitulos.map((c) => [c.id, c]));
  const capitulos = ORDEN_CAPITULOS.map((id) => porId.get(id)).filter((c): c is Capitulo => !!c);

  const aviso = (a: Aviso) =>
    `<aside class="aviso aviso-${a.tipo}"><span class="aviso-titulo">${AVISO_TITULO[a.tipo]}</span> ${m(a.texto)}</aside>`;

  const procedimiento = (p: Procedimiento): string => {
    const hay = new Set(e.capturas[p.id] ?? []);
    const pasos = p.pasos.map((paso, i) => {
      const dim = paso.captura ? e.tamano?.(p.id, paso.captura) : null;
      const ancho = dim ? ` style="width: ${anchoEnMm(dim.ancho, dim.alto)}mm"` : "";
      const img = !paso.captura ? "" : hay.has(paso.captura)
        ? `<figure><img src="${esc(e.rutaCaptura(p.id, paso.captura))}"${ancho} alt="Captura del paso ${i + 1}: ${esc(paso.texto.replace(/[«»*]/g, ""))}"></figure>`
        : `<figure class="falta">Falta la captura «${esc(paso.captura)}»</figure>`;
      return `<li class="paso"><span class="num">${i + 1}</span><div class="cuerpo"><p>${m(paso.texto)}</p>${img}</div></li>`;
    }).join("\n");
    const antes = p.antes?.length
      ? `<div class="antes"><h4>Antes de empezar</h4><ul>${p.antes.map((x) => `<li>${m(x)}</li>`).join("")}</ul></div>` : "";
    return `<section class="proc" id="proc-${p.id}">
  <header class="proc-cab"><p class="quien">${esc(quienLoHace(p))}</p><h2>${esc(p.titulo)}</h2><p class="para-que">${m(p.paraQue)}</p></header>
  ${antes}
  <ol class="pasos">
${pasos}
  </ol>
  ${(p.avisos ?? []).map(aviso).join("\n  ")}
</section>`;
  };

  const hojaDelRol = (rol: RolId): string => {
    const si = CLAVES_PERMISO.filter((k) => can(rol, k)).map((k) => `<li>${esc(PERMISOS_EN_PALABRAS[k])}</li>`).join("");
    const no = CLAVES_PERMISO.filter((k) => !can(rol, k)).map((k) => `<li>${esc(PERMISOS_EN_PALABRAS[k])}</li>`).join("");
    const menu = e.menus?.[rol]?.length ? `<p class="menu-rol"><strong>Tu menú:</strong> ${e.menus[rol]!.map(esc).join(" · ")}</p>` : "";
    const propios = todos.filter((p) => p.capitulo === rol);
    const tambien = todos.filter((p) => p.capitulo !== rol && p.capitulo !== "todos" && p.roles.includes(rol));
    const lista = (ps: Procedimiento[]) => ps.map((p) => `<li><a class="ref" href="#proc-${p.id}">${esc(p.titulo)}</a></li>`).join("");
    return `<section class="hoja-rol">
  <h2>Tu rol: ${esc(ROLE_LABEL[rol])}</h2>
  <p class="desc-rol">${esc(ROLE_DESCRIPCION[rol])}</p>
  ${menu}
  <div class="dos-col">
    <div><h3>Con este rol podés</h3><ul class="si">${si}</ul></div>
    <div><h3>Con este rol no podés</h3><ul class="no">${no || "<li>Nada: tiene todos los permisos.</li>"}</ul></div>
  </div>
  ${propios.length ? `<h3>Lo que vas a aprender en este capítulo</h3><ul class="indice-rol">${lista(propios)}</ul>` : ""}
  ${tambien.length ? `<h3>Lo que también te toca, en otros capítulos</h3><ul class="indice-rol">${lista(tambien)}</ul>` : ""}
</section>`;
  };

  const cuerpo = capitulos.map((c) => `<section class="capitulo" id="cap-${c.id}">
  <h1 class="capitulo-titulo">${esc(c.titulo)}</h1>
  <p class="intro">${m(c.intro)}</p>
  ${c.id !== "todos" ? hojaDelRol(c.id) : ""}
  ${c.procedimientos.map(procedimiento).join("\n")}
</section>`).join("\n");

  const indice = `<nav class="indice"><h1 class="sin-capitulo">Índice</h1>
${capitulos.map((c) => `<p class="idx-cap"><a href="#cap-${c.id}">${esc(c.titulo)}</a></p>
<ul>${c.procedimientos.map((p) => `<li><a href="#proc-${p.id}">${esc(p.titulo)}</a></li>`).join("")}</ul>`).join("\n")}
<p class="idx-cap"><a href="#apendice-permisos">Qué puede hacer cada rol</a></p>
<p class="idx-cap"><a href="#apendice-revisar">Puntos para revisar</a></p>
</nav>`;

  const filasPermisos = CLAVES_PERMISO.map((k) =>
    `<tr><th scope="row">${esc(PERMISOS_EN_PALABRAS[k])}</th>${ROLES_EN_ORDEN.map((r) => `<td class="${can(r, k) ? "si" : "no"}">${can(r, k) ? "✓" : "—"}</td>`).join("")}</tr>`).join("\n");
  const apendicePermisos = `<section class="apendice" id="apendice-permisos">
  <h1 class="capitulo-titulo">Qué puede hacer cada rol</h1>
  <p class="intro">La tabla sale de la configuración del sistema: si cambia un permiso, el manual lo refleja al volver a generarlo.</p>
  <table class="permisos"><thead><tr><th></th>${ROLES_EN_ORDEN.map((r) => `<th scope="col">${esc(ROLE_LABEL[r])}</th>`).join("")}</tr></thead>
  <tbody>
${filasPermisos}
  </tbody></table>
</section>`;

  const porRevisar = todos.flatMap((p) => (p.avisos ?? []).filter((a) => a.tipo === "revisar").map((a) => ({ p, a })));
  const apendiceRevisar = `<section class="apendice" id="apendice-revisar">
  <h1 class="capitulo-titulo">Puntos para revisar</h1>
  <p class="intro">Todo lo que este borrador deja por confirmar con Angel y Camila, en el orden del manual.</p>
  ${porRevisar.length === 0 ? "<p>No hay puntos pendientes.</p>" : `<ol class="revisar-lista">${porRevisar.map(({ p, a }) =>
    `<li><a class="ref" href="#proc-${p.id}">${esc(p.titulo)}</a> — ${m(a.texto)}</li>`).join("\n")}</ol>`}
</section>`;

  const comoUsar = `<section class="como-usar">
  <h1 class="sin-capitulo">Cómo usar este manual</h1>
  <p>Cada capítulo explica, paso a paso y con capturas de la clínica de demostración, lo que hace una persona con su rol. Empezá por <strong>Para todos</strong> y seguí con el capítulo de tu rol; al principio de cada uno vas a ver qué podés y qué no podés hacer.</p>
  <h3>Cómo se lee</h3>
  <ul class="leyenda">
    <li>Los botones y menús de la pantalla van así: <span class="boton">Dar cita</span>.</li>
    <li>El recuadro rojo de las capturas marca lo que hay que tocar; si hay varios, llevan número.</li>
    <li><strong>Ojo</strong> avisa de lo que puede salir mal, y <strong>Tip</strong> de un atajo.</li>
    <li>Un recuadro amarillo, <strong>Para revisar</strong>, marca lo que este borrador deja por confirmar.</li>
    <li>Los nombres, fechas y montos de las capturas son de ejemplo (clínica de demostración).</li>
  </ul>
</section>`;

  const portada = `<section class="portada">
  <div class="logo">${e.logoSvg}</div>
  <h1 class="titulo-portada">Manual de procedimientos</h1>
  <p class="sub-portada">Qué hace cada persona de la clínica en Novudent, paso a paso</p>
  <p class="borrador">Borrador para revisión · ${esc(e.fecha)}</p>
</section>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Novudent — Manual de procedimientos</title>
<meta name="author" content="Novum">
<meta name="description" content="Manual de procedimientos por rol de Novudent. Borrador para revisión.">
<style>
${e.css}
</style>
</head>
<body>
${portada}
${comoUsar}
${indice}
${cuerpo}
${apendicePermisos}
${apendiceRevisar}
</body>
</html>
`;
}
