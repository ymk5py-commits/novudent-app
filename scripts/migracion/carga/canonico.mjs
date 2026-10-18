/** La forma canónica de un documento y su SHA-256, para comparar «lo que se exportó» con «lo que quedó en Postgres».
 *
 *  Postgres guarda `jsonb`: reordena las claves, normaliza los espacios y los números. Por eso el hash NO puede ser el de la línea cruda del
 *  archivo (el manifiesto ya trae ese, por colección): se calcula sobre una forma canónica, con las claves ordenadas, que da lo mismo antes de
 *  entrar a la base y después de leerla. Es la misma función para los dos lados. */
import { createHash } from "node:crypto";

/** JSON con las claves de cada objeto ordenadas (por unidad de código, como `Array.prototype.sort`); los arreglos conservan su orden. */
export function canonizar(valor) {
  if (Array.isArray(valor)) return `[${valor.map(canonizar).join(",")}]`;
  if (valor && typeof valor === "object") {
    return `{${Object.keys(valor).sort().map((k) => `${JSON.stringify(k)}:${canonizar(valor[k])}`).join(",")}}`;
  }
  return JSON.stringify(valor);
}

/** SHA-256 (hexadecimal) del documento `{ id, data }` en su forma canónica. */
export function hashDeDocumento(id, data) {
  return createHash("sha256").update(canonizar({ id, data })).digest("hex");
}
