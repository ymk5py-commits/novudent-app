# Documentos clínicos y consentimientos en la Ficha clínica — diseño

Fecha: 6-oct-2026 · Pedido del equipo Novum (Camila, revisión con Aura Esthetic Center)

## Problema

Camila comparó la ficha de Novudent con la de Dentalink que usa Aura y marcó dos cosas:

1. **«Esto lo que está mal»**: en Novudent los *Formularios* son un «Anamnesis inicial» de tres
   campos de texto, y junto con *Consentimientos* viven en «Datos personales». En Dentalink,
   la Ficha clínica tiene un menú **Documentos ▾** con dos entradas: **Consentimientos** y
   **Documentos clínicos**.
2. **«Tiene que estar todos los screens que pasé»**: el documento clínico **Historia Clínica**
   de Aura (Dentalink, `/ficha/formularios/nuevo/13`) tiene nueve secciones con listas,
   casillas y textos. Novudent no tiene nada parecido.

Además, en Dentalink el consentimiento se crea con **Tipo\***, **Plan de tratamiento** y
**Profesional a cargo\***; en Novudent solo se elige la plantilla.

## Decisiones (Croman, 6-oct-2026)

| Tema | Decisión |
|---|---|
| Formularios | Se unifican en **Documentos clínicos**. Formularios y Consentimientos salen de «Datos personales» y pasan a Ficha clínica › Documentos ▾. Lo que hoy cuenta la campanita como «formularios pendientes» pasa a ser «documentos clínicos pendientes». |
| Plantillas | 1) **Historia Clínica completa** (las nueve secciones de las capturas). 2) **Editor de plantillas en Configuración** (formulario o texto). 3) **Textos de indicaciones** (cuidados post-exodoncia, post-blanqueamiento, higiene y cepillado) como **borradores que tiene que revisar un odontólogo**. |
| «Continuar» | Guarda el documento como completado y abre la vista para **imprimir con membrete** o **enviar por correo**. Sin firma del paciente (se puede sumar después con la firma electrónica existente). |
| Orden | Esto va primero; después la campanita, «Mi agenda» con IA y el manual de procedimientos. |

## Restricciones

- Firestore Web SDK, sin Admin SDK: las reglas son la defensa (CLAUDE.md).
- Multi-tenant: todo en `clinics/{cid}/…`.
- Un documento de Firestore < 1 MB: los documentos clínicos **no** van dentro del doc del
  paciente (que ya carga foto base64, EMR y odontograma) sino en una **colección propia**.
- Una colección nueva necesita su regla y `firebase deploy --only firestore:rules`. El demo
  (`cl_demo`) funciona sin el deploy por `isDemo`; las clínicas reales, no. La CLI de Firebase
  no tiene sesión en esta máquina: se pide `firebase login` a Croman y el deploy lo hace Claude.

## Modelo de datos

### Plantilla — `PlantillaDocumento` (en `Clinic.config.plantillasDocumento`)

```ts
type TipoCampo = "texto" | "parrafo" | "seleccion" | "casillas" | "numero";

interface CampoDocumento {
  id: string;            // estable: es la clave del valor guardado
  etiqueta: string;
  tipo: TipoCampo;
  opciones?: string[];   // seleccion y casillas
  soloMujeres?: boolean; // «<Mujeres> …» de Dentalink: se oculta si el paciente es sexo M
}

interface SeccionDocumento { id: string; titulo: string; campos: CampoDocumento[] }

interface PlantillaDocumento {
  id: string;
  nombre: string;                    // «Historia Clínica»
  tipo: "formulario" | "texto";
  secciones?: SeccionDocumento[];    // formulario
  cuerpo?: string;                   // texto, con {paciente} {documento} {fecha} {profesional} {clinica}
  porRevisar?: boolean;              // borrador redactado por Novudent: no se usa sin revisión
  inactiva?: boolean;                // no aparece al crear (los documentos viejos siguen intactos)
}
```

Mismo patrón que `estadosCita`: si la clínica nunca tocó sus plantillas,
`config.plantillasDocumento` no existe y se usan las de fábrica
(`PLANTILLAS_DE_FABRICA` en `lib/documentosClinicos.ts`). La primera edición guarda la lista
completa. `normalizarPlantillas()` descarta basura (ids repetidos, campos sin etiqueta, una
selección sin opciones) para que una edición rota no rompa la ficha.

### Documento — `DocumentoClinico` (colección `clinics/{cid}/clinicalDocs`)

