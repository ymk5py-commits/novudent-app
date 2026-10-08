import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { marcar, validar, revisarCapturas, montarHtml, anchoEnMm, ORDEN_CAPITULOS, type Entrada } from "./montar";
import { PERMISOS_EN_PALABRAS } from "./permisos";
import type { Capitulo, Procedimiento } from "./contenido/tipos";

const proc = (o: Partial<Procedimiento> & { id: string }): Procedimiento => ({
  capitulo: "receptionist", titulo: "Dar una cita", roles: ["receptionist"], paraQue: "Cuando un paciente pide horario.",
  pasos: [{ texto: "Entrá a **Agenda** y tocá «Dar cita»." }], ...o,
});
const cap = (id: Capitulo["id"], procedimientos: Procedimiento[] = []): Capitulo => ({ id, titulo: id, intro: "Cómo es tu día.", procedimientos });

describe("marcar — del texto del manual al HTML", () => {
  it("escapa todo: lo que escriba una persona nunca es HTML", () => {
    expect(marcar('Tocá <b>"A" & B</b>')).toBe("Tocá &lt;b&gt;&quot;A&quot; &amp; B&lt;/b&gt;");
  });
  it("**negrita** y «Botón»", () => {
    expect(marcar("Entrá a **Agenda** y tocá «Dar cita».")).toBe('Entrá a <strong>Agenda</strong> y tocá <span class="boton">Dar cita</span>.');
  });
  it("se pueden combinar", () => {
    expect(marcar("**Tocá «Guardar»**")).toBe('<strong>Tocá <span class="boton">Guardar</span></strong>');
  });
  it("[[id]] es un link al procedimiento si existe, y si no queda como está", () => {
    const t = new Map([["dar-una-cita", "Dar una cita"]]);
    expect(marcar("Ver [[dar-una-cita]].", t)).toBe('Ver <a class="ref" href="#proc-dar-una-cita">Dar una cita</a>.');
    expect(marcar("Ver [[no-existe]].", t)).toBe("Ver [[no-existe]].");
  });
  it("el título de la referencia también se escapa", () => {
    expect(marcar("[[x]]", new Map([["x", "A <i>B</i>"]]))).toContain("A &lt;i&gt;B&lt;/i&gt;");
  });
});

