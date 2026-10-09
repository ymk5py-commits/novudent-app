/** Decodifica los valores de la API REST de Firestore (`{ stringValue: "…" }`, `{ integerValue: "30" }`, …) a JSON puro, y cuenta lo que no es
 *  JSON puro (fechas, puntos, referencias, bytes) para que el informe de la exportación lo muestre: la app guarda fechas como texto ISO, así
 *  que lo esperado es que esos contadores den 0. Solo lectura, sin dependencias: lo usa `exportar-firestore.mjs`. */

export function nuevosHallazgos() {
  return { timestamp: 0, geopoint: 0, referencia: 0, bytes: 0, enteroGrande: 0, decimalEspecial: 0, desconocido: 0 };
}

/** @param {Record<string, any> | undefined} v @param {ReturnType<typeof nuevosHallazgos>} hallazgos */
export function decodificarValor(v, hallazgos) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) {
    const n = Number(v.integerValue);
    if (Number.isSafeInteger(n)) return n;
    hallazgos.enteroGrande++; // no entra en un número de JSON sin perder dígitos: se conserva como texto
    return String(v.integerValue);
  }
  if ("doubleValue" in v) {
    if (typeof v.doubleValue === "number") return v.doubleValue;
    hallazgos.decimalEspecial++; // «NaN», «Infinity»: no existen en JSON
    return String(v.doubleValue);
  }
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) { hallazgos.timestamp++; return v.timestampValue; }
  if ("geoPointValue" in v) { hallazgos.geopoint++; return { latitude: v.geoPointValue.latitude ?? 0, longitude: v.geoPointValue.longitude ?? 0 }; }
  if ("referenceValue" in v) { hallazgos.referencia++; return v.referenceValue; }
  if ("bytesValue" in v) { hallazgos.bytes++; return v.bytesValue; }
  if ("mapValue" in v) return decodificarCampos(v.mapValue?.fields, hallazgos);
  if ("arrayValue" in v) return (v.arrayValue?.values ?? []).map((x) => decodificarValor(x, hallazgos));
  hallazgos.desconocido++;
  return null;
}

export function decodificarCampos(campos, hallazgos) {
  const salida = {};
  for (const [clave, valor] of Object.entries(campos ?? {})) salida[clave] = decodificarValor(valor, hallazgos);
  return salida;
}

/** Un documento de la lista de la API → `{ id, data, fantasma }`. «Fantasma» = el documento no existe pero tiene subcolecciones (la API lo
 *  devuelve con `showMissing=true`, solo con su nombre). La API devuelve los nombres sin codificar (como vienen del Firestore interno). */
export function decodificarDocumento(documento, hallazgos) {
  const id = String(documento.name).split("/").pop();
  const fantasma = !documento.createTime && !documento.fields;
  return { id, data: fantasma ? {} : decodificarCampos(documento.fields, hallazgos), fantasma };
}