```ts
interface DocumentoClinico {
  id: string;
  clinicId: string;
  patientId: string;
  plantillaId: string;
  nombre: string;                          // snapshot
  tipo: "formulario" | "texto";
  secciones?: SeccionDocumento[];          // snapshot: editar la plantilla no cambia lo ya hecho
  cuerpo?: string;                         // texto final (con los datos reemplazados)
  valores?: Record<string, string | string[]>;  // campo.id → valor (casillas = string[])
  dentistId?: string;                      // profesional a cargo
  estado: "pendiente" | "completado" | "anulado";
  createdAt: string; createdBy: string; createdByName: string;
  updatedAt?: string;
  completedAt?: string; completedBy?: string;
  voidedAt?: string; voidedBy?: string;
}
```

- **pendiente** = creado sin completar («Guardar borrador», o el pendiente que se crea al dar
  de alta un paciente). Es lo que cuenta la campanita.
- **completado** = se tocó «Continuar». Se puede seguir corrigiendo (queda `updatedAt`); el
  historial muestra la fecha de completado.
- **anulado** = no se borra (registro clínico, mismo criterio que recetas y pagos). «Mostrar
  anulados» lo vuelve a mostrar.

### Datos viejos: `Patient.forms`

Los `PatientForm` existentes (Anamnesis inicial, etc.) **no se migran con escritura**: la lista
de Documentos clínicos los muestra como documentos de tipo «formulario simple», con su estado,
y se completan con el modal que ya existe (`FormFill` + `completeForm`). El alta de paciente
deja de crear el «Anamnesis inicial» y en su lugar crea una **Historia Clínica pendiente** en
`clinicalDocs`, así el pendiente de bienvenida se mantiene, ahora con el documento completo.

### Consentimientos — `SignatureDoc`

Se suman dos campos opcionales: `budgetId` (plan de tratamiento) y `dentistId` (profesional a
cargo). Los consentimientos viejos no los tienen y se muestran igual.

## Historia Clínica de fábrica

Transcripta de las capturas de Aura. Los rótulos se corrigen de tipeo («Diábetes» → Diabetes,
«Silvilancias» → Sibilancias, «Poligagia» → Polifagia, «Polidispsia» → Polidipsia,
«Transtornos» → Trastornos, «entumesidas» → entumecidas, «defeción» → defecación,
«Fasetas» → Facetas, «diaurno» → diurno, «Bricomanía» → Bruxomanía, «Atrisión» → Atrición).
Las opciones de las listas que no se ven en las fotos las define Novudent (marcadas «*»
abajo) y la clínica las puede cambiar en Configuración.

1. **Antecedentes patológicos** — ¿Padece o ha padecido alguna enfermedad en los últimos años?
   (Sí/No\*) · ¿Padece o padeció alguna alergia? ¿Sí? Especificar (texto) · Hospitalizaciones en
   los últimos 5 años (fecha, motivo y secuelas) (texto) · ¿Ha tenido algún trauma o accidente
   en cabeza, cuello o diente; alguna secuela? (texto) · ¿Cuenta con todas sus vacunas?
   (Sí/No/No sabe\*) · El paciente refiere haber padecido (casillas: Hepatitis, Hipotensión,
   Hipertensión, Hemofilia, Cardiopatías, Anemia, ETS, Cáncer, Diabetes, Epilepsia, Artritis,
   Fiebre reumática, Ninguna) · Observaciones de enfermedades (texto) · Medicamentos usados
   actualmente (nombre, dosis y motivo) (texto).
2. **Aparatos y sistemas** (casillas; «SDP» = sin datos patológicos) — Aparato digestivo
   (Apetito aumentado, Apetito disminuido, Hipertensión, Gastritis frecuente, Úlcera gástrica,
   Aftas, Dificultad para tragar, Reflujo, Náuseas, Vómito, Dolor abdominal, Frecuencia de
   defecación anormal, SDP) · Aparato respiratorio (Amigdalitis, Faringitis, Disfonía, Disnea,
   Tos crónica, Dolor torácico, Expectoraciones, Sinusitis, Tabique desviado, Respirador oral,
   Hábito de roncar, Sibilancias, SDP) · Aparato cardiovascular (Marcapasos, Palpitaciones,
   Taquicardia, Dolor de pecho, SDP) · Sistema nervioso (Problemas psicológicos, Depresión,
   Ansiedad, Dolor de pecho, Mareos, Migraña, Convulsiones, Desmayos, Disminución visual,
   Audición disminuida, Olfato aumentado, Olfato disminuido, Alteraciones de memoria,
   Parestesia, Trastornos de personalidad, Extremidades entumecidas, SDP) · Sistema endocrino
   (Polifagia, Poliuria, Polidipsia, Irritabilidad al clima, SDP) · Sistema hemático-linfático
   (Sangrado, Hemorragias, Alto nivel de glucosa en sangre, Bajo nivel de glucosa en sangre,
   Petequias, Tumoraciones, Inmunodeficiencias, Herpes facial, SDP) · Aparato genitourinario
   (Sangrado, Poliuria, Problemas renales, Dificultad o dolor al orinar, SDP) · Observaciones de
   aparatos y sistemas (texto).