describe("validar — lo que está mal en el contenido", () => {
  const todas = (ps: Procedimiento[]) => [cap("todos"), cap("receptionist", ps)];

  it("un contenido sano no tiene problemas", () => {
    expect(validar(todas([proc({ id: "dar-una-cita" })]))).toEqual([]);
  });
  it("ids repetidos, mal escritos o en el capítulo equivocado", () => {
    expect(validar(todas([proc({ id: "a" }), proc({ id: "a" })]).map((c) => c))).toContainEqual(expect.stringContaining("repetido"));
    expect(validar(todas([proc({ id: "Dar Cita" })]))).toContainEqual(expect.stringContaining("minúsculas con guiones"));
    expect(validar(todas([proc({ id: "a", capitulo: "admin" })]))).toContainEqual(expect.stringContaining("capítulo «admin»"));
  });
  it("roles que no existen o ninguno", () => {
    expect(validar(todas([proc({ id: "a", roles: ["jefe" as never] })]))).toContainEqual(expect.stringContaining("«jefe» no existe"));
    expect(validar(todas([proc({ id: "a", roles: [] })]))).toContainEqual(expect.stringContaining("qué roles"));
    expect(validar(todas([proc({ id: "a", verComo: ["jefe" as never] })]))).toContainEqual(expect.stringContaining("«jefe» no existe"));
  });
  it("sin pasos, paso vacío, sin título o sin «para qué»", () => {
    expect(validar(todas([proc({ id: "a", pasos: [] })]))).toContainEqual(expect.stringContaining("no tiene pasos"));
    expect(validar(todas([proc({ id: "a", pasos: [{ texto: "  " }] })]))).toContainEqual(expect.stringContaining("paso 1: está vacío"));
    expect(validar(todas([proc({ id: "a", titulo: " " })]))).toContainEqual(expect.stringContaining("falta el título"));
    expect(validar(todas([proc({ id: "a", paraQue: "" })]))).toContainEqual(expect.stringContaining("para qué sirve"));
  });
  it("capturas: sin repetir, bien nombradas y con cómo sacarlas", () => {
    const dos = [{ texto: "Uno.", captura: "agenda" }, { texto: "Dos.", captura: "agenda" }];
    expect(validar(todas([proc({ id: "a", pasos: dos, capturar: async () => {} })]))).toContainEqual(expect.stringContaining("ya se usó"));
    expect(validar(todas([proc({ id: "a", pasos: [{ texto: "Uno.", captura: "Mi Foto" }], capturar: async () => {} })]))).toContainEqual(expect.stringContaining("minúsculas"));
    expect(validar(todas([proc({ id: "a", pasos: [{ texto: "Uno.", captura: "agenda" }] })]))).toContainEqual(expect.stringContaining("falta `capturar`"));
  });
  it("la captura no entra con un rol que el procedimiento dice que no lo hace", () => {
    const foto = [{ texto: "Uno.", captura: "x" }];
    const conAdmin = proc({ id: "a", roles: ["receptionist"], pasos: foto, capturar: async (c) => { await c.entrar("admin", "/app"); await c.foto("x"); } });
    expect(validar(todas([conAdmin]))).toContainEqual(expect.stringContaining("«a»: la captura entra como «admin»"));
    const comilla = proc({ id: "b", roles: ["receptionist"], pasos: foto, capturar: async (c) => { await c.entrar('cashier'); await c.foto("x"); } });
    expect(validar(todas([comilla]))).toContainEqual(expect.stringContaining("entra como «cashier»"));
    const sano = proc({ id: "c", roles: ["receptionist", "admin"], pasos: foto, capturar: async (c) => { await c.entrar("receptionist", "/app"); await c.entrar("admin"); await c.foto("x"); } });
    expect(validar(todas([sano]))).toEqual([]);
    // «Así la ve ella»: una captura de resultado puede ser de otro rol si el procedimiento lo declara en `verComo`.
    const resultado = proc({ id: "d", roles: ["admin"], verComo: ["assistant"], pasos: foto, capturar: async (c) => { await c.entrar("admin"); await c.entrar("assistant"); await c.foto("x"); } });
    expect(validar(todas([resultado]))).toEqual([]);
    const otroMas = proc({ id: "e", roles: ["admin"], verComo: ["assistant"], pasos: foto, capturar: async (c) => { await c.entrar("dentist"); await c.foto("x"); } });
    expect(validar(todas([otroMas]))).toContainEqual(expect.stringContaining("entra como «dentist»"));
  });
  it("marcas sin cerrar y referencias que no existen", () => {
    expect(validar(todas([proc({ id: "a", pasos: [{ texto: "Tocá **Agenda." }] })]))).toContainEqual(expect.stringContaining("`**` sin cerrar"));
    expect(validar(todas([proc({ id: "a", pasos: [{ texto: "Tocá «Agenda." }] })]))).toContainEqual(expect.stringContaining("«» sin cerrar"));
    expect(validar(todas([proc({ id: "a", paraQue: "Ver [[fantasma]]." })]))).toContainEqual(expect.stringContaining("[[fantasma]]"));
    // Una referencia a otro procedimiento que sí existe está bien, aunque sea de otro capítulo.
    expect(validar([cap("todos", [proc({ id: "b", capitulo: "todos" })]), cap("receptionist", [proc({ id: "a", paraQue: "Ver [[b]]." })])])).toEqual([]);
  });
  it("en una corrida parcial las referencias a otros capítulos no se exigen", () => {
    const sola = [cap("receptionist", [proc({ id: "a", paraQue: "Ver [[de-otro-capitulo]]." })])];
    expect(validar(sola)).toContainEqual(expect.stringContaining("[[de-otro-capitulo]]"));
    expect(validar(sola, { ignorarReferencias: true })).toEqual([]);
  });
  it("el manual no nombra a otros sistemas ni deja marcas de borrador", () => {
    expect(validar(todas([proc({ id: "a", pasos: [{ texto: "Como en Dentalink." }] })]))).toContainEqual(expect.stringContaining("otros sistemas"));
    expect(validar(todas([proc({ id: "a", pasos: [{ texto: "TODO completar." }] })]))).toContainEqual(expect.stringContaining("marca de borrador"));
    expect(validar(todas([proc({ id: "a", pasos: [{ texto: "Lorem ipsum dolor." }] })]))).toContainEqual(expect.stringContaining("marca de borrador"));
  });
  it("«todo» en castellano no es una marca de borrador", () => {
    expect(validar(todas([proc({ id: "a", pasos: [{ texto: "Todo queda ordenado por día, y todo se guarda solo." }] })]))).toEqual([]);
  });
  it("un capítulo sin introducción o repetido", () => {
    expect(validar([{ ...cap("todos"), intro: "" }])).toContainEqual(expect.stringContaining("introducción"));
    expect(validar([cap("todos"), cap("todos")])).toContainEqual(expect.stringContaining("repetido"));
  });
});

