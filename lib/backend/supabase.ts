/** Implementación de la capa de datos sobre Supabase (Postgres + PostgREST + Realtime + GoTrue), detrás de las interfaces de `tipos.ts`.
 *
 *  Es el ÚNICO archivo que puede importar `@supabase/*` (lo vigila `aislamiento.test.ts`). El navegador habla directo con la base: lo que
 *  decide qué ve y qué escribe cada persona es RLS (supabase/**, fase B), no este archivo. El esquema es una tabla por colección con el
 *  documento entero en `data jsonb` (nombres en `supabase-esquema.ts`) y las operaciones de escritura son las funciones de Postgres de la
 *  fase B (`guardar`, `quitar`, `fijar_campo`, `mezclar_clinica`, `lote`), que corren con los permisos de quien llama.
 *
 *  Diferencias con Firestore que esta capa esconde (spec del 9-oct §5.2):
 *   - una consulta con documentos que no se pueden ver NO falla: RLS simplemente no los devuelve (no hace falta el `catch permission-denied`);
 *   - los errores llegan con los mismos `code` que usa la interfaz (`permission-denied`, `not-found`, `unavailable`) y, en el login, los de
 *     Firebase Auth (`auth/invalid-credential`…), que son los que entiende `friendlyAuthError`;
 *   - `iniciarSesion` devuelve el uid de LOGIN (el de `User.authUid`) y `usuarioActual` el id del DOCUMENTO de usuario: pueden ser distintos
 *     (los usuarios migrados conservan su id viejo), y la tienda necesita ambos. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { COLECCIONES_DE_LA_TIENDA } from "./colecciones";
import { CLINICA_DEMO } from "./constantes";
import { limpiar } from "./documentos";
import { RPC } from "./supabase-esquema";
import type {
  AlFallar, BackendDeDatos, DatosDeBackend, Desuscribir, Doc, LecturaDeClinica, OperacionDeLote, OpcionesDeEscucha, OpcionesDeLectura,
  SesionDeBackend,
} from "./tipos";

/* ---------------------------------------------------------------- errores */

/** Un error de la base con el `code` que entiende el resto de la app. La causa original queda en `causa` (para el registro). */
export class ErrorDeBase extends Error {
  constructor(message: string, readonly code: string, readonly causa?: unknown) {
    super(message);
    this.name = "ErrorDeBase";
  }
}

const esRed = (e: unknown) =>
  e instanceof TypeError || /failed to fetch|networkerror|network request failed|fetch failed|load failed|retryable/i.test(String((e as Error)?.name) + " " + String((e as Error)?.message));

/** PostgREST / Postgres → los `code` de la interfaz (los de Firestore, que usa `clasificarError` para decidir qué le dice la pantalla al usuario). */
export function traducirError(e: unknown): ErrorDeBase {
  if (e instanceof ErrorDeBase) return e;
  const err = e as { code?: string; message?: string; status?: number } | null;
  const codigo = String(err?.code ?? "");
  const mensaje = String(err?.message ?? e);
  if (codigo === "42501") return new ErrorDeBase(mensaje, "permission-denied", e);
  if (codigo === "PGRST301" || codigo === "PGRST303" || /jwt expired|invalid jwt/i.test(mensaje)) return new ErrorDeBase(mensaje, "unauthenticated", e);
  if (codigo === "PGRST116" || codigo === "P0002") return new ErrorDeBase(mensaje, "not-found", e);
  if (codigo === "22023" || codigo === "42P01") return new ErrorDeBase(mensaje, "invalid-argument", e);
  if (esRed(e) || err?.status === 0 || (codigo === "" && /timeout|aborted/i.test(mensaje))) return new ErrorDeBase(mensaje, "unavailable", e);
  if (err?.status === 429 || codigo === "PGRST120") return new ErrorDeBase(mensaje, "resource-exhausted", e);
  return new ErrorDeBase(mensaje, codigo || "unknown", e);
}

