/** Registro de escrituras a Firestore que fallaron.
 *
 *  EL PROBLEMA. El store escribe write-through: primero actualiza el estado local
 *  (la interfaz dice "guardado" al instante) y después manda el `setDoc`. Ese
 *  setDoc terminaba en `.catch((e) => console.warn(...))`. O sea: si Firestore
 *  rechazaba la escritura —permisos, suscripción vencida, red caída— el usuario
 *  veía su trabajo en pantalla, cerraba la sesión, y al volver no estaba. Sin un
 *  solo aviso. En una ficha clínica eso es perder una evolución o un pago
 *  cobrado.
 *
 *  POR QUÉ ACÁ Y NO EN REACT. Hay 83 llamadas a fsSave/fsDelete en el store, y
 *  refactorizarlas una por una para propagar el error sería enorme y riesgoso.
 *  Este módulo es un canal lateral: fsSave le avisa cuando algo falla y la
 *  interfaz se entera por suscripción. Cero cambios en los 83 puntos de llamada.
 *
 *  Es un módulo suelto (no un hook) a propósito: `fsSave` es un `useCallback`
 *  sin dependencias, así que no puede leer estado de React sin romper esa
 *  garantía. Un store externo con pub/sub sí puede llamarse desde ahí.
 */

export type CausaFallo = "permiso" | "suscripcion" | "conexion" | "desconocido";

export interface EscrituraFallida {
  /** Identidad estable: si la misma fila falla dos veces, es UN problema. */
  clave: string;
  coleccion: string;
  docId: string;
  causa: CausaFallo;
  detalle: string;
  /** epoch ms del último intento */
  cuando: number;
  /** Cuántas veces falló. Sube en vez de duplicar la entrada. */
  intentos: number;
  /** Reintento. Ausente en un borrado que no se puede reconstruir. */
  reintentar?: () => Promise<void>;
}

/** Traduce el error de Firestore a algo accionable.
 *
 *  La distinción importa de verdad: `permission-denied` NO se arregla
 *  reintentando —o le falta un rol, o la suscripción venció— así que ofrecer un
 *  botón de reintentar ahí sería mentirle al usuario. Un error de red sí. */
export function clasificarError(e: unknown): CausaFallo {
  const code = (e as { code?: string } | null)?.code ?? "";
  if (code === "permission-denied") return "permiso";
  if (
    code === "unavailable" ||
    code === "deadline-exceeded" ||
    code === "resource-exhausted" ||
    code === "aborted" ||
    code === "cancelled"
  ) return "conexion";
  return "desconocido";
}

/** La causa que se le muestra al usuario. `clasificarError` solo ve el error de Firestore y no sabe de suscripciones: con la suscripción
 *  vencida la clínica está en solo lectura y `firestore.rules` rechaza TODA escritura con `permission-denied`, igual que un rol sin permiso.
 *  Quien muestra el aviso sí sabe si la suscripción venció (`accessMode`), y en ese caso el rechazo es por la suscripción, no por el rol:
 *  decirle «no tenés permiso» mandaba a buscar un problema que no existe. */
export function causaMostrada(causa: CausaFallo, suscripcionVencida: boolean): CausaFallo {
  return causa === "permiso" && suscripcionVencida ? "suscripcion" : causa;
}

/** Lo que se le dice al usuario. Sin códigos ni jerga: qué pasó y qué hacer. */
export function mensajeDe(causa: CausaFallo): { titulo: string; ayuda: string } {
  switch (causa) {
    case "suscripcion":
      return {
        titulo: "No se guardó: la suscripción está vencida y la clínica está en solo lectura",
        ayuda:
          "Con la suscripción vencida se puede consultar y exportar todo, pero no guardar cambios. " +
          "Regularizá el pago en Administración › Suscripción y volvé a cargar lo que estabas haciendo — reintentar antes de pagar no lo va a resolver.",
      };
    case "permiso":
      return {
        titulo: "No se guardó: no tenés permiso para este cambio",
        ayuda:
          "Puede ser que tu rol no lo permita o que la suscripción de la clínica esté vencida. " +
          "Anotá lo que estabas cargando y avisale al administrador — reintentar no lo va a resolver.",
      };
    case "conexion":
      return {
        titulo: "No se guardó: se cortó la conexión",
        ayuda: "Revisá tu internet y reintentá. Lo que cargaste sigue en pantalla.",
      };
    default:
      return {
        titulo: "No se guardó",
        ayuda: "Algo falló al guardar en el servidor. Reintentá; si sigue, avisale al administrador.",
      };
  }
}

