# Copiloto de Voz Perio — Diseño

**Fecha:** 2026-06-16
**Tipo:** Diferenciador de producto (feature nueva, **Novudent puro** — no toca Botika)

## Objetivo

El dentista carga el periodontograma **dictando con las manos ocupadas**: dice una
pieza y sus 6 profundidades (+ sangrados, movilidad), la IA lo parsea y lo **pinta
en el chart editable**, el dentista lo corrige de un vistazo y avanza. Elimina la
fricción de tipear 6 valores por pieza mientras sondea. El más "wow" y demo-able,
y técnicamente distintivo (casi nadie dicta perio estructurado).

## Contexto (qué se reutiliza)

- **Periodontograma** (`components/Periodontogram.tsx`): `PerioEditor` ya tiene
  celdas editables con `setPd(tooth, site, raw)`, `toggleBop(tooth, site)`,
  `setMobility(tooth, raw)` y `save()` → `addPerioSession`. La voz RELLENA esas
  celdas; el dentista edita lo que esté mal (ese es el "confirmar").
- **Modelo** (`lib/types.ts`): `PerioToothRecord = { pd: (number|null)[6], bop:
  boolean[6], mobility?: 0|1|2|3 }`. No se agregan campos.
- **Dictado por voz** (`app/api/ia/nota-voz/route.ts`): molde de la ruta nueva —
  audio base64 → Gemini → JSON estricto, con auth (`verifyIdToken`) + rate-limit.
  El cliente graba con `MediaRecorder` (patrón de `VoiceNoteButton` en
  `components/NovudentIA.tsx`).

## Enfoque

**A — Botón de voz en el `PerioEditor` existente + ruta `/api/ia/perio-voz` +
validador puro.** Reusa el editor (sus celdas son la superficie de confirmación) y
el patrón de la ruta de voz. Mínimo, ship-eable.

Descartados: **B** wizard de voz a pantalla completa (duplica el editor que ya
está); **C** meter un "modo" en `nota-voz` (mezcla concerns; un route handler
nuevo en Next no tiene el límite de 12 funciones — ese es de Botika).

## Componentes

1. **`lib/perio-voice.ts`** (nuevo, puro, **TDD** — es clínico): `validatePerioVoice(raw)`
   toma el JSON crudo de Gemini y devuelve `{ ok: true, tooth, record }` o
   `{ ok: false, error }`. Valida: `tooth` es FDI válido (11-18,21-28,31-38,41-48);
   `pd` largo 6, cada valor entero 1-15 o null; `bop` largo 6 booleano; `mobility`
   ausente o 0-3. **Descarta basura** — nunca mete un número inválido en la ficha.
2. **`app/api/ia/perio-voz/route.ts`** (nuevo): auth + rate-limit (molde nota-voz);
   audio → Gemini con prompt estricto que devuelve
   `{ tooth, pd:[6], bop:[6], mobility, transcript }`. El prompt FIJA el orden de
   los 6 sitios = el orden `pd[0..5]` del chart (leer las etiquetas reales del
   `PerioEditor` y replicarlas en el prompt para que cada número caiga en su sitio).
3. **Voz en el `PerioEditor`** (`components/Periodontogram.tsx`): botón "Dictar
   pieza" (o modo dictado con la pieza activa resaltada + botón escuchar). Graba →
   `/api/ia/perio-voz` → `validatePerioVoice` → si ok, aplica con
   `setPd/toggleBop/setMobility` a esa pieza → el dentista mira/corrige → siguiente.
   Manejo de error claro ("no te entendí, repetí la pieza").

## Flujo

1. Dentista abre el periodontograma de un paciente → "modo dictado" (o botón por pieza).
2. Toca escuchar, dice: *"pieza 16: 3 2 4 5 3 2, sangra mesial y distal"*.
3. Audio → ruta → Gemini → JSON → `validatePerioVoice` → pinta los 6 `pd` + bop +
   movilidad de la pieza 16 en las celdas.
4. El dentista corrige a mano si algo está mal (las celdas ya son editables) → siguiente pieza.
5. `save()` (existente) guarda la `PerioSession`.

## Seguridad clínica

- La voz NO escribe directo e irreversible: **rellena celdas editables** que el
  dentista revisa antes de `save()`. El validador descarta valores fuera de rango
  (un "treinta" mal oído no entra como profundidad de 30 mm).
- Si el JSON es inválido o inaudible → no aplica nada, pide repetir.

## Alcance

**v1 (IN):** push-to-talk por pieza; dictado estructurado (pieza + 6 sitios en orden
fijo + sangrados + movilidad); ruta `/api/ia/perio-voz`; validador puro (TDD); voz
en el `PerioEditor` que pinta las celdas; confirmación = edición manual existente;
guardado con `addPerioSession` existente.

**Fuera de v1:** captura continua con auto-segmentación; varias piezas por dictado;
recesión/CAL (el modelo actual no los tiene); multi-idioma del dictado.

## Criterio de éxito

El dentista dicta una pieza con sus 6 profundidades y sangrados; en ~2-3 s el chart
muestra esos valores en la pieza correcta; corrige lo que haga falta a mano y guarda
la sesión — sin tipear cada celda. Un dictado inaudible/ambiguo no corrompe la ficha
(no aplica nada y pide repetir).

## Riesgos / decisiones

- **Orden de los 6 sitios:** el prompt debe coincidir EXACTO con el orden `pd[0..5]`
  del `PerioEditor` (leer las etiquetas reales del componente) o los números caen en
  el sitio equivocado. Es el punto crítico de precisión.
- **Reconocimiento de números en español** (PY): el prompt pide dígitos; el
  validador acota el rango. Audio ruidoso de clínica → puede fallar; mitigación: el
  dentista confirma siempre en el chart.
- Novudent puro: una sola feature, un repo. Se prueba con build + qa-flow; el dictado
  real (micrófono) es validación interactiva.
