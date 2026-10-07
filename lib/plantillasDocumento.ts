import type { CampoDocumento, PlantillaDocumento, SeccionDocumento } from "./types";

/* Plantillas de documentos clínicos que trae toda clínica nueva (hasta que la clínica edite
 * las suyas en Configuración › Documentos clínicos; ver `plantillasDeClinica`).
 *
 * «Historia Clínica» es la de Aura Esthetic Center en Dentalink (nueve secciones, capturas
 * del 6-oct-2026), con la ortografía corregida («Silvilancias» → Sibilancias, «Poligagia» →
 * Polifagia, «Bricomanía» → Bruxomanía…). Las opciones de las listas que no se ven en las
 * capturas (Sí/No, Buena/Regular/Mala…) las puso Novudent.
 *
 * Los tres textos son BORRADORES de Novudent con indicaciones generales: `porRevisar` los
 * marca hasta que un odontólogo los revise y un administrador los confirme. Los textos no
 * repiten título, paciente ni fecha: la hoja impresa y el correo ya los llevan en el encabezado. */

const SI_NO = ["Sí", "No"];
const BUENA_REGULAR_MALA = ["Buena", "Regular", "Mala"];
const VECES_POR_SEMANA = ["Nunca", "1 a 3 veces", "4 a 6 veces", "Todos los días"];
const CLASES = ["Clase I", "Clase II", "Clase III"];

const texto = (id: string, etiqueta: string): CampoDocumento => ({ id, etiqueta, tipo: "texto" });
const parrafo = (id: string, etiqueta: string): CampoDocumento => ({ id, etiqueta, tipo: "parrafo" });
const lista = (id: string, etiqueta: string, opciones: string[], extra: Partial<CampoDocumento> = {}): CampoDocumento => ({ id, etiqueta, tipo: "seleccion", opciones, ...extra });
const casillas = (id: string, etiqueta: string, opciones: string[]): CampoDocumento => ({ id, etiqueta, tipo: "casillas", opciones });
const seccion = (id: string, titulo: string, campos: CampoDocumento[]): SeccionDocumento => ({ id, titulo, campos });

