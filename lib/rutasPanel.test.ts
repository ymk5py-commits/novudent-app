import { describe, it, expect } from "vitest";
import { hrefActivo, PESTANAS_DE_FICHA, pestanaDeRuta, rutaDeFicha, rutaDeSeccion, rutaLimpia, seccionDeRuta } from "./rutasPanel";

describe("rutaDeSeccion — la URL limpia de una sección del panel", () => {
  it("cada sección tiene su ruta, con el nombre de la URL que se lee bien", () => {
    expect(rutaDeSeccion("configuracion", "permisos")).toBe("/app/configuracion/permisos");
    expect(rutaDeSeccion("configuracion", "fusion")).toBe("/app/configuracion/fusion-de-fichas");
    expect(rutaDeSeccion("configuracion", "agendamiento")).toBe("/app/configuracion/agenda-online");
    expect(rutaDeSeccion("configuracion", "estados-cita")).toBe("/app/configuracion/estados-de-cita");
    expect(rutaDeSeccion("reportes", "analisis")).toBe("/app/reportes/analisis-de-pacientes");
    expect(rutaDeSeccion("reportes", "graficos")).toBe("/app/reportes/graficos");
    expect(rutaDeSeccion("tareas", "configuracion")).toBe("/app/tareas/plazos");
    expect(rutaDeSeccion("tareas", "estadisticas")).toBe("/app/tareas/estadisticas");
    expect(rutaDeSeccion("pacientes", "configuracion")).toBe("/app/pacientes/configuracion");
  });

  it("la sección que abre por defecto (o una que no existe) es la raíz del área", () => {
    expect(rutaDeSeccion("reportes", "desempeno")).toBe("/app/reportes");
    expect(rutaDeSeccion("pacientes", "lista")).toBe("/app/pacientes");
    expect(rutaDeSeccion("tareas", "bandeja")).toBe("/app/tareas");
    expect(rutaDeSeccion("configuracion", "no-existe")).toBe("/app/configuracion");
  });
});

describe("seccionDeRuta — qué sección pide la URL", () => {
  it("lee el área y la sección, con o sin barra final", () => {
    expect(seccionDeRuta("/app/configuracion/permisos")).toEqual({ area: "configuracion", id: "permisos" });
    expect(seccionDeRuta("/app/configuracion/fusion-de-fichas/")).toEqual({ area: "configuracion", id: "fusion" });
    expect(seccionDeRuta("/app/reportes/analisis-de-pacientes")).toEqual({ area: "reportes", id: "analisis" });
    expect(seccionDeRuta("/app/tareas/plazos")).toEqual({ area: "tareas", id: "configuracion" });
    expect(seccionDeRuta("/app/pacientes/estudios")).toEqual({ area: "pacientes", id: "estudios" });
  });

  it("la raíz del área es su sección por defecto", () => {
    expect(seccionDeRuta("/app/reportes")).toEqual({ area: "reportes", id: "desempeno" });
    expect(seccionDeRuta("/app/pacientes")).toEqual({ area: "pacientes", id: "lista" });
    expect(seccionDeRuta("/app/tareas")).toEqual({ area: "tareas", id: "bandeja" });
    expect(seccionDeRuta("/app/configuracion")).toEqual({ area: "configuracion", id: "" });
  });

  it("nada para una sección desconocida, otra área o la ficha de un paciente", () => {
    expect(seccionDeRuta("/app/configuracion/cualquiera")).toBeNull();
    expect(seccionDeRuta("/app/agenda")).toBeNull();
    expect(seccionDeRuta("/app/pacientes/p1")).toBeNull();
    expect(seccionDeRuta("/app/pacientes/p1/planes")).toBeNull();
  });
});

