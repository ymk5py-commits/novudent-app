/** Corre el contrato de datos contra Firestore de verdad (el emulador). Requiere Java y el CLI de Firebase: `npm run test:backend`. */
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, type Firestore } from "firebase/firestore";
import { describeContratoDeDatos } from "./contrato-de-datos";
import { crearDatosFirestore } from "./firestore";

const REGLAS_ABIERTAS = "rules_version = '2'; service cloud.firestore { match /databases/{d}/documents { match /{document=**} { allow read, write: if true; } } }";

describeContratoDeDatos("Firestore (emulador)", async () => {
  const usuarioId = "u-sesion";
  const entorno = await initializeTestEnvironment({ projectId: "novudent-backend-contrato", firestore: { rules: REGLAS_ABIERTAS } });
  const db = entorno.unauthenticatedContext().firestore() as unknown as Firestore;
  return {
    backend: crearDatosFirestore(db, async () => usuarioId),
    usuarioId,
    sembrar: (ruta, data) => setDoc(doc(db, ruta), data),
    vaciar: () => entorno.clearFirestore(),
    cerrar: () => entorno.cleanup(),
  };
});
