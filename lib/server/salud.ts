/** La comprobación de `/api/health` contra la base, con un resultado que vale unos segundos: la ruta es pública y sin límite de uso, y cada comprobación es un pedido con la
 *  clave de servicio a Kong/PostgREST (que si la base está lenta retiene la conexión hasta el tiempo máximo). Un monitoreo cada 30 s no nota el retraso; un bucle de pedidos
 *  de un atacante deja de multiplicarse hacia la base. El resultado negativo también se recuerda: así una base caída no recibe un pedido por cada golpe. */
import { backendDelServidor } from "./backend";
import { datosSupabase } from "./datos-supabase";

const VIGENCIA_MS = 5_000;
let ultimo: { ok: boolean; hasta: number } | null = null;
let enCurso: Promise<boolean> | null = null;

/** `true` si la app puede hablar con su base. Con el backend por defecto (Firestore) no se consulta nada. */
export async function baseContesta(): Promise<boolean> {
  if (backendDelServidor() !== "supabase") return true;
  if (ultimo && Date.now() < ultimo.hasta) return ultimo.ok;
  // Una sola comprobación a la vez: los pedidos que llegan mientras tanto esperan la misma.
  enCurso ??= (async () => {
    try {
      await datosSupabase.ping?.();
      return true;
    } catch (e) {
      console.error("[health] la base no contesta:", e instanceof Error ? e.message : e);
      return false;
    }
  })()
    .then((ok) => { ultimo = { ok, hasta: Date.now() + VIGENCIA_MS }; return ok; })
    .finally(() => { enCurso = null; });
  return enCurso;
}

/** Solo para las pruebas. */
export function reiniciarCacheDeSalud(): void {
  ultimo = null;
  enCurso = null;
}
