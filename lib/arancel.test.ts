import { describe, it, expect } from "vitest";
import type { Procedure } from "./types";
import {
  parsearPrecio, parsearPorcentaje, normalizarCodigo, filtrarServicios, ajustarPrecio, planAjuste, aplicarCambios,
  analizarCargaDePrecios, analizarCargaDeFilas, procedimientosDeLaCarga, filasParaExportar, totalDelArancel, buscarPrestaciones,
  MAX_FILAS_DE_CARGA,
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
  it("corta en 3.000 filas y avisa (antes eran 500: un arancel real tiene miles de prestaciones)", () => {
    expect(MAX_FILAS_DE_CARGA).toBe(3000);
    const texto = Array.from({ length: 3020 }, (_, i) => `N${i + 1};Servicio ${i + 1};${1000 + i}`).join("\n");
    const a = analizarCargaDePrecios(texto, CATALOGO);
    expect(a.filas).toHaveLength(3000);
    expect(a.truncado).toBe(true);
    expect(analizarCargaDePrecios(texto.split("\n").slice(0, 3000).join("\n"), CATALOGO).truncado).toBe(false);
  });
  it("un precio que es una fórmula sin su resultado guardado pide abrir el archivo en Excel", () => {
    const a = analizarCargaDeFilas([{ linea: 1, campos: ["Prestación", "Precio"] }, { linea: 6, campos: ["Carillas", "=B2*10"] }], CATALOGO);
    expect(a.filas[0]).toMatchObject({ linea: 6, estado: "error", motivo: "La fórmula «=B2*10» no tiene su resultado guardado: abrí el archivo en Excel, guardalo y volvé a elegirlo." });
  });
  it("una fila sin precio dice que falta el precio", () => {
    const a = analizarCargaDePrecios("Código;Descripción;Precio\nN1;Pulido;", CATALOGO);
    expect(a.filas[0]).toMatchObject({ linea: 2, estado: "error", motivo: "Falta el precio." });
  });
  it("un texto sin nada útil da un análisis vacío", () => {
    const a = analizarCargaDePrecios("   \n\n", CATALOGO);
    expect(a).toMatchObject({ filas: [], nuevos: 0, cambian: 0, iguales: 0, errores: 0, truncado: false });
  });
});

describe("analizarCargaDeFilas — el mismo análisis para el texto pegado y para el archivo de Excel", () => {
  it("con las mismas filas da lo mismo que pegarlas", () => {
    const texto = "Código;Descripción;Precio\nD2330;Resina compuesta — 1 superficie;450000\nN1;Pulido;mucho";
    const filas = texto.split("\n").map((l, i) => ({ linea: i + 1, campos: l.split(";") }));
    const desdeFilas = analizarCargaDeFilas(filas, CATALOGO);
    const desdeTexto = analizarCargaDePrecios(texto, CATALOGO);
    expect(desdeFilas.filas.map(({ estado, linea }) => ({ estado, linea }))).toEqual(desdeTexto.filas.map(({ estado, linea }) => ({ estado, linea })));
    expect([desdeFilas.nuevos, desdeFilas.cambian, desdeFilas.errores]).toEqual([0, 1, 1]);
  });
  it("cada fila conserva su número (el de la fila en la hoja, aunque haya filas salteadas)", () => {
    const a = analizarCargaDeFilas([
      { linea: 7, campos: ["Código", "Precio"] },
      { linea: 9, campos: ["D2330", "450000"] },
      { linea: 15, campos: ["D0120", "abc"] },
    ], CATALOGO);
    expect(a.filas.map((f) => f.linea)).toEqual([9, 15]);
  });
  it("una fila con error muestra sus celdas separadas por «|», y las columnas vacías del final no cuentan", () => {
    const a = analizarCargaDeFilas([{ linea: 3, campos: ["N1", "Pulido", "mucho", "", ""] }], CATALOGO);
    expect(a.filas[0]).toEqual({ linea: 3, estado: "error", texto: "N1 | Pulido | mucho", motivo: "Precio inválido «mucho»." });
    // El CSV que guarda Excel con columnas de más vacías al final se lee igual.
    const b = analizarCargaDePrecios("D2330;Resina compuesta — 1 superficie;450000;;", CATALOGO);
    expect(b.filas[0]).toMatchObject({ estado: "cambia", cpt: "D2330", price: 450000 });
  });
});

