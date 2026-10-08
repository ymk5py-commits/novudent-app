import { describe, it, expect } from "vitest";
import type { Procedure } from "./types";
import {
  parsearPrecio, parsearPorcentaje, normalizarCodigo, filtrarServicios, ajustarPrecio, planAjuste, aplicarCambios,
  analizarCargaDePrecios, procedimientosDeLaCarga, filasParaExportar, totalDelArancel, buscarPrestaciones,
} from "./arancel";

const P = (cpt: string, description: string, price: number, category?: Procedure["category"], extra: Partial<Procedure> = {}): Procedure =>
  ({ cpt, description, price, defaultDx: [], category, ...extra });

const CATALOGO: Procedure[] = [
  P("D0120", "Evaluación oral periódica", 150000, "diagnostico"),
  P("D2330", "Resina compuesta — 1 superficie", 420000, "operatoria", { defaultDx: ["K02.9"] }),
  P("D3310", "Endodoncia — anterior", 1200000, "endodoncia", { surgical: true }),
  P("D7140", "Exodoncia simple", 600000, "cirugia"),
];

describe("parsearPrecio — lo que se escribe o se pega desde Excel", () => {
  it("entiende los formatos paraguayos y los de planilla", () => {
    const casos: [string, number][] = [
      ["1500000", 1500000], ["1.500.000", 1500000], ["1,500,000", 1500000], ["Gs. 1.500.000", 1500000],
      ["₲ 250.000", 250000], ["$ 1.200.000", 1200000], ["  250.000  ", 250000], ["250 000", 250000], ["250 000", 250000],
      ["1.500.000,50", 1500000.5], ["12,50", 12.5], ["12.50", 12.5], ["1.500", 1500], ["0", 0],
    ];
    for (const [texto, esperado] of casos) expect(parsearPrecio(texto), texto).toBe(esperado);
  });
  it("devuelve null si no es un monto válido", () => {
    for (const malo of ["", "   ", "abc", "-100", "1.2.3,4,5", "Gs.", "12abc34", "1e9"]) expect(parsearPrecio(malo), malo).toBeNull();
  });
  it("redondea a 2 decimales como mucho", () => {
    expect(parsearPrecio("10,456")).toBe(10456);
    expect(parsearPrecio("10.456789")).toBe(10.46);
  });
});

describe("parsearPorcentaje — el «subir o bajar» del ajuste en bloque", () => {
  it("entiende signo, coma o punto decimal y el símbolo %", () => {
    const casos: [string, number][] = [["10", 10], ["+10", 10], ["-5", -5], ["7,5", 7.5], ["+7.5", 7.5], ["10 %", 10], ["-12,5%", -12.5], ["  3 ", 3], ["0", 0], ["−5", -5]];
    for (const [texto, esperado] of casos) expect(parsearPorcentaje(texto), texto).toBe(esperado);
  });
  it("rechaza lo que no es un porcentaje o es un error de tipeo gigante", () => {
    for (const malo of ["", "  ", "abc", "10 20", "1e2", "%", "-100", "-95", "501", "99999"]) expect(parsearPorcentaje(malo), malo).toBeNull();
  });
  it("acepta los extremos razonables", () => {
    expect(parsearPorcentaje("-90")).toBe(-90);
    expect(parsearPorcentaje("500")).toBe(500);
  });
});

describe("normalizarCodigo — el código es el id del documento en la base", () => {
  it("pasa a mayúsculas y recorta", () => {
    expect(normalizarCodigo("  d2330 ")).toBe("D2330");
    expect(normalizarCodigo("ort-01")).toBe("ORT-01");
    expect(normalizarCodigo("D2.330_a")).toBe("D2.330_A");
  });
  it("rechaza lo que rompería la ruta en la base o no es un código", () => {
    for (const malo of ["", "   ", "D/2330", "a b", ".", "..", "-D1", "D2330\\x", "x".repeat(21), "D$1"]) expect(normalizarCodigo(malo), malo).toBeNull();
  });
});

