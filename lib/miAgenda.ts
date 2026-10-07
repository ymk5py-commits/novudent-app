/** «Mi agenda» (Inicio): lo que le toca a la persona que entró, hoy o esta semana.
 *
 *  Junta tres cosas en una sola lista de ítems:
 *  - sus tareas propias (las de la bandeja de tipo «personalizada», que se tildan desde acá),
 *  - las automáticas de la bandeja que le asignaron (solo lectura: se trabajan en la bandeja),
 *  - la rutina del día (confirmar citas de mañana, documentos, caja, stock, reservas online), que
 *    sale del estado de la clínica y por eso se tacha sola cuando se resuelve.
 *
 *  Módulo PURO: no importa React, ni Firestore, ni el store. Todo entra por parámetro. */
import { diaDe, fechaCorta, sumarDias, type FilaTarea } from "./tareas";
import { etiquetaAutoCierre } from "./tareasAuto";
import { HREF_DOCUMENTOS_PENDIENTES } from "./pendientes";
import type { Permission } from "./rbac";
import type { Appointment, CashSession, StockItem } from "./types";

export type Ambito = "hoy" | "semana";

/** Rango inclusivo de días calendario (YYYY-MM-DD). */
export interface Rango { desde: string; hasta: string }

/** «Hoy», o la semana (lunes a domingo) que contiene a hoy. */
export function rangoDe(ambito: Ambito, hoy: string): Rango {
  if (ambito === "hoy") return { desde: hoy, hasta: hoy };
  const dow = new Date(`${hoy}T00:00:00Z`).getUTCDay(); // 0 = domingo
  const desde = sumarDias(hoy, -((dow + 6) % 7));
  return { desde, hasta: sumarDias(desde, 6) };
}

export interface ItemAgenda {
  /** Estable: sirve de `key` y de ancla en los tests. */
  id: string;
  origen: "propia" | "rutina" | "automatica";
  titulo: string;
  detalle?: string;
  /** Día de la agenda en el que va (YYYY-MM-DD). */
  fecha: string;
  hecha: boolean;
  /** Cómo quedó hecha: la tildé yo, o se tachó sola (la rutina se resolvió, el paciente pagó…). */
  hechaPor?: "mano" | "sola";
  /** Pendiente y de un día que ya pasó. */
  atrasada: boolean;
  /** A dónde ir a resolverla (rutina y automáticas). */
  href?: string;
  paciente?: { id: string; nombre: string };
  /** Lo que hace el casillero. Sin valor, el ítem es de solo lectura. */
  accion?: "tildar" | "destildar";
  /** Una tarea propia se puede borrar; las automáticas de la bandeja y la rutina no. */
  eliminable?: true;
  /** «Se tacha sola cuando…» (solo propias pendientes que lo esperan). */
  leyenda?: string;
  /** La fila de la bandeja de la que sale (propias y automáticas): es lo que se tilda. */
  fila?: FilaTarea;
}

/** A dónde lleva una tarea de la bandeja: su día, con la tarea elegida. */
export function linkTarea(f: Pick<FilaTarea, "id" | "fecha">): string {
  return `/app/tareas?fecha=${f.fecha}&tarea=${encodeURIComponent(f.id)}`;
}

/** ¿Me toca a mí? La propia que creé y no delegué, o la que me asignaron. Las automáticas de la
 *  bandeja (cobranza, captura…) no son de nadie hasta que alguien las asigna. */
export function esMia(f: Pick<FilaTarea, "derivedKey" | "assigneeId" | "createdBy">, yo: string): boolean {
  if (f.assigneeId) return f.assigneeId === yo;
  return !f.derivedKey && f.createdBy === yo;
}

