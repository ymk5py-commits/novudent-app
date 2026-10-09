import { describe, it, expect } from "vitest";
import { armarDB, cargarDB, filtroDeDirectos, opsDeSemilla } from "./carga";
import { COLECCIONES_DE_LA_TIENDA } from "./colecciones";
import { CLINICA_DEMO } from "./constantes";
import { crearBackendEnMemoria } from "./memoria";
import { buildSeed } from "../seed";

const usuarios = [
  { id: "admin1", role: "admin", active: true },
  { id: "dent1", role: "dentist", active: true },
  { id: "baja1", role: "assistant", active: false },
];

describe("filtroDeDirectos", () => {
  it("la demo lee todos los directos, con o sin sesión", () => {
    expect(filtroDeDirectos(CLINICA_DEMO, [], null)).toBe("todos");
  });
  it("el admin lee todos; el resto, solo los suyos", () => {
    expect(filtroDeDirectos("cl1", usuarios, "admin1")).toBe("todos");
    expect(filtroDeDirectos("cl1", usuarios, "dent1")).toEqual({ participante: "dent1" });
  });
  it("sin sesión, sin figurar en el padrón o dado de baja: ninguno", () => {
    expect(filtroDeDirectos("cl1", usuarios, null)).toBe("ninguno");
    expect(filtroDeDirectos("cl1", usuarios, "desconocido")).toBe("ninguno");
    expect(filtroDeDirectos("cl1", usuarios, "baja1")).toBe("ninguno");
  });
});

describe("opsDeSemilla", () => {
  it("guarda el documento de la clínica con su onboarding y un documento por cada elemento de la semilla (procedimientos por su cpt)", () => {
    const seed = buildSeed();
    const ops = opsDeSemilla(seed);
    expect(ops[0]).toEqual({ tipo: "guardarClinica", data: { ...seed.clinics[0], onboarding: seed.onboarding } });
    const guardados = ops.filter((o) => o.tipo === "guardar") as Array<{ col: string; id: string }>;
    expect(guardados.filter((o) => o.col === "procedures").map((o) => o.id)).toEqual(seed.procedures.map((p) => p.cpt));
    expect(guardados.filter((o) => o.col === "patients").map((o) => o.id)).toEqual(seed.patients.map((p) => p.id));
    expect(guardados.length).toBe(
      ["users", "patients", "appointments", "billing", "procedures", "budgets", "payments", "expenses", "stock", "stockMoves", "waitlist", "outbox",
        "patientNotes", "fiscalDocs", "cashSessions", "sterilizationCycles", "teamMessages", "directMessages", "surveys", "surveyResponses",
        "mgmtTasks", "environmentalLogs", "eduVideos", "branches", "clinicalDocs", "routineChecks", "agendaBlocks"]
        .reduce((n, c) => n + (seed as unknown as Record<string, unknown[]>)[c].length, 0),
    );
  });
});

describe("armarDB", () => {
  it("devuelve una lista (vacía si no vino nada) por cada colección de la tienda, el onboarding por defecto y la suscripción", () => {
    const db = armarDB("cl1", { clinica: { id: "cl1", name: "Real", plan: "clinica", config: { currency: "PYG" } }, suscripcion: null, colecciones: {} });
    const listas = Object.keys(db).filter((k) => Array.isArray((db as unknown as Record<string, unknown>)[k]) && k !== "clinics");
    expect(listas.sort()).toEqual([...COLECCIONES_DE_LA_TIENDA].sort());
    expect(db.clinics).toEqual([{ id: "cl1", name: "Real", plan: "clinica", config: { currency: "PYG" } }]);
    expect(db.onboarding).toEqual({ usersCreated: false, servicesDefined: false, tourDone: false });
    expect(db.subscription).toBeNull();
  });
});

