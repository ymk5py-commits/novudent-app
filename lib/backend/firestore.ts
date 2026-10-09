/** Implementación de la capa de datos sobre Firestore: lo que hacía `lib/store.tsx` con el SDK de Firebase (leer la clínica, `fsSave`,
 *  `fsDelete`, `fsCampo`, `fsMeta`, los `onSnapshot`) y `lib/firebase.ts` (la sesión), detrás de las interfaces de `tipos.ts`.
 *
 *  Es el ÚNICO archivo, junto con `lib/firebase.ts`, que puede importar `firebase/*` (lo vigila `aislamiento.test.ts`). */
import {
  collection, deleteDoc, deleteField, doc, getDoc, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc, where, writeBatch,
  type Firestore, type Query,
} from "firebase/firestore";
import { app, currentAuthUid, currentIdToken, fsdb, sendPasswordReset, signInAnonymousIfNeeded, signInEmail, signOutUser } from "../firebase";
import { COLECCIONES_DE_LA_TIENDA } from "./colecciones";
import { limpiar } from "./documentos";
import type { BackendDeDatos, DatosDeBackend, Doc, LecturaDeClinica, OpcionesDeLectura, SesionDeBackend } from "./tipos";

type Instantanea = { docs: { data: () => unknown }[] } | null;
const filas = (snap: Instantanea): Doc[] => (snap ? snap.docs.map((d) => d.data() as Doc) : []);

/** Los datos sobre una instancia de Firestore cualquiera (en las pruebas, la del emulador). `usuarioActual` es el id del usuario con sesión. */
export function crearDatosFirestore(db: Firestore, usuarioActual: () => Promise<string | null>): DatosDeBackend {
  const docDe = (cid: string, col: string, id: string) => doc(db, "clinics", cid, col, id);

  /* Una colección que el ROL no tiene permiso de leer devuelve vacío, no rompe.
   *
   * Esto no es defensa preventiva: sin el catch, Novudent queda INUTILIZABLE para dentistas y asistentes en cuanto se despliegan las reglas
   * de RBAC. Las colecciones se piden en un solo `Promise.all`, que rechaza al primer error; `expenses` y `settlements` son admin-only por
   * regla, así que el permission-denied de un dentista tumbaba el arranque ENTERO y lo mandaba a "modo local". O sea: la clínica compra el
   * sistema y solo el dueño puede entrar.
   *
   * Devolver vacío es lo correcto, no un parche: que una asistente no vea los gastos ES la regla de negocio. La interfaz ya esconde esas
   * pantallas por `can(role, …)`, así que una lista vacía es exactamente lo que corresponde. */
  const leer = async (ref: Query) => {
    try {
      return await getDocs(ref);
    } catch (e) {
      if ((e as { code?: string })?.code === "permission-denied") return null;
      throw e; // red caída, cuota, config rota: eso sí tiene que explotar
    }
  };

  return {
    tipo: "firestore",

    async leerClinica(cid: string, opciones: OpcionesDeLectura): Promise<LecturaDeClinica | null> {
      const clinicaSnap = await getDoc(doc(db, "clinics", cid));
      if (!clinicaSnap.exists()) return null;
      /* Suscripción SaaS: colección RAÍZ, solo-lectura para el cliente (la escribe el webhook con el usuario de servicio). Si no existe, la
       * clínica es anterior al cobro → grandfathered (ver lib/subscription.ts). */
      const subSnap = await getDoc(doc(db, "subscriptions", cid)).catch(() => null);
      const col = (nombre: string) => leer(collection(db, "clinics", cid, nombre));
      const usuariosP = col("users");
      /* Mensajes directos: la ÚNICA colección de la clínica que un miembro no lee entera (ver `filtroDeDirectos` en carga.ts). El filtro
       * necesita el padrón de usuarios, por eso espera `usuariosP`; en paralelo con el resto de las lecturas. */
      const directosP = (async () => {
        const ref = collection(db, "clinics", cid, "directMessages");
        const filtro = opciones.directos(filas(await usuariosP), await usuarioActual());
        if (filtro === "ninguno") return null;
        return leer(filtro === "todos" ? ref : query(ref, where("participants", "array-contains", filtro.participante)));
      })();
      const otras = COLECCIONES_DE_LA_TIENDA.filter((n) => n !== "users" && n !== "directMessages");
      const [usuarios, directos, ...resto] = await Promise.all([usuariosP, directosP, ...otras.map(col)]);
      const colecciones: Record<string, Doc[]> = { users: filas(usuarios), directMessages: filas(directos) };
      otras.forEach((nombre, i) => { colecciones[nombre] = filas(resto[i]); });
      return { clinica: clinicaSnap.data() as Doc, suscripcion: subSnap?.exists() ? (subSnap.data() as Doc) : null, colecciones };
    },

    async clinicaDelUsuario(uid: string) {
      const snap = await getDoc(doc(db, "directory", uid));
      const clinicId = snap.exists() ? (snap.data() as { clinicId?: unknown }).clinicId : null;
      return typeof clinicId === "string" ? clinicId : null;
    },

    guardar: (cid, col, id, data) => setDoc(docDe(cid, col, id), limpiar(data as Doc)),
    quitar: (cid, col, id) => deleteDoc(docDe(cid, col, id)),
    // `updateDoc` lee `"a.b"` como una ruta anidada y la interfaz solo conoce campos de primer nivel: un nombre con punto (o vacío) se rechaza.
    // `limpiar` pasa el valor por JSON (saca los `undefined`) y rompería el marcador de `deleteField()`: por eso se lo aplica solo al valor.
    // `null` se guarda como `null`; solo `undefined` borra el campo.
    fijarCampo: async (cid, col, id, campo, valor) => {
      if (campo === "" || campo.includes(".")) throw new Error(`Nombre de campo no válido: ${JSON.stringify(campo)} (no puede estar vacío ni llevar puntos)`);
      return updateDoc(docDe(cid, col, id), { [campo]: valor === undefined ? deleteField() : limpiar(valor) });
    },
    mezclarClinica: (cid, data) => setDoc(doc(db, "clinics", cid), limpiar(data as Doc), { merge: true }),
    async lote(cid, ops) {
      const lote = writeBatch(db);
      for (const op of ops) {
        if (op.tipo === "guardar") lote.set(docDe(cid, op.col, op.id), limpiar(op.data as Doc));
        else if (op.tipo === "guardarClinica") lote.set(doc(db, "clinics", cid), limpiar(op.data as Doc));
        else lote.set(doc(db, "clinics", cid), limpiar(op.data as Doc), { merge: true });
      }
      await lote.commit();
    },

    escucharSuscripcion: (cid, alCambiar, alFallar) =>
      onSnapshot(doc(db, "subscriptions", cid), (snap) => alCambiar(snap.exists() ? (snap.data() as Doc) : null), alFallar),
    escucharClinica: (cid, alCambiar, alFallar) =>
      onSnapshot(doc(db, "clinics", cid), (snap) => alCambiar(snap.exists() ? (snap.data() as Doc) : null), alFallar),
    escucharColeccion: (cid, col, alCambiar, opciones, alFallar) => {
      const ref = collection(db, "clinics", cid, col);
      const restricciones = [
        ...(opciones?.participante ? [where("participants", "array-contains", opciones.participante)] : []),
        ...(opciones?.ordenarPor ? [orderBy(opciones.ordenarPor, "asc")] : []),
      ];
      return onSnapshot(restricciones.length ? query(ref, ...restricciones) : ref, (snap) => alCambiar(snap.docs.map((d) => d.data() as Doc)), alFallar);
    },
  };
}

