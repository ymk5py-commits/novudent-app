# Frente E · URLs limpias en el panel y SEO del sitio público

Pedido de Croman (8-oct-2026), textual: «y mejorar todo el seo de las url https://novudent.novumholding.lat/app/configuracion#permisos veo que
tiene # mejorar todo el vanity url y el seo» · «indexar todo y mejorar todo».

## Qué se decidió y por qué (leer antes de tocar nada)

1. **Un `#` no llega al servidor ni lo indexa ningún buscador**: sirve solo para saltar dentro de una página. En el panel las secciones pasan a ser
   **rutas reales** (vanity URL): `/app/configuracion/permisos`, `/app/reportes/desempeno`… Se gana: enlaces que se pueden compartir y volver a abrir
   (el manual, el chat, un marcador), botón «atrás» que respeta la sección y títulos de pestaña propios. **Los enlaces viejos con `#` tienen que seguir
   andando** (el PDF del manual y los marcadores de la gente los usan): al cargar, se convierten solos a la ruta nueva.
2. **El panel (`/app/*`) NO se indexa, a propósito.** Está detrás del login (el buscador no ve nada útil), son datos de clínicas y una URL interna no
   tiene valor de búsqueda. Hoy lo protege `robots.txt` (`disallow: /app`), pero el `metadata.robots` raíz dice `index: true` para TODO: se refuerza con
   `noindex, nofollow` en el layout de `/app` y en las páginas por link (`/firmar`, `/confirmar`, `/pagar`, `/encuestas`, `/videoconsulta`, `/superadmin`,
   `/login`, `/reservar`). **«Indexar todo» = indexar todo lo PÚBLICO** (el sitio de marketing y lo que se agregue), nunca el panel ni las páginas con datos
   por token (privacidad de pacientes). Decírselo a Croman en el informe, con esta razón.
3. El sitio público ya tiene lo básico (probado en el código del 8-oct): `metadataBase`, canonical por página, `robots.ts`, `sitemap.ts` con 10 páginas,
   Open Graph, JSON-LD en la home y en Precios. Lo que sigue son mejoras, no una reconstrucción.

## E1 · URLs limpias del panel

Hoy se usan 17 destinos con `#` (21 enlaces: `components/Shell.tsx` NAV, tarjetas de Inicio, la campana, Mi agenda, `docs/manual/contenido/*.ts`…). Se leen en 5
lugares: `app/app/configuracion/page.tsx`, `app/app/reportes/page.tsx`, `app/app/pacientes/page.tsx`, `app/app/pacientes/[id]/page.tsx` (pestañas de la ficha) y
`app/app/tareas/page.tsx`.

| Hoy | Ruta nueva |
|---|---|
| `/app/configuracion#usuarios` | `/app/configuracion/usuarios` |
| `#permisos` · `#sucursales` · `#arancel` · `#bancos` · `#convenios` · `#logotipo` · `#consentimientos` | `/app/configuracion/<igual>` |
| `#fusion` | `/app/configuracion/fusion-de-fichas` |
| `#agendamiento` | `/app/configuracion/agenda-online` |
| `#estados-cita` | `/app/configuracion/estados-de-cita` |
| `#documentos-clinicos` | `/app/configuracion/documentos-clinicos` |
| `/app/reportes#desempeno` · `#graficos` · `#analisis` · `#excel` | `/app/reportes/<igual>` (`analisis` → `analisis-de-pacientes`) |
| `/app/pacientes#configuracion` | `/app/pacientes/configuracion` |
| `/app/tareas#estadisticas` · `#configuracion` | `/app/tareas/estadisticas` · `/app/tareas/plazos` |
| `/app/pacientes/<id>#<pestaña>` | `/app/pacientes/<id>/<pestaña>` |

- Una sola página por área que acepta la sección como segmento opcional (`[[...seccion]]`), así el contenido y los componentes no se duplican. Ojo: en
  `/app/pacientes` ya existe `nuevo/` y `[id]/`: las rutas estáticas ganan a las dinámicas, pero probalo.
- Un helper compartido (`lib/seccionesPanel.ts`, puro y con tests): tabla sección → ruta, `rutaDeSeccion(area, seccion)` y `seccionDeRuta(pathname)`, y
  `rutaDesdeHashViejo(pathname, hash)` para convertir los enlaces antiguos. Un efecto en el layout de `/app` hace `router.replace` si llega un `#` conocido.
