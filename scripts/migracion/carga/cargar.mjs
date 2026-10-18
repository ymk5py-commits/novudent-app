/** El corazón del cargador: valida la exportación, deja las cuentas de GoTrue, sube los documentos a Postgres con upsert y compara TODO contra lo que quedó.
 *
 *  Tres modos:
 *   - `cargar`: crea las cuentas, hace el upsert y verifica (la comparación completa corre siempre al final).
 *   - `solo-verificar`: no escribe nada (ni cuentas): compara la base con la exportación.
 *   - `simulacro`: no escribe nada: cuenta qué se insertaría, qué se actualizaría y qué cuentas se crearían (con base y GoTrue; sin ellos, solo valida la
 *     exportación).
 *
 *  La comparación es documento por documento: SHA-256 de la forma canónica `{ id, data }` (ver `canonico.mjs`) de cada documento del archivo contra el que se
 *  lee de la base, y también en el otro sentido (lo que hay en la base y no está en la exportación). El cargador NUNCA borra: lo que sobra se informa. */
import { hashDeDocumento } from "./canonico.mjs";
import { NO_SE_CARGA, leerDocumentos, leerManifiesto, planDeCarga, verificarArchivos } from "./exportacion.mjs";
import { asegurarUsuarios, recolectarUsuarios, reescribirUsuario } from "./usuarios.mjs";

export class ErrorDeCarga extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "ErrorDeCarga";
  }
}

export const MODOS = ["cargar", "solo-verificar", "simulacro"];
const PAGINA = 500;
const BYTES_POR_LOTE = 4 * 1024 * 1024;

const nombreDe = (clinica, coleccion) => (clinica ? `clinics/${clinica}/${coleccion}` : coleccion);

/**
 * @param {{
 *   carpeta: string,
 *   colecciones: { porClinica: string[], raiz: string[], noSeMigra?: string[] },
 *   almacen: any | null,
 *   gotrue: any | null,
 *   modo: "cargar" | "solo-verificar" | "simulacro",
 *   permitirIncompleto?: boolean,
 *   ignorarDesconocidas?: boolean,
 *   sobrescribir?: boolean,
 *   tamanoDeLote?: number,
 *   alAvanzar?: (mensaje: string) => void,
 * }} opciones
 * @returns {Promise<any>}  el informe (ver `informe.mjs`)
 */