const HISTORIA_CLINICA: PlantillaDocumento = {
  id: "historia_clinica",
  nombre: "Historia Clínica",
  tipo: "formulario",
  secciones: [
    seccion("antecedentes_patologicos", "Antecedentes patológicos", [
      lista("enfermedad_ultimos_anos", "¿Padece o ha padecido alguna enfermedad en los últimos años?", SI_NO),
      texto("alergia", "¿Padece o padeció usted alguna alergia? ¿Sí? Especificar:"),
      parrafo("hospitalizaciones", "Hospitalizaciones en los últimos 5 años (fecha, motivo y secuelas):"),
      parrafo("trauma", "¿Ha tenido algún trauma o accidente en cabeza, cuello o diente; alguna secuela?"),
      lista("vacunas", "¿Cuenta con todas sus vacunas?", ["Sí", "No", "No sabe"]),
      casillas("refiere_padecido", "El paciente refiere haber padecido:", [
        "Hepatitis", "Hipotensión", "Hipertensión", "Hemofilia", "Cardiopatías", "Anemia", "ETS",
        "Cáncer", "Diabetes", "Epilepsia", "Artritis", "Fiebre reumática", "Ninguna",
      ]),
      parrafo("obs_enfermedades", "Observaciones de enfermedades:"),
      parrafo("medicamentos", "Medicamentos usados actualmente (nombre, dosis y motivo):"),
    ]),
    seccion("aparatos_y_sistemas", "Aparatos y sistemas", [
      casillas("ap_digestivo", "Aparato digestivo", [
        "Apetito aumentado", "Apetito disminuido", "Hipertensión", "Gastritis frecuente", "Úlcera gástrica", "Aftas",
        "Dificultad para tragar", "Reflujo", "Náuseas", "Vómito", "Dolor abdominal", "Frecuencia de defecación anormal", "SDP",
      ]),
      casillas("ap_respiratorio", "Aparato respiratorio", [
        "Amigdalitis", "Faringitis", "Disfonía", "Disnea", "Tos crónica", "Dolor torácico", "Expectoraciones",
        "Sinusitis", "Tabique desviado", "Respirador oral", "Hábito de roncar", "Sibilancias", "SDP",
      ]),
      casillas("ap_cardiovascular", "Aparato cardiovascular", ["Marcapasos", "Palpitaciones", "Taquicardia", "Dolor de pecho", "SDP"]),
      casillas("sistema_nervioso", "Sistema nervioso", [
        "Problemas psicológicos", "Depresión", "Ansiedad", "Dolor de pecho", "Mareos", "Migraña", "Convulsiones", "Desmayos",
        "Disminución visual", "Audición disminuida", "Olfato aumentado", "Olfato disminuido", "Alteraciones de memoria",
        "Parestesia", "Trastornos de personalidad", "Extremidades entumecidas", "SDP",
      ]),
      casillas("sistema_endocrino", "Sistema endocrino", ["Polifagia", "Poliuria", "Polidipsia", "Irritabilidad al clima", "SDP"]),
      casillas("sistema_hematico", "Sistema hemático-linfático", [
        "Sangrado", "Hemorragias", "Alto nivel de glucosa en sangre", "Bajo nivel de glucosa en sangre",
        "Petequias", "Tumoraciones", "Inmunodeficiencias", "Herpes facial", "SDP",
      ]),
      casillas("ap_genitourinario", "Aparato genitourinario", ["Sangrado", "Poliuria", "Problemas renales", "Dificultad o dolor al orinar", "SDP"]),
      parrafo("obs_aparatos", "Observaciones de aparatos y sistemas:"),
    ]),
    seccion("antecedentes_hereditarios", "Antecedentes hereditarios", [
      lista("familiar_enfermedad", "¿Tiene algún familiar (abuelos, tíos, hermanos) que haya padecido infarto, cáncer, hiper/hipotensión o diabetes?", SI_NO),
      texto("familiar_parentesco", "Quién y qué parentesco:"),
      lista("embarazada", "¿Está o sospecha estar actualmente embarazada?", ["No", "Sí", "Sospecha"], { soloMujeres: true }),
      lista("embarazos_anteriores", "Número de embarazos anteriores:", ["0", "1", "2", "3", "4", "5 o más"], { soloMujeres: true }),
    ]),
    seccion("signos_vitales", "Signos vitales", [
      texto("tension_arterial", "Tensión arterial:"),
      texto("pulso", "Pulso cardíaco:"),
      texto("frecuencia_respiratoria", "Frecuencia respiratoria:"),
      texto("peso_estatura", "Peso (kg) / Estatura (m):"),
    ]),
    seccion("antecedentes_no_patologicos", "Antecedentes no patológicos", [
      lista("buena_alimentacion", "¿Tiene buena alimentación?", ["Sí", "Regular", "No"]),
      texto("desc_alimentacion", "Descripción de alimentación:"),
      lista("personas_conviven", "¿Cuántas personas más viven con usted?", ["0", "1", "2", "3", "4", "5 o más"]),
      texto("ejercicio", "¿Realiza ejercicio? Detalle:"),
      casillas("habitos", "Hábitos y adicciones:", [
        "Café", "Tabaco", "Alcohol", "Bebidas gasificadas", "Dulces", "Drogas recreativas", "Bruxomanía", "Atrición",
        "Vinos / jugos de color intenso", "Ninguno", "Otros",
      ]),
      texto("obs_habitos", "Observaciones de hábitos y adicciones:"),
    ]),
    seccion("antecedentes_odontologicos", "Antecedentes odontológicos", [
      lista("higiene_bucal", "¿Cómo refiere su higiene bucal?", BUENA_REGULAR_MALA),
      lista("cepillado_dia", "¿Cuántas veces se cepilla los dientes al día?", ["0", "1", "2", "3", "4 o más"]),
      lista("hilo_semana", "¿Cuántas veces a la semana usa hilo dental?", VECES_POR_SEMANA),
      lista("enjuague_semana", "¿Cuántas veces a la semana usa enjuague bucal?", VECES_POR_SEMANA),
      lista("experiencia_dental", "¿Cómo describe su experiencia en la atención dental?", BUENA_REGULAR_MALA),
      lista("atencion_reciente", "¿Ha tenido atención dental recientemente?", SI_NO),
      texto("tratamientos_anteriores", "Tratamientos anteriores:"),
      texto("continuacion_tratamientos", "Continuación de tratamientos:"),
      texto("obs_tx_anteriores", "Observaciones de tx anteriores:"),
      lista("sangrado_encias", "¿Refiere sangrado de encías?", SI_NO),
      lista("sensibilidad", "¿Refiere sensibilidad dental?", SI_NO),
      lista("accidentes_bucodentales", "¿Refiere accidentes bucodentales?", SI_NO),
      lista("complicaciones_anestesia", "¿Refiere complicaciones por anestesia?", SI_NO),
    ]),
    seccion("parafunciones", "Parafunciones", [
      casillas("parafunciones_referidas", "Parafunciones referidas:", [
        "Masticación constante de chicle", "Malposición de lengua", "Apretamiento diurno", "Apretamiento nocturno",
        "Rechinamiento diurno", "Rechinamiento nocturno", "Otro", "Ninguno",
      ]),
      texto("obs_parafunciones", "Observaciones de parafunciones:"),
    ]),
    seccion("exploracion_extraoral", "Exploración extraoral", [
      texto("cabeza", "Cabeza:"),
      texto("perfil", "Perfil:"),
      texto("ganglios", "Ganglios:"),
      casillas("signos_atm", "Signos ATM:", [
        "Limitación de movimiento por traba", "Limitación de movimiento por dolor", "Chasquido apertura", "Chasquido cierre",
        "Crepitación", "Alteración progresiva de la intercuspidación máxima", "Asimetrías faciales", "Luxación", "Bloqueo",
        "Tumefacción", "Hipertrofia", "Desviación", "Deflexión", "Limitación de apertura", "Limitación de cierre", "Otro",
      ]),
      casillas("sintomas_atm", "Síntomas ATM:", [
        "Dolor a la palpación", "Dolor espontáneo", "Dolor al despertar", "Zumbidos en los oídos", "Dolor de oídos",
        "Presión intraarticular", "Sensación de globo al tragar", "Fatiga muscular", "Otro", "Ninguno",
      ]),
    ]),
    seccion("exploracion_intraoral", "Exploración intraoral", [
      lista("molar_der", "Relación molar derecha:", CLASES),
      lista("molar_izq", "Relación molar izquierda:", CLASES),
      lista("canina_izq", "Relación canina izquierda:", CLASES),
      lista("canina_der", "Relación canina derecha:", CLASES),
      texto("max_intercuspidacion", "Máxima intercuspidación:"),
      texto("lineas_medias", "Líneas medias:"),
      texto("sobremordidas", "Sobremordidas:"),
      texto("lateralidad_der", "Lateralidad derecha:"),
      texto("lateralidad_izq", "Lateralidad izquierda:"),
      texto("protrusiones", "Protrusiones:"),
      texto("rotaciones", "Rotaciones:"),
      texto("versiones", "Versiones:"),
      texto("gresiones", "Gresiones:"),
      texto("facetas", "Facetas de desgaste:"),
      texto("fracturas", "Fracturas:"),
      texto("forma_arco", "Forma de arco:"),
      texto("espacios_desdentados", "Espacios desdentados:"),
    ]),
  ],
};

