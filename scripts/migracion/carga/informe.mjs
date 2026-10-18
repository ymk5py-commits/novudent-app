/** El informe de la carga (Markdown): cantidades por colección contra el manifiesto, la comparación SHA-256 documento por documento y la lista de diferencias.
 *  Muestra ids y números, nunca el contenido de un documento ni ninguna clave. */

const fila = (...celdas) => `| ${celdas.join(" | ")} |`;
const tabla = (cabecera, filas) => [fila(...cabecera), fila(...cabecera.map(() => "---")), ...filas.map((f) => fila(...f))].join("\n");
const TOPE_DE_IDS = 20;

const nombreDe = (clinica, coleccion) => (clinica ? `clinics/${clinica}/${coleccion}` : coleccion);
/** Colecciones cuyo id es una credencial: `checkoutTokens/{token}` ata un pago a una clínica. Sus ids nunca se muestran, solo cuántos son. */
const CON_ID_SECRETO = new Set(["checkoutTokens"]);
const ids = (lista, coleccion) => {
  if (CON_ID_SECRETO.has(coleccion)) return `${lista.length} ids ocultos (son credenciales)`;
  const vistos = lista.slice(0, TOPE_DE_IDS).map((id) => `\`${id}\``).join(", ");
  return lista.length > TOPE_DE_IDS ? `${vistos} … y ${lista.length - TOPE_DE_IDS} más` : vistos;
};

const TITULOS = {
  cargar: "Informe de carga a Postgres",
  "solo-verificar": "Informe de verificación (solo lectura)",
  simulacro: "SIMULACRO de carga a Postgres",
};

/** @param {any} informe  lo que devuelve `ejecutarCarga` */
export function armarInforme(informe) {
  const simulacro = informe.modo === "simulacro";
  const t = informe.totales;
  const partes = [`# ${TITULOS[informe.modo]}`];

  partes.push([
    simulacro ? "**SIMULACRO: no se escribió nada** (ni documentos ni cuentas de GoTrue)." : "",
    informe.destino ? `Destino: \`${informe.destino}\`.` : "Sin base de destino: solo se validó la exportación.",
    informe.generado ? `Exportación generada el ${informe.generado}.` : "",
  ].filter(Boolean).join(" "));

  if (simulacro) {
    partes.push(informe.base
      ? `## Plan\nSe insertarían **${t.faltan}** documentos, se actualizarían **${t.distintos}**, **${t.iguales}** ya están iguales y quedarían **${t.sobran}** que no están en la exportación (el cargador nunca borra). Se crearían **${informe.usuarios.porCrear}** cuentas de GoTrue.`
      : `## Resultado\nLos ${informe.archivos.verificados} archivos de la exportación coinciden con el manifiesto. Para ver el plan completo pasá \`--url-base\` y \`--url-gotrue\`.`);
  } else {
    partes.push(informe.ok
      ? `## ✅ SIN DIFERENCIAS\nLos ${t.iguales} documentos de la base son idénticos a la exportación (SHA-256 documento por documento) y las cantidades coinciden con el manifiesto.`
      : `## ❌ HAY DIFERENCIAS (${t.diferencias})\nFaltan **${t.faltan}** documentos, **${t.distintos}** son distintos y **${t.sobran}** están en la base sin estar en la exportación${t.cargados.fallidos ? `; **${t.cargados.fallidos}** no se pudieron cargar` : ""}.`);
  }

  partes.push(`## Archivos de la exportación\n${informe.archivos.verificados} archivos: SHA-256, tamaño y cantidad de documentos coinciden con el manifiesto${informe.archivos.problemas.length ? ` — ¡excepto ${informe.archivos.problemas.length}!` : ""}.`);

  const u = informe.usuarios;
  partes.push([
    "## Cuentas de GoTrue",
    tabla(["Qué", "Cantidad"], [
      ["Usuarios reales (con authUid y correo)", String(u.reales)],
      ["Usuarios de la demo (sin authUid: no se migran)", String(u.deLaDemo)],
      [simulacro ? "Cuentas que ya existen" : "Cuentas ya existentes", String(u.existentes)],
      [simulacro || informe.modo === "solo-verificar" ? "Cuentas que faltan crear" : "Cuentas creadas", String(simulacro || informe.modo === "solo-verificar" ? u.porCrear : u.creados)],
    ]),
    "Cada documento de usuario conserva su `id`; solo `authUid` pasa a ser el uuid de GoTrue. Las cuentas se crean sin contraseña: cada persona elige la suya por correo.",
  ].join("\n\n"));

  if (informe.base) {
    const cabecera = ["Colección", "Manifiesto", "Base", "Iguales (SHA-256)", simulacro ? "Se insertarían" : "Faltan", simulacro ? "Se actualizarían" : "Distintos", "Sobran"];
    if (informe.modo === "cargar") cabecera.push("Carga: ins/act/igual/fallidos");
    partes.push(["## Cantidades por colección", tabla(cabecera, informe.colecciones.map((f) => {
      const celdas = [nombreDe(f.clinica, f.coleccion), String(f.manifiesto.docs), String(f.base.docs), String(f.iguales), String(f.faltan.length), String(f.distintos.length), String(f.sobran.length)];
      if (informe.modo === "cargar") celdas.push(f.carga ? `${f.carga.insertados}/${f.carga.actualizados}/${f.carga.iguales}/${f.carga.fallidos.length}` : "—");
      return celdas;
    })), `Total: manifiesto ${t.manifiesto} · base ${t.base} · iguales ${t.iguales}.`].join("\n\n"));
  }

  const conDiferencias = informe.colecciones.filter((f) => f.faltan.length || f.distintos.length || f.sobran.length || f.carga?.fallidos.length);
  if (conDiferencias.length) {
    const lineas = [];
    for (const f of conDiferencias) {
      const n = nombreDe(f.clinica, f.coleccion);
      if (f.carga?.fallidos.length) lineas.push(`- **${n}** — no se pudo cargar: ${f.carga.fallidos.slice(0, TOPE_DE_IDS).map((x) => (CON_ID_SECRETO.has(f.coleccion) ? `(id oculto) (${x.codigo ?? "error"}: ${x.mensaje})` : `\`${x.id}\` (${x.codigo ?? "error"}: ${x.mensaje})`)).join(", ")}`);
      if (f.faltan.length) lineas.push(`- **${n}** — ${simulacro ? "se insertarían" : "faltan en la base"}: ${ids(f.faltan, f.coleccion)}`);
      if (f.distintos.length) lineas.push(`- **${n}** — ${simulacro ? "se actualizarían" : "distintos a la exportación"}: ${ids(f.distintos, f.coleccion)}`);
      if (f.sobran.length) lineas.push(`- **${n}** — sobran en la base: ${ids(f.sobran, f.coleccion)}`);
    }
    partes.push(["## Detalle", ...lineas].join("\n"));
  }
  if (informe.sobrantesDeClinicas.length) {
    partes.push(["## Clínicas en la base que no están en la exportación", tabla(["Colección", "Clínica", "Documentos"], informe.sobrantesDeClinicas.map((s) => [s.coleccion, `\`${s.clinica}\``, String(s.docs)])), "El cargador no borra nada: si esos datos no corresponden, hay que limpiarlos aparte."].join("\n\n"));
  }
  if (informe.advertencias.length) partes.push(["## Advertencias", ...informe.advertencias.map((a) => `- ${a}`)].join("\n"));
  return `${partes.join("\n\n")}\n`;
}