3. **Antecedentes hereditarios** — ¿Tiene algún familiar (abuelos, tíos, hermanos) que haya
   padecido infarto, cáncer, hiper/hipotensión o diabetes? (Sí/No\*) · Quién y qué parentesco
   (texto) · ¿Está o sospecha estar embarazada? (No/Sí/Sospecha\*, solo mujeres) · Número de
   embarazos anteriores (0, 1, 2, 3, 4, 5 o más\*, solo mujeres).
4. **Signos vitales** — Tensión arterial · Pulso cardíaco · Frecuencia respiratoria · Peso (kg) /
   Estatura (m) (textos).
5. **Antecedentes no patológicos** — ¿Tiene buena alimentación? (Sí/Regular/No\*) · Descripción
   de alimentación (texto) · ¿Cuántas personas más viven con usted? (0, 1, 2, 3, 4, 5 o más\*) ·
   ¿Realiza ejercicio? Detalle (texto) · Hábitos y adicciones (casillas: Café, Tabaco, Alcohol,
   Bebidas gasificadas, Dulces, Drogas recreativas, Bruxomanía, Atrición, Vinos / jugos de
   color intenso, Ninguno, Otros) · Observaciones de hábitos y adicciones (texto).
6. **Antecedentes odontológicos** — ¿Cómo refiere su higiene bucal? (Buena/Regular/Mala\*) ·
   ¿Cuántas veces se cepilla los dientes al día? (0, 1, 2, 3, 4 o más\*) · ¿Cuántas veces a la
   semana usa hilo dental? (Nunca, 1 a 6, Todos los días\*) · ¿Cuántas veces a la semana usa
   enjuague bucal? (ídem\*) · ¿Cómo describe su experiencia en la atención dental?
   (Buena/Regular/Mala\*) · ¿Ha tenido atención dental recientemente? (Sí/No\*) · Tratamientos
   anteriores · Continuación de tratamientos · Observaciones de tratamientos anteriores (textos)
   · ¿Refiere sangrado de encías? · ¿Refiere sensibilidad dental? · ¿Refiere accidentes
   bucodentales? · ¿Refiere complicaciones por anestesia? (Sí/No\*).
7. **Parafunciones** — Parafunciones referidas (casillas: Masticación constante de chicle,
   Malposición de lengua, Apretamiento diurno, Apretamiento nocturno, Rechinamiento diurno,
   Rechinamiento nocturno, Otro, Ninguno) · Observaciones de parafunciones (texto).
8. **Exploración extraoral** — Cabeza · Perfil · Ganglios (textos) · Signos ATM (casillas:
   Limitación de movimiento por traba, Limitación de movimiento por dolor, Chasquido apertura,
   Chasquido cierre, Crepitación, Alteración progresiva de la intercuspidación máxima,
   Asimetrías faciales, Luxación, Bloqueo, Tumefacción, Hipertrofia, Desviación, Deflexión,
   Limitación de apertura, Limitación de cierre, Otro) · Síntomas ATM (casillas: Dolor a la
   palpación, Dolor espontáneo, Dolor al despertar, Zumbidos en los oídos, Dolor de oídos,
   Presión intraarticular, Sensación de globo al tragar, Fatiga muscular, Otro, Ninguno).
9. **Exploración intraoral** — Relación molar derecha · Relación molar izquierda · Relación
   canina izquierda · Relación canina derecha (Clase I/Clase II/Clase III) · Máxima
   intercuspidación · Líneas medias · Sobremordidas · Lateralidad derecha · Lateralidad
   izquierda · Protrusiones · Rotaciones · Versiones · Gresiones · Facetas de desgaste ·
   Fracturas · Forma de arco · Espacios desdentados (textos).

