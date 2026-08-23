/**
 * Autorización de las rutas /api/ia/* — membresía + suscripción + plan.
 *
 * `verifyIdToken` responde una sola pregunta: "¿este token es de una cuenta real
 * de nuestro proyecto Firebase?". No dice a qué clínica pertenece, si sigue
 * activa, ni qué plan pagó. Y como el proveedor Email/Password está abierto
 * (cualquiera se registra desde la pantalla de ingreso), esa cuenta real puede
 * ser la de un desconocido que se dio de alta hace treinta segundos.
 *
 * Con solo `verifyIdToken`, las ocho rutas de IA eran esto:
 *   - un cliente del plan Solo ($45) usando por curl toda la suite de IA que es
 *     justamente lo que justifica el plan Clínica ($129);
 *   - una clínica cancelada o vencida —que la app declara solo-lectura— seguía
 *     quemando `gemini-2.5-pro` con imágenes de 8 MB contra la key del dueño;
 *   - y cualquier registrado sin clínica, lo mismo.
 * En Blaze eso es factura real: el rate limit (20/min por uid) acota el ritmo,
 * no el derecho.
 *
 * Este helper cierra las tres puertas antes de gastar un token de Gemini.
 * Cuesta 3 lecturas de Firestore (~centavos de millón) contra una llamada a un
 * modelo de visión: la relación es abismalmente favorable.
 */
import { getDocument } from "./firestore-rest";
import { isSubscriptionActive, subscriptionPlanId } from "../subscription";
import { planHas, type PlanFeature } from "../plan";
import type { Subscription } from "../types";
import { AuthError } from "./auth";
import { isValidId } from "./ids";

export interface Autorizado {
  uid: string;
  clinicId: string;
  role: string;
}

/**
 * Exige que `uid` sea miembro activo de una clínica cuya suscripción esté
 * vigente y cuyo plan incluya `feature`. Lanza `AuthError` si no.
 *
 * 403 y no 402 en todos los casos: el detalle de por qué no alcanza (plan bajo,
 * vencido, usuario dado de baja) es información de negocio que no le debemos a
 * un llamador no autorizado. El mensaje sí distingue, para que un usuario
 * legítimo entienda qué le pasa.
 */
export async function requireFeature(uid: string, feature: PlanFeature): Promise<Autorizado> {
  if (!uid || !isValidId(uid)) throw new AuthError("Sesión inválida", 403);

  const dir = (await getDocument(`directory/${uid}`).catch(() => null)) as
    | { clinicId?: string } | null;
  const clinicId = dir?.clinicId;
  if (!clinicId || typeof clinicId !== "string" || !isValidId(clinicId)) {
    throw new AuthError("Tu cuenta no está asignada a ninguna clínica.", 403);
  }

  /* El directorio dice a qué clínica APUNTA la cuenta; el doc de usuario dice si
   * TODAVÍA pertenece. No es redundante: al dar de baja a un empleado se marca
   * `active:false` en el usuario y el directorio no se toca, así que sin esta
   * segunda lectura un despedido conservaría la IA de la clínica. */
  const user = (await getDocument(`clinics/${clinicId}/users/${uid}`).catch(() => null)) as
    | { active?: boolean; role?: string } | null;
  if (!user || user.active === false) {
    throw new AuthError("Tu usuario no está activo en la clínica.", 403);
  }

  const sub = (await getDocument(`subscriptions/${clinicId}`).catch(() => null)) as Subscription | null;
  if (!isSubscriptionActive(sub)) {
    throw new AuthError("La suscripción de la clínica no está vigente.", 403);
  }
  if (!planHas(subscriptionPlanId(sub), feature)) {
    throw new AuthError("Tu plan no incluye esta función.", 403);
  }

  return { uid, clinicId, role: String(user.role ?? "") };
}
