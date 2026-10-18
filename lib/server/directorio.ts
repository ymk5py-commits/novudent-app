/** A qué clínica y a qué documento de usuario corresponde un uid de LOGIN.
 *
 *  Firestore tenía `directory/{uid}` (uid → clinicId) y el documento de usuario se llamaba igual que el uid. En Supabase `directory` no existe:
 *  el uid de login (`User.authUid`) puede ser distinto del id del documento (los usuarios migrados conservan su id viejo), así que el servidor
 *  tiene que preguntar AMBAS cosas. Toda ruta que parte de un token verificado (`verifyIdToken().uid`) y necesita la ficha del usuario pasa por
 *  acá y usa `userId` —nunca el uid— para armar `clinics/{cid}/users/{userId}`. */
import { getDocument } from "./datos";

export interface EntradaDeDirectorio {
  clinicId: string;
  /** Id del documento `clinics/{clinicId}/users/{userId}`. En Firestore es el mismo uid. */
  userId: string;
  email?: string;
}

/** `null` si el uid no pertenece a ninguna clínica. Rechaza si no se pudo leer. */
export async function directorioDe(uid: string): Promise<EntradaDeDirectorio | null> {
  const d = await getDocument(`directory/${uid}`);
  if (!d || typeof d.clinicId !== "string" || d.clinicId === "") return null;
  return {
    clinicId: d.clinicId,
    userId: typeof d.userId === "string" && d.userId !== "" ? d.userId : uid,
    email: typeof d.email === "string" ? d.email : undefined,
  };
}