const CUIDADOS_EXODONCIA: PlantillaDocumento = {
  id: "cuidados_exodoncia",
  nombre: "Cuidados postoperatorios de exodoncia",
  tipo: "texto",
  porRevisar: true,
  cuerpo: `Estimado/a {paciente}:

Hoy le realizamos una extracción dental. Para que cicatrice bien y sin complicaciones, siga estas indicaciones:

1. Muerda suavemente la gasa durante 30 a 45 minutos. Si pasado ese tiempo sigue sangrando, coloque una gasa limpia y muerda otra vez durante 30 minutos.
2. Durante las primeras 24 horas no se enjuague, no escupa con fuerza ni toque la herida con la lengua o los dedos. El coágulo protege la herida.
3. Aplique frío (una bolsa con hielo envuelta en un paño) sobre la mejilla, 15 minutos sí y 15 minutos no, durante las primeras horas. Ayuda a reducir la hinchazón.
4. Coma alimentos blandos y fríos o tibios (yogur, puré, helado, gelatina). Evite lo caliente, lo duro y lo picante, y mastique del lado contrario a la extracción.
5. No fume ni tome alcohol durante al menos 72 horas, y no use pajitas: la succión puede soltar el coágulo.
6. Tome únicamente los medicamentos que le indicó su odontólogo, en la dosis y los horarios indicados.
7. Desde el día siguiente cepille el resto de los dientes con suavidad, sin pasar el cepillo por la herida. Puede hacer enjuagues suaves con agua tibia y sal.
8. Descanse y evite el ejercicio intenso durante 24 a 48 horas. Duerma con la cabeza un poco elevada.

Consulte de inmediato con {clinica} si tiene sangrado abundante que no cede, fiebre, dolor intenso que no mejora con la medicación, hinchazón que aumenta después del tercer día, mal sabor o mal olor persistente, o dificultad para respirar o tragar.

Profesional a cargo: {profesional}`,
};

