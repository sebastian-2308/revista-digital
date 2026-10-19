# Biblioteca · Revistas digitales

Biblioteca de revistas digitales con efecto 3D de paso de página: una estantería
ordenada donde publicas tus propios PDFs y los lees como un libro de verdad.
Tres archivos principales, sin build ni dependencias locales: se abre y funciona.

## Características

- **Vista biblioteca**: estantería de portadas con lomo, buscador por título o
  categoría, chips de filtro y orden (lo publicado primero, luego el catálogo).
- **Publicar revista**: botón *Publicar* o **arrastra un PDF** a la ventana.
  Se le genera la portada automáticamente (PDF.js rasteriza la página 1), se
  guardan nº de páginas y fecha, y queda en la estantería persistida en el
  navegador (IndexedDB, con respaldo en memoria si no hay soporte).
- **Lector flipbook**: al pulsar una portada se abre a pantalla completa con
  **volteo 3D realista** (StPageFlip), gestos táctiles, arrastre con el ratón,
  esquinas interactivas y **sonido de hoja** (`assets/pagina.mp3`).
- **Conversión automática del PDF**: PDF.js rasteriza cada página a imágenes y
  el libro se monta solo. Carga por prioridades: primero las visibles.
- **Navegación**: dock flotante con deslizador, indicador de páginas, riel de
  miniaturas, pantalla completa y atajos de teclado.
- **Panel de ficha**: descripción editable (se guarda sola en el navegador,
  por revista) y datos del archivo.
- **Responsive y accesible**: doble página en escritorio, página única en
  móvil, foco visible, etiquetas ARIA y respeto a `prefers-reduced-motion`.

> No hay editor de texto en vivo: la revista se lee tal cual se publica.
> Para cambiar un texto, edita el PDF de origen y vuelve a publicarlo.

## Cómo ejecutar

Abre `index.html` con un servidor local (por seguridad, los navegadores no
dejan leer los PDF en local con `file://`):

```bash
cd revista-digital
python -m http.server        # o: npx serve
# abre http://localhost:8000
```

Si abres `index.html` con doble clic, la app lo detecta: la estantería usa el
catálogo incluido y te ofrece **elegir el PDF a mano** para leerlo en la sesión.

## Estructura

```
revista-digital/
├── index.html                 Marcado y tipografías (Google Fonts con respaldo)
├── styles.css                 Estética editorial oscura, responsive, accesible
├── app.js                     Toda la lógica (biblioteca, publicación, flipbook)
└── assets/
    ├── revistas.json          Catálogo de la estantería (título, categoría, PDF…)
    ├── revista.pdf            Horizontes N.º 01 — Diseño (10 páginas)
    ├── revista-orbita.pdf     Órbita N.º 07 — Ciencia (6 páginas)
    ├── revista-taller.pdf     Taller N.º 12 — Oficios (6 páginas)
    ├── covers/                Portadas de la estantería (JPEG)
    ├── pagina.mp3             Sonido de paso de página
    └── LEEME.txt              Notas sobre los assets
```

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
| `Esc` | Cerrar el panel de información |
| `Intro` / `Espacio` | Abrir la revista enfocada (en la estantería) |

## Personalización

Los ajustes viven como constantes al principio de `app.js`: rutas de CDN y del
sonido, ancho máximo de rasterizado (`ANCHO_RASTER`), categoría de las
publicaciones propias (`CATEGORIA_PROPIA`) y claves de `localStorage`.

## Tecnologías

- [PDF.js](https://mozilla.github.io/pdf.js/) 3.11.174 (jsDelivr)
- [StPageFlip](https://github.com/nicm/stpageflip) 2.0.7 (jsDelivr)
- IndexedDB para las publicaciones propias.
- Sin frameworks: JavaScript puro, CSS puro, HTML semántico.

## Pruebas

Suites jsdom (50 + 14 aserciones) que cubren estantería, filtros, apertura,
navegación, panel, sonido, miniaturas, publicación y el modo `file://`.
