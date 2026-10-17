/** El «almacén»: donde el cargador escribe y lee los documentos. Dos versiones con el mismo contrato (`almacen.contrato.ts`): en memoria (pruebas) y Postgres.
 *
 *  Un almacén conoce las colecciones por su nombre en el manifiesto (`patients`, `directMessages`…); cuál es su tabla lo resuelve `preparar()` mirando las
 *  tablas que de verdad existen, así que ningún nombre llega a una consulta sin haber sido hallado en el catálogo de la base. Las filas son
 *  `{ id, data }`; `clinica` es el id de la clínica, o `null` para las colecciones de la raíz (`clinics`, `subscriptions`…). */
import { canonizar } from "./canonico.mjs";

/** `directMessages` → `direct_messages`. */
export const aSnake = (nombre) => nombre.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** La tabla de una colección entre las que existen: el nombre tal cual, o en snake_case. `null` si no hay. @param {string} coleccion @param {Set<string>} tablas */
export function nombreDeTabla(coleccion, tablas) {
  if (tablas.has(coleccion)) return coleccion;
  const snake = aSnake(coleccion);
  return tablas.has(snake) ? snake : null;
}

const SOLO_LECTURA = "El almacén está en modo solo lectura: no se puede escribir.";

/** Un texto con el carácter NUL no entra en `jsonb` de Postgres; la versión en memoria lo imita para que las pruebas lo cubran. */
const tieneNul = (v) => (typeof v === "string" ? v.includes("\u0000") : Array.isArray(v) ? v.some(tieneNul) : v && typeof v === "object" ? Object.entries(v).some(([k, x]) => tieneNul(k) || tieneNul(x)) : false);

/** @param {{ colecciones: string[], soloLectura?: boolean }} opciones */
export function crearAlmacenEnMemoria({ colecciones, soloLectura = false }) {
  const tablas = new Map(); // «coleccion|clinica» → Map(id → data)
  const tabla = (coleccion, clinica) => {
    const clave = `${coleccion}|${clinica ?? ""}`;
    if (!tablas.has(clave)) tablas.set(clave, new Map());
    return tablas.get(clave);
  };
  /** Leer no crea nada (si no, un simulacro «escribiría» tablas vacías). */
  const leer = (coleccion, clinica) => tablas.get(`${coleccion}|${clinica ?? ""}`) ?? new Map();
  const conocidas = new Set(colecciones);
  return {
    destino: "(en memoria)",
    async preparar(lista) {
      return { problemas: lista.filter((c) => !conocidas.has(c)).map((c) => `No existe la tabla de la colección «${c}».`) };
    },
    async upsertar({ coleccion, clinica, filas }) {
      if (soloLectura) throw new Error(SOLO_LECTURA);
      const t = tabla(coleccion, clinica);
      const r = { insertados: 0, actualizados: 0, iguales: 0, fallidos: [] };
      for (const { id, data } of filas) {
        if (tieneNul(data) || tieneNul(id)) { r.fallidos.push({ id, codigo: "22P05", mensaje: "unsupported Unicode escape sequence" }); continue; }
        const nuevo = JSON.parse(JSON.stringify(data));
        if (!t.has(id)) { t.set(id, nuevo); r.insertados++; }
        else if (canonizar(t.get(id)) === canonizar(nuevo)) r.iguales++;
        else { t.set(id, nuevo); r.actualizados++; }
      }
      return r;
    },
    async leerPagina({ coleccion, clinica, despuesDe, limite }) {
      const t = leer(coleccion, clinica);
      const ids = [...t.keys()].sort().filter((id) => despuesDe === null || id > despuesDe).slice(0, limite);
      return ids.map((id) => ({ id, data: JSON.parse(JSON.stringify(t.get(id))) }));
    },
    async clinicasEn(coleccion) {
      return [...tablas.entries()].filter(([clave, t]) => clave.startsWith(`${coleccion}|`) && clave !== `${coleccion}|` && t.size > 0).map(([clave]) => clave.slice(coleccion.length + 1)).sort();
    },
    async cerrar() {},
    /** Para las pruebas: el contenido actual. */
    _volcado: () => [...tablas.entries()].map(([k, t]) => [k, [...t.entries()]]),
  };
}

