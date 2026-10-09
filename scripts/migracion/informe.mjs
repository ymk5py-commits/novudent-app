/** El informe de volumen de la exportación (Markdown): cuánto pesan los datos hoy y cuánto se espera con 30 clínicas, para decidir el
 *  tamaño del servidor. No incluye datos de pacientes: solo cantidades, tamaños e ids. */

const mb = (bytes) => (bytes / 1024 / 1024).toLocaleString("es-PY", { maximumFractionDigits: 2 });
const gb = (bytes) => (bytes / 1024 / 1024 / 1024).toLocaleString("es-PY", { maximumFractionDigits: 2 });
const fila = (...celdas) => `| ${celdas.join(" | ")} |`;
const tabla = (cabecera, filas) => [fila(...cabecera), fila(...cabecera.map(() => "---")), ...filas.map((f) => fila(...f))].join("\n");

/** Cuánto ocupa en Postgres respecto del JSON exportado (índices, relleno y versiones internas). Estimación gruesa a propósito. */
export const FACTOR_POSTGRES = 1.5;
export const CLINICAS_OBJETIVO = 30;
const CLINICA_DEMO = "cl_demo";

/** Las clínicas de verdad: todas menos la demo. */
/** @param {import("./exportar.mjs").Manifiesto} manifiesto */
export function clinicasReales(manifiesto) {
  return Object.entries(manifiesto.clinicas).filter(([cid]) => cid !== CLINICA_DEMO);
}

/** Proyección del tamaño de la base con `objetivo` clínicas, a partir del promedio de las reales. `null` si todavía no hay ninguna. */
/** @param {import("./exportar.mjs").Manifiesto} manifiesto */
export function proyectar(manifiesto, objetivo = CLINICAS_OBJETIVO) {
  const reales = clinicasReales(manifiesto);
  if (reales.length === 0) return null;
  const promedio = reales.reduce((n, [, c]) => n + c.bytes, 0) / reales.length;
  const exportado = promedio * objetivo;
  return { clinicasReales: reales.length, promedioPorClinica: promedio, exportado, enPostgres: exportado * FACTOR_POSTGRES };
}

