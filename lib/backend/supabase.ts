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
const PAGINA = 300;
/** Las colecciones con documentos pesados (imágenes en base64, hasta 2 MiB cada uno) se leen en páginas más chicas. */
const PAGINA_DE: Record<string, number> = { radiographs: 25, signatures: 50, patients: 100, clinicalDocs: 100, eduVideos: 50 };
/** Operaciones que admite `lote` (la función de la base). Más no se parte: sería dejar de ser «todas o ninguna». */
const MAXIMO_POR_LOTE = 1000;
/** Eventos que se guardan mientras se lee; si se desborda, se descartan y se vuelve a leer todo. */
const TOPE_DE_COLA = 500;
const ESPERA_MAXIMA_MS = 30_000;
const esperaDeReintento = (intento: number) => Math.min(ESPERA_MAXIMA_MS, 1000 * 2 ** intento);

type Fila = { id: string; data: Doc; updated_at: string };

/** `mi_directorio()` devuelve una tabla `(clinic_id, user_id)`: una fila, o ninguna si la sesión no tiene clínica. */
const filaDeDirectorio = (data: unknown): { clinic_id?: string; user_id?: string } | null => {
  const f = Array.isArray(data) ? data[0] : data;
  return f && typeof f === "object" ? (f as { clinic_id?: string; user_id?: string }) : null;
};

/** Los datos sobre un cliente de Supabase cualquiera (en las pruebas, uno con la clave de servicio o uno falso). `usuarioActual` es el id del documento del
 *  usuario con sesión; `uidDeLogin` el uid de GoTrue de esa sesión (para decidir si `mi_directorio()` habla de la misma persona). */