describe("filtrarServicios — buscar por código, descripción o categoría", () => {
  it("sin búsqueda ni categoría devuelve todo, en el mismo orden", () => {
    expect(filtrarServicios(CATALOGO, "", "todas")).toEqual(CATALOGO);
    expect(filtrarServicios(CATALOGO, "   ", "todas")).toEqual(CATALOGO);
  });
  it("ignora mayúsculas y tildes", () => {
    expect(filtrarServicios(CATALOGO, "EVALUACION", "todas").map((p) => p.cpt)).toEqual(["D0120"]);
    expect(filtrarServicios(CATALOGO, "d23", "todas").map((p) => p.cpt)).toEqual(["D2330"]);
    expect(filtrarServicios(CATALOGO, "cirugia", "todas").map((p) => p.cpt)).toEqual(["D7140"]);
  });
  it("todas las palabras tienen que aparecer, en cualquier orden", () => {
    expect(filtrarServicios(CATALOGO, "anterior endodoncia", "todas").map((p) => p.cpt)).toEqual(["D3310"]);
    expect(filtrarServicios(CATALOGO, "anterior resina", "todas")).toEqual([]);
  });
  it("filtra por categoría, y la categoría sale del código si el servicio no la trae", () => {
    expect(filtrarServicios(CATALOGO, "", "operatoria").map((p) => p.cpt)).toEqual(["D2330"]);
    const sinCategoria = [...CATALOGO, P("D4341", "Raspado", 550000)];
    expect(filtrarServicios(sinCategoria, "", "periodoncia").map((p) => p.cpt)).toEqual(["D4341"]);
  });
});

describe("ajustarPrecio — subir o bajar un porcentaje", () => {
  it("aplica el porcentaje", () => {
    expect(ajustarPrecio(1000000, 10, 0)).toBe(1100000);
    expect(ajustarPrecio(250000, -10, 0)).toBe(225000);
    expect(ajustarPrecio(420000, 5, 0)).toBe(441000);
  });
  it("redondea al múltiplo pedido (a la mitad, hacia arriba)", () => {
    expect(ajustarPrecio(150000, 3, 1000)).toBe(155000);
    expect(ajustarPrecio(420000, 7.3, 10000)).toBe(450000);
    expect(ajustarPrecio(123456, 0, 1000)).toBe(123000);
  });
  it("sin redondeo deja guaraníes enteros", () => {
    expect(ajustarPrecio(333333, 10, 0)).toBe(366666);
  });
  it("nunca baja de cero", () => {
    expect(ajustarPrecio(100000, -150, 0)).toBe(0);
  });
});

describe("totalDelArancel — para mostrar cuánto suma el cambio antes de aplicarlo", () => {
  it("suma los precios de los servicios", () => {
    expect(totalDelArancel(CATALOGO)).toBe(150000 + 420000 + 1200000 + 600000);
    expect(totalDelArancel([])).toBe(0);
  });
});

describe("planAjuste / aplicarCambios — el cambio masivo se ve antes y se puede deshacer", () => {
  it("lista solo los precios que cambian, con el antes y el después", () => {
    expect(planAjuste(CATALOGO, 10, 0)).toEqual([
      { cpt: "D0120", antes: 150000, despues: 165000 },
      { cpt: "D2330", antes: 420000, despues: 462000 },
      { cpt: "D3310", antes: 1200000, despues: 1320000 },
      { cpt: "D7140", antes: 600000, despues: 660000 },
    ]);
    expect(planAjuste(CATALOGO, 0, 0)).toEqual([]);
    expect(planAjuste([P("X1", "Gratis", 0)], 10, 0)).toEqual([]);
  });
  it("aplica el cambio sobre los servicios sin perder el resto de sus datos", () => {
    const plan = planAjuste(CATALOGO, 10, 0);
    const nuevos = aplicarCambios(CATALOGO, plan, "despues");
    expect(nuevos.find((p) => p.cpt === "D2330")).toEqual({ ...CATALOGO[1], price: 462000 });
    expect(nuevos.find((p) => p.cpt === "D3310")?.surgical).toBe(true);
    expect(nuevos).toHaveLength(4);
  });
  it("deshacer deja cada precio como estaba", () => {
    const plan = planAjuste(CATALOGO, -12.5, 1000);
    const cambiados = aplicarCambios(CATALOGO, plan, "despues");
    const vueltos = aplicarCambios(cambiados, plan, "antes");
    expect(vueltos).toEqual(CATALOGO);
  });
  it("ignora códigos del plan que ya no existen", () => {
    expect(aplicarCambios(CATALOGO, [{ cpt: "NOEXISTE", antes: 1, despues: 2 }], "despues")).toEqual([]);
  });
});

