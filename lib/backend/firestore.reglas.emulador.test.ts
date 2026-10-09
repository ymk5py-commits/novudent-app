/** La lectura de la clínica con las reglas REALES de firestore.rules: lo que cada rol recibe de verdad. Requiere el emulador: `npm run test:backend`. */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, type Firestore } from "firebase/firestore";
import { filtroDeDirectos } from "./carga";
import { crearDatosFirestore } from "./firestore";

const CID = "clA";
let entorno: RulesTestEnvironment;

const como = (uid: string) => {
  const db = entorno.authenticatedContext(uid).firestore() as unknown as Firestore;
  return crearDatosFirestore(db, async () => uid);
};
const politica = { directos: (usuarios: Parameters<typeof filtroDeDirectos>[1], id: string | null) => filtroDeDirectos(CID, usuarios, id) };

beforeAll(async () => {
  entorno = await initializeTestEnvironment({ projectId: "novudent-backend-reglas", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, `clinics/${CID}`), { id: CID, name: "A", plan: "clinica", config: {} });
    await setDoc(doc(db, `clinics/${CID}/users/adminA`), { id: "adminA", role: "admin", active: true, clinicId: CID });
    await setDoc(doc(db, `clinics/${CID}/users/dentA`), { id: "dentA", role: "dentist", active: true, clinicId: CID });
    await setDoc(doc(db, `clinics/${CID}/patients/p1`), { id: "p1", firstName: "Ana" });
    await setDoc(doc(db, `clinics/${CID}/expenses/e1`), { id: "e1", amount: 100 });
    await setDoc(doc(db, `clinics/${CID}/directMessages/m1`), { id: "m1", participants: ["dentA", "adminA"] });
    await setDoc(doc(db, `clinics/${CID}/directMessages/m2`), { id: "m2", participants: ["adminA", "otro"] });
  });
}, 60_000);
afterAll(async () => { await entorno.cleanup(); });

describe("leerClinica con las reglas reales", () => {
  it("el administrador recibe todo: gastos y todos los directos", async () => {
    const l = (await como("adminA").leerClinica(CID, politica))!;
    expect(l.colecciones.patients.map((d) => d.id)).toEqual(["p1"]);
    expect(l.colecciones.expenses.map((d) => d.id)).toEqual(["e1"]);
    expect(l.colecciones.directMessages.map((d) => d.id).sort()).toEqual(["m1", "m2"]);
  });

  it("un dentista recibe lo suyo: sin gastos (permission-denied → vacío, no rompe) y solo sus directos", async () => {
    const l = (await como("dentA").leerClinica(CID, politica))!;
    expect(l.colecciones.patients.map((d) => d.id)).toEqual(["p1"]);
    expect(l.colecciones.expenses).toEqual([]);
    expect(l.colecciones.directMessages.map((d) => d.id)).toEqual(["m1"]);
  });

  it("pedir todos los directos siendo dentista no rompe la carga: llega vacío (por eso el filtro se arma por rol)", async () => {
    const l = (await como("dentA").leerClinica(CID, { directos: () => "todos" }))!;
    expect(l.colecciones.directMessages).toEqual([]);
    expect(l.colecciones.patients.map((d) => d.id)).toEqual(["p1"]);
  });

  it("alguien que no es de la clínica no lee nada de ella", async () => {
    await expect(como("intruso").leerClinica(CID, politica)).rejects.toMatchObject({ code: "permission-denied" });
  });
});