export async function ejecutarCarga({ carpeta, colecciones, almacen, gotrue, modo, permitirIncompleto = false, ignorarDesconocidas = false, sobrescribir = false, tamanoDeLote = 200, alAvanzar = () => {} }) {
  if (!MODOS.includes(modo)) throw new ErrorDeCarga(`Modo desconocido: «${modo}».`);
  if (modo !== "simulacro" && !almacen) throw new ErrorDeCarga("Falta la base de datos de destino.");
  if (modo !== "simulacro" && !gotrue) throw new ErrorDeCarga(`Para ${modo === "cargar" ? "cargar" : "verificar"} hace falta GoTrue (--url-gotrue y la clave de servicio): sin él no se sabe qué \`authUid\` le corresponde a cada usuario.`);
  const escribe = modo === "cargar";

  // 1. La exportación: el manifiesto y cada archivo contra su SHA-256, antes de tocar nada.
  const manifiesto = leerManifiesto(carpeta);
  const { entradas, advertencias } = planDeCarga(manifiesto, colecciones, { permitirIncompleto, ignorarDesconocidas });
  const problemas = await verificarArchivos(carpeta, entradas, { alAvanzar });
  if (problemas.length) {
    const lista = problemas.map((p) => `  · ${nombreDe(p.clinica, p.coleccion)}: ${p.motivo}`).join("\n");
    throw new ErrorDeCarga(`La exportación no coincide con su manifiesto (no se escribió nada):\n${lista}\nVolvé a exportar.`);
  }

  const informe = {
    modo,
    ok: false,
    diferencias: 0,
    hashes: Boolean(almacen),
    base: Boolean(almacen),
    destino: almacen?.destino ?? null,
    generado: manifiesto.generado ?? null,
    archivos: { verificados: entradas.length, problemas: [] },
    usuarios: { reales: 0, deLaDemo: 0, sinCorreo: [], creados: 0, existentes: 0, porCrear: 0, repetidos: [], consultado: false },
    colecciones: [],
    sobrantesDeClinicas: [],
    totales: { manifiesto: 0, base: 0, iguales: 0, faltan: 0, distintos: 0, sobran: 0, diferencias: 0, cargados: { insertados: 0, actualizados: 0, iguales: 0, fallidos: 0 } },
    advertencias,
  };
  const nuevaFila = (clinica, coleccion, entrada) => ({
    clinica,
    coleccion,
    manifiesto: { docs: entrada?.docs ?? 0, sha256: entrada?.sha256 ?? null },
    archivo: { ok: true },
    carga: null,
    base: { docs: 0 },
    iguales: 0,
    faltan: [],
    distintos: [],
    sobran: [],
  });
  informe.colecciones = entradas.map((e) => nuevaFila(e.clinica, e.coleccion, e));
  informe.totales.manifiesto = entradas.reduce((n, e) => n + e.docs, 0);

  // Sin base (simulacro de solo lectura de la exportación): ya está todo lo que se puede decir.
  if (!almacen) {
    informe.ok = true;
    return informe;
  }

  // 2. La base: ¿están las tablas de TODAS las colecciones? (también las que esta exportación no trae: se comparan para encontrar sobrantes)
  const raizACargar = colecciones.raiz.filter((c) => !NO_SE_CARGA.includes(c) && !(colecciones.noSeMigra ?? []).includes(c));
  const { problemas: faltanTablas } = await almacen.preparar([...raizACargar, ...colecciones.porClinica]);
  if (faltanTablas.length) throw new ErrorDeCarga(`La base no está lista (no se escribió nada):\n${faltanTablas.map((p) => `  · ${p}`).join("\n")}`);
  if (gotrue?.comprobar) await gotrue.comprobar();

  // 3. Las cuentas de GoTrue (en la carga, primero solo se mira qué hay: las cuentas se crean después de revisar que no se pisan datos).
  const documentosDeUsuarios = [];
  for (const entrada of entradas.filter((e) => e.coleccion === "users")) {
    for await (const { id, data } of leerDocumentos(carpeta, entrada)) documentosDeUsuarios.push({ clinica: entrada.clinica, id, data });
  }
  const { reales, sinCorreo, deLaDemo } = recolectarUsuarios(documentosDeUsuarios);
  let cuentas = await asegurarUsuarios({ reales, gotrue, crear: false, alAvanzar });

  /** El documento tal como debe quedar en la base: igual a la exportación salvo `authUid` en los usuarios reales. */
  const documentoFinal = (entrada, id, data) => (entrada.coleccion === "users" ? { id, data: reescribirUsuario(data, cuentas.uuidPorEmail) } : { id, data });

  // 4. La comparación completa, documento por documento y en los dos sentidos: lo del archivo contra lo de la base (SHA-256 de la forma canónica) y lo que
  //    hay en la base y no en el archivo. Se usa antes de cargar (el plan) y después (la verificación).
  const entradaDe = (clinica, coleccion) => entradas.find((e) => e.clinica === clinica && e.coleccion === coleccion) ?? null;
  const pares = [
    ...raizACargar.map((c) => [c, null]),
    ...Object.keys(manifiesto.clinicas).flatMap((cid) => colecciones.porClinica.map((c) => [c, cid])),
  ];
  /** @param {string} coleccion @param {string | null} clinica @param {any} entrada  null = la exportación no trae esa colección: todo lo que haya en la base es sobrante */
  const compararColeccion = async (coleccion, clinica, entrada) => {
    const esperados = new Map();
    if (entrada) for await (const { id, data } of leerDocumentos(carpeta, entrada)) { const d = documentoFinal(entrada, id, data); esperados.set(d.id, hashDeDocumento(d.id, d.data)); }
    const f = nuevaFila(clinica, coleccion, entrada);
    let despuesDe = null;
    for (;;) {
      const pagina = await almacen.leerPagina({ coleccion, clinica, despuesDe, limite: PAGINA });
      for (const { id, data } of pagina) {
        f.base.docs++;
        if (!esperados.has(id)) { f.sobran.push(id); continue; }
        if (esperados.get(id) === hashDeDocumento(id, data)) f.iguales++;
        else f.distintos.push(id);
        esperados.delete(id);
      }
      if (pagina.length < PAGINA) break;
      despuesDe = pagina[pagina.length - 1].id;
    }
    f.faltan.push(...esperados.keys());
    return f;
  };
  const compararTodo = async () => {
    const filas = [];
    for (const [coleccion, clinica] of pares) {
      const entrada = entradaDe(clinica, coleccion);
      const f = await compararColeccion(coleccion, clinica, entrada);
      if (entrada || f.sobran.length) filas.push(f); // una colección que la exportación no trae solo aparece si la base tiene algo de más
    }
    // Clínicas que están en la base y no en la exportación.
    const conocidas = new Set(Object.keys(manifiesto.clinicas));
    const sobrantesDeClinicas = [];
    for (const coleccion of colecciones.porClinica) {
      for (const clinica of await almacen.clinicasEn(coleccion)) {
        if (conocidas.has(clinica)) continue;
        const f = await compararColeccion(coleccion, clinica, null);
        sobrantesDeClinicas.push({ coleccion, clinica, docs: f.base.docs });
      }
    }
    return { filas, sobrantesDeClinicas };
  };

  // 5. La carga: antes se revisa que no se pisan datos que la base tiene distintos (una edición hecha después de exportar se perdería).
  const cargas = new Map();
  if (escribe) {
    if (!sobrescribir) {
      const plan = await compararTodo();
      const pisaria = plan.filas.filter((f) => f.distintos.length);
      if (pisaria.length) {
        const total = pisaria.reduce((n, f) => n + f.distintos.length, 0);
        throw new ErrorDeCarga(`La base ya tiene ${total} documento(s) DISTINTOS a los de la exportación, y cargar los sobrescribiría (no se escribió nada, ni cuentas):\n${pisaria.map((f) => `  · ${nombreDe(f.clinica, f.coleccion)}: ${f.distintos.length}`).join("\n")}\nMirá qué cambia con --dry-run. Si la exportación es la verdad (por ejemplo, un segundo simulacro con una exportación nueva), repetí con --sobrescribir; si la base tiene ediciones más nuevas, NO lo hagas.`);
      }
    }
    cuentas = await asegurarUsuarios({ reales, gotrue, crear: true, alAvanzar });
    const sinCuenta = reales.filter((u) => !cuentas.uuidPorEmail.has(u.email));
    if (sinCuenta.length) throw new ErrorDeCarga("Quedaron usuarios sin cuenta de GoTrue; no se carga nada.");
    for (const entrada of entradas) {
      const carga = { insertados: 0, actualizados: 0, iguales: 0, fallidos: [] };
      cargas.set(`${entrada.clinica ?? ""}|${entrada.coleccion}`, carga);
      let lote = [];
      let bytes = 0;
      const subir = async () => {
        if (!lote.length) return;
        const r = await almacen.upsertar({ coleccion: entrada.coleccion, clinica: entrada.clinica, filas: lote });
        carga.insertados += r.insertados; carga.actualizados += r.actualizados; carga.iguales += r.iguales; carga.fallidos.push(...r.fallidos);
        lote = []; bytes = 0;
      };
      for await (const { id, data, bytes: n } of leerDocumentos(carpeta, entrada)) {
        lote.push(documentoFinal(entrada, id, data));
        bytes += n;
        if (lote.length >= tamanoDeLote || bytes >= BYTES_POR_LOTE) await subir();
      }
      await subir();
      alAvanzar(`${nombreDe(entrada.clinica, entrada.coleccion)}: ${entrada.docs} documentos cargados${carga.fallidos.length ? ` (${carga.fallidos.length} NO se pudieron cargar)` : ""}`);
    }
  }
  informe.usuarios = { reales: reales.length, deLaDemo, sinCorreo, creados: cuentas.creados, existentes: cuentas.existentes, porCrear: cuentas.porCrear, repetidos: cuentas.repetidos, consultado: cuentas.consultado };
  if (sinCorreo.length) informe.advertencias.push(`⚠️ ${sinCorreo.length} usuario(s) tienen authUid pero ningún correo usable: no se les puede crear la cuenta de GoTrue (${sinCorreo.map((u) => `${u.clinica}/${u.id}`).join(", ")}).`);
  if (cuentas.repetidos.length) informe.advertencias.push(`${cuentas.repetidos.length} correo(s) aparecen en más de un documento de usuario: comparten una sola cuenta de GoTrue (y el esquema admite una sola clínica real por persona: el segundo documento no se va a poder cargar).`);

  // 6. La comparación final (o, en el simulacro, el plan) y los totales.
  const { filas, sobrantesDeClinicas } = await compararTodo();
  for (const f of filas) f.carga = cargas.get(`${f.clinica ?? ""}|${f.coleccion}`) ?? null;
  informe.colecciones = filas;
  informe.sobrantesDeClinicas = sobrantesDeClinicas;
  const t = informe.totales;
  for (const f of filas) {
    t.base += f.base.docs; t.iguales += f.iguales; t.faltan += f.faltan.length; t.distintos += f.distintos.length; t.sobran += f.sobran.length;
    if (f.carga) { t.cargados.insertados += f.carga.insertados; t.cargados.actualizados += f.carga.actualizados; t.cargados.iguales += f.carga.iguales; t.cargados.fallidos += f.carga.fallidos.length; }
  }
  const ajenos = sobrantesDeClinicas.reduce((n, s) => n + s.docs, 0);
  t.base += ajenos; t.sobran += ajenos;
  const cuentasFaltantes = modo === "solo-verificar" ? cuentas.porCrear : 0;
  t.diferencias = t.faltan + t.distintos + t.sobran + cuentasFaltantes;
  informe.diferencias = t.diferencias;
  informe.ok = modo === "simulacro" ? true : t.diferencias === 0 && t.cargados.fallidos === 0;
  return informe;
}
