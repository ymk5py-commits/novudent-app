/** Los usuarios reales de la exportación → cuentas de GoTrue, y el cambio de `data.authUid` en su documento.
 *
 *  Un usuario es REAL si su documento tiene `authUid` y un correo: los de la demo (`cl_demo`) traen correo pero no `authUid` (no tienen cuenta, se
 *  eligen en la pantalla de la demo) y las cuentas anónimas de Firebase no tienen documento de usuario. A cada usuario real se le crea una cuenta
 *  en GoTrue (sin contraseña) y su documento conserva TODO —también el `id`, así que ninguna referencia (`dentistId`, `participants`…) se toca—
 *  salvo `authUid`, que pasa a ser el uuid nuevo. Es idempotente: la cuenta se busca por correo antes de crearla. */
import { ErrorDeGoTrue } from "./gotrue.mjs";

/** Lo que se escribe en `authUid` mientras la cuenta no existe (simulacro): nunca se deja el uid viejo de Firebase, que apunta a nada. */
export const PENDIENTE = "(cuenta por crear en GoTrue)";

/** GoTrue guarda los correos en minúsculas y no admite dos cuentas que difieran solo en eso. */
export const claveDeEmail = (email) => String(email).trim().toLowerCase();

const tieneCorreo = (email) => typeof email === "string" && /^[^\s@]+@[^\s@]+$/.test(email.trim());

/** @param {Record<string, any>} data */
export function esUsuarioReal(data) {
  return typeof data?.authUid === "string" && data.authUid !== "" && tieneCorreo(data.email);
}

/** @param {Array<{ clinica: string, id: string, data: Record<string, any> }>} documentos  los documentos de las colecciones `users` de todas las clínicas */
export function recolectarUsuarios(documentos) {
  const reales = [];
  const sinCorreo = [];
  let deLaDemo = 0;
  for (const { clinica, id, data } of documentos) {
    if (esUsuarioReal(data)) {
      reales.push({ clinica, id, email: claveDeEmail(data.email), nombre: typeof data.name === "string" ? data.name : "", firebaseUid: data.authUid });
    } else if (typeof data?.authUid === "string" && data.authUid !== "") {
      sinCorreo.push({ clinica, id }); // tiene cuenta en Firebase pero el documento no trae un correo usable: no hay con qué crearla
    } else {
      deLaDemo++;
    }
  }
  return { reales, sinCorreo, deLaDemo };
}

/** El documento de usuario con `authUid` cambiado por el uuid de GoTrue. No muta el original. Los que no son reales vuelven tal cual.
 *  @param {Record<string, any>} data @param {Map<string, string>} uuidPorEmail */
export function reescribirUsuario(data, uuidPorEmail) {
  if (!esUsuarioReal(data)) return data;
  return { ...data, authUid: uuidPorEmail.get(claveDeEmail(data.email)) ?? PENDIENTE };
}

/**
 * Deja una cuenta de GoTrue por cada correo. Con `crear: false` (simulacro) no escribe nada: cuenta lo que se crearía.
 *
 * @param {{
 *   reales: Array<{ clinica: string, id: string, email: string, nombre: string, firebaseUid: string }>,
 *   gotrue: { listarUsuarios(): Promise<Array<{ id: string, email: string, esAnonimo: boolean }>>, crearUsuario(u: { email: string, nombre: string, firebaseUid: string }): Promise<{ id: string }> } | null,
 *   crear: boolean,
 *   alAvanzar?: (mensaje: string) => void,
 * }} opciones
 */
export async function asegurarUsuarios({ reales, gotrue, crear, alAvanzar = () => {} }) {
  /** @type {Map<string, string>} */
  const uuidPorEmail = new Map();
  const resultado = { uuidPorEmail, creados: 0, existentes: 0, porCrear: 0, repetidos: [], consultado: gotrue !== null };

  const porCorreo = new Map();
  for (const u of reales) {
    if (porCorreo.has(u.email)) resultado.repetidos.push(u.email);
    else porCorreo.set(u.email, u);
  }
  resultado.repetidos = [...new Set(resultado.repetidos)];

  const enGoTrue = new Map();
  const leer = async () => {
    enGoTrue.clear();
    for (const u of await gotrue.listarUsuarios()) if (!u.esAnonimo && u.email) enGoTrue.set(claveDeEmail(u.email), u.id);
  };
  if (gotrue) await leer();

  for (const u of porCorreo.values()) {
    const previo = enGoTrue.get(u.email);
    if (previo) {
      uuidPorEmail.set(u.email, previo);
      resultado.existentes++;
      continue;
    }
    if (!crear || !gotrue) {
      resultado.porCrear++;
      continue;
    }
    try {
      const { id } = await gotrue.crearUsuario({ email: u.email, nombre: u.nombre, firebaseUid: u.firebaseUid });
      uuidPorEmail.set(u.email, id);
      resultado.creados++;
      alAvanzar(`cuenta creada para el usuario ${u.id} de ${u.clinica}`);
    } catch (e) {
      // Alguien la creó entre medio (o un reintento después de un corte de red): se la busca en vez de fallar.
      if (!(e instanceof ErrorDeGoTrue) || e.codigo !== "email_exists") throw e;
      await leer();
      const id = enGoTrue.get(u.email);
      if (!id) throw e;
      uuidPorEmail.set(u.email, id);
      resultado.existentes++;
    }
  }
  return resultado;
}