const ident = (nombre) => `"${String(nombre).replaceAll('"', '""')}"`;
/** Una sola vez por base: evita que dos cargas corran a la vez contra la misma. */
const CLAVE_DE_BLOQUEO = 7270000101;
/** Errores de datos de UN documento (clases 22, 23 y los `raise` de un disparador, P0): se aíslan fila por fila. Cualquier otro (conexión, permisos, tabla
 *  que no existe, base de solo lectura…) afecta a todo y corta la carga. */
const esErrorDeUnDocumento = (e) => typeof e?.code === "string" && (e.code.startsWith("22") || e.code.startsWith("23") || e.code.startsWith("P0"));
const primeraLinea = (texto) => String(texto ?? "").split("\n")[0].slice(0, 200);

/** "postgres://usuario:clave@host:5432/base" → "usuario@host:5432/base" (nunca la clave). */
export function describirDestino(url) {
  try {
    const u = new URL(url);
    return `${decodeURIComponent(u.username)}@${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(URL de la base ilegible)";
  }
}

/**
 * @param {{ url: string, soloLectura?: boolean, esquema?: string, Cliente?: new (config: any) => any }} opciones
 *   `soloLectura`: la sesión se abre con `default_transaction_read_only = on` (la propia base rechaza cualquier escritura) y no toma el bloqueo de carga.
 */
export async function crearAlmacenPostgres({ url, soloLectura = false, esquema = "public", Cliente }) {
  if (!Cliente) {
    try {
      ({ Client: Cliente } = await import("pg").then((m) => m.default ?? m));
    } catch {
      throw new Error("Falta el paquete «pg» (el cliente de Postgres). Instalalo con: npm install");
    }
  }
  const cliente = new Cliente({ connectionString: url });
  await cliente.connect();
  const consultar = (sql, params) => cliente.query(sql, params);
  try {
    if (soloLectura) await consultar("set default_transaction_read_only = on");
    else {
      const { rows } = await consultar("select pg_try_advisory_lock($1) as ok", [CLAVE_DE_BLOQUEO]);
      if (!rows[0].ok) throw new Error("Hay otra carga corriendo contra esta misma base (bloqueo de aviso tomado). Esperá a que termine.");
    }
  } catch (e) {
    await cliente.end().catch(() => {});
    throw e;
  }

  /** @type {Map<string, { tabla: string, conClinica: boolean }>} */
  const resueltas = new Map();
  const referencia = (coleccion) => {
    const r = resueltas.get(coleccion);
    if (!r) throw new Error(`La colección «${coleccion}» no se preparó (llamá a preparar() antes).`);
    return r;
  };
  const exigir = (coleccion, clinica) => {
    const r = referencia(coleccion);
    if (clinica !== null && !r.conClinica) throw new Error(`La tabla de «${coleccion}» no tiene la columna clinic_id, pero se la quiere usar con una clínica.`);
    if (clinica === null && r.conClinica) throw new Error(`La tabla de «${coleccion}» es de clínica (tiene clinic_id) y se la quiere usar sin clínica.`);
    return `${ident(esquema)}.${ident(r.tabla)}`;
  };

  return {
    destino: describirDestino(url),

    /** Resuelve las tablas de las colecciones y revisa sus columnas. */
    async preparar(colecciones) {
      const { rows: filas } = await consultar(
        "select c.table_name, c.column_name from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name where c.table_schema = $1 and t.table_type = 'BASE TABLE'",
        [esquema],
      );
      const columnas = new Map();
      for (const { table_name: t, column_name: c } of filas) (columnas.get(t) ?? columnas.set(t, new Set()).get(t)).add(c);
      const existentes = new Set(columnas.keys());
      const problemas = [];
      for (const coleccion of colecciones) {
        const tabla = nombreDeTabla(coleccion, existentes);
        if (!tabla) { problemas.push(`No existe la tabla de la colección «${coleccion}» en el esquema «${esquema}» (se buscó «${coleccion}» y «${aSnake(coleccion)}»).`); continue; }
        const cols = columnas.get(tabla);
        const faltan = ["id", "data"].filter((c) => !cols.has(c));
        if (faltan.length) { problemas.push(`La tabla «${tabla}» no tiene las columnas ${faltan.join(", ")}.`); continue; }
        resueltas.set(coleccion, { tabla, conClinica: cols.has("clinic_id") });
      }
      return { problemas };
    },

    async upsertar({ coleccion, clinica, filas }) {
      if (soloLectura) throw new Error(SOLO_LECTURA);
      const t = exigir(coleccion, clinica);
      const sql = clinica === null
        ? `insert into ${t} as t (id, data) select r.id, r.data from jsonb_to_recordset($1::jsonb) as r(id text, data jsonb) on conflict (id) do update set data = excluded.data where t.data is distinct from excluded.data returning (xmax = 0) as insertado`
        : `insert into ${t} as t (clinic_id, id, data) select $1::text, r.id, r.data from jsonb_to_recordset($2::jsonb) as r(id text, data jsonb) on conflict (clinic_id, id) do update set data = excluded.data where t.data is distinct from excluded.data returning (xmax = 0) as insertado`;
      const lote = async (lista) => {
        const json = JSON.stringify(lista);
        const { rows } = await consultar(sql, clinica === null ? [json] : [clinica, json]);
        const insertados = rows.filter((r) => r.insertado).length;
        return { insertados, actualizados: rows.length - insertados, iguales: lista.length - rows.length };
      };
      try {
        return { ...(await lote(filas)), fallidos: [] };
      } catch (e) {
        if (!esErrorDeUnDocumento(e)) throw new Error(`Postgres rechazó el lote de «${coleccion}» (${e.code ?? "error"}: ${primeraLinea(e.message)})`);
      }
      // Algún documento no entra: se prueba de a uno para saber cuál, sin copiar su contenido.
      const r = { insertados: 0, actualizados: 0, iguales: 0, fallidos: [] };
      for (const fila of filas) {
        try {
          const uno = await lote([fila]);
          r.insertados += uno.insertados; r.actualizados += uno.actualizados; r.iguales += uno.iguales;
        } catch (e) {
          if (!esErrorDeUnDocumento(e)) throw new Error(`Postgres rechazó un documento de «${coleccion}» (${e.code ?? "error"}: ${primeraLinea(e.message)})`);
          r.fallidos.push({ id: fila.id, codigo: e.code, mensaje: primeraLinea(e.message) });
        }
      }
      return r;
    },

    async leerPagina({ coleccion, clinica, despuesDe, limite }) {
      const t = exigir(coleccion, clinica);
      const { rows } = clinica === null
        ? await consultar(`select id, data from ${t} where ($1::text is null or id > $1) order by id limit $2`, [despuesDe, limite])
        : await consultar(`select id, data from ${t} where clinic_id = $1 and ($2::text is null or id > $2) order by id limit $3`, [clinica, despuesDe, limite]);
      return rows.map((r) => ({ id: r.id, data: r.data }));
    },

    async clinicasEn(coleccion) {
      const r = referencia(coleccion);
      if (!r.conClinica) return [];
      const { rows } = await consultar(`select distinct clinic_id from ${ident(esquema)}.${ident(r.tabla)} order by 1`);
      return rows.map((x) => x.clinic_id);
    },

    async cerrar() {
      await cliente.end().catch(() => {});
    },
  };
}
