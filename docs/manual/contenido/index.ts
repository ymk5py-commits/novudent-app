import type { Capitulo, CapituloId, Procedimiento } from "./tipos";
import { CAPITULOS_META } from "./capitulos";
import { procedimientos as todos } from "./todos";
import { procedimientos as recepcion } from "./recepcion";
import { procedimientos as caja } from "./caja";
import { procedimientos as dentista } from "./dentista";
import { procedimientos as asistente } from "./asistente";
import { procedimientos as adminConfiguracion } from "./admin-configuracion";
import { procedimientos as adminGestion } from "./admin-gestion";

/** Los módulos de cada capítulo. Un capítulo puede repartirse en varios archivos (el de Administrador, en dos). */
const MODULOS: Record<CapituloId, Procedimiento[][]> = {
  todos: [todos],
  receptionist: [recepcion],
  cashier: [caja],
  dentist: [dentista],
  assistant: [asistente],
  admin: [adminConfiguracion, adminGestion],
};

/** Todos los capítulos del manual. El orden en que se imprimen lo fija `ORDEN_CAPITULOS` en `montar.ts`. */
export const CAPITULOS: Capitulo[] = (Object.keys(MODULOS) as CapituloId[]).map((id) => ({
  id,
  ...CAPITULOS_META[id],
  procedimientos: MODULOS[id].flat(),
}));