/** GoTrue → los códigos de Firebase Auth que ya traducen la pantalla de ingreso (`auth/invalid-credential`…). */
export function traducirErrorDeIngreso(e: unknown): ErrorDeBase {
  const err = e as { code?: string; message?: string; status?: number; name?: string } | null;
  const codigo = String(err?.code ?? "");
  const mensaje = String(err?.message ?? e);
  const con = (code: string, msg: string) => new ErrorDeBase(msg, code, e);
  if (esRed(e) || err?.status === 0) return con("auth/network-request-failed", "Sin conexión con el servidor.");
  if (codigo === "over_request_rate_limit" || codigo === "over_email_send_rate_limit" || codigo === "over_sms_send_rate_limit" || err?.status === 429) return con("auth/too-many-requests", "Demasiados intentos.");
  if (codigo === "user_banned") return con("auth/user-disabled", "Tu usuario está desactivado.");
  if (codigo === "email_address_invalid" || (codigo === "validation_failed" && /email/i.test(mensaje))) return con("auth/invalid-email", "El email no es válido.");
  if (codigo === "invalid_credentials" || codigo === "email_not_confirmed" || codigo === "user_not_found" || err?.status === 400) return con("auth/invalid-credential", "Email o contraseña incorrectos.");
  if (codigo === "weak_password") return con("auth/weak-password", "La contraseña es demasiado débil.");
  return con(codigo ? `auth/${codigo.replace(/_/g, "-")}` : "auth/internal-error", mensaje);
}

/* --------------------------------------------------------------- validación */

/** Como en Firestore, un id de documento no puede estar vacío ni llevar «/». Se rechaza (promesa): nunca se lanza al llamar. */
const validarId = (id: string) => {
  if (typeof id !== "string" || id === "" || id.includes("/")) throw new Error(`Id no válido: ${JSON.stringify(id)} (no puede estar vacío ni llevar «/»)`);
};
/** La interfaz solo conoce campos de primer nivel; Firestore leería `a.b` como una ruta anidada y la base lo rechaza: se mantiene igual. */
const validarCampo = (campo: string) => {
  if (typeof campo !== "string" || campo === "" || campo.includes(".")) throw new Error(`Nombre de campo no válido: ${JSON.stringify(campo)} (no puede estar vacío ni llevar puntos)`);
};

/* ------------------------------------------------------------------- datos */

/** Documentos por página al leer una colección (PostgREST corta cada respuesta en 1000 filas). */
const PAGINA = 500;
/** Operaciones por llamada a `lote` (la función de la base admite hasta 1000). */
const MAXIMO_POR_LOTE = 1000;

type Fila = { id: string; data: Doc; updated_at: string };

/** Los datos sobre un cliente de Supabase cualquiera (en las pruebas, uno con la clave de servicio). `usuarioActual` es el id del documento del
 *  usuario con sesión; `uidDeLogin` el uid de GoTrue de esa sesión (para decidir si `mi_clinica()` habla de la misma persona). */
