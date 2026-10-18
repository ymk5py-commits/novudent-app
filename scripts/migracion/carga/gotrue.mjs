/** Cliente mínimo de la API de administración de GoTrue (el login de Supabase): listar y crear usuarios. Sin dependencias; `fetch` y la espera se
 *  inyectan para probarlo sin red. Nunca pone la clave, un correo ni el cuerpo de una respuesta en un mensaje de error. */

export class ErrorDeGoTrue extends Error {
  /** @param {string} mensaje @param {{ estado?: number, codigo?: string }} [datos] */
  constructor(mensaje, { estado, codigo } = {}) {
    super(mensaje);
    this.name = "ErrorDeGoTrue";
    this.estado = estado;
    /** El `error_code` de GoTrue (por ejemplo `email_exists`). */
    this.codigo = codigo;
  }
}

const REINTENTABLES = new Set([429, 500, 502, 503, 504]);
const POR_PAGINA = 200;

/**
 * @param {{ url: string, clave: string, fetch?: typeof fetch, esperar?: (ms: number) => Promise<void>, reintentos?: number }} opciones
 *   `url`: la base de GoTrue, con su prefijo (por ejemplo `https://api-novudent.novumholding.lat/auth/v1`). `clave`: la clave `service_role`.
 */
export function crearClienteGoTrue({ url, clave, fetch: pedir = fetch, esperar = (ms) => new Promise((r) => setTimeout(r, ms)), reintentos = 5 }) {
  let base;
  try {
    base = new URL(url);
  } catch {
    base = null;
  }
  if (!base || (base.protocol !== "http:" && base.protocol !== "https:")) throw new Error("La URL de GoTrue no es válida: tiene que empezar con http:// o https:// (por ejemplo http://127.0.0.1:8000/auth/v1).");
  if (!clave) throw new Error("Falta la clave de servicio (service_role) de GoTrue.");
  const raiz = url.replace(/\/+$/, "");
  const cabeceras = { apikey: clave, Authorization: `Bearer ${clave}`, "Content-Type": "application/json" };

  /** GET/POST con reintentos (límite de uso, errores del servidor y cortes de red) y espera creciente. Devuelve el JSON. */
  async function solicitar(metodo, ruta, cuerpo) {
    const que = `${metodo} ${ruta.split("?")[0]}`;
    for (let intento = 0; ; intento++) {
      let res;
      try {
        // `redirect: "error"`: la clave de servicio nunca sigue una redirección a otro servidor.
        res = await pedir(`${raiz}${ruta}`, { method: metodo, headers: cabeceras, redirect: "error", ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}) });
      } catch (e) {
        if (intento >= reintentos) throw new ErrorDeGoTrue(`sin conexión con GoTrue en ${que} (${e?.cause?.code ?? e?.name ?? "error"})`);
        await esperar(Math.min(8000, 500 * 2 ** intento));
        continue;
      }
      if (res.ok) return res.json().catch(() => ({}));
      if (REINTENTABLES.has(res.status) && intento < reintentos) {
        await esperar(Math.min(8000, 500 * 2 ** intento));
        continue;
      }
      const datos = await res.json().catch(() => ({}));
      const codigo = typeof datos?.error_code === "string" ? datos.error_code : undefined;
      throw new ErrorDeGoTrue(`GoTrue respondió ${res.status}${codigo ? ` (${codigo})` : ""} en ${que}`, { estado: res.status, codigo });
    }
  }

  return {
    /** GoTrue contesta y la clave sirve para la API de administración. */
    async comprobar() {
      await solicitar("GET", "/health");
      try {
        await solicitar("GET", "/admin/users?page=1&per_page=1");
      } catch (e) {
        if (e instanceof ErrorDeGoTrue && (e.estado === 401 || e.estado === 403)) throw new ErrorDeGoTrue("La clave de servicio (service_role) no sirve para la API de administración de GoTrue: ¿es la del proyecto correcto?", { estado: e.estado, codigo: e.codigo });
        throw e;
      }
    },

    /** Todas las cuentas de GoTrue. `creadaPorElCargador`: la creó este cargador (lleva `app_metadata.origen = firebase`).
     *  @returns {Promise<Array<{ id: string, email: string, esAnonimo: boolean, creadaPorElCargador: boolean }>>} */
    async listarUsuarios() {
      const todos = [];
      for (let pagina = 1; pagina < 10000; pagina++) {
        const datos = await solicitar("GET", `/admin/users?page=${pagina}&per_page=${POR_PAGINA}`);
        const usuarios = Array.isArray(datos?.users) ? datos.users : [];
        for (const u of usuarios) todos.push({ id: String(u.id), email: typeof u.email === "string" ? u.email : "", esAnonimo: Boolean(u.is_anonymous), creadaPorElCargador: u.app_metadata?.origen === "firebase" });
        if (usuarios.length < POR_PAGINA) break;
      }
      return todos;
    },

    /** Crea la cuenta sin contraseña y con el correo ya confirmado: la persona elige una por correo («olvidé mi contraseña»). El uid viejo de Firebase
     *  queda en `app_metadata.firebase_uid` como rastro. @returns {Promise<{ id: string, email: string }>} */
    async crearUsuario({ email, nombre, firebaseUid }) {
      const datos = await solicitar("POST", "/admin/users", {
        email,
        email_confirm: true,
        user_metadata: { name: nombre },
        app_metadata: { origen: "firebase", firebase_uid: firebaseUid },
      });
      if (typeof datos?.id !== "string") throw new ErrorDeGoTrue("GoTrue no devolvió el id de la cuenta creada");
      return { id: datos.id, email: typeof datos.email === "string" ? datos.email : email };
    },
  };
}
