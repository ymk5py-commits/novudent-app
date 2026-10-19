/** `DatosDeServidor` sobre Firestore REST: las 8 operaciones de `firestore-rest.ts` tal cual (las rutas de hoy, con el usuario de servicio). */
import type { DatosDeServidor } from "./datos";
import * as rest from "./firestore-rest";

export const datosFirestore: DatosDeServidor = {
  tipo: "firestore",
  estaConfigurado: rest.isServerFirestoreConfigured,
  getDocument: rest.getDocument,
  listCollection: rest.listCollection,
  queryWhere: rest.queryWhere,
  queryRange: rest.queryRange,
  queryIn: rest.queryIn,
  setDocument: rest.setDocument,
  patchFields: rest.patchFields,
  createIfAbsent: rest.createIfAbsent,
};