/** Mis tareas de la bandeja, en el rango pedido. Lo pendiente que ya venció va siempre (atrasada). */
export function itemsDeTareas(
  filas: readonly FilaTarea[],
  o: { yo: string; hoy: string; rango: Rango; nombrePaciente: (f: FilaTarea) => string | undefined },
): ItemAgenda[] {
  const out: ItemAgenda[] = [];
  for (const f of filas) {
    if (!esMia(f, o.yo)) continue;
    const hecha = f.estado !== "pendiente";
    const atrasada = !hecha && f.fecha < o.hoy;
    if (!atrasada && (f.fecha < o.rango.desde || f.fecha > o.rango.hasta)) continue;
    const propia = !f.derivedKey;
    const item: ItemAgenda = {
      id: `${propia ? "propia" : "auto"}:${f.id}`,
      origen: propia ? "propia" : "automatica",
      titulo: f.title,
      fecha: f.fecha,
      hecha,
      atrasada,
      fila: f,
    };
    if (f.detail) item.detalle = f.detail;
    if (hecha) item.hechaPor = f.estado === "sistema" ? "sola" : "mano";
    if (f.patientId) item.paciente = { id: f.patientId, nombre: o.nombrePaciente(f) ?? f.patientName ?? "Paciente" };
    if (propia) {
      item.eliminable = true;
      if (!hecha) item.accion = "tildar";
      // Solo se destilda lo que se cerró con «se ejecutó»: un «OK» (que la reactiva a la semana) o un
      // «volver a contactar» son otra cosa y se ven en la bandeja.
      else if (f.estado === "completada" && f.gestion?.accion === "cerrar") item.accion = "destildar";
    } else {
      item.href = linkTarea(f);
    }
    if (!hecha && f.autoCierre) item.leyenda = etiquetaAutoCierre(f.autoCierre);
    out.push(item);
  }
  return out;
}

/* ─── Rutina del día ──────────────────────────────────────────────────────── */

/** Lo que la rutina necesita saber de la clínica y de quien la mira. */
export interface DatosRutina {
  /** Hoy, en hora local (YYYY-MM-DD). */
  hoy: string;
  puede: (p: Permission) => boolean;
  /** ¿Ve la agenda de este profesional? (alcance por doctor) */
  veDoctor: (dentistId: string | undefined) => boolean;
  tieneCaja: boolean;
  tieneInventario: boolean;
  appointments: readonly Pick<Appointment, "id" | "dentistId" | "start" | "status" | "source">[];
  /** Pacientes con documentos clínicos pendientes (`pendientesPorPaciente().size`). */
  documentosPendientes: number;
  stock: readonly Pick<StockItem, "name" | "stock" | "minStock">[];
  cashSessions: readonly Pick<CashSession, "status" | "openedAt" | "closedAt" | "userName">[];
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** «Uno» · «Uno y Dos» · «Uno, Dos y Tres» · «Uno, Dos, Tres y 2 más». */
function listaCorta(nombres: string[], max = 3): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  if (nombres.length <= max) return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  return `${nombres.slice(0, max).join(", ")} y ${nombres.length - max} más`;
}

/** La rutina de hoy. Cada punto se calcula del estado de la clínica, así que se tacha solo cuando se
 *  resuelve; sin permiso, sin el plan, o sin nada que la sustente (no hay citas mañana, nunca hubo una
 *  reserva online), no aparece. */