- Cambiar de sección **no recarga la página** (se usa `router.push`/`Link`), conserva el scroll de la sección y marca bien la pestaña activa. La pestaña abierta
  se refleja en la URL; el título de la pestaña del navegador dice la sección («Permisos del equipo · Novudent»).
- Actualizar: NAV de `Shell.tsx`, todos los enlaces internos, `docs/manual/contenido/*.ts` (las capturas navegan por esas URLs; correr los módulos afectados) y los
  e2e que usan `#`.
- Criterio: abrir un enlace viejo `/app/configuracion#permisos` termina en `/app/configuracion/permisos` con la sección visible; `/app/configuracion/permisos`
  abierta directo (recarga) muestra lo mismo; «atrás» vuelve a la sección anterior.

## E2 · SEO del sitio público

Hacer en este orden, midiendo antes y después (Lighthouse o equivalente sobre `/`, `/precios`, `/capacidades`):

1. **`noindex` en lo privado** (punto 2 de arriba) y test que lo verifica (el HTML de `/app`, `/login`, `/firmar/x/y`… trae `noindex`).
2. **Un solo dominio**: hoy responden `novudent.novumholding.lat` y `novudent-app.vercel.app`; el canonical ya apunta al propio, pero conviene un **301** de
   `novudent-app.vercel.app` al dominio propio (`redirects()` en `next.config.mjs` con `has: [{ type: "host", value: "novudent-app.vercel.app" }]`; no tocar las
   URLs de preview). Antes: `grep -rn "novudent-app.vercel.app"` por si algo (pruebas de producción, integraciones, el manual) depende de ese host.
3. **Datos estructurados**: `Organization` + `WebSite` + `SoftwareApplication` (con `offers` salidos de los planes de Precios) en la home; `BreadcrumbList` en las
   páginas internas; `FAQPage` donde haya preguntas frecuentes (`lib/faqs.ts`). Validar el JSON con un test (parsea y tiene los campos obligatorios).
4. **Títulos y descripciones** únicos por página (título ≤ 60, descripción 140–160 caracteres), Open Graph y Twitter por página, y una imagen social
   (`opengraph-image`) por sección principal si hay material; que `og:url` y canonical coincidan.
5. **`sitemap.ts`**: `lastModified` con fechas reales de contenido (hoy es `new Date()` en cada pedido: le dice a Google que todo cambió siempre) y
   `alternates.languages` (`es-PY`). `robots.ts` se mantiene.
6. **Contenido y semántica**: un solo `<h1>` por página, jerarquía de títulos, `alt` en imágenes, enlaces internos con texto descriptivo, enlaces entre las
   páginas del sitio (Precios ↔ Capacidades ↔ Cómo se trabaja ↔ Odontograma). Revisar que el HTML del servidor traiga el texto (hay un temporizador anti-página-en-blanco
   porque framer-motion deja cosas en `opacity:0`; confirmar que no esconde contenido a los buscadores).
7. **Rendimiento (Core Web Vitals)**: LCP, CLS, peso de fuentes (se cargan Jost, Inter y JetBrains Mono: ¿hacen falta las tres en el sitio público?), imágenes con
   ancho y alto y formatos modernos, JS que no se usa en la landing.
8. **«Indexar»**: dejar listo todo lo que no depende de una cuenta de Croman: campos `verification` en `metadata` leídos de variables de entorno
   (`GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`; sin valor no emiten nada), el archivo de clave de **IndexNow** (clave de 32 hex generada, servida en
   `/<clave>.txt`) y `scripts/indexnow.mjs` que avisa a Bing/Yandex las URLs del sitemap (solo públicas). **Lo que sí necesita a Croman** (decirlo en el informe):
   verificar el dominio en Google Search Console (ellos dan el token; se pega en la variable de Vercel), enviar `sitemap.xml` y, si quiere, Bing Webmaster Tools.
   No ejecutar el aviso a IndexNow sin que el sitio esté publicado con la clave.

## Fuera de este frente (decisión para Croman)

- **Página pública de cada clínica** (nombre, dirección, horarios, `LocalBusiness`/`Dentist`, reserva online) indexable **si la clínica lo pide**: sería el SEO local
  que más les sirve a los clientes, pero es una función nueva (opt-in por clínica, con revisión de privacidad). Hoy `/reservar/<clinicId>` está bloqueada a propósito.
- Contenido nuevo para posicionar (blog, páginas por especialidad): se trabaja con la estrategia de marca (ver `marca/`) y el skill de SEO.