/** La sesión sobre Firebase Auth (las funciones viven en `lib/firebase.ts`, con la explicación de cada decisión). */
export const sesionFirebase: SesionDeBackend = {
  /** Espera a que Firebase Auth termine de restaurar la sesión guardada.
   *
   *  ⚠️ NO HAY QUE REPONER UN `signInAnonymously` ACÁ. Existía porque las reglas desplegadas eran las de por defecto de Firebase y hacía falta
   *  CUALQUIER sesión para leer algo; con las reglas reales (`isDemo(cid)` no pide sesión) ya no aplica, y hacía daño: la restauración es
   *  asíncrona, así que en una carga fría `auth.currentUser` es `null` aunque haya sesión válida y la anónima le PISABA la sesión real (el
   *  «entro y no guarda nada»), además de dejar una cuenta anónima por visita (213 de 216 usuarios del proyecto). Lo que sí hace falta es
   *  ESPERAR a que la restauración termine antes de consultar. */
  async esperarSesion() {
    try {
      const { getAuth } = await import("firebase/auth");
      await getAuth(app).authStateReady();
    } catch (e) {
      console.warn("No se pudo esperar el estado de sesión:", e);
    }
  },
  iniciarSesion: signInEmail,
  iniciarSesionDeDemo: signInAnonymousIfNeeded,
  cerrarSesion: signOutUser,
  usuarioActual: currentAuthUid,
  token: currentIdToken,
  enviarRecuperacion: sendPasswordReset,
};

/** El backend de la app cuando `NEXT_PUBLIC_BACKEND` es `firestore` (el valor por defecto). */
export const backendFirestore: BackendDeDatos = { ...crearDatosFirestore(fsdb, currentAuthUid), ...sesionFirebase };