describe("revisarCapturas", () => {
  const capitulos = [cap("receptionist", [proc({ id: "a", capturar: async () => {}, pasos: [{ texto: "Uno.", captura: "uno" }, { texto: "Dos.", captura: "dos" }] })])];
  it("avisa de las que faltan y de las que sobran", () => {
    expect(revisarCapturas(capitulos, { a: ["uno", "extra"] })).toEqual({ faltan: ["a/dos"], sobran: ["a/extra"] });
  });
  it("todo en orden", () => {
    expect(revisarCapturas(capitulos, { a: ["uno", "dos"] })).toEqual({ faltan: [], sobran: [] });
  });
});

describe("anchoEnMm — todas las capturas con el mismo zoom", () => {
  it("una pantalla entera ocupa el ancho de la página (150 mm)", () => {
    expect(anchoEnMm(1920, 1140)).toBe(150);
  });
  it("un recorte chico queda chico: el texto se lee igual de grande que en la pantalla entera", () => {
    expect(anchoEnMm(960, 600)).toBe(75);
  });
  it("lo muy ancho se achica al ancho de la página, y lo muy alto al alto máximo", () => {
    expect(anchoEnMm(3840, 1000)).toBe(150);
    expect(anchoEnMm(1920, 2000)).toBeCloseTo(107.5, 0); // 112 mm de alto → 107,5 de ancho
  });
});

