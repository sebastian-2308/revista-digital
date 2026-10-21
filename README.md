# Noti‑Misión · Sitio y biblioteca de revistas digitales

Sitio completo del grupo juvenil **Noti‑Misión (JUMISMAC)** con biblioteca de
revistas digitales: secciones navegables, configuración del sitio protegida
con contraseña para el equipo y un lector flipbook con efecto 3D de paso de
página. La interfaz vive en tres archivos principales (`index.html`,
`styles.css`, `app.js`) y el contenido compartido en dos pequeñas APIs
(`functions/api/sitio.js` y `functions/api/biblioteca.js`); sin build ni
dependencias locales. La biblioteca y las ediciones se ven en todos los
dispositivos.

> El sitio se entrega con **el contenido del grupo ya escrito** —Inicio,
> Testimonios, Nuestras misiones, Extensión, Consejos e Información— y
> **huecos de foto**: el equipo cambia textos, fotos y enlaces desde el modo
> edición, sin tocar código.

## Secciones del sitio

Inicio · Testimonios · Nuestras misiones · Extensión · Consejos ·
Información · Biblioteca. Cada sección se muestra con un hash
(`#/inicio`, `#/testimonios`…), así que se puede enlazar directamente a
cualquiera.

## Estética editorial (sin peso extra)

- **Base de la web original**: fondo tinta `#080f13` y texto hueso, con un
  **amarillo vivo** (`#ffd43b`) como campo protagonista en la cinta, la
  navegación, el héroe, los folios y la llamada a testimonios.
- **Tipografías variables** (Fraunces + Archivo): una sola petición por familia
  y el navegador descarga solo los subconjuntos que usa. Fraunces lleva los
  titulares; Archivo, el texto y la interfaz.
- **Contraste editorial**: una banda crema a todo el ancho abre «¿Quiénes
  somos?»; los testimonios pares y algunas tarjetas usan el mismo papel claro.
  El resto sigue en tinta para que el amarillo respire.
- **Detalles de revista solo con CSS**: cinta de identidad, folios grandes
  (01–06), disco solar plano detrás de la foto del héroe, línea de cierre,
  comillas decorativas y autor en versalitas, borde superior de 4 px en las
  tarjetas, trama y esquinas en los huecos de foto, y rombo en el pie.
- **Sin imágenes de adorno, iconos externos ni librerías de animación**: el
  acabado no añade peso y respeta `prefers-reduced-motion`. Las transiciones
  van de 180 a 280 ms.

## Criterio de diseño (impeccable + taste-skill)

Estas decisiones aplican lo aprendido en `pbakaus/impeccable` y
`Leonxlnx/taste-skill`, sin romper la identidad del sitio ni los requisitos de
edición:

- **Fuera las fuentes por defecto**: Archivo sustituye a Inter; Fraunces sigue
  siendo la voz de los titulares. La pareja tiene contraste real de carácter,
  no dos sans genéricas.
- **Un gesto fuerte por pantalla**: el disco solar plano del héroe, la banda
  amarilla del testimonio y los folios grandes. El resto se queda quieto para
  que esos momentos manden.
- **Sin halos ni degradados de adorno**: fondo plano, sin radiales de color,
  sin sombras amarillas en botones, sin cápsulas alrededor de los epígrafes.
  La profundidad viene de las superficies y los bordes, no del brillo.
- **Tarjetas como papel**: borde superior grueso, esquinas de 4 px y sin
  levantar todas las tarjetas al pasar el ratón; el hover solo afirma el borde.
- **Jerarquía antes que etiqueta**: los números de sección son folios de
  revista, no micro-etiquetas en mayúsculas con tracking. Los epígrafes van en
  caja baja y a tamaño de lectura.
- **La retícula cambia según el contenido**: en Inicio la banda crema ocupa
  todo el ancho y las dos tarjetas oscuras se reparten debajo; la biblioteca
  pone buscador y «Publicar» en una sola línea.
- **Las fotos siguen siendo huecos a propósito**: no se copiaron imágenes del
  sitio original; el equipo las sustituye desde «Cambiar foto». El hueco tiene
  trama y esquinas para leerse como espacio editorial, no como un error.

