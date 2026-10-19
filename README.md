# Noti‑Misión · Sitio y biblioteca de revistas digitales

Sitio completo del grupo juvenil **Noti‑Misión (JUMISMAC)** con biblioteca de
revistas digitales: secciones navegables, modo edición para el equipo y un
lector flipbook con efecto 3D de paso de página. Tres archivos principales
(`index.html`, `styles.css`, `app.js`), sin build ni dependencias locales: se
abre y funciona.

> El sitio se entrega con **textos de guía y huecos de foto**: el equipo pone
> sus propias palabras, fotos y enlaces desde el modo edición, sin tocar código.

## Secciones del sitio

Inicio · Testimonios · Nuestras misiones · Extensión · Consejos ·
Información · Biblioteca. Cada sección se muestra con un hash
(`#/inicio`, `#/testimonios`…), así que se puede enlazar directamente a
cualquiera.

## Dos formas de edición (100 % editable)

### 1. Modo edición del sitio (botón «Editar sitio»)

- **Textos**: pulsa cualquier texto marcado y escribe (se guarda solo).
- **Fotos**: botón «Cambiar foto» en cada hueco; la imagen se recorta y
  comprime a medida.
- **Agregar bloques**: botón «Agregar bloque» en la barra de edición. Abre una
  galería de modelos ya diseñados que se insertan al final de la sección que
  estés viendo:
  - Bloque de texto · Lista con viñetas · Foto con pie · Testimonio ·
    Ficha de integrante (ideal para nuevos miembros) · Cita destacada ·
    Llamada con botón.
  Sus textos nacen editables y sus fotos se cambian igual que las demás; el ✕
  de un bloque agregado lo elimina en dos toques (no se puede deshacer).
  En la sección Biblioteca el botón aparece deshabilitado.
- **Bloques**: ✕ en cada bloque original para ocultarlo; «Mostrar bloques
  ocultos» lo recupera.
- **Enlaces**: en modo edición, un clic sobre un enlace pide la nueva URL.
- **Persistencia**: todo se guarda en el navegador (`localStorage`). Para
  llevar los cambios a otro navegador o publicarlos: **Descargar cambios**
  (JSON) → **Importar cambios**. «Restablecer» (dos toques) vuelve al
  contenido original y elimina los bloques agregados.
- **Publicación opcional**: si se crea `assets/ediciones.json` con la misma
  forma del JSON descargado, se sirve como contenido base para todos los
  visitantes (los cambios locales tienen prioridad).

### 2. Editor de texto sobre las páginas (botón «Editar texto» / tecla `E`)

Dentro del lector, sobre cualquier revista abierta:

- Un **clic sobre una página** añade un texto (título, nota, pie…).
- **Arrastr** para colocarlo; la barra superior da fuente, tamaño, color,
  negrita, cursiva y centrado.
- Duplicar, deshacer (`Ctrl+Z`), borrar (`Supr`) o salir (`E` / `Esc`).
- Los textos se guardan **por revista** en el navegador.
- **PDF editado**: exporta la revista con los textos ya escritos encima
  (compone página + textos en un PDF descargable, sin librerías externas).

## Cómo ejecutar

Abre `index.html` con un servidor local (por seguridad, los navegadores no
dejan leer los PDF en local con `file://`):

```bash
cd revista-digital
python -m http.server        # o: npx serve
# abre http://localhost:8000
```

Si abres `index.html` con doble clic, la app lo detecta: la estantería usa el
catálogo incluido y te ofrece **elegir el PDF a mano** para leerlo en la
sesión.

## Estructura

```
revista-digital/
├── index.html                 Marcado del sitio, secciones y barras de edición
├── styles.css                 Estética editorial oscura, responsive, accesible
├── app.js                     Toda la lógica (sitio, editores, biblioteca, flipbook)
└── assets/
    ├── revistas.json          Catálogo de la estantería (título, categoría, PDF…)
    ├── revista.pdf            Horizontes N.º 01 — Diseño (10 páginas)
    ├── revista-orbita.pdf     Órbita N.º 07 — Ciencia (6 páginas)
    ├── revista-taller.pdf     Taller N.º 12 — Oficios (6 páginas)
    ├── covers/                Portadas de la estantería (JPEG)
    ├── pagina.mp3             Sonido de paso de página
    └── LEEME.txt              Notas sobre los assets
```