export function crearDatosSupabase(
  cliente: SupabaseClient,
  usuarioActual: () => Promise<string | null>,
  uidDeLogin: () => Promise<string | null> = async () => null,
): DatosDeBackend {
  let canales = 0;

  /** Lee TODAS las filas `(id, data, updated_at)` de una tabla, de a páginas POR CLAVE (`id > último`, no por desplazamiento: una fila que aparece o se va entre
   *  página y página no duplica ni saltea otras). `permitirDenegado`: un 42501 (sin permiso sobre la tabla, por ejemplo un anónimo en la demo) da `[]`. */
  async function leerTabla(tabla: string, aplicar: (q: any) => any, permitirDenegado = true): Promise<Fila[]> {
    const salida: Fila[] = [];
    const vistos = new Set<string>();
    const pagina = PAGINA_DE[tabla] ?? PAGINA;
    let ultimo: string | null = null;
    for (;;) {
      let q = aplicar(cliente.from(tabla).select("id,data,updated_at"));
      if (ultimo !== null) q = q.gt("id", ultimo);
      const { data, error } = await q.order("id", { ascending: true }).limit(pagina);
      if (error) {
        if (permitirDenegado && error.code === "42501") return [];
        throw traducirError(error);
      }
      const filas = (data ?? []) as Fila[];
      for (const f of filas) if (!vistos.has(f.id)) { vistos.add(f.id); salida.push(f); }
      if (filas.length < pagina) return salida;
      ultimo = filas[filas.length - 1].id;
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

  /** `fijar_campo` rechaza con 42501 tanto un permiso negado como un documento que no existe (RLS no deja distinguirlos). Se desempata mirando si se ve;
   *  si ni siquiera se puede mirar, queda el error original. */
  async function distinguirNoEncontrado(e: ErrorDeBase, cid: string, col: string, id: string): Promise<ErrorDeBase> {
    if (e.code !== "permission-denied" || !/no existe o ninguna regla/.test(e.message)) return e;
    const { data, error } = await cliente.from(col).select("id").eq("clinic_id", cid).eq("id", id).maybeSingle();
    if (error || data) return e;
    return new ErrorDeBase(`No existe el documento clinics/${cid}/${col}/${id}`, "not-found", e.causa);
  }

  const operacion = (cid: string, op: OperacionDeLote): Record<string, unknown> =>
    op.tipo === "guardar" ? { op: "guardar", tabla: op.col, clinic_id: cid, id: op.id, data: limpiar(op.data as Doc) }
    : op.tipo === "guardarClinica" ? { op: "guardar", tabla: "clinics", clinic_id: null, id: cid, data: limpiar(op.data as Doc) }
    : { op: "mezclar_clinica", cid, parche: limpiar(op.data as Doc) };

  /* ----- escucha en vivo -----
   * Estado inicial por consulta + cambios por Realtime (`postgres_changes`), con el mismo orden que `onSnapshot`: primero lo que hay, después cada cambio.
   *  - El estado inicial se lee sin esperar al canal (el primer `SUBSCRIBED` de un servidor recién arrancado tarda segundos) y se vuelve a leer cuando el canal
   *    queda suscripto —y en cada reconexión—: lo que cambió entre la lectura y la suscripción no llegó por ningún evento.
   *  - Los eventos que llegan MIENTRAS se lee quedan en cola (con tope) y se aplican después, salvo los más viejos que la fila leída (`updated_at`). Ya sincronizada,
   *    un evento se aplica EN EL ORDEN EN QUE LLEGA: Realtime los entrega en el orden de los commits, mientras que `updated_at` es la hora de INICIO de la
   *    transacción (`now()`) y una transacción larga puede dejarlo menor que el de un cambio posterior.
   *  - Los DELETE no pasan por RLS ni por el filtro de Realtime: llegan los de TODAS las clínicas. Se ignora el que trae otro `clinic_id` (siempre viene: es parte
   *    de la clave primaria).
   *  - Si el canal se cierra (token vencido con la pestaña dormida, servidor reiniciado) se crea otro con espera creciente; si la lectura falla, se reintenta igual. */
  function escuchar(opciones: {
    tabla: string;
    /** Filtro de Realtime (`clinic_id=eq.cl1`): Realtime acepta uno solo; el resto de las condiciones las ejecuta RLS y el filtro de acá. */
    filtro: string;
    /** La clínica de la colección escuchada (los DELETE de otras no cuentan). */
    clinicId?: string;
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
    let canal: ReturnType<SupabaseClient["channel"]> | null = null;
    let fallosDeLectura = 0;
    let cierres = 0;
    let temporizadorDeLectura: ReturnType<typeof setTimeout> | null = null;
    let temporizadorDeCanal: ReturnType<typeof setTimeout> | null = null;

    /** Aplica un evento. Devuelve si cambió el estado. `contraLaLectura`: viene de la cola, así que se compara con lo leído. */
    const aplicar = (ev: any, contraLaLectura: boolean): boolean => {
      const nuevo = ev.new as Partial<Fila> | undefined;
      const viejo = ev.old as (Partial<Fila> & { clinic_id?: string }) | undefined;
      const id = String(nuevo?.id ?? viejo?.id ?? "");
      if (!id) return false;
      const actual = filas.get(id);
      if (ev.eventType === "DELETE") {
        if (opciones.clinicId && viejo?.clinic_id && viejo.clinic_id !== opciones.clinicId) return false;
        // Un borrado anterior a lo ya leído (el documento se volvió a crear) no cuenta.
        if (contraLaLectura && actual && ev.commit_timestamp && Date.parse(actual.updated_at) > Date.parse(ev.commit_timestamp)) return false;
        return filas.delete(id);
      }
      if (!nuevo || nuevo.data === undefined) { repetir = true; return false; } // Realtime recortó una fila demasiado grande: se vuelve a leer
      if (contraLaLectura && actual && Date.parse(actual.updated_at) > Date.parse(String(nuevo.updated_at))) return false;
      filas.set(id, { id, data: nuevo.data as Doc, updated_at: String(nuevo.updated_at) });
      return true;
    };
    /** Entrega el estado. `forzar`: tras un evento se entrega siempre (dos cambios de la misma transacción llevan el mismo `updated_at`); tras una lectura, solo si cambió. */
    const emitir = (forzar: boolean) => {
      if (!activo || !sincronizada) return;
      const firma = [...filas.values()].map((f) => `${f.id}@${f.updated_at}`).sort().join("|");
      if (!forzar && firma === ultimaFirma) return;
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
          fallosDeLectura = 0;
          const pendientes = enCola;
          enCola = [];
          for (const ev of pendientes) aplicar(ev, true);
          emitir(false);
        } while (repetir && activo);
      } catch (e) {
        if (!activo) return;
        opciones.alFallar?.(traducirError(e));
        enCola = []; // se vuelve a leer todo: lo que se guardó ya no sirve y no puede crecer sin límite
        if (!temporizadorDeLectura) {
          temporizadorDeLectura = setTimeout(() => { temporizadorDeLectura = null; void sincronizar(); }, esperaDeReintento(fallosDeLectura++));
        }
      } finally {
        corriendo = false;
      }
    }

    function suscribir() {
      if (!activo) return;
      const este = cliente
        .channel(`novudent:${opciones.tabla}:${opciones.filtro}:${++canales}`)
        .on("postgres_changes", { event: "*", schema: "public", table: opciones.tabla, filter: opciones.filtro }, (ev: any) => {
          if (!activo) return;
          if (!sincronizada) {
            if (enCola.length >= TOPE_DE_COLA) { enCola = []; repetir = true; } else enCola.push(ev);
            return;
          }
          const cambio = aplicar(ev, false);
          if (repetir) void sincronizar();
          else if (cambio) emitir(true);
        })
        .subscribe((estado: string, err?: Error) => {
          if (!activo || este !== canal) return; // un canal que ya se reemplazó
          if (estado === "SUBSCRIBED") { cierres = 0; void sincronizar(); }
          else if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") opciones.alFallar?.(traducirError(err ?? new Error(`Realtime: ${estado}`)));
          else if (estado === "CLOSED" && !temporizadorDeCanal) {
            temporizadorDeCanal = setTimeout(() => {
              temporizadorDeCanal = null;
              if (!activo) return;
              const viejo = canal;
              canal = null;
              if (viejo) void cliente.removeChannel(viejo);
              suscribir();
            }, esperaDeReintento(cierres++));
          }
        });
      canal = este;
    }

    void sincronizar();
    suscribir();

    return () => {
      activo = false;
      if (temporizadorDeLectura) clearTimeout(temporizadorDeLectura);
      if (temporizadorDeCanal) clearTimeout(temporizadorDeCanal);
      if (canal) void cliente.removeChannel(canal);
    };
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
      const lista = (col: string, permitirDenegado = true) => leerTabla(col, deClinica(cid), permitirDenegado).then(documentos);
      /* El padrón (`users`) es OBLIGATORIO: si no se puede leer, la carga falla. Un padrón vacío por un permiso o un fallo de infraestructura desloguearía a todos (la tienda
       * cierra la sesión de quien no figura en él). Las demás colecciones sin permiso llegan vacías: que una asistente no vea los gastos ES la regla de negocio. */
      const usuariosP = lista("users", false);
      /* Mensajes directos: RLS ya entrega a cada uno solo lo suyo (el admin y la demo, todo), pero se pide con el mismo filtro que antes
       * (`filtroDeDirectos`) y se vuelve a filtrar acá: defensa en profundidad si una política se aflojara. */
      const directosP = (async () => {
        const filtro = opciones.directos(await usuariosP, await usuarioActual());
        if (filtro === "ninguno") return [] as Doc[];
        const todos = await lista("directMessages");
        return filtro === "todos" ? todos : todos.filter((d) => Array.isArray(d.participants) && (d.participants as unknown[]).includes(filtro.participante));
      })();
      const otras = COLECCIONES_DE_LA_TIENDA.filter((n) => n !== "users" && n !== "directMessages");
      const [usuarios, directos, ...resto] = await Promise.all([usuariosP, directosP, ...otras.map((n) => lista(n))]);
      const colecciones: Record<string, Doc[]> = { users: usuarios, directMessages: directos };
      otras.forEach((nombre, i) => { colecciones[nombre] = resto[i]; });
      return { clinica: clinica.data, suscripcion: suscripcion?.data ?? null, colecciones };
    },

    async clinicaDelUsuario(uid: string) {
      /* Quien tiene sesión y pregunta por sí mismo: `mi_directorio()` (nunca rutea a la demo ni a un usuario dado de baja). */
      if (uid !== "" && uid === (await uidDeLogin())) {
        const cid = filaDeDirectorio(await rpc(RPC.miDirectorio, {}))?.clinic_id;
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
    lote: async (cid, ops) => {
      // Una llamada es UNA transacción. Más operaciones de las que admite no se parten: sería dejar de ser «todas o ninguna».
      if (ops.length > MAXIMO_POR_LOTE) throw new Error(`Un lote admite hasta ${MAXIMO_POR_LOTE} operaciones (llegaron ${ops.length}).`);
      for (const op of ops) if (op.tipo === "guardar") validarId(op.id);
      await rpc(RPC.lote, { operaciones: ops.map((op) => operacion(cid, op)) });
    },

    escucharSuscripcion: (cid, alCambiar, alFallar) => escucharDocumento("subscriptions", cid, alCambiar, alFallar),
    escucharClinica: (cid, alCambiar, alFallar) => escucharDocumento("clinics", cid, alCambiar, alFallar),
    escucharColeccion(cid, col, alCambiar, opciones?: OpcionesDeEscucha, alFallar?) {
      const participante = opciones?.participante;
      const campo = opciones?.ordenarPor;
      return escuchar({
        tabla: col,
        filtro: `clinic_id=eq.${cid}`,
        clinicId: cid,
        leer: () => leerTabla(col, deClinica(cid)),
        entregar: (filas) => {
          let docs = documentos(filas);
          // El chat directo es de sus participantes (y del admin): RLS ya lo asegura, el filtro es el mismo que pide la tienda.
          if (participante) docs = docs.filter((d) => Array.isArray(d.participants) && (d.participants as unknown[]).includes(participante));
          // Como `orderBy` de Firestore: de menor a mayor, y los documentos que no tienen el campo no aparecen.
          if (campo) {
            docs = docs.filter((d) => d[campo] !== undefined).sort((a, b) =>
              (a[campo] as never) < (b[campo] as never) ? -1 : (a[campo] as never) > (b[campo] as never) ? 1 : String(a.id ?? "") < String(b.id ?? "") ? -1 : String(a.id ?? "") > String(b.id ?? "") ? 1 : 0);
          }
          alCambiar(docs);
        },
        alFallar,
      });
    },
  };
}

/* ------------------------------------------------------------------ sesión */

/** La sesión sobre GoTrue. `resolverUsuario` es la caché de `usuarioActual` (uid de login → id del documento de usuario). */
/** Dónde se recuerda quién es, por documento, la persona de una sesión (solo ids; no es ninguna credencial). Sirve para restaurar la sesión SIN red: la tienda compara el id
 *  de su sesión guardada con `usuarioActual()` y, si no se pudiera preguntar, cerraría la sesión de todos al recargar con el servidor caído. */
const CLAVE_USUARIO_RECORDADO = "novudent-auth-usuario";
const recordado = {
  leer(): { uid: string; usuarioId: string } | null {
    try { return JSON.parse(globalThis.localStorage?.getItem(CLAVE_USUARIO_RECORDADO) || "null"); } catch { return null; }
  },
  guardar(v: { uid: string; usuarioId: string } | null) {
    try { if (v) globalThis.localStorage?.setItem(CLAVE_USUARIO_RECORDADO, JSON.stringify(v)); else globalThis.localStorage?.removeItem(CLAVE_USUARIO_RECORDADO); } catch { /* sin almacenamiento */ }
  },
};
const cederElTurno = () => new Promise<void>((r) => setTimeout(r, 0));

export function crearSesionSupabase(cliente: SupabaseClient) {
  let conocido: { uid: string; usuarioId: string } | null = null;
  /* Recuperación de contraseña. El correo vuelve a la app con la sesión en la URL (`#access_token=…&type=recovery`); supabase-js la toma al arrancar, borra el hash y
   * avisa con PASSWORD_RECOVERY. Se confía SOLO en ese aviso (que trae la sesión): mirar la URL no alcanza, porque un enlace armado a mano
   * (`/login#access_token=x&type=recovery`) dejaría cambiar la contraseña de una sesión normal sin pedir la actual. El aviso sale en un `setTimeout(0)` DESPUÉS de que `getSession()`
   * resuelve: por eso se cede un turno antes de mirar. Vale solo para la sesión de recuperación (su uid) y se olvida al iniciar o cerrar sesión. */
  let recuperacionDe: string | null = null;
  cliente.auth.onAuthStateChange((evento, sesion) => {
    if (evento === "PASSWORD_RECOVERY") recuperacionDe = sesion?.user?.id ?? null;
    else if (evento === "SIGNED_OUT") recuperacionDe = null;
  });
  let demoEnCurso: Promise<boolean> | null = null;

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
      recordado.guardar(null);
      recuperacionDe = null;
      return data.user.id;
    },

    /** Abre la sesión anónima de la demo SOLO si no hay ninguna (ver la nota de `signInAnonymousIfNeeded` en lib/firebase.ts: no se pisa una sesión real). Dos llamadas
     *  a la vez comparten la misma (si no, se crearían dos cuentas anónimas). */
    iniciarSesionDeDemo() {
      demoEnCurso ??= (async () => {
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
      })().finally(() => { demoEnCurso = null; });
      return demoEnCurso;
    },

    async cerrarSesion() {
      conocido = null;
      recordado.guardar(null);
      recuperacionDe = null;
      const { error } = await cliente.auth.signOut({ scope: "local" });
      if (error) throw traducirErrorDeIngreso(error);
    },

    /** El id del DOCUMENTO de usuario de esta sesión (no el uid de login: en los usuarios migrados son distintos), por `mi_directorio()`. Sin ficha en ninguna clínica
     *  (la sesión anónima de la demo, una cuenta recién creada) devuelve el uid de login, que no coincide con ningún documento. Si la base no contesta devuelve el último
     *  id conocido de ESTA sesión y, si no lo hay, rechaza: devolver el uid cerraría la sesión de los usuarios migrados y dejaría el chat sin conversaciones. */
    async usuarioActual() {
      const uid = await uidDeLogin();
      if (!uid) return null;
      if (conocido?.uid === uid) return conocido.usuarioId;
      const { data, error } = await cliente.rpc(RPC.miDirectorio);
      if (error) {
        const guardado = recordado.leer();
        if (guardado?.uid === uid && guardado.usuarioId) return guardado.usuarioId;
        throw traducirError(error);
      }
      const usuarioId = filaDeDirectorio(data)?.user_id;
      if (typeof usuarioId === "string" && usuarioId !== "") {
        conocido = { uid, usuarioId };
        recordado.guardar(conocido);
        return usuarioId;
      }
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

    async hayEnlaceDeRecuperacion() {
      const uid = await uidDeLogin(); // espera a que termine de iniciar: ahí se procesa la URL
      await cederElTurno(); // PASSWORD_RECOVERY sale en un setTimeout(0) posterior
      return recuperacionDe !== null && recuperacionDe === uid;
    },

    async fijarClaveNueva(nueva) {
      if (recuperacionDe === null || recuperacionDe !== (await uidDeLogin())) {
        throw new ErrorDeBase("Esta sesión no viene de un enlace de recuperación de contraseña.", "auth/invalid-action-code");
      }
      const { error } = await cliente.auth.updateUser({ password: nueva });
      if (error) throw traducirErrorDeIngreso(error);
      recuperacionDe = null;
      conocido = null;
      recordado.guardar(null);
      await cliente.auth.signOut({ scope: "local" });
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
  hayEnlaceDeRecuperacion: diferido("hayEnlaceDeRecuperacion"), fijarClaveNueva: diferido("fijarClaveNueva"),
};