export function rutinaDeHoy(d: DatosRutina): ItemAgenda[] {
  const out: ItemAgenda[] = [];
  const punto = (clave: string, titulo: string, pendienteDetalle: string | null, hechoDetalle: string, href: string) => {
    out.push({
      id: `rutina:${clave}`, origen: "rutina", titulo, fecha: d.hoy, atrasada: false, href,
      hecha: pendienteDetalle === null,
      ...(pendienteDetalle === null ? { hechaPor: "sola" as const, detalle: hechoDetalle } : { detalle: pendienteDetalle }),
    });
  };
  const visibles = d.appointments.filter((a) => d.veDoctor(a.dentistId));

  // Confirmar las citas de mañana.
  if (d.puede("agenda.edit")) {
    const manana = sumarDias(d.hoy, 1);
    const deManana = visibles.filter((a) => diaDe(a.start) === manana && a.status !== "cancelada" && a.status !== "ausente");
    if (deManana.length > 0) {
      const sin = deManana.filter((a) => a.status === "pendiente").length;
      punto(
        "citas-manana", "Confirmar las citas de mañana",
        sin > 0 ? `${sin} de ${deManana.length} sin confirmar` : null,
        deManana.length === 1 ? "La cita de mañana está confirmada" : `Las ${deManana.length} citas de mañana están confirmadas`,
        "/app/agenda",
      );
    }
  }

  // Validar las reservas que entraron por la web. Solo si la clínica las recibe.
  if (d.puede("agenda.edit")) {
    const online = visibles.filter((a) => a.source === "online");
    if (online.length > 0) {
      const por = online.filter((a) => a.status === "pendiente" && diaDe(a.start) >= d.hoy).length;
      punto("reservas", "Validar las reservas online", por > 0 ? `${por} por validar` : null, "No hay reservas por validar", "/app/agenda");
    }
  }

  // Documentos clínicos pendientes.
  if (d.puede("engagement.forms")) {
    const n = d.documentosPendientes;
    punto(
      "documentos", "Completar los documentos clínicos pendientes",
      n > 0 ? `${n} ${plural(n, "paciente con documentos pendientes", "pacientes con documentos pendientes")}` : null,
      "No hay documentos pendientes", HREF_DOCUMENTOS_PENDIENTES,
    );
  }

  // Cerrar la caja.
  if (d.tieneCaja && d.puede("payments.manage")) {
    const abiertas = d.cashSessions.filter((s) => s.status === "abierta");
    if (abiertas.length > 0) {
      const desde = diaDe(abiertas[0].openedAt);
      punto(
        "caja", "Cerrar la caja",
        abiertas.length > 1 ? `${abiertas.length} cajas abiertas`
          : desde < d.hoy ? `Quedó abierta desde el ${fechaCorta(desde, d.hoy)}` : `Abierta por ${abiertas[0].userName}`,
        "", "/app/caja",
      );
    } else if (d.cashSessions.some((s) => s.closedAt && diaDe(s.closedAt) === d.hoy)) {
      punto("caja", "Cerrar la caja", null, "La caja de hoy está cerrada", "/app/caja");
    }
  }

  // Reponer lo que está bajo el mínimo.
  if (d.tieneInventario && d.puede("inventory.manage") && d.stock.length > 0) {
    const bajo = d.stock.filter((s) => s.stock <= s.minStock);
    punto(
      "stock", "Reponer el stock bajo",
      bajo.length > 0 ? `${bajo.length} ${plural(bajo.length, "insumo", "insumos")}: ${listaCorta(bajo.map((s) => s.name))}` : null,
      "El stock está al día", "/app/inventario",
    );
  }
  return out;
}

/* ─── La agenda armada ────────────────────────────────────────────────────── */

export interface Agenda {
  ambito: Ambito;
  rango: Rango;
  /** Lo que falta: primero lo atrasado, después por día. */
  pendientes: ItemAgenda[];
  hechas: ItemAgenda[];
  atrasadas: ItemAgenda[];
  /** Los ítems del rango agrupados por día (con sus hechas), sin las atrasadas. Solo días con algo. */
  dias: { fecha: string; items: ItemAgenda[] }[];
  total: number;
  hechasN: number;
  /** 0 a 1. */
  avance: number;
}

const ORDEN_ORIGEN: Record<ItemAgenda["origen"], number> = { rutina: 0, propia: 1, automatica: 2 };

/** Orden estable dentro de un día: rutina, propias, automáticas; después por título. Tildar un ítem no
 *  lo cambia de lugar en la vista por día (no se reacomoda bajo el cursor). */
const porOrigenYTitulo = (a: ItemAgenda, b: ItemAgenda) =>
  ORDEN_ORIGEN[a.origen] - ORDEN_ORIGEN[b.origen] || a.titulo.localeCompare(b.titulo, "es") || a.id.localeCompare(b.id);
const porDiaYLuego = (a: ItemAgenda, b: ItemAgenda) => a.fecha.localeCompare(b.fecha) || porOrigenYTitulo(a, b);

export function armarAgenda(items: readonly ItemAgenda[], ambito: Ambito, hoy: string): Agenda {
  const ordenados = [...items].sort(porDiaYLuego);
  const atrasadas = ordenados.filter((i) => i.atrasada);
  const delRango = ordenados.filter((i) => !i.atrasada);
  const dias: Agenda["dias"] = [];
  for (const i of delRango) {
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.fecha === i.fecha) ultimo.items.push(i);
    else dias.push({ fecha: i.fecha, items: [i] });
  }
  const hechasN = items.filter((i) => i.hecha).length;
  return {
    ambito,
    rango: rangoDe(ambito, hoy),
    pendientes: [...atrasadas, ...delRango.filter((i) => !i.hecha)],
    hechas: ordenados.filter((i) => i.hecha),
    atrasadas,
    dias,
    total: items.length,
    hechasN,
    avance: items.length === 0 ? 0 : hechasN / items.length,
  };
}