describe("analizarCargaDePrecios — pegar filas de Excel", () => {
  it("lee tres columnas separadas por tabulación (lo que copia Excel) y las clasifica", () => {
    const texto = "D2330\tResina compuesta — 1 superficie\t450.000\nD9999\tServicio nuevo\t100.000";
    const a = analizarCargaDePrecios(texto, CATALOGO);
    expect(a.filas).toEqual([
      { linea: 1, estado: "cambia", cpt: "D2330", description: "Resina compuesta — 1 superficie", price: 450000, category: "operatoria", antes: { description: "Resina compuesta — 1 superficie", price: 420000, category: "operatoria" } },
      { linea: 2, estado: "nuevo", cpt: "D9999", description: "Servicio nuevo", price: 100000 },
    ]);
    expect([a.nuevos, a.cambian, a.iguales, a.errores]).toEqual([1, 1, 0, 0]);
  });
  it("salta el encabezado y conserva el número de línea del texto", () => {
    const a = analizarCargaDePrecios("Código;Descripción;Precio\nD2330;Resina compuesta — 1 superficie;420000", CATALOGO);
    expect(a.filas).toEqual([{ linea: 2, estado: "igual", cpt: "D2330" }]);
    expect(a.iguales).toBe(1);
  });
  it("con dos columnas (código y precio) solo actualiza lo que ya existe", () => {
    const a = analizarCargaDePrecios("D2330;450000\nZZ9;1000", CATALOGO);
    expect(a.filas[0]).toMatchObject({ estado: "cambia", cpt: "D2330", price: 450000, description: "Resina compuesta — 1 superficie" });
    expect(a.filas[1]).toMatchObject({ estado: "error", linea: 2 });
    if (a.filas[1].estado === "error") expect(a.filas[1].motivo).toMatch(/no existe/i);
  });
  it("respeta las comillas y acepta coma o punto y coma", () => {
    const a = analizarCargaDePrecios('N1;"Resina, 1 superficie";450000\nN2,"Corona, cerámica",2800000', CATALOGO);
    expect(a.filas).toMatchObject([
      { estado: "nuevo", cpt: "N1", description: "Resina, 1 superficie", price: 450000 },
      { estado: "nuevo", cpt: "N2", description: "Corona, cerámica", price: 2800000 },
    ]);
  });
  it("con encabezado entiende el orden de las columnas", () => {
    const a = analizarCargaDePrecios("Arancel\tCodigo\tServicio\n450000\tN1\tResina nueva", CATALOGO);
    expect(a.filas).toMatchObject([{ linea: 2, estado: "nuevo", cpt: "N1", description: "Resina nueva", price: 450000 }]);
  });
  it("cuatro columnas: código, descripción, categoría y precio", () => {
    const a = analizarCargaDePrecios("N1;Pulido;Prevención e higiene;80000\nN2;Algo;Magia;1000", CATALOGO);
    expect(a.filas[0]).toMatchObject({ estado: "nuevo", cpt: "N1", category: "prevencion", price: 80000 });
    expect(a.filas[1]).toMatchObject({ estado: "error", linea: 2 });
    if (a.filas[1].estado === "error") expect(a.filas[1].motivo).toMatch(/categor/i);
  });
  it("marca como error el precio inválido, el código inválido y el código repetido", () => {
    const a = analizarCargaDePrecios("N1;Uno;mucho\nN/2;Dos;1000\nN3;Tres;3000\nn3;Tres otra vez;4000\n;Sin código;500", CATALOGO);
    expect(a.filas.map((f) => f.estado)).toEqual(["error", "error", "nuevo", "error", "error"]);
    const motivos = a.filas.flatMap((f) => (f.estado === "error" ? [f.motivo] : []));
    expect(motivos[0]).toMatch(/precio/i);
    expect(motivos[1]).toMatch(/código/i);
    expect(motivos[2]).toMatch(/repetido|línea 3/i);
    expect(motivos[3]).toMatch(/código/i);
    expect(a.errores).toBe(4);
  });
  it("cambia la descripción solo si viene una distinta", () => {
    const a = analizarCargaDePrecios("D7140\tExodoncia simple (diente)\t600000", CATALOGO);
    expect(a.filas[0]).toMatchObject({ estado: "cambia", description: "Exodoncia simple (diente)", price: 600000 });
  });
  it("las líneas vacías se saltan pero cuentan para el número de línea", () => {
    const a = analizarCargaDePrecios("\n\nD2330;450000\n   \n;;;\n", CATALOGO);
    expect(a.filas).toHaveLength(1);
    expect(a.filas[0]).toMatchObject({ linea: 3, cpt: "D2330" });
  });
  it("corta en 500 filas y avisa", () => {
    const texto = Array.from({ length: 520 }, (_, i) => `N${i + 1};Servicio ${i + 1};${1000 + i}`).join("\n");
    const a = analizarCargaDePrecios(texto, CATALOGO);
    expect(a.filas).toHaveLength(500);
    expect(a.truncado).toBe(true);
  });
  it("un texto sin nada útil da un análisis vacío", () => {
    const a = analizarCargaDePrecios("   \n\n", CATALOGO);
    expect(a).toMatchObject({ filas: [], nuevos: 0, cambian: 0, iguales: 0, errores: 0, truncado: false });
  });
});