## Movimiento y tacto (oficio de Emil Kowalski)

Estos detalles siguen los principios de `emilkowalski/skills`:

- **Prensado inmediato**: los botones, chips y fichas hacen `scale(0.97)` en
  `:active`, no esperan al `click`.
- **Curvas con carácter**: `--ease-out` para entradas y respuesta, `--ease-drawer`
  para el panel lateral; nada de `ease-in` en la interfaz.
- **Duración corta**: entradas de sección y fichas entre 260 y 280 ms; el
  hover no supera los 260 ms. La animación decorativa se queda por debajo de
  los 300 ms.
- **Hover solo con ratón**: los estados `:hover` se neutralizan en pantallas
  táctiles para que no se queden pegados tras un toque.
- **Táctil nativo**: sin destello azul al tocar, `touch-action: manipulation`,
  `100dvh`, safe areas del notch y campos a 16 px para que iOS no haga zoom.
- **Menos movimiento, no cero**: con `prefers-reduced-motion` se apaga el
  desplazamiento pero se conservan los cambios de color y opacidad.

## Dos formas de edición (100 % editable)

### 1. Configuración del sitio (botón «Configuración»)

- **Panel lateral**: en escritorio, los controles de edición aparecen en una
  barra lateral derecha que no tapa el contenido (el sitio reserva ese
  espacio). En móvil se muestra abajo, como antes.
- **Textos**: pulsa cualquier texto marcado y escribe (se guarda solo).
- **Fotos**: botón «Cambiar foto» en cada hueco; la imagen se recorta y
  comprime a medida.
- **Agregar bloques**: botón «Agregar bloque» en la barra de edición. Abre una
  galería de modelos ya diseñados que se insertan al final de la sección que
  estés viendo:
  - Bloque de texto · Lista con viñetas · Foto con pie (con pie de foto) ·
    Foto grande a todo el ancho · Testimonio · Ficha de integrante (ideal para
    nuevos miembros) · Cita destacada · Llamada con botón.
  Sus textos nacen editables y sus fotos se cambian igual que las demás; el ✕
  de un bloque agregado lo elimina en dos toques (no se puede deshacer).
  En la sección Biblioteca el botón aparece deshabilitado.
- **Bloques**: ✕ en cada bloque original para ocultarlo; «Mostrar bloques
  ocultos» lo recupera.
- **Enlaces**: en modo edición, un clic sobre un enlace pide la nueva URL.
- **Persistencia**: los cambios se guardan en el navegador (`localStorage`)
  mientras editas. El botón **Guardar** de la barra los publica en el almacén
  compartido (Cloudflare KV) para que se vean en otros navegadores y
  dispositivos. **Descargar cambios** / **Importar cambios** siguen disponibles
  como copia JSON. «Restablecer» (dos toques) vuelve al contenido original y
  elimina los bloques agregados; después hay que pulsar **Guardar** para
  aplicarlo en línea. En la biblioteca, el equipo también puede **publicar** o
  **retirar** revistas desde el mismo modo edición.
- **Contraseña**: el botón «Configuración» pide la contraseña antes de abrir
  el editor; solo se pide una vez por visita (se olvida al recargar). En el
  código solo se guarda su huella (FNV‑1a), nunca la contraseña en texto
  plano. Para cambiarla: ejecuta en la consola del navegador
  `__interno.calcularHuella('nueva-clave')` y pon el resultado en
  `HUELLA_CLAVE_SITIO` (`app.js`).
  > Nota: en un sitio estático la contraseña evita entradas accidentales al
  > editor; no sustituye a la seguridad de un servidor. La API de guardado
  > comprueba esa misma huella para evitar escrituras anónimas.

### 2. Descripciones de las revistas

La descripción de cada edición se puede corregir desde el botón de
información del lector o directamente en la vista previa cuando el sitio está
en modo edición. Se guarda con el resto del contenido y se sincroniza al
pulsar **Guardar**.

## Cómo ejecutar

Para usar la biblioteca compartida y el guardado en línea hace falta el
servidor de Cloudflare Pages Functions. Con Wrangler:

```bash
cd revista-digital
npx wrangler pages dev . --port 8788
# abre http://localhost:8788
```

También puedes servir solo los archivos estáticos con `python -m http.server`
o `npx serve`, pero entonces `/api/sitio` y `/api/biblioteca` no existen: la
biblioteca no carga y no se puede guardar en línea.

Si abres `index.html` con doble clic (`file://`), la app lo detecta y muestra
un aviso: puedes arrastrar un PDF a la ventana para leerlo solo en ese
dispositivo, pero la biblioteca compartida necesita Internet.

## Estructura

```
revista-digital/
├── index.html                    Marcado del sitio, secciones y barras de edición
├── styles.css                    Estética editorial oscura, responsive, accesible
├── app.js                        Toda la lógica (sitio, editores, biblioteca, flipbook)
├── wrangler.toml                 Configuración de Cloudflare Pages y KV
├── functions/api/sitio.js        API del contenido editado (GET/POST)
├── functions/api/biblioteca.js   API de la biblioteca (listar, publicar, retirar)
├── functions/api/biblioteca/     Descarga del PDF y de la portada
└── assets/
    ├── pagina.mp3                Sonido de paso de página
    └── LEEME.txt                 Notas sobre los assets
```

La biblioteca arranca vacía. Las revistas se publican desde la interfaz y se
guardan en Cloudflare KV: aparecen en todos los navegadores y dispositivos.

## Biblioteca de revistas

- **Estantería compartida** de portadas, buscador por título, categoría o
  descripción, chips de filtro y contador de publicaciones.
- **Solo el equipo publica**: los botones «Publicar revista» y «Retirar» solo
  aparecen después de entrar en **Configuración** con la contraseña. Un
  visitante nunca ve esas acciones.
- **Publicar revista**: botón *Publicar*, arrastra un PDF (con la sesión de
  editor abierta) o usa la tarjeta «Nueva publicación». El formulario pide
  título, categoría y descripción, genera la portada con la primera página
  (PDF.js) y sube el PDF completo.
- **Límite de vista**: el lector monta como máximo **12 páginas** de cada PDF,
  aunque el archivo tenga más. La barra superior y el panel lo indican
  («Vista de 12 de N páginas»). El PDF original no se recorta.
- **Descarga completa**: las fichas, la vista previa y la barra del lector
  descargan el PDF completo tal como se publicó.
- **Lector flipbook**: volteo 3D realista (StPageFlip), gestos táctiles,
  esquinas interactivas y **sonido de hoja** (`assets/pagina.mp3`).
- **Navegación**: dock flotante con deslizador, indicador de páginas, riel de
  miniaturas, pantalla completa y atajos de teclado.
- **Panel de ficha**: descripción editable (por revista) y datos del archivo.
- **Vista previa**: portada, categoría, páginas, descripción y una muestra de
  las primeras páginas; no monta el libro completo.
- **Biblioteca vacía**: muestra un mensaje distinto para visitantes («el
  equipo puede publicarlas desde Configuración») y para el editor («publica la
  primera»).

### Límites y almacenamiento

- Cada PDF puede pesar hasta **50 MB**. El servidor lo divide en fragmentos de
  20 MB para guardarlo en KV y los reconstruye en streaming al descargarlo.
- La portada se guarda aparte (máximo 2 MB).
- La lista se actualiza al instante para quien publica; Cloudflare KV puede
  tardar hasta ~60 segundos en propagar el cambio al resto del mundo.
- Si dos editores publican o guardan a la vez, gana el último guardado.

## Atajos de teclado

| Tecla | Acción |
| --- | --- |
| `←` / `→`, `AvPág` / `RePág` | Página anterior / siguiente |
| `Inicio` / `Fin` | Primera / última página |
| `F` | Pantalla completa |
| `Esc` | Cerrar el panel o la vista previa |
| `Intro` / `Espacio` | Abrir la revista enfocada (en la estantería) |

## Despliegue en Cloudflare Pages

El sitio es estático salvo las dos APIs de `functions/api/`: el contenido
editado (`sitio.js`) y la biblioteca (`biblioteca.js` + `biblioteca/[id].js`).
Las dos usan el mismo espacio de nombres KV (`SITIO_KV`) para que todo se vea
en cualquier dispositivo.

