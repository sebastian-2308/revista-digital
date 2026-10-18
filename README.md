# Revista Digital · Flipbook

Visor de revista digital con efecto 3D de paso de página, editorial oscuro,
**editor de texto en vivo sobre las páginas** y **exportación a PDF**.
Tres archivos, sin build ni dependencias locales: se abre y funciona.

## Características

- **Volteo 3D realista** con StPageFlip: gestos táctiles, arrastre con el ratón,
  esquinas interactivas y **sonido de hoja** (`assets/pagina.mp3`, con sonido
  sintetizado de respaldo si el archivo no está disponible).
- **Conversión automática del PDF**: PDF.js rasteriza cada página de
  `assets/revista.pdf` a imágenes y el libro se monta solo, sin partir el PDF a mano.
- **Carga por prioridades**: primero las páginas visibles, después el resto,
  para que revistas largas abran al instante.
- **Editor de texto en vivo** (botón *Editar texto* o tecla `E`):
  - Haz clic sobre cualquier página para escribir encima.
  - Tipografía, tamaño, color, negrita y cursiva desde la barra flotante.
  - Arrastra las cajas con el puntero; duplica o borra las que quieras.
  - `Ctrl+Z` deshace; `Esc` sale del modo edición.
  - Todo se guarda automáticamente en el navegador (por nombre de archivo).
- **Exportación a PDF** (botón *Exportar*): compone página + textos en un PDF
  real y lo descarga (por ejemplo `revista-editada.pdf`).
- **Navegación**: dock flotante con slider, indicador de páginas, riel de
  miniaturas, pantalla completa y atajos de teclado.
- **Panel de edición**: título y cajetín editables en la barra superior,
  descripción editable y ficha del archivo en el panel lateral.
- **Responsive y accesible**: vista de doble página en escritorio, página única
  en móvil, foco visible, etiquetas ARIA y respeto a `prefers-reduced-motion`.

## Cómo ejecutar

Abre `index.html` con un servidor local (por seguridad, los navegadores no
dejan leer el PDF en local con `file://`):

```bash
cd revista-digital
python -m http.server        # o: npx serve
# abre http://localhost:8000
```

Si abres `index.html` con doble clic, la app lo detecta y te ofrece
**arrastrar el PDF** a la ventana o elegirlo manualmente con un botón.

## Estructura

```
revista-digital/
├── index.html        Marcado y tipografías (Google Fonts con respaldo)
├── styles.css        Estética editorial oscura, responsive, accesible
├── app.js            Toda la lógica (PDF.js, flipbook, editor, exportación)
└── assets/
    ├── revista.pdf   Revista de ejemplo (10 páginas) — sustitúyela por la tuya
    ├── pagina.mp3    Sonido de paso de página
    └── LEEME.txt     Notas sobre los assets
```

## Sustituir la revista

Pon tu PDF en `assets/revista.pdf` (o arrástralo a la ventana). Los textos
añadidos quedan guardados por nombre de archivo, así que cada revista mantiene
sus propias capas.

## Atajos de teclado

| Tecla | Acción |
| --- | --- |
| `←` / `→`, `AvPág` / `RePág` | Página anterior / siguiente |
| `Inicio` / `Fin` | Primera / última página |
| `F` | Pantalla completa |
| `E` | Activar o desactivar el modo edición |
| `Ctrl+Z` | Deshacer el último cambio de texto |
| `Supr` | Borrar la capa seleccionada |
| `Esc` | Salir del modo edición / cerrar el panel |

## Personalización

Todo vive en el objeto `CONFIG` al principio de `app.js`: ruta del PDF y del
sonido, calidad de imagen, escala de rasterizado, valores por defecto de las
capas de texto, volumen, etc.

## Tecnologías

- [PDF.js](https://mozilla.github.io/pdf.js/) 3.11.174 (jsDelivr)
- [StPageFlip](https://github.com/nicm/stpageflip) 2.0.7 (jsDelivr)
- Sin frameworks: JavaScript puro, CSS puro, HTML semántico.
