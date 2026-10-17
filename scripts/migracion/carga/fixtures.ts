/** Exportaciones SINTÉTICAS para las pruebas del cargador: se arman con el MISMO exportador de verdad (`exportarFirestore`) a partir de documentos
 *  inventados en el formato de la API REST de Firestore, así el cargador se prueba contra los archivos y el manifiesto que él mismo va a recibir.
 *  Jamás datos reales de pacientes. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearEscritorDeArchivos, exportarFirestore } from "../exportar.mjs";
import { ErrorDeGoTrue } from "./gotrue.mjs";

/** El manifiesto de colecciones de la app (lo que lee el exportador de `lib/backend/colecciones.json`). */
export const COLECCIONES = {
  porClinica: ["users", "patients", "appointments", "directMessages", "slotLocks"],
  raiz: ["clinics", "directory", "subscriptions", "webhookEvents", "leads", "checkoutTokens"],
  noSeMigra: ["serviceAccounts"],
  soloServidor: ["slotLocks"],
};

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** JSON → valores de la API REST de Firestore (`{ stringValue }`, `{ mapValue }`…). */
export function aValor(v: Json): Record<string, unknown> {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isSafeInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(aValor) } };
  return { mapValue: { fields: aCampos(v) } };
}
export function aCampos(o: { [k: string]: Json }): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, aValor(v)]));
}

/** `base["clinics/c1/patients"] = [{ id, data }]` → los documentos tal como los devuelve la API. */
export type BaseSintetica = Record<string, Array<{ id: string; data: { [k: string]: Json } | null }>>;

function clienteFalso(base: BaseSintetica, colecciones: Record<string, string[]>) {
  return {
    async *listarDocumentos(padre: string, coleccion: string) {
      const ruta = [padre, coleccion].filter(Boolean).join("/");
      for (const d of base[ruta] ?? []) {
        yield { name: `projects/p/databases/(default)/documents/${ruta}/${d.id}`, ...(d.data ? { createTime: "t", fields: aCampos(d.data) } : {}) };
      }
    },
    async listarColecciones(ruta = "") { return colecciones[ruta] ?? []; },
  };
}

/** Datos inventados: la demo, una clínica «real» con dos usuarios reales (con `authUid`) y uno de la demo sin `authUid`. */
export function baseSintetica(): BaseSintetica {
  return {
    clinics: [
      { id: "cl_demo", data: { name: "Demo", plan: "clinica" } },
      { id: "c1", data: { name: "Clínica Uno", plan: "solo", config: { permisos: { assistant: { dar: [], quitar: ["x"] } } } } },
    ],
    subscriptions: [{ id: "c1", data: { clinicId: "c1", plan: "solo", status: "trialing", currentPeriodEndMs: 1790000000000 } }],
    leads: [{ id: "l1", data: { email: "lead@example.com", clinica: "Algo" } }],
    directory: [
      { id: "fbUidAna", data: { clinicId: "c1", email: "ana@example.com" } },
      { id: "fbUidLuis", data: { clinicId: "c1", email: "luis@example.com" } },
    ],
    "clinics/cl_demo/users": [{ id: "u1", data: { id: "u1", name: "Carlos Admin", email: "admin@novudent.app", role: "admin", active: true } }],
    "clinics/cl_demo/patients": [{ id: "p1", data: { nombre: "Paciente Demo", edad: 40, notas: ["a", "b"] } }],
    "clinics/c1/users": [
      { id: "fbUidAna", data: { id: "fbUidAna", authUid: "fbUidAna", clinicId: "c1", name: "Ana", email: "Ana@Example.com", role: "admin", active: true, mustChangePassword: true } },
      { id: "u2", data: { id: "u2", authUid: "fbUidLuis", clinicId: "c1", name: "Luis", email: "luis@example.com", role: "dentist", active: true } },
    ],
    "clinics/c1/patients": [
      { id: "p1", data: { nombre: "Persona Sintética Uno", tags: ["x"], deuda: 1500000, ratio: 0.5, anidado: { b: 2, a: { z: null, y: [1, { k: "v" }] } }, vacio: "", texto: "Ñandú — “comillas” \\ barra \n salto" } },
      { id: "p 2 ñ%.1", data: { nombre: "Persona Sintética Dos" } },
    ],
    "clinics/c1/appointments": [{ id: "a1", data: { patientId: "p1", dentistId: "u2", start: "2026-11-02T13:00:00.000Z", status: "scheduled" } }],
  };
}

export const COLECCIONES_POR_RUTA: Record<string, string[]> = {
  "": ["clinics", "directory", "subscriptions", "leads", "serviceAccounts"],
  "clinics/cl_demo": ["users", "patients"],
  "clinics/c1": ["users", "patients", "appointments"],
};

const carpetas: string[] = [];
/** Una carpeta temporal (fuera del repositorio) que `limpiarCarpetas()` borra. */
export function carpetaTemporal(prefijo = "carga-"): string {
  const d = mkdtempSync(join(tmpdir(), prefijo));
  carpetas.push(d);
  return d;
}
export function limpiarCarpetas() {
  while (carpetas.length) rmSync(carpetas.pop()!, { recursive: true, force: true });
}

/** Escribe una exportación completa en `carpeta` (JSONL + manifiesto.json, como el comando) y devuelve el manifiesto. */
export async function escribirExportacion(carpeta: string, { base = baseSintetica(), colecciones = COLECCIONES_POR_RUTA, extra = {} as Record<string, unknown> } = {}) {
  mkdirSync(carpeta, { recursive: true });
  const manifiesto = await exportarFirestore({
    cliente: clienteFalso(base, colecciones),
    colecciones: COLECCIONES,
    escritor: crearEscritorDeArchivos(carpeta),
  });
  const completo = { proyecto: "sintetico", credencial: "prueba", soloMedir: false, ...manifiesto, ...extra };
  writeFileSync(join(carpeta, "manifiesto.json"), `${JSON.stringify(completo, null, 2)}\n`);
  return completo as typeof manifiesto & Record<string, unknown>;
}

/** Un GoTrue falso con memoria (la API de `gotrue.mjs`): cada cuenta nueva recibe `uuid-1`, `uuid-2`… */
export function gotrueFalso(inicial: Array<{ id: string; email: string; esAnonimo?: boolean }> = [], { falla = {} as Record<string, Error> } = {}) {
  const usuarios = inicial.map((u) => ({ esAnonimo: false, ...u }));
  const creados: Array<{ email: string; nombre: string; firebaseUid: string }> = [];
  let n = 0;
  return {
    usuarios, creados,
    async listarUsuarios() { return usuarios.map((u) => ({ ...u })); },
    async crearUsuario({ email, nombre, firebaseUid }: { email: string; nombre: string; firebaseUid: string }) {
      if (falla[email]) throw falla[email];
      if (usuarios.some((u) => u.email === email)) throw new ErrorDeGoTrue("ya existe", { estado: 422, codigo: "email_exists" });
      const id = `uuid-${++n}`;
      usuarios.push({ id, email, esAnonimo: false });
      creados.push({ email, nombre, firebaseUid });
      return { id, email };
    },
  };
}