export function crearDatosSupabase(
  cliente: SupabaseClient,
  usuarioActual: () => Promise<string | null>,
  uidDeLogin: () => Promise<string | null> = async () => null,
): DatosDeBackend {
  let canales = 0;

  /** Lee TODAS las filas `(id, data, updated_at)` de una tabla, de a páginas. `permitirDenegado`: un 42501 (sin permiso sobre la tabla) da `[]`. */
  async function leerTabla(tabla: string, aplicar: (q: any) => any, permitirDenegado = true): Promise<Fila[]> {
    const salida: Fila[] = [];
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await aplicar(cliente.from(tabla).select("id,data,updated_at")).order("id", { ascending: true }).range(desde, desde + PAGINA - 1);
      if (error) {
        if (permitirDenegado && error.code === "42501") return [];
        throw traducirError(error);
      }
      const pagina = (data ?? []) as Fila[];
      salida.push(...pagina);
      if (pagina.length < PAGINA) return salida;
    }
  }
  const deClinica = (cid: string) => (q: any) => q.eq("clinic_id", cid);
  const documentos = (filas: Fila[]): Doc[] => filas.map((f) => f.data);

  async function unaFila(tabla: string, id: string): Promise<Fila | null> {
    const { data, error } = await cliente.from(tabla).select("id,data,updated_at").eq("id", id).maybeSingle();
    if (error) throw traducirError(error);
    return (data as Fila | null) ?? null;
  }

  async function rpc(nombre: string, args: Record<string, unknown>) {
    const { data, error } = await cliente.rpc(nombre, args);
    if (error) throw traducirError(error);
    return data;
  }

  /** `fijar_campo` rechaza con 42501 tanto un permiso negado como un documento que no existe (RLS no deja distinguirlos). Se desempata mirando si se ve. */
  async function distinguirNoEncontrado(e: ErrorDeBase, cid: string, col: string, id: string): Promise<ErrorDeBase> {
    if (e.code !== "permission-denied" || !/no existe o ninguna regla/.test(e.message)) return e;
    const { data } = await cliente.from(col).select("id").eq("clinic_id", cid).eq("id", id).maybeSingle();
    return data ? e : new ErrorDeBase(`No existe el documento clinics/${cid}/${col}/${id}`, "not-found", e.causa);
  }

  const operacion = (cid: string, op: OperacionDeLote): Record<string, unknown> =>
    op.tipo === "guardar" ? { op: "guardar", tabla: op.col, clinic_id: cid, id: op.id, data: limpiar(op.data as Doc) }
    : op.tipo === "guardarClinica" ? { op: "guardar", tabla: "clinics", clinic_id: null, id: cid, data: limpiar(op.data as Doc) }
    : { op: "mezclar_clinica", cid, parche: limpiar(op.data as Doc) };

  /* ----- escucha en vivo -----
   * Estado inicial por consulta + cambios por Realtime (`postgres_changes`), y el mismo orden de eventos que `onSnapshot`: primero lo que
   * hay, después cada cambio. El estado inicial se lee sin esperar al canal (el primer `SUBSCRIBED` de un servidor recién arrancado tarda
   * varios segundos) y se vuelve a leer cuando el canal queda suscripto —y en cada reconexión—, porque lo que cambió entre la lectura y la
   * suscripción no llegó por ningún evento. Los eventos que llegan mientras se lee quedan en cola; `updated_at` descarta uno más viejo que la
   * fila ya leída. Solo se entrega cuando el conjunto cambió. */
  function escuchar(opciones: {
    tabla: string;
    /** Filtro de Realtime (`clinic_id=eq.cl1`): Realtime acepta uno solo; el resto de las condiciones las ejecuta RLS y el filtro de acá. */
    filtro: string;
    leer: () => Promise<Fila[]>;
    entregar: (filas: Fila[]) => void;
    alFallar?: AlFallar;
  }): Desuscribir {
    let activo = true;
    let sincronizada = false;
    let corriendo = false;
    let repetir = false;
    const filas = new Map<string, Fila>();
    let enCola: any[] = [];
    let ultimaFirma: string | null = null;

    const aplicar = (ev: any) => {
      const nuevo = ev.new as Partial<Fila> | undefined;
      const viejo = ev.old as Partial<Fila> | undefined;
      const id = String(nuevo?.id ?? viejo?.id ?? "");
      if (!id) return;
      const actual = filas.get(id);
      if (ev.eventType === "DELETE") {
        // Un borrado anterior a lo que ya se leyó (el documento se volvió a crear) no cuenta.
        if (actual && ev.commit_timestamp && Date.parse(actual.updated_at) > Date.parse(ev.commit_timestamp)) return;
        filas.delete(id);
        return;
      }
      if (!nuevo || nuevo.data === undefined) { repetir = true; return; } // Realtime recortó una fila demasiado grande: se vuelve a leer
      if (actual && Date.parse(actual.updated_at) > Date.parse(String(nuevo.updated_at))) return;
      filas.set(id, { id, data: nuevo.data as Doc, updated_at: String(nuevo.updated_at) });
    };
    const emitir = () => {
      if (!activo || !sincronizada) return;
      const firma = [...filas.values()].map((f) => `${f.id}@${f.updated_at}`).sort().join("|");
      if (firma === ultimaFirma) return;
      ultimaFirma = firma;
      opciones.entregar([...filas.values()]);
    };

    async function sincronizar() {
      if (corriendo) { repetir = true; return; }
      corriendo = true;
      try {
        do {
          repetir = false;
          sincronizada = false;
          const leidas = await opciones.leer();
          if (!activo) return;
          filas.clear();
          for (const f of leidas) filas.set(f.id, f);
          sincronizada = true;
          const pendientes = enCola;
          enCola = [];
          for (const ev of pendientes) aplicar(ev);
          emitir();
        } while (repetir && activo);
      } catch (e) {
        if (activo) opciones.alFallar?.(traducirError(e));
      } finally {
        corriendo = false;
      }
    }

    void sincronizar();
    const canal = cliente
      .channel(`novudent:${opciones.tabla}:${opciones.filtro}:${++canales}`)
      .on("postgres_changes", { event: "*", schema: "public", table: opciones.tabla, filter: opciones.filtro }, (ev: any) => {
        if (!activo) return;
        if (!sincronizada) { enCola.push(ev); return; }
        aplicar(ev);
        if (repetir) void sincronizar();
        else emitir();
      })
      .subscribe((estado: string, err?: Error) => {
        if (!activo) return;
        if (estado === "SUBSCRIBED") void sincronizar();
        else if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") opciones.alFallar?.(traducirError(err ?? new Error(`Realtime: ${estado}`)));
      });

    return () => { activo = false; void cliente.removeChannel(canal); };
  }

  /* El estado de un solo documento (la clínica, la suscripción): el último evento manda. */
  function escucharDocumento(tabla: string, id: string, alCambiar: (d: Doc | null) => void, alFallar?: AlFallar): Desuscribir {
    return escuchar({
      tabla,
      filtro: `id=eq.${id}`,
      leer: async () => { const f = await unaFila(tabla, id); return f ? [f] : []; },
      entregar: (filas) => alCambiar(filas[0]?.data ?? null),
      alFallar,
    });
  }

  return {
    tipo: "supabase",

    async leerClinica(cid: string, opciones: OpcionesDeLectura): Promise<LecturaDeClinica | null> {
      const clinica = await unaFila("clinics", cid);
      if (!clinica) return null;
      /* La suscripción la escribe solo el webhook; si no se puede leer (o no existe) la clínica es anterior al cobro → grandfathered. */
      const suscripcion = await unaFila("subscriptions", cid).catch(() => null);
      const lista = (col: string) => leerTabla(col, deClinica(cid)).then(documentos);
      const usuariosP = lista("users");
      /* Mensajes directos: RLS ya entrega a cada uno solo lo suyo (el admin y la demo, todo), pero se pide con el mismo filtro que antes
       * (`filtroDeDirectos`) y se vuelve a filtrar acá: defensa en profundidad si una política se aflojara. */
      const directosP = (async () => {
        const filtro = opciones.directos(await usuariosP, await usuarioActual());
        if (filtro === "ninguno") return [] as Doc[];
        const todos = await lista("directMessages");
        return filtro === "todos" ? todos : todos.filter((d) => Array.isArray(d.participants) && (d.participants as unknown[]).includes(filtro.participante));
      })();
      const otras = COLECCIONES_DE_LA_TIENDA.filter((n) => n !== "users" && n !== "directMessages");
      const [usuarios, directos, ...resto] = await Promise.all([usuariosP, directosP, ...otras.map(lista)]);
      const colecciones: Record<string, Doc[]> = { users: usuarios, directMessages: directos };
      otras.forEach((nombre, i) => { colecciones[nombre] = resto[i]; });
      return { clinica: clinica.data, suscripcion: suscripcion?.data ?? null, colecciones };
    },

    async clinicaDelUsuario(uid: string) {
      /* Quien tiene sesión y pregunta por sí mismo: `mi_clinica()` (nunca rutea a la demo ni a un usuario dado de baja). */
      if (uid !== "" && uid === (await uidDeLogin())) {
        const cid = await rpc(RPC.miClinica, {});
        return typeof cid === "string" && cid !== "" ? cid : null;
      }
      const { data, error } = await cliente.from("users").select("clinic_id").eq("data->>authUid", uid).neq("clinic_id", CLINICA_DEMO).limit(1);
      if (error) throw traducirError(error);
      const cid = (data as Array<{ clinic_id?: unknown }> | null)?.[0]?.clinic_id;
      return typeof cid === "string" ? cid : null;
    },

    // Las escrituras son `async` a propósito: la interfaz promete que todo error (también un id mal armado) llega como rechazo.
    guardar: async (cid, col, id, data) => {
      validarId(id);
      await rpc(RPC.guardar, { tabla: col, clinic_id: cid, id, data: limpiar(data as Doc) });
    },
    quitar: async (cid, col, id) => {
      validarId(id);
      await rpc(RPC.quitar, { tabla: col, clinic_id: cid, id });
    },
    fijarCampo: async (cid, col, id, campo, valor) => {
      validarId(id);
      validarCampo(campo);
      try {
        // `null` se GUARDA como null; solo `undefined` quita la clave.
        await rpc(RPC.fijarCampo, { tabla: col, clinic_id: cid, id, campo, valor: valor === undefined ? null : limpiar(valor), quitar: valor === undefined });
      } catch (e) {
        throw await distinguirNoEncontrado(traducirError(e), cid, col, id);
      }
    },
    mezclarClinica: async (cid, data) => {
      await rpc(RPC.mezclarClinica, { cid, parche: limpiar(data as Doc) });
    },
    async lote(cid, ops) {
      // Una llamada es una transacción; más de MAXIMO_POR_LOTE operaciones se parten (cada tramo sigue siendo todo o nada).
      for (let i = 0; i < ops.length; i += MAXIMO_POR_LOTE) {
        await rpc(RPC.lote, { operaciones: ops.slice(i, i + MAXIMO_POR_LOTE).map((op) => operacion(cid, op)) });
      }
    },

    escucharSuscripcion: (cid, alCambiar, alFallar) => escucharDocumento("subscriptions", cid, alCambiar, alFallar),
    escucharClinica: (cid, alCambiar, alFallar) => escucharDocumento("clinics", cid, alCambiar, alFallar),
    escucharColeccion(cid, col, alCambiar, opciones?: OpcionesDeEscucha, alFallar?) {
      const participante = opciones?.participante;
      const campo = opciones?.ordenarPor;
      return escuchar({
        tabla: col,
        filtro: `clinic_id=eq.${cid}`,
        leer: () => leerTabla(col, deClinica(cid)),
        entregar: (filas) => {
          let docs = documentos(filas);
          // El chat directo es de sus participantes (y del admin): RLS ya lo asegura, el filtro es el mismo que pide la tienda.
          if (participante) docs = docs.filter((d) => Array.isArray(d.participants) && (d.participants as unknown[]).includes(participante));
          // Como `orderBy` de Firestore: de menor a mayor, y los documentos que no tienen el campo no aparecen.
          if (campo) docs = docs.filter((d) => d[campo] !== undefined).sort((a, b) => (a[campo] as never) < (b[campo] as never) ? -1 : (a[campo] as never) > (b[campo] as never) ? 1 : 0);
          alCambiar(docs);
        },
        alFallar,
      });
    },
  };
}