> Las capturas llegan hasta «Espacios desdentados». Si en Dentalink hay más secciones debajo,
> se suman cuando Camila mande esa parte; el editor de plantillas también permite agregarlas.

**Textos de indicaciones** (`porRevisar: true`): «Cuidados postoperatorios de exodoncia»,
«Indicaciones después del blanqueamiento» e «Higiene y cepillado en adultos». Redactados por
Novudent con indicaciones generales; mientras estén «por revisar», al crearlos se ve un aviso
y en Configuración un botón «Marcar como revisada» (solo admin).

## Interfaz

### Ficha del paciente (`app/app/pacientes/[id]/page.tsx`)

- Grupo **Ficha clínica**: se suma la pestaña **Documentos ▾**, un desplegable con
  **Consentimientos** y **Documentos clínicos** (como Dentalink). Las pestañas internas son
  `consentimientos` y `documentos`.
- Grupo **Datos personales**: salen «Formularios» y «Consentimientos».
- Enlaces viejos: `?tab=formularios` y `#formularios` abren `documentos`.
- La recepción y la caja (que hoy gestionan formularios y consentimientos pero no ven la ficha
  clínica) ven el grupo Ficha clínica **solo con Documentos ▾**.
- El ícono de «formularios pendientes» de la cabecera pasa a contar documentos pendientes y
  abre Documentos clínicos.

### Documentos clínicos (`components/DocumentosClinicos.tsx`)

- Encabezado «Documentos clínicos», casilla «Mostrar anulados» y botón **Nuevo documento
  clínico**.
- Lista: fecha · documento · profesional · estado (Pendiente / Completado / Anulado) y
  acciones: Completar o Editar, Ver e imprimir, Enviar por correo, Anular.
- **Nuevo documento clínico** (modal): «Seleccione el tipo de documento clínico que desea
  crear» (plantillas activas, con buscador) y «Profesional a cargo» (opcional; por defecto el
  usuario si es dentista). Aceptar abre el editor.
- **Editor** (página completa dentro de la ficha, como Dentalink): título «Nuevo documento
  clínico» + nombre de la plantilla; cada sección con su barra azul y sus campos en grilla de
  cuatro columnas (una en el celular); barra fija abajo con **Descartar y volver**, **Guardar
  borrador** y **Continuar**. Salir con cambios sin guardar pide confirmación
  (`AvisoNoGuardado`). Los documentos de texto muestran el cuerpo con los datos del paciente ya
  puestos, editable antes de guardar.
- **Continuar** = completado + vista de impresión con membrete (`PrintDocument`): datos del
  paciente, profesional, fecha y solo los campos respondidos (las casillas como lista; una
  sección sin respuestas no se imprime). Desde ahí, **Enviar por correo** (`EmailButton`).

### Consentimientos (`components/Consentimientos.tsx`)

- Botón **Nuevo consentimiento informado** que abre **Crear nuevo consentimiento**: Tipo de
  consentimiento\* (plantillas; aclaración «Las plantillas nuevas se crean en Configuración»),
  Plan de tratamiento (los planes del paciente, `#n.º — nombre`) y Profesional a cargo\*
  (dentistas activos).
- La lista y la impresión muestran plan y profesional. «Mostrar anulados» esconde por defecto
  los anulados.
- Sigue gateado por el plan (`firma_electronica`, Clínica en adelante); en el plan Solo,
  «Consentimientos» muestra el candado de siempre y Documentos clínicos funciona igual.

### Configuración › Documentos clínicos

- Lista de plantillas: nombre, tipo, estado (Activa / Inactiva / Por revisar) y acciones
  Editar, Duplicar, Activar/Desactivar.
- **Nueva plantilla**: formulario (secciones y campos: rótulo, tipo, opciones, «solo mujeres»,
  subir/bajar, borrar) o texto (nombre y cuerpo con los datos disponibles). Editar una
  plantilla nunca cambia documentos ya creados (snapshot).
- Solo admin (`practice.config`).

### Fuera de la ficha

- **Campanita / Inicio / Contralor IA**: «formularios pendientes» pasa a contar documentos
  pendientes (y los `PatientForm` pendientes viejos). Los enlaces llevan a
  `/app/pacientes/{id}?tab=documentos`. El panel con links de la campanita es el pedido
  siguiente y se apoya en esto.