## Biblioteca de revistas

- **Estantería** de portadas con lomo, buscador por título o categoría, chips
  de filtro y orden (lo publicado primero, luego el catálogo).
- **Publicar revista**: botón *Publicar* o **arrastra un PDF** a la ventana.
  Se le genera la portada automáticamente (PDF.js rasteriza la página 1) y
  queda persistida en el navegador (IndexedDB, con respaldo en memoria).
- **Lector flipbook**: volteo 3D realista (StPageFlip), gestos táctiles,
  esquinas interactivas y **sonido de hoja** (`assets/pagina.mp3`).
- **Navegación**: dock flotante con deslizador, indicador de páginas, riel de
  miniaturas, pantalla completa y atajos de teclado.
- **Panel de ficha**: descripción editable (se guarda sola, por revista) y
  datos del archivo.

## Añadir o quitar revistas del catálogo

1. Pon el PDF en `assets/` y una portada en `assets/covers/`.
2. Añade una entrada en `assets/revistas.json`:

```json
{
  "id": "mi-revista-01",
  "titulo": "Mi revista",
  "numero": "N.º 01",
  "categoria": "Diseño",
  "fecha": "2026-10-01",
  "pdf": "assets/mi-revista.pdf",
  "portada": "assets/covers/mi-revista-01.jpg",
  "paginas": 12,
  "descripcion": "De qué va esta edición."
}
```

Las revistas que publicas desde la interfaz no tocan este archivo: se guardan
en tu navegador. En cada ficha propia aparece un ✕ para quitarla.

## Atajos de teclado

| Tecla | Acción |
| --- | --- |
| `←` / `→`, `AvPág` / `RePág` | Página anterior / siguiente |
| `Inicio` / `Fin` | Primera / última página |
| `F` | Pantalla completa |
| `E` | Activar / desactivar el editor de texto sobre páginas |
| `Supr` | Borrar el texto seleccionado (en modo texto) |
| `Ctrl+Z` | Deshacer (en modo texto) |
| `Esc` | Salir del modo texto / cerrar el panel |
| `Intro` / `Espacio` | Abrir la revista enfocada (en la estantería) |

## Despliegue en Cloudflare Pages

El sitio es 100 % estático: sube la carpeta tal cual.

```bash
npx wrangler pages project create noti-mision --production-branch main
npx wrangler pages deploy . --project-name noti-mision
```

Cualquier CDN estático sirve (GitHub Pages, Netlify…): no hay backend.

**Resiliencia del CDN:** PDF.js y page-flip se cargan con `async` desde
jsDelivr y `app.js` nunca espera a ellos. Si el CDN está lento o bloqueado,
el sitio, las rutas y los dos modos de edición siguen funcionando; al abrir
o publicar un PDF se muestra un aviso de error a los ~10 s en lugar de
quedarse en «Cargando…».

## Personalización

Los ajustes viven como constantes al principio de `app.js`: rutas de CDN y del
sonido, secciones del sitio (`SECCIONES`), ancho máximo de rasterizado
(`ANCHO_RASTER`), categoría de las publicaciones propias (`CATEGORIA_PROPIA`) y
claves de `localStorage`.

## Tecnologías

- [PDF.js](https://mozilla.github.io/pdf.js/) 3.11.174 (jsDelivr)
- [StPageFlip](https://github.com/nicm/stpageflip) 2.0.7 (jsDelivr)
- IndexedDB para las publicaciones propias; localStorage para ediciones.
- Sin frameworks: JavaScript puro, CSS puro, HTML semántico.

## Pruebas

Suites jsdom (50 + 14 + 62 + 14 aserciones) que cubren estantería, filtros,
apertura, navegación, panel, sonido, miniaturas, publicación, el modo
`file://`, las rutas del sitio, el modo edición del sitio (con la galería de
bloques predefinidos), el editor de capas sobre páginas, la resiliencia sin
CDN y la exportación del PDF editado.