describe("procedimientosDeLaCarga — lo que realmente se guarda", () => {
  it("crea los nuevos y actualiza los existentes sin perder sus otros datos", () => {
    const a = analizarCargaDePrecios("D3310;Endodoncia — anterior;1500000\nN1;Pulido;Prevención e higiene;80000\nD0120;150000", CATALOGO);
    const aGuardar = procedimientosDeLaCarga(a, CATALOGO);
    expect(aGuardar).toEqual([
      { ...CATALOGO[2], price: 1500000 },
      { cpt: "N1", description: "Pulido", price: 80000, defaultDx: [], category: "prevencion" },
    ]);
  });
  it("no incluye los que no cambian ni los que tienen error", () => {
    const a = analizarCargaDePrecios("D2330;420000\nZZ9;5\nX/1;Mal;5", CATALOGO);
    expect(procedimientosDeLaCarga(a, CATALOGO)).toEqual([]);
  });
});

describe("filasParaExportar — la tabla de precios para llevar a Excel y volver", () => {
  it("trae encabezado y una fila por servicio con el precio como número", () => {
    const filas = filasParaExportar(CATALOGO);
    expect(filas[0]).toEqual(["Código", "Descripción", "Categoría", "Precio"]);
    expect(filas[2]).toEqual(["D2330", "Resina compuesta — 1 superficie", "Operatoria", 420000]);
    expect(filas).toHaveLength(5);
  });
  it("lo exportado se puede volver a cargar y no cambia nada", () => {
    const csv = filasParaExportar(CATALOGO).map((f) => f.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(";")).join("\n");
    const a = analizarCargaDePrecios(csv, CATALOGO);
    expect(a.iguales).toBe(4);
    expect(a.errores).toBe(0);
    expect(procedimientosDeLaCarga(a, CATALOGO)).toEqual([]);
  });
});

describe("buscarPrestaciones — el buscador del plan con un arancel de cientos de servicios", () => {
  const MUCHOS: Procedure[] = [
    P("D0120", "Evaluación oral periódica", 150000, "diagnostico"),
    P("D1110", "Profilaxis dental — adulto", 200000, "prevencion"),
    P("D2330", "Resina compuesta — 1 superficie", 420000, "operatoria"),
    P("D2391", "Resina posterior — 1 superficie", 480000, "operatoria"),
    P("D3310", "Endodoncia — anterior", 1200000, "endodoncia"),
    P("D7140", "Exodoncia simple", 600000, "cirugia"),
    P("S0001", "Limpieza con ultrasonido", 180000),
  ];

  it("sin escribir nada ofrece los primeros, en el orden del arancel, y dice cuántos hay", () => {
    const r = buscarPrestaciones(MUCHOS, "", 3);
    expect(r.visibles.map((p) => p.cpt)).toEqual(["D0120", "D1110", "D2330"]);
    expect(r.total).toBe(7);
  });

  it("sin importar mayúsculas ni tildes, y con todas las palabras", () => {
    expect(buscarPrestaciones(MUCHOS, "EVALUACION", 10).visibles.map((p) => p.cpt)).toEqual(["D0120"]);
    expect(buscarPrestaciones(MUCHOS, "resina superficie", 10).visibles.map((p) => p.cpt)).toEqual(["D2330", "D2391"]);
    expect(buscarPrestaciones(MUCHOS, "zzz", 10)).toEqual({ visibles: [], total: 0 });
  });

  it("el código exacto va primero, después los que empiezan con lo escrito y después los que lo contienen", () => {
    const catalogo: Procedure[] = [
      P("X1", "Corona sobre D23 provisoria", 1),
      P("D2330", "Resina compuesta", 2),
      P("D23", "Código exacto", 3),
      P("D2391", "Resina posterior", 4),
    ];
    expect(buscarPrestaciones(catalogo, "d23", 10).visibles.map((p) => p.cpt)).toEqual(["D23", "D2330", "D2391", "X1"]);
  });

  it("los que empiezan con la palabra del nombre van antes que los que solo la contienen", () => {
    const catalogo: Procedure[] = [P("A1", "Control de endodoncia", 1), P("A2", "Endodoncia — anterior", 2), P("A3", "Retratamiento de endodoncia", 3)];
    expect(buscarPrestaciones(catalogo, "endodoncia", 10).visibles.map((p) => p.cpt)).toEqual(["A2", "A1", "A3"]);
  });

  it("no ofrece los que se excluyen (los que el plan ya tiene) y el total los descuenta", () => {
    const r = buscarPrestaciones(MUCHOS, "resina", 10, new Set(["D2330"]));
    expect(r.visibles.map((p) => p.cpt)).toEqual(["D2391"]);
    expect(r.total).toBe(1);
  });

  it("corta en el máximo pero cuenta todos los que coinciden", () => {
    const r = buscarPrestaciones(MUCHOS, "d", 2);
    expect(r.visibles).toHaveLength(2);
    expect(r.total).toBeGreaterThan(2);
  });
});
