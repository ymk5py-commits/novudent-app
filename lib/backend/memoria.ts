/** Backend en memoria: la misma interfaz que Firestore, sin red. Sirve para probar la lógica que usa la capa de datos (carga de la clínica,
 *  semilla de la demo…) y es la implementación de referencia del contrato (`contrato-de-datos.ts`). No se usa en la app. */
import { COLECCIONES_DE_LA_TIENDA } from "./colecciones";
import { limpiar, mezclarProfundo } from "./documentos";
import type {
  DatosDeBackend, Desuscribir, Doc, FiltroDeDirectos, LecturaDeClinica, OperacionDeLote, OpcionesDeEscucha, OpcionesDeLectura,
} from "./tipos";

export interface BackendEnMemoria extends DatosDeBackend {
  /** Escribe un documento en cualquier ruta (`clinics/cl1/patients/p1`) sin pasar por ninguna regla: para armar el escenario de una prueba. */
  sembrar(ruta: string, data: Doc): void;
  /** Lee un documento de cualquier ruta; `undefined` si no existe. */
  leer(ruta: string): Doc | undefined;
  /** Los ids de los documentos de una colección (`clinics/cl1/patients`), ordenados. */
  ids(rutaDeColeccion: string): string[];
  vaciar(): void;
}

const noEncontrado = (ruta: string) => Object.assign(new Error(`No existe el documento ${ruta}`), { code: "not-found" });

function filtrarDirectos(lista: Doc[], filtro: FiltroDeDirectos): Doc[] {
  if (filtro === "todos") return lista;
  if (filtro === "ninguno") return [];
  return lista.filter((d) => Array.isArray(d.participants) && d.participants.includes(filtro.participante));
}

export function crearBackendEnMemoria(usuarioActual: () => Promise<string | null> = async () => null): BackendEnMemoria {
  const docs = new Map<string, Doc>();
  const oyentes = new Set<() => void>();
  const avisar = () => queueMicrotask(() => { for (const o of [...oyentes]) o(); });

  const copia = (d: Doc | undefined): Doc | null => (d ? limpiar(d) : null);
  const ids = (coleccion: string) =>
    [...docs.keys()].filter((r) => r.startsWith(`${coleccion}/`) && !r.slice(coleccion.length + 1).includes("/")).map((r) => r.slice(coleccion.length + 1)).sort();
  const listar = (coleccion: string): Doc[] => ids(coleccion).map((id) => limpiar(docs.get(`${coleccion}/${id}`)!));
  const rutaDe = (cid: string, col: string, id: string) => `clinics/${cid}/${col}/${id}`;

  function consultar(cid: string, col: string, opciones?: OpcionesDeEscucha): Doc[] {
    let lista = listar(`clinics/${cid}/${col}`);
    if (opciones?.participante) lista = filtrarDirectos(lista, { participante: opciones.participante });
    const campo = opciones?.ordenarPor;
    // Como `orderBy` de Firestore: los documentos que no tienen el campo no aparecen.
    if (campo) lista = lista.filter((d) => d[campo] !== undefined).sort((a, b) => String(a[campo]).localeCompare(String(b[campo])));
    return lista;
  }

  function escuchar<T>(leer: () => T, alCambiar: (valor: T) => void): Desuscribir {
    let ultimo: string | undefined;
    let activo = true;
    const revisar = () => {
      if (!activo) return;
      const valor = leer();
      const huella = JSON.stringify(valor);
      if (huella === ultimo) return;
      ultimo = huella;
      alCambiar(valor);
    };
    oyentes.add(revisar);
    queueMicrotask(revisar); // el estado inicial llega después, de forma asíncrona, como en Firestore
    return () => { activo = false; oyentes.delete(revisar); };
  }

  const aplicar = (cid: string, op: OperacionDeLote) => {
    if (op.tipo === "guardar") docs.set(rutaDe(cid, op.col, op.id), limpiar(op.data as Doc));
    else if (op.tipo === "guardarClinica") docs.set(`clinics/${cid}`, limpiar(op.data as Doc));
    else docs.set(`clinics/${cid}`, mezclarProfundo(docs.get(`clinics/${cid}`) ?? {}, limpiar(op.data as Doc)));
  };

  return {
    tipo: "memoria",

    async leerClinica(cid: string, opciones: OpcionesDeLectura): Promise<LecturaDeClinica | null> {
      const clinica = copia(docs.get(`clinics/${cid}`));
      if (!clinica) return null;
      const lista = (col: string) => listar(`clinics/${cid}/${col}`);
      const filtro = opciones.directos(lista("users"), await usuarioActual());
      const colecciones: Record<string, Doc[]> = {};
      for (const col of COLECCIONES_DE_LA_TIENDA) colecciones[col] = col === "directMessages" ? filtrarDirectos(lista(col), filtro) : lista(col);
      return { clinica, suscripcion: copia(docs.get(`subscriptions/${cid}`)), colecciones };
    },

    async clinicaDelUsuario(uid: string) {
      const clinicId = docs.get(`directory/${uid}`)?.clinicId;
      return typeof clinicId === "string" ? clinicId : null;
    },

    async guardar(cid, col, id, data) {
      docs.set(rutaDe(cid, col, id), limpiar(data as Doc));
      avisar();
    },
    async quitar(cid, col, id) {
      docs.delete(rutaDe(cid, col, id));
      avisar();
    },
    async fijarCampo(cid, col, id, campo, valor) {
      const ruta = rutaDe(cid, col, id);
      const actual = docs.get(ruta);
      if (!actual) throw noEncontrado(ruta);
      const nuevo: Doc = { ...actual };
      if (valor === undefined) delete nuevo[campo];
      else nuevo[campo] = limpiar(valor);
      docs.set(ruta, nuevo);
      avisar();
    },
    async mezclarClinica(cid, data) {
      aplicar(cid, { tipo: "mezclarClinica", data });
      avisar();
    },
    async lote(cid, ops) {
      for (const op of ops) aplicar(cid, op);
      avisar();
    },

    escucharSuscripcion: (cid, alCambiar) => escuchar(() => copia(docs.get(`subscriptions/${cid}`)), alCambiar),
    escucharClinica: (cid, alCambiar) => escuchar(() => copia(docs.get(`clinics/${cid}`)), alCambiar),
    escucharColeccion: (cid, col, alCambiar, opciones) => escuchar(() => consultar(cid, col, opciones), alCambiar),

    sembrar(ruta, data) { docs.set(ruta, limpiar(data)); avisar(); },
    leer: (ruta) => copia(docs.get(ruta)) ?? undefined,
    ids,
    vaciar() { docs.clear(); avisar(); },
  };
}