describe("nombre y precio, sin código — la planilla «Prestación | Precio»", () => {
  it("empareja por nombre sin tildes, mayúsculas ni signos y cambia el precio (sin tocar el nombre guardado)", () => {
    const texto = "Prestación\tPrecio\nresina compuesta - 1 superficie\t450.000\nEVALUACIÓN ORAL PERIÓDICA\t150000";
    const a = analizarCargaDePrecios(texto, CATALOGO);
    expect(a.filas).toEqual([
      {
        linea: 2, estado: "cambia", cpt: "D2330", description: "Resina compuesta — 1 superficie", price: 450000, category: "operatoria", porNombre: true,
        antes: { description: "Resina compuesta — 1 superficie", price: 420000, category: "operatoria" },
      },
      { linea: 3, estado: "igual", cpt: "D0120", description: "Evaluación oral periódica", porNombre: true },
    ]);
    expect([a.nuevos, a.cambian, a.iguales, a.errores]).toEqual([0, 1, 1, 0]);
  });
  it("lo que no existe se crea con un código automático S0001, S0002… que no choca con los que ya hay ni entre sí", () => {
    const conAutomaticos = [...CATALOGO, P("S0001", "Creado en otra carga", 1000), P("S0003", "Otro de otra carga", 1000)];
    const a = analizarCargaDePrecios("Prestación;Precio\nLimpieza con ultrasonido;180000\nCarillas;2.500.000\nGuarda oclusal;900000", conAutomaticos);
    expect(a.filas).toEqual([
      { linea: 2, estado: "nuevo", cpt: "S0002", description: "Limpieza con ultrasonido", price: 180000, porNombre: true },
      { linea: 3, estado: "nuevo", cpt: "S0004", description: "Carillas", price: 2500000, porNombre: true },
      { linea: 4, estado: "nuevo", cpt: "S0005", description: "Guarda oclusal", price: 900000, porNombre: true },
    ]);
  });
  it("un nombre repetido en el archivo es un error de esa fila (y no gasta un código)", () => {
    const a = analizarCargaDePrecios(
      "Prestación;Precio\nCorona nueva;100\ncorona  NUEVA;200\nResina compuesta — 1 superficie;1\nresina compuesta - 1 superficie;2\nOtra nueva;300",
      CATALOGO,
    );
    expect(a.filas.map((f) => f.estado)).toEqual(["nuevo", "error", "cambia", "error", "nuevo"]);
    expect(a.filas[1]).toMatchObject({ linea: 3, motivo: "Nombre repetido: ya está en la línea 2." });
    expect(a.filas[3]).toMatchObject({ linea: 5, motivo: "Nombre repetido: ya está en la línea 4." });
    expect(a.filas[4]).toMatchObject({ cpt: "S0002" });
  });
  it("reconoce «Procedimiento» e «Ítem» como la columna del nombre", () => {
    expect(analizarCargaDePrecios("Procedimiento;Valor\nExodoncia simple;650000", CATALOGO).filas[0]).toMatchObject({ estado: "cambia", cpt: "D7140", price: 650000 });
    expect(analizarCargaDePrecios("Ítem;Importe\nExodoncia simple;650000", CATALOGO).filas[0]).toMatchObject({ estado: "cambia", cpt: "D7140", price: 650000 });
  });
  it("con categoría también la cambia, y la categoría que no existe es un error", () => {
    const a = analizarCargaDePrecios("Prestación;Categoría;Precio\nExodoncia simple;Cirugía;600000\nPulido nuevo;Prevención e higiene;80000\nAlgo;Magia;1", CATALOGO);
    expect(a.filas[0]).toMatchObject({ estado: "igual", cpt: "D7140" });
    expect(a.filas[1]).toMatchObject({ estado: "nuevo", cpt: "S0001", category: "prevencion" });
    expect(a.filas[2]).toMatchObject({ estado: "error" });
  });
  it("si en el arancel hay dos servicios con ese nombre, pide el código para elegir", () => {
    const dobles = [...CATALOGO, P("C1", "Consulta", 100), P("C2", "consulta", 200)];
    const a = analizarCargaDePrecios("Prestación;Precio\nConsulta;300", dobles);
    expect(a.filas[0]).toMatchObject({ estado: "error" });
    if (a.filas[0].estado === "error") expect(a.filas[0].motivo).toMatch(/C1, C2.*código/);
  });
  it("falta el nombre o el precio: error de esa fila", () => {
    const a = analizarCargaDeFilas([
      { linea: 1, campos: ["Prestación", "Precio"] },
      { linea: 2, campos: ["", "1000"] },
      { linea: 3, campos: ["Carillas"] },
      { linea: 4, campos: ["—", "1000"] },
    ], CATALOGO);
    expect(a.filas.map((f) => (f.estado === "error" ? f.motivo : f.estado))).toEqual([
      "Falta el nombre de la prestación.", "Falta el precio.", "Falta el nombre de la prestación.",
    ]);
  });
  it("lo nuevo por nombre se guarda con su código automático", () => {
    const a = analizarCargaDePrecios("Prestación;Precio\nLimpieza con ultrasonido;180000\nExodoncia simple;650000", CATALOGO);
    expect(procedimientosDeLaCarga(a, CATALOGO)).toEqual([
      { cpt: "S0001", description: "Limpieza con ultrasonido", price: 180000, defaultDx: [] },
      { ...CATALOGO[3], price: 650000 },
    ]);
  });
  it("sin encabezado y con dos columnas: con espacios o más de 20 letras es un nombre; si no, un código (como siempre)", () => {
    const a = analizarCargaDePrecios(
      "Limpieza con ultrasonido;180000\nD2330;450000\nResinaCompuesta1Superficie;1000\nZZ9;1000",
      CATALOGO,
    );
    expect(a.filas.map((f) => f.estado)).toEqual(["nuevo", "cambia", "nuevo", "error"]);
    expect(a.filas[0]).toMatchObject({ cpt: "S0001", description: "Limpieza con ultrasonido", porNombre: true });
    expect(a.filas[1]).toMatchObject({ cpt: "D2330", price: 450000 });
    expect(a.filas[1]).not.toHaveProperty("porNombre");
    expect(a.filas[2]).toMatchObject({ cpt: "S0002", description: "ResinaCompuesta1Superficie" });
    if (a.filas[3].estado === "error") expect(a.filas[3].motivo).toMatch(/no existe/);
  });
  it("sin encabezado, una sola palabra sin números («Profilaxis») es un nombre, salvo que sea un código que ya existe", () => {
    const catalogo = [...CATALOGO, P("ORTO", "Control de ortodoncia", 100000)];
    const a = analizarCargaDePrecios("Profilaxis;300000\northo;5\nORTO;120000\nExodoncia simple;600000", catalogo);
    expect(a.filas).toMatchObject([
      { estado: "nuevo", cpt: "S0001", description: "Profilaxis" },
      { estado: "nuevo", cpt: "S0002", description: "ortho" },
      { estado: "cambia", cpt: "ORTO", price: 120000 },
      { estado: "igual", cpt: "D7140" },
    ]);
  });
  it("el código automático no pisa un código que el mismo archivo trae más abajo", () => {
    const a = analizarCargaDePrecios("Limpieza profunda;180000\nS0001;Servicio con su código;5000", CATALOGO);
    expect(a.filas).toMatchObject([
      { estado: "nuevo", cpt: "S0002", description: "Limpieza profunda" },
      { estado: "nuevo", cpt: "S0001", description: "Servicio con su código" },
    ]);
  });
  it("el mismo servicio por código y por nombre en el mismo archivo es un repetido", () => {
    const a = analizarCargaDePrecios("D7140;Exodoncia simple;610000\nExodoncia simple;620000\nN1;Algo nuevo;1000\nalgo nuevo;2000", CATALOGO);
    expect(a.filas.map((f) => f.estado)).toEqual(["cambia", "error", "nuevo", "error"]);
    if (a.filas[1].estado === "error") expect(a.filas[1].motivo).toMatch(/línea 1/);
    if (a.filas[3].estado === "error") expect(a.filas[3].motivo).toMatch(/línea 3/);
  });
  it("el encabezado necesita la columna del precio y la del código o el nombre", () => {
    const sinPrecio = analizarCargaDePrecios("Prestación;Categoría\nPulido;Prevención e higiene", CATALOGO);
    expect(sinPrecio.filas).toHaveLength(1);
    expect(sinPrecio.filas[0]).toMatchObject({ estado: "error", linea: 1 });
    if (sinPrecio.filas[0].estado === "error") expect(sinPrecio.filas[0].motivo).toMatch(/Precio/);
    const sinNombre = analizarCargaDePrecios("Precio;Categoría\n1000;Cirugía", CATALOGO);
    if (sinNombre.filas[0].estado === "error") expect(sinNombre.filas[0].motivo).toMatch(/Código.*nombre/i);
    else throw new Error("tenía que ser un error");
  });
});