describe("rutaDeFicha / pestanaDeRuta — las pestañas de la ficha del paciente", () => {
  it("arma y lee /app/pacientes/<id>/<pestaña>", () => {
    expect(rutaDeFicha("p1")).toBe("/app/pacientes/p1");
    expect(rutaDeFicha("p1", "planes")).toBe("/app/pacientes/p1/planes");
    expect(rutaDeFicha("p 1", "recibir-pago")).toBe("/app/pacientes/p%201/recibir-pago");
    expect(pestanaDeRuta("/app/pacientes/p1/planes")).toBe("planes");
    expect(pestanaDeRuta("/app/pacientes/p1/recibir-pago/")).toBe("recibir-pago");
  });

  it("«formularios» es el nombre viejo de «documentos»", () => {
    expect(rutaDeFicha("p4", "formularios")).toBe("/app/pacientes/p4/documentos");
    expect(pestanaDeRuta("/app/pacientes/p4/formularios")).toBe("documentos");
  });

  it("una pestaña que no existe no arma ruta ni se lee", () => {
    expect(rutaDeFicha("p1", "cualquiera")).toBe("/app/pacientes/p1");
    expect(pestanaDeRuta("/app/pacientes/p1/cualquiera")).toBeNull();
    expect(pestanaDeRuta("/app/pacientes/p1")).toBeNull();
    expect(pestanaDeRuta("/app/pacientes/configuracion")).toBeNull();
  });

  it("las pestañas son las de la ficha", () => {
    for (const p of ["datos", "documentos", "planes", "odontograma", "facturacion", "recibir-pago", "tareas"]) expect(PESTANAS_DE_FICHA).toContain(p);
  });
});

describe("rutaLimpia — los enlaces viejos (con # o ?tab=) pasan a la URL limpia", () => {
  it("una sección con # pasa a su ruta", () => {
    expect(rutaLimpia("/app/configuracion", "", "#permisos")).toBe("/app/configuracion/permisos");
    expect(rutaLimpia("/app/configuracion", "", "#agendamiento")).toBe("/app/configuracion/agenda-online");
    expect(rutaLimpia("/app/reportes", "", "#analisis")).toBe("/app/reportes/analisis-de-pacientes");
    expect(rutaLimpia("/app/pacientes", "", "#configuracion")).toBe("/app/pacientes/configuracion");
    expect(rutaLimpia("/app/tareas", "", "#estadisticas")).toBe("/app/tareas/estadisticas");
    expect(rutaLimpia("/app/tareas", "", "#configuracion")).toBe("/app/tareas/plazos");
  });

  it("la pestaña de la ficha con # o con ?tab= pasa a su ruta, y el resto de la consulta se conserva", () => {
    expect(rutaLimpia("/app/pacientes/p1", "", "#planes")).toBe("/app/pacientes/p1/planes");
    expect(rutaLimpia("/app/pacientes/p2", "?tab=documentos", "")).toBe("/app/pacientes/p2/documentos");
    expect(rutaLimpia("/app/pacientes/p4", "?tab=formularios", "")).toBe("/app/pacientes/p4/documentos");
    expect(rutaLimpia("/app/pacientes/p2", "?tab=datos&x=1", "")).toBe("/app/pacientes/p2/datos?x=1");
  });

  it("la consulta de otras cosas se conserva (la fecha de la bandeja, los pendientes)", () => {
    expect(rutaLimpia("/app/tareas", "?fecha=2026-10-08&tarea=t1", "#estadisticas")).toBe("/app/tareas/estadisticas?fecha=2026-10-08&tarea=t1");
  });

  it("nada que cambiar: ya está limpia, el # no es una sección o es otra pantalla", () => {
    expect(rutaLimpia("/app/configuracion/permisos", "", "")).toBeNull();
    expect(rutaLimpia("/app/configuracion", "", "")).toBeNull();
    expect(rutaLimpia("/app/configuracion", "", "#cualquiera")).toBeNull();
    expect(rutaLimpia("/app/pacientes/p1", "?tab=cualquiera", "")).toBeNull();
    expect(rutaLimpia("/app/agenda", "", "#algo")).toBeNull();
    expect(rutaLimpia("/app/pacientes", "?pendientes=documentos", "")).toBeNull();
  });
});

describe("hrefActivo — qué ítem del menú corresponde a la URL", () => {
  const items = ["/app/configuracion", "/app/configuracion/permisos", "/app/configuracion/arancel"];
  it("gana el que más se parece, cortando en las barras", () => {
    expect(hrefActivo("/app/configuracion/permisos", items)).toBe("/app/configuracion/permisos");
    expect(hrefActivo("/app/configuracion", items)).toBe("/app/configuracion");
    expect(hrefActivo("/app/configuracion/usuarios", items)).toBe("/app/configuracion");
  });
  it("no confunde un prefijo de texto con un segmento", () => {
    expect(hrefActivo("/app/configuracionx", items)).toBeNull();
    expect(hrefActivo("/app/agenda", items)).toBeNull();
  });
});
