# Diaria global como grilla, con menú por espacio — diseño

**Fecha:** 13-oct-2026 · **Pedido de:** Camila (por WhatsApp, vía Croman) · **Estado:** aprobado en conversación, falta revisar este documento
**Antecedente:** `docs/superpowers/specs/2026-10-08-pedidos-de-camila-agenda-ficha-plan-tareas.md` (frente A: menú por espacio en la Semanal).

## Contexto

El 8-oct la Semanal ganó un menú en cada espacio de 30 minutos: dar cita presencial o por videoconsulta, dar múltiples citas, sobreagendar y bloquear espacio (`components/agenda/GrillaSemanal.tsx`, geometría pura en `lib/agendaSemana.ts`). El 13-oct Camila escribió que «le doy click y no sale las opciones de bloquear espacio y las demás». Probó **como administradora**, en lo que llamó «Semanal global», y respondió «sí, en la diaria también» a la pregunta de si quería el menú en las vistas del día.

Como administradora, la Semanal sí muestra el menú (verificado en producción el 13-oct). Lo más probable es que estuviera en la **Diaria global**: en Dentalink esa vista vive en `/agendas/semanal2`, y en Novudent hoy son columnas de tarjetas por profesional, sin casilleros, así que tocar no hace nada. En Dentalink la Diaria global es **una grilla de un día con una columna por profesional** («la vista de recepción: se ve de un vistazo quién tiene hueco ahora», `docs/dentalink/04-agenda-crm-y-catalogos.md`). La Diaria de Dentalink es una tabla, como la de Novudent.

Ese mismo día se publicó otro arreglo: quien ve la agenda en solo lectura (dentista, asistente) ahora lo lee en un aviso (`AvisoSoloLectura`, main `3bc4455`).

## Decisiones (aprobadas por Croman el 13-oct)

1. **La Diaria global pasa a ser una grilla** de casilleros de 30 minutos, con una columna por profesional. La **Diaria (tabla) no cambia**.
2. **Fuera de horario: gris, pero se puede tocar igual.** Las horas en que el profesional no atiende (`User.horario`, o `HORARIO_POR_DEFECTO`: lunes a sábado de 08:00 a 18:00) se ven en gris; el menú se abre igual, y «Dar cita» ya avisa «No entra en el horario». Bloquear sigue andando.
3. **Una sola grilla para las dos vistas:** `GrillaSemanal` se generaliza en `GrillaAgenda`, que recibe sus columnas (7 días o N profesionales). Nada de copiar el componente.

## Alcance

**Entra:**
- Diaria global como grilla, con el mismo menú por espacio que la Semanal y **el profesional de la columna ya elegido** en «Dar cita» y en «Bloquear espacio».
- Gris fuera de horario en la Diaria global (por columna) y en la Semanal **cuando hay un solo profesional filtrado** (con «Todos los profesionales» cada uno tiene su horario, así que no se pinta).
- Manual de procedimientos y CLAUDE.md al día.

**No entra:** la Diaria (tabla), la Mensual, la Reprogramación; columnas por box (el filtro de box sigue igual); arrastrar citas; filtro por especialidad (Dentalink lo tiene, nadie lo pidió); una «Semanal global» con todos los profesionales lado a lado durante la semana (si Camila se refería a eso, es otro pedido).

## Diseño

### 1. Lógica pura — `lib/agendaGrilla.ts` (nuevo, con `lib/agendaGrilla.test.ts`)

```ts
/** Una columna de la grilla de la agenda: un día (Semanal) o un profesional en un día (Diaria global). */
export interface ColumnaDeAgenda {
  clave: string;          // estable: "d:2026-10-13" o "p:u2"
  titulo: string;         // "Lun" | "Dra. Sofía Benítez"
  subtitulo?: string;     // "12" | especialidad, si tiene
  fecha: Date;            // medianoche local del día de la columna
  dentistId?: string;     // solo en la Diaria global
  color?: string;         // el color del profesional (punto en el encabezado)
  esHoy: boolean;
}

export function columnasDeLaSemana(lunes: Date, hoy?: Date): ColumnaDeAgenda[];
export function columnasDelDia(fecha: Date, profesionales: Pick<User, "id" | "name" | "color" | "specialty">[], hoy?: Date): ColumnaDeAgenda[];

/** ¿Va esta cita / este bloqueo en esta columna? Semanal: mismo día. Diaria global: mismo día y mismo profesional; un bloqueo de
 *  «Todos los profesionales» (`dentistId: "*"`) va en todas las columnas. */
export function citaEnColumna(col: ColumnaDeAgenda, a: Pick<Appointment, "start" | "dentistId">): boolean;
export function bloqueoEnColumna(col: ColumnaDeAgenda, b: Pick<AgendaBlock, "start" | "dentistId">): boolean;

/** ¿La celda [hora, hora + paso) cae fuera del horario de atención? Fuera = el día no está en `dias`, o la celda empieza antes de
 *  `desde` o termina después de `hasta`. Sin horario cargado, `HORARIO_POR_DEFECTO`. */
export function fueraDeHorario(horario: Horario | undefined, fecha: Date, hora: string, paso?: number): boolean;
```

`lib/agendaSemana.ts` conserva lo que ya tiene (celdas, posición, superposición, `tituloDeEspacio`). La etiqueta de un espacio de la Diaria global suma el profesional: `«Dra. Sofía Benítez · Mar 13 oct · 09:30»` (`tituloDeEspacio(fecha, hora, profesional?)`); la de la Semanal queda igual, así las pruebas actuales siguen valiendo.

### 2. Componente — `components/agenda/GrillaAgenda.tsx` (reemplaza a `GrillaSemanal.tsx`)