type Escucha = (fallos: EscrituraFallida[]) => void;

let fallos: EscrituraFallida[] = [];
const escuchas = new Set<Escucha>();

const avisar = () => {
  const copia = [...fallos];
  escuchas.forEach((f) => f(copia));
};

/** Se suscribe a los cambios. Devuelve la función para desuscribirse. */
export function suscribirFallos(fn: Escucha): () => void {
  escuchas.add(fn);
  fn([...fallos]);
  return () => { escuchas.delete(fn); };
}

/** Registra un fallo. Si la MISMA fila ya había fallado, suma un intento en vez
 *  de apilar entradas: cinco intentos de guardar el mismo paciente son un solo
 *  problema para quien lo está mirando, no cinco. */
export function registrarFallo(
  args: { coleccion: string; docId: string; causa: CausaFallo; detalle: string; reintentar?: () => Promise<void> },
  ahora: number = Date.now(),
): void {
  const clave = `${args.coleccion}/${args.docId}`;
  const previo = fallos.find((f) => f.clave === clave);
  if (previo) {
    previo.intentos += 1;
    previo.cuando = ahora;
    previo.causa = args.causa;
    previo.detalle = args.detalle;
    previo.reintentar = args.reintentar;
  } else {
    fallos = [...fallos, { clave, ...args, cuando: ahora, intentos: 1 }];
  }
  avisar();
}

/** Saca un fallo (se resolvió, o el usuario lo descartó). */
export function resolverFallo(clave: string): void {
  const antes = fallos.length;
  fallos = fallos.filter((f) => f.clave !== clave);
  if (fallos.length !== antes) avisar();
}

export function limpiarFallos(): void {
  if (fallos.length === 0) return;
  fallos = [];
  avisar();
}

export function fallosActuales(): EscrituraFallida[] {
  return [...fallos];
}

/** Reintenta todo lo reintentable. Lo que vuelva a fallar se re-registra solo
 *  (fsSave llama a registrarFallo de nuevo), así que acá solo se saca lo que
 *  salió bien. */
export async function reintentarTodo(): Promise<{ ok: number; fallaron: number }> {
  const candidatos = fallos.filter((f) => f.reintentar);
  let ok = 0, fallaron = 0;
  for (const f of candidatos) {
    try {
      await f.reintentar!();
      resolverFallo(f.clave);
      ok++;
    } catch {
      fallaron++; // fsSave ya lo volvió a registrar con el intento sumado
    }
  }
  return { ok, fallaron };
}

/** Manda una escritura a Firestore y deja el resultado en el registro, para que no se pierda en silencio: si falla queda el aviso
 *  «No se guardó» (con su causa y el botón de reintentar); si sale bien se saca el aviso viejo de esa fila.
 *
 *  Es lo que ya hacía `fsSave` para cada documento; se lo agrega acá para el documento de la clínica (su configuración), que
 *  terminaba en un `.catch(() => {})`: un link de pago, un plazo o una plantilla se veían guardados y no lo estaban.
 *
 *  `reintentar` es lo que corre el botón del aviso. Para un documento que se reescribe entero conviene que arme el cuerpo con el
 *  estado de AHORA: repetir el cuerpo viejo pisaría los cambios hechos después. Sin él se repite la misma escritura.
 *  Devuelve `true` si se guardó y `false` si no; nunca rechaza, así que se puede llamar sin esperar ni atajar nada. */
export async function vigilarEscritura(args: {
  coleccion: string;
  docId: string;
  escribir: () => Promise<unknown>;
  reintentar?: () => Promise<unknown>;
}): Promise<boolean> {
  const { coleccion, docId, escribir } = args;
  const reintento = args.reintentar ?? escribir;
  try {
    await escribir();
    resolverFallo(`${coleccion}/${docId}`);
    return true;
  } catch (e) {
    registrarFallo({
      coleccion, docId,
      causa: clasificarError(e),
      detalle: (e as { code?: string } | null)?.code ?? String(e),
      reintentar: async () => { await reintento(); },
    });
    return false;
  }
}