describe("cargarDB", () => {
  it("una clínica real que no existe rechaza con CLINICA_NO_ENCONTRADA y no escribe nada", async () => {
    const memoria = crearBackendEnMemoria();
    await expect(cargarDB(memoria, "cl_real")).rejects.toThrow("CLINICA_NO_ENCONTRADA");
    expect(memoria.ids("clinics")).toEqual([]);
  });

  it("la demo que no existe se siembra y se devuelve la semilla", async () => {
    const memoria = crearBackendEnMemoria();
    const db = await cargarDB(memoria, CLINICA_DEMO);
    const seed = buildSeed();
    expect(db.users.length).toBe(seed.users.length);
    expect(memoria.ids("clinics/cl_demo/users").length).toBe(seed.users.length);
    expect(memoria.ids("clinics/cl_demo/procedures").sort()).toEqual(seed.procedures.map((p) => p.cpt).sort());
    expect(memoria.leer("clinics/cl_demo")).toMatchObject({ id: "cl_demo", onboarding: seed.onboarding });
  });

  it("una clínica real se arma con lo que hay: sin tocar nada ni sembrar nada, con su suscripción", async () => {
    const memoria = crearBackendEnMemoria(async () => "admin1");
    memoria.sembrar("clinics/cl_real", { id: "cl_real", name: "Real", plan: "clinica", config: { currency: "PYG" } });
    memoria.sembrar("clinics/cl_real/users/admin1", { id: "admin1", role: "admin", active: true });
    memoria.sembrar("clinics/cl_real/patients/p1", { id: "p1" });
    memoria.sembrar("clinics/cl_real/directMessages/m1", { id: "m1", participants: ["x", "y"] });
    memoria.sembrar("subscriptions/cl_real", { plan: "clinica", status: "active" });
    const antes = memoria.ids("clinics/cl_real/budgets");
    const db = await cargarDB(memoria, "cl_real");
    expect(db.clinics[0]).toMatchObject({ id: "cl_real", name: "Real" });
    expect(db.patients).toEqual([{ id: "p1" }]);
    expect(db.directMessages.map((d) => d.id)).toEqual(["m1"]); // es admin: los ve todos
    expect(db.subscription).toEqual({ plan: "clinica", status: "active" });
    expect(db.budgets).toEqual([]);
    expect(memoria.ids("clinics/cl_real/budgets")).toEqual(antes); // las mejoras de la demo no tocan a una clínica real
    expect(memoria.ids("clinics/cl_real/outbox")).toEqual([]);
  });

  it("un no-admin recibe solo sus directos", async () => {
    const memoria = crearBackendEnMemoria(async () => "dent1");
    memoria.sembrar("clinics/cl_real", { id: "cl_real", name: "Real", plan: "clinica", config: {} });
    memoria.sembrar("clinics/cl_real/users/dent1", { id: "dent1", role: "dentist", active: true });
    memoria.sembrar("clinics/cl_real/directMessages/m1", { id: "m1", participants: ["dent1", "admin1"] });
    memoria.sembrar("clinics/cl_real/directMessages/m2", { id: "m2", participants: ["admin1", "x"] });
    expect((await cargarDB(memoria, "cl_real")).directMessages.map((d) => d.id)).toEqual(["m1"]);
  });

  it("la demo a la que le faltan los módulos nuevos (presupuestos, inventario, Botika) los recibe una sola vez", async () => {
    const memoria = crearBackendEnMemoria();
    memoria.sembrar("clinics/cl_demo", { id: "cl_demo", name: "Demo", plan: "clinica", config: {} });
    const seed = buildSeed();
    const db = await cargarDB(memoria, CLINICA_DEMO);
    expect(db.budgets.length).toBe(seed.budgets.length);
    expect(db.stock.length).toBe(seed.stock.length);
    expect(db.outbox.length).toBe(seed.outbox.length);
    expect(memoria.ids("clinics/cl_demo/budgets").length).toBe(seed.budgets.length);
    expect(memoria.ids("clinics/cl_demo/outbox").length).toBe(seed.outbox.length);
    expect(memoria.leer("clinics/cl_demo")?.config).toHaveProperty("botika");
    expect(db.clinics[0].config).toHaveProperty("botika");
    // La segunda vez no hay nada que agregar: lo que alguien cambió después de la primera carga sobrevive. Si las guardas «una sola vez» de la
    // puesta al día no anduvieran, la demo volvería a la semilla en cada carga y esto fallaría.
    const idPresupuesto = memoria.ids("clinics/cl_demo/budgets")[0];
    const idTarea = memoria.ids("clinics/cl_demo/outbox")[0];
    memoria.sembrar(`clinics/cl_demo/budgets/${idPresupuesto}`, { id: idPresupuesto, cambiadoPor: "visitante" });
    memoria.sembrar(`clinics/cl_demo/outbox/${idTarea}`, { id: idTarea, cambiadoPor: "visitante" });
    const otra = await cargarDB(memoria, CLINICA_DEMO);
    expect(otra.budgets.find((b) => b.id === idPresupuesto)).toMatchObject({ cambiadoPor: "visitante" });
    expect(otra.outbox.find((t) => t.id === idTarea)).toMatchObject({ cambiadoPor: "visitante" });
  });
});