Mismo comportamiento de hoy, con las columnas como dato:

```ts
GrillaAgenda({
  columnas: ColumnaDeAgenda[];
  citas: Appointment[];        // ya filtradas
  bloqueos: AgendaBlock[];     // ya filtrados
  gridRef; puedeAgendar; puedeBloquear;
  /** Si está, pinta en gris las celdas fuera de horario de esa columna. */
  fueraDeHorario?: (col: ColumnaDeAgenda, hora: string) => boolean;
  onVer; onSobreagendar; onQuitarBloqueos;
  onAccion: (accion: AccionEspacio, fecha: Date, hora: string, dentistId?: string) => void;
})
```

- Plantilla de columnas: `56px repeat(N, minmax(<mínimo>, 1fr))`. Semanal: el ancho mínimo de hoy (unos tres días por pantalla en el celular). Diaria global: unos **150 px por profesional**; con muchos profesionales o en el celular se recorre de costado. Horas fijas a la izquierda y encabezado fijo arriba, como hoy.
- Encabezado de la Diaria global: punto con el color del profesional, nombre (truncado, con `title`) y especialidad.
- Celdas fuera de horario: fondo gris claro (distinto del rayado de los bloqueos) y `aria-label` con «· fuera de horario» al final; siguen siendo botones con el menú.
- El menú del espacio, el menú del bloqueo, el «+» de sobreagendar, el comentario de la cita y la superposición en columnas funcionan igual en las dos vistas.
- Sin permisos de agenda: sin menú, sin «+» y sin quitar bloqueos (igual que hoy); el aviso `AvisoSoloLectura` ya sale arriba.

### 3. Página — `app/app/agenda/page.tsx`

- **Diaria global:** reemplaza las columnas de tarjetas por `GrillaAgenda` con `columnasDelDia(day, profesionales)`. Profesionales = los dentistas que ve la persona (`alcance.veDoctor`), filtrados por el selector de profesional. Las citas pasan por los mismos filtros de hoy (sucursal, box, estados de la izquierda y «solo reservas online»). Los bloqueos, `bloqueosDelDia`. `fueraDeHorario` usa el `horario` de cada profesional. Al entrar a la vista, la grilla baja a las 08:00 (como la Semanal). Si no queda ningún profesional por mostrar: «No hay profesionales para mostrar con estos filtros.».
- **Semanal:** usa `GrillaAgenda` con `columnasDeLaSemana(weekStart)`. Si hay un profesional filtrado, pasa `fueraDeHorario` con su horario.
- `accionEspacio(accion, fecha, hora, dentistId?)`: con `dentistId`, «Dar cita» abre con ese profesional (`citaBase({ dentistId })`) y «Bloquear espacio» con ese profesional elegido (`BloquearEspacio` ya recibe `dentistId`). Sin `dentistId`, como hoy (el profesional del filtro).
- La columna izquierda de la vista del día (fecha, profesional, sucursal, estados) sigue igual en la Diaria global.

### 4. Manual y documentación

- `docs/manual/contenido/recepcion.ts`: el paso de la Diaria global (hoy «ves el día con una columna por profesional») suma que tocando un espacio libre se da cita o se bloquea con ese profesional ya elegido, y que el gris es fuera de horario. `dentista.ts`: el `tip` de «Diaria global» queda coherente (para el dentista es de solo lectura).
- Volver a sacar las capturas de los procedimientos que muestran la Diaria global. `npm run ayuda:conocimiento` corresponde recién cuando Novi esté en main (hoy no está).
- CLAUDE.md: el párrafo de la agenda (8-oct) pasa a citar `GrillaAgenda` y `lib/agendaGrilla.ts`, y enlaza este documento.

## Pruebas

- **Unitarias (`lib/agendaGrilla.test.ts`):** columnas de la semana (7, lunes primero, `esHoy`); columnas del día (orden y datos del profesional); `citaEnColumna` / `bloqueoEnColumna` (otro día, otro profesional, bloqueo `"*"` en todas); `fueraDeHorario` (día no laborable, antes de `desde`, justo en `desde`, la última celda que termina en `hasta`, después, sin horario = por defecto). `tituloDeEspacio` con y sin profesional.
- **e2e (`e2e/agenda-espacios.spec.ts`, escritorio y celular):** en la Diaria global (recepción) tocar un espacio libre de la columna de un profesional abre el menú; «Dar cita presencial» abre «Dar cita» con ese profesional y esa hora; «Bloquear espacio» guarda un bloqueo de ese profesional y se ve rayado en su columna; un bloqueo de «Todos» aparece en todas las columnas; una celda fuera de horario se ve en gris y abre el menú; el dentista ve la grilla sin menú; en el celular la grilla se recorre de costado sin ensanchar la página (`sinScrollHorizontal`). La prueba existente «la Diaria global muestra el bloqueo… en la columna del profesional» se adapta a la grilla.
- **Regresión:** todas las de agenda (`agenda.spec.ts`, `agenda-espacios.spec.ts`, `mi-agenda.spec.ts`), `roles`, `permisos`, `pantallas-y-flujos`, `app-paginas` y `visual`; `tsc`, `vitest` y `build`.

## Riesgos

- **Muchos profesionales:** 48 botones por columna; con 10 profesionales son 480, igual que una Semanal y media. Aceptable.
- **El cambio toca la vista que más usa la recepción:** la Diaria (tabla) no se toca, y la Diaria global mantiene sus filtros y su columna izquierda.
- **Interpretación de «Semanal global»:** si Camila quería otra cosa, la grilla de la Diaria global igual cumple lo que pidió para el día; lo otro se conversa aparte.