/* ------------------------------------------------------------------ sesión */

/** La sesión sobre GoTrue. `resolverUsuario` es la caché de `usuarioActual` (uid de login → id del documento de usuario). */
export function crearSesionSupabase(cliente: SupabaseClient) {
  let conocido: { uid: string; usuarioId: string } | null = null;

  async function uidDeLogin(): Promise<string | null> {
    try {
      const { data } = await cliente.auth.getSession(); // espera a que se restaure la sesión guardada
      return data.session?.user.id ?? null;
    } catch {
      return null;
    }
  }

  const sesion: SesionDeBackend = {
    async esperarSesion() {
      try { await cliente.auth.getSession(); } catch (e) { console.warn("No se pudo esperar el estado de sesión:", e); }
    },

    async iniciarSesion(email, clave) {
      const { data, error } = await cliente.auth.signInWithPassword({ email, password: clave });
      if (error || !data.user) throw traducirErrorDeIngreso(error ?? new Error("Sin usuario"));
      conocido = null;
      return data.user.id;
    },

    /** Abre la sesión anónima de la demo SOLO si no hay ninguna (ver la nota de `signInAnonymousIfNeeded` en lib/firebase.ts: no se pisa una sesión real). */
    async iniciarSesionDeDemo() {
      try {
        const { data } = await cliente.auth.getSession();
        if (data.session) return true;
        const { error } = await cliente.auth.signInAnonymously();
        if (error) throw error;
        return true;
      } catch (e) {
        console.warn("No se pudo abrir la sesión de la demo:", e);
        return false;
      }
    },

    async cerrarSesion() {
      conocido = null;
      const { error } = await cliente.auth.signOut({ scope: "local" });
      if (error) throw traducirErrorDeIngreso(error);
    },

    /** El id del DOCUMENTO de usuario de esta sesión (no el uid de login: en los usuarios migrados son distintos). Si no tiene ficha en ninguna clínica
     *  (la sesión anónima de la demo, una cuenta recién creada), devuelve el uid de login, que no coincide con ningún documento. */
    async usuarioActual() {
      const uid = await uidDeLogin();
      if (!uid) return null;
      if (conocido?.uid === uid) return conocido.usuarioId;
      try {
        const { data: cid } = await cliente.rpc(RPC.miClinica);
        if (typeof cid === "string" && cid !== "") {
          const { data: id } = await cliente.rpc(RPC.miUsuario, { cid });
          if (typeof id === "string" && id !== "") {
            conocido = { uid, usuarioId: id };
            return id;
          }
        }
      } catch { /* sin red: se devuelve el uid, sin guardarlo */ }
      return uid;
    },

    async token() {
      try {
        const { data } = await cliente.auth.getSession(); // renueva el token si venció
        return data.session?.access_token ?? null;
      } catch {
        return null;
      }
    },

    async enviarRecuperacion(email) {
      // A propósito NO distingue «email inexistente» de «correo enviado» (GoTrue ya contesta igual): ver app/login/page.tsx.
      const { error } = await cliente.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` });
      if (error) throw traducirErrorDeIngreso(error);
    },
  };
  return { sesion, uidDeLogin };
}

/* ------------------------------------------------------------ la app (lazy) */

export function crearClienteSupabase(url: string, claveAnonima: string): SupabaseClient {
  return createClient(url, claveAnonima, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "novudent-auth" },
    realtime: { params: { eventsPerSecond: 20 } },
  });
}

/** El cliente de la app: se crea al primer uso (no al importar el módulo), con la URL y la clave pública que se hornean en el build. */
let clienteDeLaApp: SupabaseClient | null = null;
function cliente(): SupabaseClient {
  if (clienteDeLaApp) return clienteDeLaApp;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (se hornean al compilar).");
  return (clienteDeLaApp = crearClienteSupabase(url, clave));
}

let _backend: BackendDeDatos | null = null;
function armar(): BackendDeDatos {
  const c = cliente();
  const { sesion, uidDeLogin } = crearSesionSupabase(c);
  return { ...crearDatosSupabase(c, sesion.usuarioActual, uidDeLogin), ...sesion };
}
/** Cada método arma el backend la primera vez que se llama (así importar este módulo en el servidor, al compilar, no necesita variables). */
const diferido = <K extends keyof BackendDeDatos>(nombre: K) => ((...args: unknown[]) => ((_backend ??= armar())[nombre] as (...a: unknown[]) => unknown)(...args)) as BackendDeDatos[K];

/** El backend de la app cuando `NEXT_PUBLIC_BACKEND` es `supabase`. */
export const backendSupabase: BackendDeDatos = {
  tipo: "supabase",
  leerClinica: diferido("leerClinica"), clinicaDelUsuario: diferido("clinicaDelUsuario"),
  guardar: diferido("guardar"), quitar: diferido("quitar"), fijarCampo: diferido("fijarCampo"), mezclarClinica: diferido("mezclarClinica"), lote: diferido("lote"),
  escucharSuscripcion: diferido("escucharSuscripcion"), escucharClinica: diferido("escucharClinica"), escucharColeccion: diferido("escucharColeccion"),
  esperarSesion: diferido("esperarSesion"), iniciarSesion: diferido("iniciarSesion"), iniciarSesionDeDemo: diferido("iniciarSesionDeDemo"),
  cerrarSesion: diferido("cerrarSesion"), usuarioActual: diferido("usuarioActual"), token: diferido("token"), enviarRecuperacion: diferido("enviarRecuperacion"),
};