describe("montarHtml", () => {
  const entrada = (capitulos: Capitulo[], extra: Partial<Entrada> = {}): Entrada => ({
    capitulos, capturas: {}, rutaCaptura: (p, n) => `capturas/${p}/${n}.png`, fecha: "7 de octubre de 2026", logoSvg: "<svg></svg>", css: "body{}", ...extra,
  });
  const base = [
    cap("todos", [proc({ id: "entrar", capitulo: "todos", titulo: "Entrar al sistema", roles: ["receptionist", "cashier", "dentist"] })]),
    cap("receptionist", [proc({
      id: "dar-una-cita", titulo: "Dar una cita", roles: ["receptionist", "cashier"],
      pasos: [{ texto: "Tocá «Dar cita».", captura: "agenda" }, { texto: "Elegí al paciente." }],
      avisos: [{ tipo: "revisar", texto: "Confirmar el horario de atención." }, { tipo: "ojo", texto: "No se puede dar una cita en el pasado." }],
      capturar: async () => {},
    })]),
    cap("cashier", [proc({ id: "ingresar-un-pago", capitulo: "cashier", titulo: "Ingresar un pago", roles: ["cashier"] })]),
    cap("commercial"), cap("dentist"), cap("assistant"), cap("admin"),
  ];

  it("arma portada, índice, capítulos en orden y apéndices", () => {
    const html = montarHtml(entrada(base));
    expect(html).toContain("Manual de procedimientos");
    expect(html).toContain("Borrador para revisión · 7 de octubre de 2026");
    const orden = ORDEN_CAPITULOS.map((id) => html.indexOf(`id="cap-${id}"`));
    expect(orden.every((n) => n > 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    expect(html).toContain('id="apendice-permisos"');
    expect(html).toContain('id="apendice-revisar"');
  });
  it("cada procedimiento tiene su ancla y su entrada en el índice", () => {
    const html = montarHtml(entrada(base));
    expect(html).toContain('id="proc-dar-una-cita"');
    expect(html).toContain('<li><a href="#proc-dar-una-cita">Dar una cita</a></li>');
  });
  it("los pasos van numerados, con el botón dibujado", () => {
    const html = montarHtml(entrada(base));
    expect(html).toContain('<span class="num">1</span>');
    expect(html).toContain('<span class="num">2</span>');
    expect(html).toContain('<span class="boton">Dar cita</span>');
  });
  it("la captura se muestra si existe y si no, avisa cuál falta", () => {
    expect(montarHtml(entrada(base, { capturas: { "dar-una-cita": ["agenda"] } }))).toContain('<img src="capturas/dar-una-cita/agenda.png"');
    expect(montarHtml(entrada(base))).toContain("Falta la captura «agenda»");
  });
  it("si se conoce el tamaño de la captura, la imagen lleva su ancho en mm", () => {
    const html = montarHtml(entrada(base, { capturas: { "dar-una-cita": ["agenda"] }, tamano: () => ({ ancho: 960, alto: 600 }) }));
    expect(html).toContain('<img src="capturas/dar-una-cita/agenda.png" style="width: 75mm"');
  });
  it("escapa los títulos y no deja pasar HTML", () => {
    const sucio = [cap("todos", [proc({ id: "x", capitulo: "todos", titulo: "<script>alert(1)</script>", roles: ["admin"] })])];
    const html = montarHtml(entrada(sucio));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
  it("la hoja del rol sale de la matriz de permisos: la recepcionista no ve montos y el administrador lo puede todo", () => {
    const html = montarHtml(entrada(base));
    const recepcion = html.slice(html.indexOf('id="cap-receptionist"'), html.indexOf('id="cap-cashier"'));
    expect(recepcion).toMatch(/Con este rol no podés[\s\S]*Ver montos: precios, presupuestos, deudas y saldos/);
    expect(recepcion).toMatch(/Con este rol podés[\s\S]*Dar citas/);
    const admin = html.slice(html.indexOf('id="cap-admin"'), html.indexOf('id="apendice-permisos"'));
    expect(admin).toContain("Nada: tiene todos los permisos.");
  });
  it("la hoja del rol lista lo suyo y lo que también le toca de otros capítulos", () => {
    const html = montarHtml(entrada(base));
    const caja = html.slice(html.indexOf('id="cap-cashier"'), html.indexOf('id="cap-dentist"'));
    expect(caja).toContain("Lo que vas a aprender en este capítulo");
    expect(caja).toContain('<a class="ref" href="#proc-ingresar-un-pago">Ingresar un pago</a>');
    expect(caja).toContain("Lo que también te toca, en otros capítulos");
    expect(caja).toContain('<a class="ref" href="#proc-dar-una-cita">Dar una cita</a>'); // lo hace la caja y vive en Recepcionista
    expect(caja).not.toContain("#proc-entrar"); // lo de «Para todos» no se repite
  });
  it("el menú del rol solo sale si se leyó de la app", () => {
    expect(montarHtml(entrada(base))).not.toContain("Tu menú:");
    expect(montarHtml(entrada(base, { menus: { receptionist: ["Agenda", "Pacientes", "Tareas"] } }))).toContain("<strong>Tu menú:</strong> Agenda · Pacientes · Tareas");
  });
  it("los «Para revisar» se juntan al final con su procedimiento; los avisos «ojo» no", () => {
    const html = montarHtml(entrada(base));
    const fin = html.slice(html.indexOf('id="apendice-revisar"'));
    expect(fin).toContain("Confirmar el horario de atención.");
    expect(fin).not.toContain("No se puede dar una cita en el pasado.");
    expect(html).toContain('class="aviso aviso-revisar"');
    expect(html).toContain('class="aviso aviso-ojo"');
  });
  it("los «Error conocido» van en su propio apéndice, aparte de «Puntos para revisar»", () => {
    const html = montarHtml(entrada([
      cap("todos"),
      cap("receptionist", [proc({ id: "a", titulo: "Dar una cita", avisos: [
        { tipo: "error", texto: "La tarjeta nueva no aparece hasta recargar." },
        { tipo: "revisar", texto: "Confirmar el horario de atención." },
      ] })]),
      cap("cashier"), cap("commercial"), cap("dentist"), cap("assistant"), cap("admin"),
    ]));
    expect(html).toContain('<aside class="aviso aviso-error"><span class="aviso-titulo">Error conocido</span> La tarjeta nueva no aparece hasta recargar.</aside>');
    expect(html).toContain('href="#apendice-errores"'); // en el índice
    const revisar = html.slice(html.indexOf('id="apendice-revisar"'), html.indexOf('id="apendice-errores"'));
    expect(revisar).toContain("Confirmar el horario de atención.");
    expect(revisar).not.toContain("La tarjeta nueva no aparece");
    const errores = html.slice(html.indexOf('id="apendice-errores"'));
    expect(errores).toContain("La tarjeta nueva no aparece hasta recargar.");
    expect(errores).toContain('href="#proc-a"');
    expect(errores).not.toContain("Confirmar el horario de atención.");
  });
  it("sin errores conocidos lo dice", () => {
    expect(montarHtml(entrada(base))).toContain("No hay errores conocidos.");
  });
  it("la negrita dentro de un aviso es negrita: solo el título del aviso lleva el estilo de título", () => {
    const html = montarHtml(entrada([
      cap("todos"),
      cap("receptionist", [proc({ id: "a", avisos: [{ tipo: "tip", texto: "En la vista **Semanal**, tocá un hueco." }] })]),
      cap("cashier"), cap("commercial"), cap("dentist"), cap("assistant"), cap("admin"),
    ]));
    expect(html).toContain('<aside class="aviso aviso-tip"><span class="aviso-titulo">Tip</span> En la vista <strong>Semanal</strong>, tocá un hueco.</aside>');
  });
  it("sin nada para revisar lo dice", () => {
    expect(montarHtml(entrada([cap("todos")]))).toContain("No hay puntos pendientes.");
  });
  it("la tabla de permisos tiene una fila por permiso y una columna por rol", () => {
    const html = montarHtml(entrada(base));
    const tabla = html.slice(html.indexOf('<table class="permisos">'), html.indexOf("</table>"));
    expect((tabla.match(/<tr>/g) ?? []).length).toBe(1 + Object.keys(PERMISOS_EN_PALABRAS).length); // encabezado + filas
    expect((tabla.match(/<th scope="col">/g) ?? []).length).toBe(6);
  });
});

describe("el manual no se queda atrás de lib/rbac.ts", () => {
  it("explica TODOS los permisos que existen", () => {
    const rbac = readFileSync(join(process.cwd(), "lib/rbac.ts"), "utf8");
    const tipo = rbac.slice(rbac.indexOf("export type Permission ="), rbac.indexOf("/** Orden en que se listan los roles"));
    const claves = [...tipo.matchAll(/\|\s*"([a-z]+\.[a-z]+)"/g)].map((m) => m[1]).sort();
    expect(claves.length).toBeGreaterThan(15); // se leyó bien
    expect(Object.keys(PERMISOS_EN_PALABRAS).sort()).toEqual(claves);
  });
});
