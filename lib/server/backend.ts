/** Qué base usa ESTE servidor. Es la misma variable que elige el backend del navegador (`NEXT_PUBLIC_BACKEND`, se fija al compilar): así
 *  la app entera —pantallas y rutas `/api`— habla con una sola base. Por defecto `firestore`. */
export type NombreDeBackend = "firestore" | "supabase";

export function backendDelServidor(): NombreDeBackend {
  const n = (process.env.NEXT_PUBLIC_BACKEND ?? "").trim().toLowerCase();
  if (n === "" || n === "firestore") return "firestore";
  if (n === "supabase") return "supabase";
  throw new Error(`NEXT_PUBLIC_BACKEND desconocido: «${process.env.NEXT_PUBLIC_BACKEND}». Valores válidos: firestore, supabase.`);
}