/** @param {import("./exportar.mjs").Manifiesto} manifiesto */
export function armarInforme(manifiesto, { proyecto = "(sin nombre)", credencial = "(sin dato)", objetivo = CLINICAS_OBJETIVO } = {}) {
  const t = manifiesto.totales;
  const clinicas = Object.entries(manifiesto.clinicas);
  const porColeccion = {};
  for (const [, c] of clinicas) {
    for (const [nombre, e] of Object.entries(c.colecciones)) {
      const acum = (porColeccion[nombre] ??= { docs: 0, bytes: 0, mayor: 0 });
      acum.docs += e.docs; acum.bytes += e.bytes; acum.mayor = Math.max(acum.mayor, e.mayor?.bytes ?? 0);
    }
  }
  const proyeccion = proyectar(manifiesto, objetivo);
  const h = manifiesto.hallazgos;
  const hallazgos = Object.entries(h).filter(([, n]) => n > 0);

  const partes = [
    `# Informe de volumen de Firestore`,
    // Una exportación filtrada con --clinica no sirve para migrar: se avisa antes que cualquier número.
    ...(Array.isArray(manifiesto.clinicasFiltradas) ? [`⚠️ Exportación PARCIAL: solo las clínicas ${manifiesto.clinicasFiltradas.join(", ")}. No sirve para migrar.`] : []),
    `Generado el ${manifiesto.generado} · proyecto \`${proyecto}\` · credencial: ${credencial}`,
    `## Resumen`,
    tabla(["Qué", "Cantidad"], [
      ["Clínicas (con la demo)", String(clinicas.length)],
      ["Clínicas reales", String(clinicasReales(manifiesto).length)],
      ["Documentos exportados", t.documentos.toLocaleString("es-PY")],
      ["Tamaño exportado (JSON)", `${mb(t.bytes)} MB`],
      ["Documento más grande", manifiesto.mayores[0] ? `${manifiesto.mayores[0].ruta}/${manifiesto.mayores[0].id} — ${mb(manifiesto.mayores[0].bytes)} MB` : "—"],
    ]),
    `## Por clínica`,
    tabla(["Clínica", "Usuarios", "Pacientes", "Documentos", "Tamaño (MB)"], clinicas
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .map(([cid, c]) => [`\`${cid}\`${c.sinDocumento ? " (sin documento)" : ""}`, String(c.colecciones.users?.docs ?? 0), String(c.colecciones.patients?.docs ?? 0), String(c.documentos), mb(c.bytes)])),
    `## Por colección (todas las clínicas)`,
    tabla(["Colección", "Documentos", "Tamaño (MB)", "Documento más grande (MB)"], Object.entries(porColeccion)
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .map(([nombre, e]) => [`\`${nombre}\``, String(e.docs), mb(e.bytes), mb(e.mayor)])),
    `## Proyección para ${objetivo} clínicas`,
    proyeccion
      ? [
        `Con el promedio de las ${proyeccion.clinicasReales} clínicas reales (${mb(proyeccion.promedioPorClinica)} MB cada una):`,
        tabla(["", "Tamaño"], [
          [`Datos exportados (JSON) con ${objetivo} clínicas`, `${gb(proyeccion.exportado)} GB`],
          [`En Postgres (×${FACTOR_POSTGRES}: índices y relleno; estimación)`, `${gb(proyeccion.enPostgres)} GB`],
        ]),
        `Los 160 GB del servidor mínimo del spec alcanzan si el total en Postgres queda bien por debajo; los 240 GB recomendados dejan lugar a los respaldos locales y al crecimiento.`,
      ].join("\n\n")
      : `Todavía no hay clínicas reales (solo la demo): no hay promedio para proyectar.`,
    `## Tipos de dato que no son JSON puro`,
    hallazgos.length
      ? tabla(["Tipo", "Veces"], hallazgos.map(([tipo, n]) => [tipo, String(n)]))
      : `Ninguno: todo es texto, números, booleanos, mapas y arreglos (lo esperado: la app guarda las fechas como texto ISO).`,
  ];

  if (manifiesto.noLeidas.length) {
    // Un 401 es «token vencido o inválido» (el de firebase-cli dura 1 hora): cambiar de credencial no lo arregla. Solo un 403 u otro permiso negado
    // puede deberse a la credencial (la que lee todo es firebase-cli); una falla de red o del servidor no tiene que ver con eso.
    const hay401 = manifiesto.noLeidas.some((n) => n.estado === 401);
    const hayPermiso = manifiesto.noLeidas.some((n) => n.permiso && n.estado !== 401);
    partes.push(`## ⚠️ Lo que NO se pudo leer`, tabla(["Ruta", "Respuesta", "Por permiso"], manifiesto.noLeidas.map((n) => [`\`${n.ruta}\``, String(n.estado ?? "sin conexión"), n.permiso ? "sí" : "no"])),
      `La exportación está **incompleta**: no sirve para migrar hasta que esto quede vacío${hayPermiso ? " (probá con `--credencial firebase-cli`)" : ""}.`);
    if (hay401) partes.push(`Un 401 significa que el token venció (dura 1 hora) o no es válido: volvé a correr la exportación.`);
  }
  const desconocidas = [...manifiesto.desconocidas.raiz.map((c) => `\`${c}\` (primer nivel)`), ...Object.entries(manifiesto.desconocidas.clinicas).flatMap(([cid, cs]) => cs.map((c) => `\`clinics/${cid}/${c}\``))];
  if (desconocidas.length) partes.push(`## Colecciones que no están en el manifiesto`, `Se exportaron igual, pero hay que decidir qué hacer con ellas (¿falta sumarlas a \`lib/backend/colecciones.json\`?): ${desconocidas.join(", ")}.`);
  if (manifiesto.documentosFantasma.length) partes.push(`## Documentos que no existen pero tienen subcolecciones`, manifiesto.documentosFantasma.map((r) => `- \`${r}\``).join("\n"));
  if (manifiesto.noMigradas.length) partes.push(`## No se migran`, manifiesto.noMigradas.map((c) => `- \`${c}\` (la lista de usuarios de servicio de Firebase: en Supabase no existe)`).join("\n"));
  if (manifiesto.mayores.length) partes.push(`## Los ${manifiesto.mayores.length} documentos más grandes`, tabla(["Documento", "Tamaño (MB)"], manifiesto.mayores.map((m) => [`\`${m.ruta}/${m.id}\``, mb(m.bytes)])));
  return `${partes.join("\n\n")}\n`;
}