describe("el encabezado como lo escribe la gente", () => {
  it("lo busca en las primeras filas y saltea el título de arriba", () => {
    const a = analizarCargaDePrecios("LISTA DE PRECIOS 2026\nClínica Aura\n\nPrestación\tPrecio (Gs.)\nExodoncia simple\t650000", CATALOGO);
    expect(a.lineaDelEncabezado).toBe(4);
    expect(a.filasAntesDelEncabezado).toBe(2);
    expect(a.filas).toMatchObject([{ linea: 5, estado: "cambia", cpt: "D7140", price: 650000 }]);
  });
  it("no se saltea nada si arriba hay filas con datos (el encabezado tiene que ir antes)", () => {
    const a = analizarCargaDePrecios("D2330;450000\nCódigo;Precio\nD0120;160000", CATALOGO);
    expect(a.lineaDelEncabezado).toBeNull();
    expect(a.filasAntesDelEncabezado).toBe(0);
    expect(a.filas[0]).toMatchObject({ linea: 1, estado: "cambia", cpt: "D2330" });
  });
  it("entiende encabezados con más palabras: «Código CDT», «Nombre del servicio», «Valor unitario»", () => {
    const a = analizarCargaDePrecios("Código CDT;Nombre del servicio;Valor unitario\nN1;Algo nuevo;1000", CATALOGO);
    expect(a.filas).toEqual([{ linea: 2, estado: "nuevo", cpt: "N1", description: "Algo nuevo", price: 1000 }]);
  });
  it("con varias columnas de plata, «Precio» gana sobre «Costo» aunque esté después", () => {
    const a = analizarCargaDePrecios("Prestación;Costo;Precio\nExodoncia simple;100000;650000", CATALOGO);
    expect(a.filas[0]).toMatchObject({ estado: "cambia", price: 650000 });
  });
  it("un título de una sola celda que empieza como una columna («Precio de lista») no es el encabezado", () => {
    const a = analizarCargaDePrecios("Precio de lista\nCódigo;Precio\nD2330;450000", CATALOGO);
    expect(a.lineaDelEncabezado).toBe(2);
    expect(a.filas).toMatchObject([{ linea: 3, estado: "cambia", cpt: "D2330" }]);
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
