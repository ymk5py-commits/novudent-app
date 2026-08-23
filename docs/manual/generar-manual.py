# -*- coding: utf-8 -*-
"""Manual de operación de Novudent — PDF.

Todo el contenido está verificado contra el código del repo (planes, límites,
matriz RBAC, campos de los formularios). Nada acá es inventado: si algo no está
implementado, el manual lo dice como pendiente en vez de describirlo como si
funcionara.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, Flowable, NextPageTemplate,
)

# ── Identidad (la misma de la landing: navy + menta + papel) ────────────────
NAVY   = colors.HexColor("#0A1240")
NAVY2  = colors.HexColor("#131C55")
MINT   = colors.HexColor("#2FE3AE")
MINTIK = colors.HexColor("#0B7A5B")   # menta legible sobre claro
PAPER  = colors.HexColor("#E9E9E9")
PAPER2 = colors.HexColor("#F1F1F1")
LINE   = colors.HexColor("#D5D5D8")
INK    = colors.HexColor("#0A1240")
MUTED  = colors.HexColor("#545B6B")
WHITE  = colors.white

W, H = A4
MARGIN = 18 * mm

def st(name, **kw):
    base = dict(fontName="Helvetica", fontSize=9.5, leading=14, textColor=INK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(name, **base)

S = {
    "h1":     st("h1", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=INK, spaceAfter=2),
    "h2":     st("h2", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=INK, spaceBefore=12, spaceAfter=5),
    "h3":     st("h3", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=INK, spaceBefore=9, spaceAfter=3),
    "body":   st("body", spaceAfter=5),
    "muted":  st("muted", textColor=MUTED, fontSize=9, leading=13),
    "small":  st("small", fontSize=8.2, leading=11.5, textColor=MUTED),
    "cell":   st("cell", fontSize=8.6, leading=12),
    "cellb":  st("cellb", fontSize=8.6, leading=12, fontName="Helvetica-Bold"),
    "cellw":  st("cellw", fontSize=8.6, leading=12, textColor=WHITE, fontName="Helvetica-Bold"),
    "step":   st("step", fontSize=9.5, leading=14, leftIndent=16, spaceAfter=4),
    "mono":   st("mono", fontName="Courier-Bold", fontSize=9, leading=13, textColor=MINTIK),
    "coverT": st("coverT", fontName="Helvetica-Bold", fontSize=34, leading=38, textColor=WHITE),
    "coverS": st("coverS", fontSize=12, leading=17, textColor=colors.HexColor("#AFC0D8")),
    "coverM": st("coverM", fontSize=9, leading=13, textColor=MINT, fontName="Helvetica-Bold"),
}


class Rule(Flowable):
    """Regla menta corta — la firma visual de la marca."""
    def __init__(self, w=34, h=2.6, color=MINT):
        super().__init__(); self.w, self.h, self.color = w, h, color
    def wrap(self, *a): return (self.w, self.h + 5)
    def draw(self):
        self.canv.setFillColor(self.color)
        self.canv.rect(0, 3, self.w, self.h, stroke=0, fill=1)


def callout(texto, tono="info"):
    """Caja de aviso. `alerta` para lo que puede romper algo."""
    bg   = colors.HexColor("#FFF4E5") if tono == "alerta" else PAPER2
    bar  = colors.HexColor("#B45309") if tono == "alerta" else MINT
    t = Table([[Paragraph(texto, S["cell"])]], colWidths=[W - 2*MARGIN - 6])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg),
        ("LEFTPADDING", (0,0), (-1,-1), 10), ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LINEBEFORE", (0,0), (0,-1), 3, bar),
    ]))
    return t


def tabla(filas, anchos, encabezado=True):
    data = []
    for i, fila in enumerate(filas):
        estilo = S["cellw"] if (encabezado and i == 0) else S["cell"]
        data.append([Paragraph(str(c), estilo) for c in fila])
    t = Table(data, colWidths=anchos, repeatRows=1 if encabezado else 0)
    cmds = [
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7),
        ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LINEBELOW", (0,0), (-1,-2), 0.5, LINE),
    ]
    if encabezado:
        cmds += [("BACKGROUND", (0,0), (-1,0), NAVY),
                 ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, PAPER2])]
    else:
        cmds += [("ROWBACKGROUNDS", (0,0), (-1,-1), [WHITE, PAPER2])]
    t.setStyle(TableStyle(cmds))
    return t


def pasos(lista):
    """Pasos numerados con el número en menta."""
    out = []
    for i, p in enumerate(lista, 1):
        out.append(Paragraph(
            f'<font color="#0B7A5B"><b>{i}.</b></font>&nbsp;&nbsp;{p}', S["step"]))
    return out


# ── Plantillas de página ───────────────────────────────────────────────────
def portada(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY); canvas.rect(0, 0, W, H, stroke=0, fill=1)
    canvas.setFillColor(NAVY2)
    canvas.circle(W*0.86, H*0.80, 120*mm, stroke=0, fill=1)
    canvas.setFillColor(MINT)
    canvas.rect(MARGIN, H - 92*mm, 34, 2.6, stroke=0, fill=1)
    canvas.restoreState()


def interior(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAPER); canvas.rect(0, 0, W, H, stroke=0, fill=1)
    # cabecera
    canvas.setFillColor(MUTED); canvas.setFont("Helvetica", 7.5)
    canvas.drawString(MARGIN, H - 12*mm, "NOVUDENT  ·  MANUAL DE OPERACION")
    canvas.setFont("Helvetica-Bold", 7.5)
    canvas.drawRightString(W - MARGIN, H - 12*mm, "NOVUM Holding")
    canvas.setStrokeColor(LINE); canvas.setLineWidth(0.5)
    canvas.line(MARGIN, H - 14.5*mm, W - MARGIN, H - 14.5*mm)
    # pie
    canvas.setFont("Helvetica", 7.5); canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, 11*mm, "novudent.novumholding.lat")
    canvas.setFillColor(INK); canvas.setFont("Helvetica-Bold", 8.5)
    canvas.drawRightString(W - MARGIN, 11*mm, str(doc.page))
    canvas.restoreState()


def construir(salida):
    doc = BaseDocTemplate(salida, pagesize=A4,
                          leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=22*mm, bottomMargin=18*mm,
                          title="Novudent — Manual de operación",
                          author="NOVUM Holding")
    fr = Frame(MARGIN, 18*mm, W - 2*MARGIN, H - 40*mm, id="f")
    doc.addPageTemplates([
        PageTemplate(id="portada", frames=[Frame(MARGIN, 30*mm, W-2*MARGIN, H-70*mm, id="c")], onPage=portada),
        PageTemplate(id="interior", frames=[fr], onPage=interior),
    ])

    A = []   # story

    # ─────────── PORTADA ───────────
    A += [Spacer(1, 92*mm),
          Paragraph("NOVUdent<font color='#2FE3AE'>.</font>", S["coverT"]),
          Spacer(1, 5),
          Paragraph("Manual de operación", S["coverT"]),
          Spacer(1, 10),
          Paragraph("Cómo se opera el sistema: para el dueño, para el administrador "
                    "de cada clínica, para el equipo, y cómo preparar una demo de venta.",
                    S["coverS"]),
          Spacer(1, 16),
          Paragraph("AGOSTO 2026  ·  NOVUM HOLDING  ·  ASUNCIÓN, PARAGUAY", S["coverM"]),
          # Cambiar de plantilla ANTES del salto: si no, el fondo navy de la
          # portada se sigue pintando en las páginas de contenido y el texto
          # oscuro queda ilegible sobre él.
          NextPageTemplate("interior"), PageBreak()]

    # ─────────── ESTADO ───────────
    A += [Paragraph("Estado del sistema", S["h1"]), Rule(),
          Paragraph("Antes del paso a paso, lo que está listo y lo que todavía no. "
                    "Esto evita prometerle a un cliente algo que aún no funciona.", S["muted"]),
          Spacer(1, 8)]

    A += [tabla([
        ["Qué", "Estado", "Detalle"],
        ["Sitio y acceso", "<b>Listo</b>", "novudent.novumholding.lat, con certificado de seguridad."],
        ["Reglas de seguridad", "<b>Listo</b>", "Desplegadas el 23/08/2026. Antes estaba la regla por defecto de Firebase, que dejaba a cualquier usuario registrado leer y escribir los datos de todas las clínicas."],
        ["Alta de clínicas", "<b>Listo</b>", "Desde /superadmin con tu clave de propietario."],
        ["Panel completo", "<b>Listo</b>", "Agenda, odontograma, ficha clínica, presupuestos, caja y facturación."],
        ["Recuperar contraseña", "<b>Listo</b>", "Desde la pantalla de ingreso, sin depender de vos."],
        ["Cobro automático", "<b>Pendiente</b>", "Faltan las claves de Lemon Squeezy en Vercel. Hasta entonces el cobro se hace por fuera del sistema."],
        ["Limpieza de cuentas", "<b>Pendiente</b>", "Quedan 213 cuentas anónimas viejas por borrar. No afectan el uso; son basura acumulada."],
    ], [34*mm, 22*mm, W - 2*MARGIN - 56*mm])]

    A += [Spacer(1, 10),
          callout("<b>Trial de 30 días.</b> Toda clínica que des de alta arranca con 30 días "
                  "de prueba y todas las funciones de su plan habilitadas. Al vencer, el sistema "
                  "pasa a <b>solo lectura</b>: la clínica sigue viendo y exportando sus historias "
                  "clínicas, pero no puede cargar información nueva. Nunca se le bloquea el acceso "
                  "a los datos de sus pacientes.")]

    A += [PageBreak()]

    # ─────────── 1 · OWNER ───────────
    A += [Paragraph("1 · Para vos (dueño)", S["h1"]), Rule(),
          Paragraph("Lo que solo podés hacer vos: dar de alta clínicas nuevas y "
                    "mantener el sistema.", S["muted"]), Spacer(1, 6)]

    A += [Paragraph("Dar de alta una clínica", S["h2"])]
    A += pasos([
        'Entrá a <font face="Courier-Bold" color="#0B7A5B">novudent.novumholding.lat/superadmin</font>',
        "Poné tu <b>clave de propietario</b>. Es la que está guardada en Vercel como OWNER_PANEL_KEY. No la compartas: quien la tenga puede crear clínicas.",
        "Elegí el <b>plan</b> (Solo, Clínica o Cadena). Se puede cambiar después.",
        "Completá el <b>nombre de la clínica</b>. Teléfono y dirección son opcionales.",
        "Cargá los datos del <b>administrador</b>: nombre y apellido, email de acceso y una contraseña inicial de 6 caracteres o más.",
        'Apretá crear. La pantalla te muestra el resumen con el acceso — <b>copiálo antes de cerrarla</b>.',
    ])

    A += [Spacer(1, 4),
          callout("La contraseña que ponés es <b>provisoria</b>. La primera vez que el administrador "
                  "entre, el sistema lo obliga a cambiarla antes de dejarlo usar nada. No hace falta "
                  "que inventes algo seguro: alcanza con que sea fácil de dictar por teléfono.")]

    A += [Paragraph("Los planes", S["h2"]),
          tabla([
              ["Plan", "Precio", "Profesionales", "Usuarios", "Para quién"],
              ["Solo", "USD 45 / mes", "1", "3", "Odontólogo independiente."],
              ["Clínica", "USD 129 / mes", "5", "12", "Clínica en crecimiento. Incluye caja, inventario, informes, IA y firma electrónica."],
              ["Cadena", "A medida", "Sin límite", "Sin límite", "Multi-sucursal. Agrega CRM y acompañamiento dedicado."],
          ], [20*mm, 26*mm, 27*mm, 21*mm, W - 2*MARGIN - 94*mm])]

    A += [Spacer(1, 4),
          Paragraph("El límite de usuarios se controla solo: cuando la clínica llega al tope de su "
                    "plan, el sistema le avisa al administrador y le ofrece pasar al plan siguiente.",
                    S["muted"])]

    A += [Paragraph("Mantenimiento: lo único que no hay que olvidar", S["h2"]),
          callout("<b>Cada vez que se agrega una colección nueva al sistema hay que volver a publicar "
                  "las reglas de seguridad.</b> Si no se hace, las clínicas reales dejan de guardar "
                  "esos datos <b>en silencio</b> — y la demo sigue andando, así que el problema no se "
                  "nota hasta que un cliente reclama.<br/><br/>"
                  "Esto ya pasó: las reglas estuvieron sin actualizar desde junio hasta el 23/08/2026, "
                  "y en ese período los datos de todas las clínicas quedaron accesibles para cualquier "
                  "usuario registrado. Se corrige publicando desde la consola de Firebase, en "
                  "Firestore &gt; Reglas.", tono="alerta")]

    A += [PageBreak()]

    # ─────────── 2 · ADMIN ───────────
    A += [Paragraph("2 · Para el administrador de la clínica", S["h1"]), Rule(),
          Paragraph("Se lo podés pasar tal cual al cliente cuando le entregás el acceso.", S["muted"]),
          Spacer(1, 6)]

    A += [Paragraph("Primer ingreso", S["h2"])]
    A += pasos([
        'Entrá a <font face="Courier-Bold" color="#0B7A5B">novudent.novumholding.lat</font> y apretá <b>Iniciar sesión</b>.',
        "Usá el email y la contraseña provisoria que te pasaron.",
        "El sistema te va a pedir una <b>contraseña nueva</b> antes de dejarte entrar. Es obligatorio y es una sola vez.",
        "Listo: ya estás adentro con todos los permisos de administrador.",
    ])

    A += [Spacer(1, 3),
          Paragraph("Si olvidás la contraseña, en la pantalla de ingreso está "
                    "<b>¿Olvidaste tu contraseña?</b>: te llega un correo para elegir una nueva. "
                    "No hace falta que llames a nadie.", S["body"])]

    A += [Paragraph("Crear a tu equipo", S["h2"])]
    A += pasos([
        "Andá a <b>Configuración &gt; Usuarios del equipo</b>.",
        "Apretá <b>Agregar usuario</b> y completá nombre, email, rol y una contraseña inicial.",
        "Pasale esos datos a la persona. En su primer ingreso el sistema le va a pedir que la cambie.",
    ])

    A += [Spacer(1, 6), Paragraph("Los tres roles", S["h3"]),
          tabla([
              ["Puede…", "Admin", "Dentista", "Asistente"],
              ["Ver y cargar la agenda", "Sí", "Sí", "Sí"],
              ["Escribir en la ficha clínica (odontograma, evolución, recetas)", "Sí", "Sí", "<b>No</b> (solo lectura)"],
              ["Cobrar y hacer el arqueo de caja", "Sí", "<b>No</b>", "Sí"],
              ["Cargar gastos de la clínica", "Sí", "<b>No</b>", "<b>No</b>"],
              ["Ver informes del negocio (ingresos, producción, comisiones)", "Sí", "<b>No</b>", "<b>No</b>"],
              ["Formularios y consentimientos", "Sí", "<b>No</b>", "Sí"],
              ["Crear usuarios y cambiar la configuración", "Sí", "<b>No</b>", "<b>No</b>"],
          ], [W - 2*MARGIN - 62*mm, 20*mm, 21*mm, 21*mm])]

    A += [Spacer(1, 6),
          callout("<b>El dentista no toca dinero y el asistente no escribe la ficha clínica.</b> "
                  "No es un detalle de pantalla: aunque alguien conozca la dirección exacta, el "
                  "servidor le niega la operación. Los números del negocio los ve solamente el "
                  "administrador.")]

    A += [Paragraph("Dar de baja a alguien", S["h2"]),
          Paragraph("En <b>Configuración &gt; Usuarios del equipo</b>, el botón al final de cada fila "
                    "da de baja a esa persona. Pierde el acceso <b>en el momento</b>: sus datos y todo "
                    "lo que cargó quedan intactos, y se la puede reactivar cuando quieras.", S["body"]),
          Paragraph("No podés darte de baja a vos mismo ni al último administrador activo — la clínica "
                    "quedaría sin nadie que la administre.", S["muted"])]

    A += [Paragraph("Agenda online para tus pacientes", S["h2"]),
          Paragraph("En <b>Configuración</b> está el <b>link de reservas</b> de tu clínica. Es una "
                    "dirección pública que podés poner en Instagram, en WhatsApp o en tu web: el "
                    "paciente elige día y hora, y el turno entra directo a la agenda.", S["body"])]

    A += [PageBreak()]

    # ─────────── 3 · EQUIPO ───────────
    A += [Paragraph("3 · Para el equipo", S["h1"]), Rule(),
          Paragraph("Una hoja para la recepción y otra para el consultorio.", S["muted"]),
          Spacer(1, 6)]

    A += [Paragraph("Recepción (asistente)", S["h2"])]
    A += pasos([
        "<b>Abrí la agenda.</b> Los turnos confirmados por WhatsApp aparecen en verde y los pendientes en ámbar.",
        "<b>Para cargar un turno</b>, hacé clic en el hueco libre del horario que querés. Se crea ahí mismo.",
        "<b>Para cobrar</b>, entrá a la ficha del paciente y usá Recibir pago. Podés cobrar en cuotas y dividir entre varios planes.",
        "<b>Al cierre del día</b>, hacé el arqueo de caja: el sistema separa lo cobrado por método de pago.",
        "<b>Consentimientos y formularios</b> se envían desde la ficha del paciente.",
    ])
    A += [Spacer(1, 3),
          Paragraph("La ficha clínica la podés <b>leer</b> pero no modificar: eso lo hace el profesional.", S["muted"])]

    A += [Paragraph("Consultorio (dentista)", S["h2"])]
    A += pasos([
        "<b>Entrá al paciente</b> desde la agenda del día.",
        "<b>Marcá el hallazgo sobre el diente</b>, en la superficie que corresponda. Queda registrado quién lo cargó y cuándo.",
        "<b>Cargá la evolución y las recetas</b> desde la misma ficha.",
        "<b>Armá el presupuesto</b> y presentáselo al paciente; queda con su estado y se puede imprimir.",
    ])
    A += [Spacer(1, 3),
          Paragraph("La caja y los gastos no aparecen en tu vista: el dinero lo maneja la recepción "
                    "o el administrador.", S["muted"])]

    A += [Spacer(1, 8),
          callout("<b>Cerrá sesión al terminar</b>, sobre todo si la computadora es compartida. "
                  "Al cerrar sesión el sistema borra del equipo los datos de pacientes que tenía "
                  "guardados para andar más rápido.")]

    A += [PageBreak()]

    # ─────────── 4 · DEMO ───────────
    A += [Paragraph("4 · La cuenta demo para vender", S["h1"]), Rule(),
          Paragraph("Para mostrarle el sistema a un cliente sin crearle nada ni tocar datos reales.",
                    S["muted"]), Spacer(1, 6)]

    A += [Paragraph("Cómo se entra", S["h2"])]
    A += pasos([
        'Abrí <font face="Courier-Bold" color="#0B7A5B">novudent.novumholding.lat/login?demo=1</font>',
        "Apretá la pestaña <b>Ver demo</b>. Aparecen cuatro usuarios de ejemplo.",
        "Elegí con cuál entrar según lo que quieras mostrar: <b>Carlos Admin</b> para lo administrativo, "
        "<b>Dra. Sofía Benítez</b> para lo clínico, <b>Paola Asistente</b> para recepción.",
        "Si la demo aparece vacía, apretá <b>Restaurar datos de demo</b> y vuelve a cargarse con pacientes, agenda y caja de ejemplo.",
    ])

    A += [Spacer(1, 4),
          callout("La demo <b>no se ofrece al público</b>: solo entra quien tenga el enlace con "
                  "<b>?demo=1</b>. Es tu herramienta de venta, no una puerta abierta en el sitio.")]

    A += [Paragraph("Un recorrido de venta que funciona", S["h2"])]
    A += pasos([
        "<b>Arrancá por el odontograma</b> (entrá como la dentista). Es lo que más impresiona: marcás una caries sobre el diente, en la superficie exacta, y queda auditado.",
        "<b>Seguí con la agenda</b>: mostrá que un turno se crea con un clic en el hueco libre.",
        "<b>Mostrá el presupuesto</b> y cómo se cobra en cuotas.",
        "<b>Cerrá con los informes</b> (entrá como Carlos Admin): cuánto entró, quién produjo, quién debe.",
        "<b>Rematá con los roles</b>: entrá como asistente y mostrá que la ficha clínica no se puede editar. Es el argumento que más tranquiliza al dueño de una clínica.",
    ])

    A += [Spacer(1, 6),
          callout("<b>Nunca cargues datos de un paciente real en la demo.</b> Es un espacio de "
                  "prueba compartido y cualquiera con el enlace puede ver y modificar lo que haya "
                  "adentro. Para una prueba con datos reales, dale de alta la clínica: nace con "
                  "30 días gratis.", tono="alerta")]

    A += [Paragraph("Cuando el cliente dice que sí", S["h2"])]
    A += pasos([
        "Dale de alta la clínica desde <b>/superadmin</b> (sección 1 de este manual).",
        "Pasale el acceso del administrador y la sección 2 de este manual.",
        "Recordale que los primeros <b>30 días son de prueba</b> y que puede migrar sus datos.",
    ])

    A += [Spacer(1, 12),
          Paragraph("Novudent es un producto de NOVUM Holding · Asunción, Paraguay", S["small"])]

    doc.build(A)


if __name__ == "__main__":
    import sys
    construir(sys.argv[1] if len(sys.argv) > 1 else "/tmp/Novudent-Manual.pdf")
    print("PDF generado")