- **Historial** (`lib/historial.ts`): cada documento completado aparece como «Documento
  clínico: <nombre>».

## Permisos (RBAC)

| Acción | Roles |
|---|---|
| Ver Documentos clínicos | todos los que ven al paciente (`engagement.forms` o `emr.read`) |
| Crear, completar, editar, anular documentos | admin, caja, recepción, dentista (`engagement.forms` o `emr.write`); el asistente, solo lectura |
| Consentimientos | sin cambios: los gestiona `engagement.forms` |
| Plantillas | admin (`practice.config`) |

Regla nueva en `firestore.rules`:

```
match /clinicalDocs/{docId} {
  allow read: if isMember(cid) || isService() || isDemo(cid);
  allow create, update: if isService() || isDemoRW(cid)
    || (isMember(cid) && subActive(cid)
        && get(/databases/$(database)/documents/clinics/$(cid)/users/$(request.auth.uid)).data.role
           in ['admin', 'cashier', 'receptionist', 'dentist']);
  allow delete: if isService() || isDemoRW(cid);
}
```

Sin borrado desde la app (se anula). `plantillasDocumento` vive en el doc de la clínica,
que ya está cubierto por su regla (solo admin escribe la config).

## Código

| Archivo | Qué |
|---|---|
| `lib/documentosClinicos.ts` (nuevo, puro) | `PLANTILLAS_DE_FABRICA`, `plantillasDeClinica`, `normalizarPlantillas`, `nuevoDocumento`, `camposVisibles` (solo mujeres), `respuestasParaImprimir`, `cuerpoConDatos`, `pendientesDe`, `documentosDelPaciente` (une `clinicalDocs` + `Patient.forms`) |
| `lib/documentosClinicos.test.ts` | TDD de todo lo anterior |
| `lib/types.ts` | `PlantillaDocumento`, `DocumentoClinico`, `Clinic.config.plantillasDocumento`, `SignatureDoc.budgetId/dentistId`, `DB.clinicalDocs` |
| `lib/store.tsx` + `lib/seed.ts` | colección `clinicalDocs` (load, `add/update`), demo con una Historia Clínica completa y una pendiente |
| `lib/camposPaciente.ts` | el alta crea la Historia Clínica pendiente en vez del «Anamnesis inicial» |
| `components/DocumentosClinicos.tsx` | lista, modal de nuevo, editor, vista de impresión |
| `components/Consentimientos.tsx` | modal «Crear nuevo consentimiento», plan, profesional, mostrar anulados |
| `components/PlantillasDocumento.tsx` | editor de Configuración |
| `app/app/pacientes/[id]/page.tsx` | Documentos ▾, pestañas por rol, enlaces viejos |
| `app/app/configuracion/page.tsx` | sección Documentos clínicos |
| `components/Shell.tsx`, `app/app/page.tsx` | conteo de pendientes |
| `lib/historial.ts` | entrada de documento clínico |
| `firestore.rules` | regla `clinicalDocs` |

## Testing

- **Unidad (vitest)**: plantillas de fábrica válidas (ids únicos, toda selección y casilla con
  opciones, nueve secciones); `normalizarPlantillas` ante basura; `camposVisibles` con sexo F,
  M y sin dato; `respuestasParaImprimir` (omite vacíos y secciones vacías, casillas como
  lista); `cuerpoConDatos`; `pendientesDe` (pendientes de `clinicalDocs` + `PatientForm`
  viejos, sin anulados); snapshot (editar la plantilla no cambia un documento).
- **E2E (Playwright, escritorio y celular)**: Ficha clínica › Documentos ▾ › Documentos
  clínicos › Nuevo › Historia Clínica → marcar casillas, elegir opciones, Continuar → aparece
  completado → imprimir muestra lo respondido; consentimiento nuevo con plan y profesional;
  la recepción ve Documentos ▾ y no ve el EMR; `?tab=formularios` abre Documentos clínicos.
- `npx tsc --noEmit && npx vitest run && npm run build` y la suite E2E antes de mergear.

## Fuera de alcance

- Firma del paciente en documentos clínicos (decisión: se suma después).
- Completar la Historia Clínica por voz o con IA.
- Pasar automáticamente alergias o medicamentos de la Historia Clínica a «Antecedentes
  médicos» (las pastillas de la cabecera siguen saliendo de Antecedentes médicos).
- Importar las plantillas propias de Aura desde Dentalink (se cargan con el editor).
