/** Tipos del manual de procedimientos (ver docs/superpowers/specs/2026-10-07-manual-de-procedimientos-design.md).
 *
 *  Este archivo es solo de tipos: los capítulos que lo importan NO traen Playwright en tiempo de ejecución,
 *  así `npm test` puede cargarlos para validarlos. Lo de Playwright llega por el `Captor` que recibe `capturar`. */
import type { Locator, Page, expect as Expect } from "@playwright/test";

export type RolId = "admin" | "cashier" | "receptionist" | "dentist" | "assistant";
/** Un capítulo es «Para todos» o el de un rol. */
export type CapituloId = "todos" | RolId;

export interface OpcionesFoto {
  /** Lo que hay que tocar: se marca con un recuadro rojo (numerado si son varios). */
  resaltar?: Locator | Locator[];
  /** Lo que se recorta de la pantalla; sin esto sale la ventana entera. Lo resaltado se suma al recorte. */
  recorte?: Locator | Locator[];
  /** Margen en px alrededor del recorte y de lo resaltado (por defecto 14). */
  margen?: number;
  /** Milisegundos de espera antes de sacar la foto, para que terminen las animaciones (por defecto 450). */
  esperar?: number;
  /** Deja el botón flotante de Ayuda (por defecto se esconde: tapa la esquina). */
  conAyuda?: boolean;
  /** Deja el foco y el mouse donde quedaron (por defecto se sacan: si no, queda un botón «apretado» o iluminado que no es el que se explica). */
  conFoco?: boolean;
  /** Saca la ventana entera aunque haya recuadros resaltados (por defecto se recorta alrededor de lo resaltado). */
  pantalla?: boolean;
  /** Esconde esto (visibility:hidden, sin mover nada) solo mientras se saca la foto: para tapar un pedazo de pantalla que no tiene que
   *  salir (el pie «Plataforma de soporte» cortado por un menú, una etiqueta ajena a la clínica, una URL local). */
  ocultar?: Locator | Locator[];
  /** Alto de la ventana para esta captura (por defecto 760 px). Para mostrar algo más alto que la pantalla. */
  alto?: number;
}

/** Lo que recibe `capturar`: la página, el `expect` de Playwright y las tres cosas que hace falta saber del manual. */
export interface Captor {
  page: Page;
  expect: typeof Expect;
  /** Entra a la demo con ese rol (y va a `ruta` si se la da). Cada procedimiento arranca con la demo recién sembrada. */
  entrar(rol: RolId, ruta?: string): Promise<void>;
  /** Va a una ruta de la app y espera a que cargue. */
  ir(ruta: string): Promise<void>;
  /** Saca la captura `nombre` de este procedimiento. */
  foto(nombre: string, o?: OpcionesFoto): Promise<void>;
  /** Los textos del menú de arriba, tal como los ve este rol. */
  menu(): Promise<string[]>;
}

export interface Aviso {
  /** «ojo»: lo que puede salir mal · «tip»: un atajo · «revisar»: lo que hay que confirmar con Angel y Camila ·
   *  «error»: algo de la app que no funciona como debería (no es una decisión: es para el equipo de desarrollo; se saca cuando se corrige). */
  tipo: "ojo" | "tip" | "revisar" | "error";
  texto: string;
}

export interface Paso {
  /** Instrucción en voseo. Marcas: **negrita**, «Botón o menú», [[id-de-otro-procedimiento]]. */
  texto: string;
  /** Nombre de la captura (la que se saca con `c.foto(nombre)`). Sin captura, el paso va solo con texto. */
  captura?: string;
}

export interface Procedimiento {
  /** Único en todo el manual, en minúsculas y con guiones: «dar-una-cita». */
  id: string;
  /** El capítulo en el que vive. */
  capitulo: CapituloId;
  /** Empieza con un verbo en infinitivo: «Dar una cita». */
  titulo: string;
  /** Todos los roles que lo hacen (aparece en el índice de cada uno). */
  roles: RolId[];
  /** Roles que no lo hacen pero cuya pantalla se muestra como resultado («así la ve ella»): `capturar` puede entrar como ellos. */
  verComo?: RolId[];
  /** Cuándo se usa, en una o dos frases. */
  paraQue: string;
  /** Lo que tiene que estar listo antes de empezar. */
  antes?: string[];
  pasos: Paso[];
  avisos?: Aviso[];
  /** Recorre la app y saca las capturas. Corre en Playwright, contra la demo local. */
  capturar?: (c: Captor) => Promise<void>;
}

export interface Capitulo {
  id: CapituloId;
  titulo: string;
  /** Un párrafo: cómo es el día de esta persona. Lo que ve y no ve el rol lo arma el generador desde `lib/rbac.ts`. */
  intro: string;
  procedimientos: Procedimiento[];
}