```bash
# Una sola vez: crear el espacio KV y copiar su id en wrangler.toml
npx wrangler kv namespace create noti-mision-sitio

# Una sola vez: crear el proyecto de Pages
npx wrangler pages project create noti-mision --production-branch main

# Publicar
npx wrangler pages deploy . --project-name noti-mision --branch main --commit-dirty=true
```

`wrangler.toml` enlaza el espacio como `SITIO_KV` y `wrangler pages deploy`
sube también la carpeta `functions/`. Antes de entregar, comprueba:

- `https://noti-mision.pages.dev/api/sitio` → `{"ok":true,"sitio":...}`
- `https://noti-mision.pages.dev/api/biblioteca` → `{"ok":true,"publicaciones":[...]}`

Sin Cloudflare, el sitio sigue funcionando con la copia local del navegador y
los botones **Descargar cambios** / **Importar cambios**; la biblioteca
compartida y el guardado en línea no están disponibles.

**Resiliencia del CDN:** PDF.js y page-flip se cargan con `async` desde
jsDelivr y `app.js` nunca espera a ellos. Si el CDN está lento o bloqueado,
el sitio, las rutas y el modo edición del sitio siguen funcionando; al abrir
o publicar un PDF se muestra un aviso de error a los ~10 s en lugar de
quedarse en «Cargando…».

## Personalización

Además de editar textos, fotos y bloques desde **Configuración**, el botón
**Apariencia** abre un panel para cambiar en vivo:

- colores de acento, fondo, tarjetas, texto y papel claro;
- tipografías de titulares y de texto corrido (Fraunces, Georgia, Archivo,
  sistema o monoespaciada);
- esquinas de las tarjetas, grosor del borde superior y visibilidad de la
  cinta de identidad.

El tema se guarda en `localStorage` (`revista:sitio`), viaja dentro de
**Descargar cambios** / **Importar cambios**, se publica en todos los
dispositivos con **Guardar** y se restablece solo con **Restablecer
apariencia** (sin tocar textos ni fotos). La interfaz avisa si el acento o el
texto pierden contraste con el fondo.

Los ajustes técnicos viven como constantes al principio de `app.js`: rutas de
CDN y del sonido, secciones del sitio (`SECCIONES`), ancho máximo de
rasterizado (`ANCHO_RASTER`), páginas visibles (`MAX_PAGINAS_VISIBLES`),
tamaño máximo del PDF (`TAMANO_MAX_PDF`), tema de fábrica
(`TEMA_POR_DEFECTO`) y claves de `localStorage`.

## Tecnologías

- [PDF.js](https://mozilla.github.io/pdf.js/) 3.11.174 (jsDelivr)
- [StPageFlip](https://github.com/nicm/stpageflip) 2.0.7 (jsDelivr)
- localStorage para el borrador de ediciones y Cloudflare KV (Pages Functions)
  para el contenido compartido y los PDFs de la biblioteca (por fragmentos).
- Sin frameworks: JavaScript puro, CSS puro, HTML semántico.

## Pruebas

Suites jsdom (**149 aserciones**): biblioteca compartida (listar, buscar,
filtrar, publicar solo en modo edición, subir PDF y portada, retirar, errores
de API), límite de 12 páginas visibles y descarga completa, lector, panel,
sonido, miniaturas, `file://`, rutas del sitio, contraseña de Configuración,
modo edición con galería de bloques, resiliencia sin CDN, vista previa corta,
apariencia y sincronización del contenido en línea entre dos navegadores.

Además, una prueba real con **Chrome headless** (20 comprobaciones) recorre el
flujo completo: visitante sin permisos, contraseña, formulario de publicación,
subida real a la API, portada generada, apertura del lector y retirada. Otras
10 comprobaciones revisan la biblioteca y el formulario a 390 px (sin desbordes
ni solapamientos). Y una comprobación visual (45 puntos) verifica números de
sección, fuentes, trama de los huecos, ausencia de desbordes de 390 a 1440 px,
el panel lateral de edición y la muestra de la vista previa.