const POST_BLANQUEAMIENTO: PlantillaDocumento = {
  id: "post_blanqueamiento",
  nombre: "Indicaciones después del blanqueamiento",
  tipo: "texto",
  porRevisar: true,
  cuerpo: `Estimado/a {paciente}:

Después del blanqueamiento los dientes quedan más porosos durante unas 48 horas y absorben con facilidad los colores. Para conservar el resultado y cuidar la sensibilidad:

1. Durante las primeras 48 horas evite lo que pigmenta: café, té, mate, vino tinto, gaseosas oscuras, salsa de soja, salsas de tomate, remolacha, chocolate y alimentos con colorantes. Si toma algo oscuro, use una pajita.
2. No fume durante ese tiempo y, si puede, durante toda la semana: el tabaco mancha de inmediato.
3. Es normal sentir sensibilidad al frío, al calor o al aire durante uno o dos días. Evite las bebidas y comidas muy frías o muy calientes.
4. Use una pasta dental para dientes sensibles y un cepillo de cerdas suaves. Si su odontólogo le indicó un gel desensibilizante, aplíquelo como se le explicó.
5. Mantenga una buena higiene: cepille sus dientes después de cada comida y use hilo dental una vez por día.
6. Si le indicaron mantenimiento en casa (férulas o geles), úselo solo con la frecuencia y el tiempo indicados.
7. Las restauraciones (resinas, carillas, coronas) no cambian de color con el blanqueamiento; coméntelo en el control si nota diferencias.

Consulte con {clinica} si la sensibilidad es intensa, dura más de 3 días, o si nota molestias en las encías que no desaparecen.

Profesional a cargo: {profesional}`,
};

const HIGIENE_CEPILLADO_ADULTOS: PlantillaDocumento = {
  id: "higiene_cepillado_adultos",
  nombre: "Higiene y cepillado en adultos",
  tipo: "texto",
  porRevisar: true,
  cuerpo: `Estimado/a {paciente}:

Una buena higiene diaria previene las caries y las enfermedades de las encías. Estas son las indicaciones para su caso:

1. Cepillado: cepille sus dientes al menos dos veces al día, idealmente después de cada comida, y siempre antes de dormir. Dedique 2 minutos cada vez.
2. Cepillo: elija uno de cerdas suaves o medias y cabeza pequeña, y cámbielo cada 3 meses o antes si las cerdas se abren.
3. Técnica: incline el cepillo unos 45° hacia la encía y haga movimientos cortos y suaves, de la encía hacia el borde del diente. No frote con fuerza. Cepille todas las caras: por fuera, por dentro y las superficies de masticación.
4. Lengua: pase el cepillo o un limpiador de lengua desde el fondo hacia adelante para reducir el mal aliento.
5. Hilo o cepillos interdentales: una vez al día, preferentemente de noche. Deslice el hilo con suavidad hasta debajo de la encía, formando una "C" contra cada diente.
6. Pasta dental: con flúor, en una cantidad del tamaño de una arveja. Después escupa el exceso sin enjuagarse con mucha agua, para que el flúor siga actuando.
7. Enjuague bucal: solo si su odontólogo se lo indicó, y sin reemplazar el cepillado ni el hilo.
8. Alimentación: limite los azúcares y las bebidas azucaradas entre comidas.
9. Controles: visite a su odontólogo cada 6 meses para controles y limpieza profesional, o antes si nota sangrado de encías, dolor o sensibilidad.

Profesional a cargo: {profesional} · {clinica}`,
};

export const PLANTILLAS_DE_FABRICA: PlantillaDocumento[] = [
  HISTORIA_CLINICA,
  CUIDADOS_EXODONCIA,
  POST_BLANQUEAMIENTO,
  HIGIENE_CEPILLADO_ADULTOS,
];
