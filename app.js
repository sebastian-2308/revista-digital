/* ==========================================================================
   BIBLIOTECA · REVISTAS DIGITALES
   app.js — lógica completa de la aplicación.

   Qué hace este archivo:
     1. Muestra una BIBLIOTECA de revistas (estantería con portadas, buscador
        y categorías) construida desde assets/revistas.json.
     2. Permite PUBLICAR un PDF propio: se le genera portada con PDF.js y se
        guarda en el navegador (IndexedDB) para que aparezca en la estantería.
     3. Abre cualquier revista en un LECTOR tipo libro (StPageFlip) con
        volteo 3D, sonido de página, miniaturas, pantalla completa y panel
        de descripción editable.

   NO hay editor de texto en vivo: la revista se lee tal cual se publica.

   Requisitos: conexión a Internet la primera vez (CDN de PDF.js y page-flip).
   ========================================================================== */

'use strict';

/* ========================= 1. CONFIGURACIÓN ============================== */

/** Rutas de las librerías (CDN jsDelivr). */
const RUTA_PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/';
const RUTA_CMAPS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/';
const RUTA_FUENTES = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/';

/** Sonido real de pasar página (.mp3 en assets/). */
const RUTA_SONIDO = 'assets/pagina.mp3';

/** Ancho máximo (px) al rasterizar cada página del PDF. */
const ANCHO_RASTER = 1700;

/** Categoría que reciben las revistas publicadas por la persona usuaria. */
const CATEGORIA_PROPIA = 'Mis revistas';

/** Claves de preferencias en localStorage. */
const CLAVE_SONIDO = 'revista:sonido';
const CLAVE_DESCRIPCION = 'revista:descripcion:';

/* ========================= 2. CATÁLOGO RESIDENTE ========================== */
/* Copia de seguridad de assets/revistas.json para cuando el navegador no
   permite leer archivos locales (file://) o falla la red. */

const CATALOGO_RESIDENTE = [
  {
    id: 'horizontes-01',
    titulo: 'Horizontes',
    numero: 'N.º 01',
    categoria: 'Diseño',
    fecha: '2026-10-01',
    pdf: 'assets/revista.pdf',
    portada: 'assets/covers/horizontes-01.jpg',
    paginas: 10,
    descripcion: 'Revista de diseño y cultura: la ciudad a pie, el regreso de la arcilla y una conversación con la arquitecta Lucía Ferrán.'
  },
  {
    id: 'orbita-07',
    titulo: 'Órbita',
    numero: 'N.º 07',
    categoria: 'Ciencia',
    fecha: '2026-09-15',
    pdf: 'assets/revista-orbita.pdf',
    portada: 'assets/covers/orbita-07.jpg',
    paginas: 6,
    descripcion: 'Ciencia explicada sin prisa: océano, hielo y las personas que miden el planeta.'
  },
  {
    id: 'taller-12',
    titulo: 'Taller',
    numero: 'N.º 12',
    categoria: 'Oficios',
    fecha: '2026-10-10',
    pdf: 'assets/revista-taller.pdf',
    portada: 'assets/covers/taller-12.jpg',
    paginas: 6,
    descripcion: 'Cuaderno de oficios: madera, cerámica y las manos que todavía hacen las cosas.'
  }
];

/* ========================= 3. ESTADO DE LA APP ============================ */

const estado = {
  vista: 'biblioteca',          // 'biblioteca' | 'lector'
  catalogo: [],                 // revistas del manifiesto
  publicadas: [],               // revistas publicadas por la persona (IndexedDB)
  filtro: { texto: '', categoria: '' },

  // lectura actual
  doc: null,                    // documento pdf.js abierto
  paginas: [],                  // vistas de página + estado de pintado
  imgs: [],                     // <img> de cada página del flipbook
  flip: null,                   // instancia de St.PageFlip
  anchoBase: 1125,              // ancho de página en puntos (del PDF)
  altoBase: 1591,               // alto de página en puntos
  archivo: null,                // ficha del archivo abierto
  pubAbierta: null,             // publicación abierta (para panel y descripción)
  pubPendiente: null,           // revista que falló al abrirse (reintentar)
  abriendo: false,
  publicando: false,
  cargandoLocal: false,

  // sonido
  audio: null,
  sonidoActivo: true,
  sonidoInicializado: false,

  // miniaturas
  railVisible: false,
  generandoMiniaturas: false,

  guardadoLocal: true            // false si IndexedDB no está disponible
};

/* ========================= 4. UTILIDADES ================================== */

const $ = (sel) => document.querySelector(sel);

const ui = {
  barraBiblioteca: $('.barra--biblioteca'),
  barraLector: $('.barra--lector'),
  vistaBiblioteca: $('#vistaBiblioteca'),
  vistaLector: $('#vistaLector'),

  // biblioteca
  estanteria: $('#estanteria'),
  chipsCategorias: $('#chipsCategorias'),
  contarRevistas: $('#contarRevistas'),
  bibliotecaVacia: $('#bibliotecaVacia'),
  inputBusqueda: $('#inputBusqueda'),
  inputPublicar: $('#inputPublicar'),
  btnPublicar: $('#btnPublicar'),
  btnVerTodas: $('#btnVerTodas'),

  // lector
  zonaLibro: $('#zonaLibro'),
  contenedorLibro: $('#contenedorLibro'),
  btnVolver: $('#btnVolver'),
  kickerEdicion: $('#kickerEdicion'),
  tituloEdicion: $('#tituloEdicion'),
  btnSonido: $('#btnSonido'),
  btnInfo: $('#btnInfo'),
  btnAnterior: $('#btnAnterior'),
  btnSiguiente: $('#btnSiguiente'),
  indicadorPagina: $('#indicadorPagina'),
  sliderPagina: $('#sliderPagina'),
  btnRail: $('#btnRail'),
  btnPantallaCompleta: $('#btnPantallaCompleta'),
  railMiniaturas: $('#railMiniaturas'),
  miniaturas: $('#miniaturas'),
  lineaProgreso: $('#lineaProgreso'),
  barraProgreso: $('#barraProgreso'),

  // overlays, panel y avisos
  overlayCarga: $('#overlayCarga'),
  textoCarga: $('#textoCarga'),
  detalleCarga: $('#detalleCarga'),
  panelArchivo: $('#panelArchivo'),
  inputArchivo: $('#inputArchivo'),
  btnReintentar: $('#btnReintentar'),
  zonaArrastre: $('#zonaArrastre'),
  fondoPanel: $('#fondoPanel'),
  panelInfo: $('#panelInfo'),
  btnCerrarInfo: $('#btnCerrarInfo'),
  btnRestaurarInfo: $('#btnRestaurarInfo'),
  textoInfo: $('#textoInfo'),
  datoArchivo: $('#datoArchivo'),
  datoPaginas: $('#datoPaginas'),
  datoFormato: $('#datoFormato'),
  datoFecha: $('#datoFecha'),
  aviso: $('#aviso')
};

/** Limita un número a un rango. */
const limite = (valor, min, max) => Math.min(max, Math.max(min, valor));

/** Formatea pesos de archivo (bytes → KB/MB). */
function formatearPeso(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/** Formatea fechas en español (AAAA-MM-DD → «1 de octubre de 2026»). */
function formatearFecha(iso) {
  if (!iso) return '—';
  const f = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
  if (isNaN(f)) return iso;
  try {
    return f.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

/** Convierte «mi-revista.pdf» en «Mi revista». */
function bonitarNombre(nombre) {
  const base = String(nombre || 'Revista').replace(/\.pdf$/i, '');
  const limpio = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/** Espera unos milisegundos (para transiciones yAnimationFrame seguro). */
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* ========================= 5. AVISOS Y OVERLAYS =========================== */

let temporizadorAviso = null;

/** Muestra un aviso flotante. `esError` lo pinta en rojo. */
function avisar(texto, esError) {
  ui.aviso.textContent = texto;
  ui.aviso.classList.toggle('error', !!esError);
  ui.aviso.classList.add('visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => ui.aviso.classList.remove('visible'), 5200);
}

function mostrarOverlayCarga(texto, detalle) {
  ui.textoCarga.textContent = texto || 'Cargando…';
  ui.detalleCarga.textContent = detalle || '';
  ui.overlayCarga.classList.remove('oculto');
}

function ocultarOverlayCarga() {
  ui.overlayCarga.classList.add('oculto');
  ui.lineaProgreso.hidden = true;
  ui.barraProgreso.style.width = '0%';
}

function mostrarPanelArchivo() {
  ui.panelArchivo.classList.remove('oculto');
}

function ocultarPanelArchivo() {
  ui.panelArchivo.classList.add('oculto');
}

function actualizarProgreso(fraccion) {
  ui.lineaProgreso.hidden = false;
  ui.barraProgreso.style.width = Math.round(limite(fraccion, 0, 1) * 100) + '%';
}

/* ========================= 6. ALMACÉN DE PUBLICACIONES ==================== */
/* Las revistas que publicas se guardan en IndexedDB (con respaldo en
   memoria si el navegador no la ofrece, p. ej. algunos file://). */

const NOMBRE_DB = 'biblioteca-revistas';
const VERSION_DB = 1;

function abrirBaseDatos() {
  return new Promise((resolver, rechazar) => {
    if (!('indexedDB' in window)) {
      rechazar(new Error('sin-indexeddb'));
      return;
    }
    const peticion = indexedDB.open(NOMBRE_DB, VERSION_DB);
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      if (!bd.objectStoreNames.contains('publicaciones')) {
        bd.createObjectStore('publicaciones', { keyPath: 'id' });
      }
    };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error || new Error('idb'));
  });
}

/** Devuelve todas las publicaciones propias (o [] si no hay soporte). */
async function listarPublicaciones() {
  try {
    const bd = await abrirBaseDatos();
    const resultado = await new Promise((resolver, rechazar) => {
      const peticion = bd.transaction('publicaciones', 'readonly')
        .objectStore('publicaciones').getAll();
      peticion.onsuccess = () => resolver(peticion.result || []);
      peticion.onerror = () => rechazar(peticion.error);
    });
    bd.close();
    return resultado;
  } catch {
    estado.guardadoLocal = false;   // solo memoria de la sesión
    return [];
  }
}

/** Guarda (o actualiza) una publicación propia. */
async function guardarPublicacion(pub) {
  try {
    const bd = await abrirBaseDatos();
    await new Promise((resolver, rechazar) => {
      const transaccion = bd.transaction('publicaciones', 'readwrite');
      transaccion.objectStore('publicaciones').put(pub);
      transaccion.oncomplete = () => resolver();
      transaccion.onerror = () => rechazar(transaccion.error);
    });
    bd.close();
  } catch {
    estado.guardadoLocal = false;
  }
}

/** Elimina una publicación propia. */
async function borrarPublicacion(id) {
  try {
    const bd = await abrirBaseDatos();
    await new Promise((resolver, rechazar) => {
      const transaccion = bd.transaction('publicaciones', 'readwrite');
      transaccion.objectStore('publicaciones').delete(id);
      transaccion.oncomplete = () => resolver();
      transaccion.onerror = () => rechazar(transaccion.error);
    });
    bd.close();
  } catch {
    estado.guardadoLocal = false;
  }
}

/* ========================= 7. VISTA BIBLIOTECA ============================ */

/** Catálogo completo: primero lo publicado, luego el manifiesto. */
function catalogoCompleto() {
  return estado.publicadas.concat(estado.catalogo);
}

/** Texto normalizado para el buscador. */
function textoBusqueda(pub) {
  return ((pub.titulo || '') + ' ' + (pub.categoria || '') + ' ' + (pub.numero || ''))
    .toLowerCase();
}

/** Revistas que pasan los filtros activos (búsqueda + categoría). */
function filtradas() {
  const q = estado.filtro.texto.trim().toLowerCase();
  const cat = estado.filtro.categoria;
  return catalogoCompleto().filter((pub) => {
    if (cat && pub.categoria !== cat) return false;
    if (q && !textoBusqueda(pub).includes(q)) return false;
    return true;
  });
}

/** Dibuja los chips de categorías a partir del catálogo real. */
function renderizarChips() {
  const categorias = [];
  for (const pub of catalogoCompleto()) {
    if (pub.categoria && !categorias.includes(pub.categoria)) categorias.push(pub.categoria);
  }
  ui.chipsCategorias.innerHTML = '';

  const crear = (etiqueta, valor) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.setAttribute('role', 'tab');
    chip.setAttribute('aria-selected', String(estado.filtro.categoria === valor));
    chip.textContent = etiqueta;
    chip.addEventListener('click', () => {
      estado.filtro.categoria = valor;
      renderizarChips();
      renderizarEstanteria();
    });
    ui.chipsCategorias.appendChild(chip);
  };

  crear('Todas', '');
  for (const cat of categorias) crear(cat, cat);
}

/** Genera una ficha de revista en la estantería. */
function crearFicha(pub, indice) {
  const ficha = document.createElement('article');
  ficha.className = 'ficha' + (pub.propia ? ' ficha--propia' : '');
  ficha.setAttribute('role', 'button');
  ficha.setAttribute('tabindex', '0');
  ficha.setAttribute('aria-label',
    'Abrir ' + pub.titulo + (pub.numero ? ', ' + pub.numero : '') +
    (pub.paginas ? ', ' + pub.paginas + ' páginas' : ''));
  ficha.style.setProperty('--i', String(indice));

  const meta = [pub.numero, pub.paginas ? pub.paginas + ' pág.' : null]
    .filter(Boolean).join(' · ');

  ficha.innerHTML =
    '<div class="ficha__portada-wrap">' +
      (pub.portada
        ? '<img class="ficha__portada" src="' + pub.portada + '" alt="" loading="lazy" decoding="async">'
        : '<span class="ficha__portada-texto">Sin portada</span>') +
      (pub.categoria ? '<span class="ficha__cat">' + pub.categoria + '</span>' : '') +
      (pub.propia ? '<span class="ficha__sello">Tu publicación</span>' : '') +
    '</div>' +
    '<h3 class="ficha__titulo">' + pub.titulo + '</h3>' +
    '<p class="ficha__meta">' + meta + '</p>';

  // Quitar publicación propia (confirmación en dos toques)
  if (pub.propia) {
    const btnQuitar = document.createElement('button');
    btnQuitar.type = 'button';
    btnQuitar.className = 'ficha__quitar';
    btnQuitar.title = 'Quitar de la biblioteca';
    btnQuitar.setAttribute('aria-label', 'Quitar «' + pub.titulo + '» de la biblioteca');
    btnQuitar.innerHTML =
      '<svg viewBox="0 0 24 24" class="icono" aria-hidden="true">' +
      '<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    let pendiente = false;
    let temp = null;
    btnQuitar.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!pendiente) {
        pendiente = true;
        btnQuitar.style.background = 'rgba(80, 20, 16, 0.95)';
        btnQuitar.title = 'Pulsa otra vez para confirmar';
        temp = setTimeout(() => { pendiente = false; btnQuitar.style.background = ''; }, 3200);
        return;
      }
      clearTimeout(temp);
      estado.publicadas = estado.publicadas.filter((p) => p.id !== pub.id);
      borrarPublicacion(pub.id);
      renderizarChips();
      renderizarEstanteria();
      avisar('«' + pub.titulo + '» se ha quitado de la biblioteca.');
    });
    ficha.appendChild(btnQuitar);
  }

  const abrir = () => abrirPublicacion(pub);
  ficha.addEventListener('click', abrir);
  ficha.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
  });
  return ficha;
}

/** Dibuja la estantería completa según los filtros. */
function renderizarEstanteria() {
  const visibles = filtradas();
  const total = catalogoCompleto().length;

  ui.estanteria.innerHTML = '';

  // Ficha de «publicar» siempre la primera
  const fichaNueva = document.createElement('article');
  fichaNueva.className = 'ficha ficha--nueva';
  fichaNueva.setAttribute('role', 'button');
  fichaNueva.setAttribute('tabindex', '0');
  fichaNueva.setAttribute('aria-label', 'Publicar una revista nueva desde un PDF');
  fichaNueva.innerHTML =
    '<div class="ficha__portada-wrap">' +
      '<svg viewBox="0 0 24 24" class="icono" aria-hidden="true">' +
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
        '<path d="M7 8l5-5 5 5"/><path d="M12 3v12"/></svg>' +
      '<span class="ficha__portada-texto">Publicar revista<br>arrastra un PDF o pulsa aquí</span>' +
    '</div>' +
    '<h3 class="ficha__titulo">Nueva publicación</h3>' +
    '<p class="ficha__meta">Se guardará en este navegador</p>';
  const lanzar = () => ui.inputPublicar.click();
  fichaNueva.addEventListener('click', lanzar);
  fichaNueva.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lanzar(); }
  });
  ui.estanteria.appendChild(fichaNueva);

  visibles.forEach((pub, i) => ui.estanteria.appendChild(crearFicha(pub, i + 1)));

  ui.bibliotecaVacia.hidden = visibles.length > 0;

  const filtrando = !!(estado.filtro.texto.trim() || estado.filtro.categoria);
  const palabra = total === 1 ? 'publicación' : 'publicaciones';
  ui.contarRevistas.textContent = filtrando
    ? visibles.length + ' de ' + total + ' ' + palabra
    : total + ' ' + palabra;
}

/* ========================= 8. PUBLICAR UN PDF ============================= */

/** Genera portada (dataURL) y nº de páginas de un PDF. */
async function generarPortada(bytesCopia) {
  const carga = pdfjsLib.getDocument({ data: bytesCopia });
  const doc = await carga.promise;
  const pagina = await doc.getPage(1);
  const vp = pagina.getViewport({ scale: 1 });
  const escala = 480 / vp.width;
  const vp2 = pagina.getViewport({ scale: escala });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp2.width);
  canvas.height = Math.round(vp2.height);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pagina.render({ canvasContext: ctx, viewport: vp2 }).promise;

  const url = canvas.toDataURL('image/jpeg', 0.82);
  const paginas = doc.numPages;
  try { doc.destroy(); } catch { /* noop */ }
  return { portada: url, paginas };
}

/** Publica un archivo PDF en la biblioteca (con portada automática). */
async function publicarPDF(archivo) {
  if (!archivo) return;
  const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name || '');
  if (!esPdf) { avisar('Solo se pueden publicar archivos PDF.', true); return; }
  if (estado.publicando) return;
  if (!pdfjsLib) { avisar('PDF.js no está disponible: no se puede publicar.', true); return; }

  estado.publicando = true;
  mostrarOverlayCarga('Preparando «' + archivo.name + '»…', 'Generando portada y ficha');

  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer());

    let portada = '';
    let paginas = 0;
    try {
      // copia: pdf.js puede consumir el buffer que recibe
      const r = await generarPortada(bytes.slice(0));
      portada = r.portada;
      paginas = r.paginas;
    } catch (e) {
      console.warn('No se pudo generar la portada:', e);
      avisar('No se pudo generar la portada; la ficha quedará sin imagen.');
    }

    const hoy = new Date();
    const pub = {
      id: 'propia-' + hoy.getTime(),
      titulo: bonitarNombre(archivo.name),
      numero: 'PDF propio',
      categoria: CATEGORIA_PROPIA,
      fecha: hoy.toISOString().slice(0, 10),
      paginas: paginas || 0,
      portada: portada,
      descripcion: 'Publicada el ' + formatearFecha(hoy.toISOString().slice(0, 10)) +
        '. Puedes editar esta descripción desde el botón de información del lector.',
      bytes: bytes,
      propia: true
    };

    await guardarPublicacion(pub);
    estado.publicadas.unshift(pub);
    renderizarChips();
    renderizarEstanteria();
    ocultarOverlayCarga();
    avisar('«' + pub.titulo + '» ya está en tu biblioteca.' +
      (estado.guardadoLocal ? '' : ' (Se guardará solo mientras dure la sesión.)'));
  } catch (e) {
    console.error(e);
    ocultarOverlayCarga();
    avisar('No se pudo publicar el archivo: ' + ((e && e.message) || e), true);
  } finally {
    estado.publicando = false;
    ui.inputPublicar.value = '';
  }
}

/* ========================= 9. ABRIR UNA REVISTA =========================== */

/** Carga y monta un PDF en el lector. Devuelve true si salió bien. */
async function abrirPDF(bytes, meta) {
  if (!pdfjsLib) {
    avisar('No se cargó PDF.js. Comprueba tu conexión a Internet.', true);
    return false;
  }
  if (!window.St) {
    avisar('No se cargó la librería de volteo (page-flip). Comprueba tu conexión.', true);
    return false;
  }

  destruirLibro();
  estado.archivo = meta;
  mostrarOverlayCarga('Procesando «' + meta.nombre + '»…', '');

  try {
    const carga = pdfjsLib.getDocument({
      data: bytes.slice(0),
      cMapUrl: RUTA_CMAPS,
      cMapPacked: true,
      standardFontDataUrl: RUTA_FUENTES
    });
    carga.onProgress = (p) => {
      if (p && p.total) {
        actualizarProgreso(p.loaded / p.total);
        ui.detalleCarga.textContent = formatearPeso(p.loaded) + ' de ' + formatearPeso(p.total);
      }
    };

    const doc = await carga.promise;
    estado.doc = doc;

    // Dimensiones de página (puntos PDF) — guían el tamaño del flipbook
    const primera = await doc.getPage(1);
    const vp1 = primera.getViewport({ scale: 1 });
    estado.anchoBase = vp1.width;
    estado.altoBase = vp1.height;

    // Construimos las páginas del libro (div > img; nunca <canvas>:
    // StPageFlip clona el DOM y los canvas clonados saldrían en blanco)
    const elems = [];
    estado.imgs = [];
    estado.paginas = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const pdfPage = await doc.getPage(i);

      const div = document.createElement('div');
      div.className = 'pagina';
      div.dataset.density = 'hard';

      const img = document.createElement('img');
      img.alt = 'Página ' + i + ' de ' + doc.numPages;
      img.decoding = 'async';
      img.draggable = false;
      img.dataset.pagina = String(i);

      div.appendChild(img);
      elems.push(div);
      estado.imgs.push(img);
      estado.paginas.push({ pdfPage, pintada: false, pintando: false, miniatura: null });
    }

    ui.contenedorLibro.innerHTML = '';
    elems.forEach((el) => ui.contenedorLibro.appendChild(el));

    // Instanciar el flipbook en modo libro abierto
    const flip = new window.St.PageFlip(ui.contenedorLibro, {
      width: Math.round(vp1.width),
      height: Math.round(vp1.height),
      minWidth: 290,
      maxWidth: 3400,
      minHeight: 380,
      maxHeight: 4800,
      drawShadow: true,
      flippingTime: 900,
      usePortrait: true,
      startZIndex: 30,
      autoSize: true,
      maxShadowOpacity: 0.7,
      showCover: true,
      mobileScrollSupport: false,
      swipeDistance: 30,
      switchingTime: 400
    });

    flip.loadFromHTML(elems);
    estado.flip = flip;

    // Eventos del volteo
    flip.on('flipping', () => sonar());
    flip.on('flip', () => actualizarNavegacion());
    flip.on('changeOrientation', () => {
      dimensionarLibro();
      actualizarNavegacion();
    });
    flip.on('changeState', () => { /* estado del pliegue: sin uso visual */ });

    dimensionarLibro();
    actualizarNavegacion();
    actualizarDatosPanel();
    ocultarOverlayCarga();

    // Pintado progresivo: primero las dos visibles, luego el resto
    pintarPrioridad(0);
    pintarPrioridad(1);
    (async () => {
      for (let i = 2; i < estado.paginas.length; i++) await pintarPrioridad(i);
    })();

    return true;
  } catch (e) {
    console.error('No se pudo abrir el PDF:', e);
    destruirLibro();
    avisar('No se pudo leer el PDF: ' + ((e && e.message) || e), true);
    return false;
  }
}

/** Rasteriza la página i (0-based) del PDF a un <img> del flipbook. */
async function pintarPrioridad(indice) {
  const item = estado.paginas[indice];
  if (!item || item.pintando || item.pintada) return;
  item.pintando = true;

  try {
    const page = item.pdfPage;
    const escala = Math.max(0.5, Math.min(ANCHO_RASTER / estado.anchoBase,
      (window.devicePixelRatio || 1) * 1.4));
    const vp = page.getViewport({ scale: escala });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    const img = estado.imgs[indice];
    if (!img) throw new Error('sin <img> destino');

    await new Promise((resolver, rechazar) => {
      canvas.toBlob((blob) => {
        if (!blob) { rechazar(new Error('toBlob devolvió null')); return; }
        const url = URL.createObjectURL(blob);
        img.onload = () => { URL.revokeObjectURL(url); resolver(); };
        img.onerror = () => { URL.revokeObjectURL(url); rechazar(new Error('fallo al cargar la imagen')); };
        img.src = url;
      }, 'image/jpeg', 0.86);
    });

    item.pintada = true;
    page.cleanup();
    pintarMiniatura(indice);
  } catch (e) {
    console.warn('Página ' + (indice + 1) + ' no se pudo rasterizar:', e);
  } finally {
    item.pintando = false;
  }
}

/** Abre una publicación de la biblioteca (manifiesto o propia). */
async function abrirPublicacion(pub) {
  if (estado.abriendo) return;
  estado.abriendo = true;
  estado.pubAbierta = pub;
  mostrarOverlayCarga('Abriendo «' + pub.titulo + '»…',
    (pub.numero ? pub.numero + ' · ' : '') + (pub.paginas ? pub.paginas + ' páginas' : ''));

  try {
    let bytes;
    if (pub.bytes) {
      // publicación propia guardada en el navegador
      bytes = pub.bytes instanceof Uint8Array ? pub.bytes : new Uint8Array(pub.bytes);
    } else {
      const respuesta = await fetch(pub.pdf, { cache: 'no-store' });
      if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
      bytes = new Uint8Array(await respuesta.arrayBuffer());
    }

    const ok = await abrirPDF(bytes, {
      nombre: pub.titulo + (pub.numero ? ' · ' + pub.numero : ''),
      peso: formatearPeso(bytes.byteLength),
      fecha: pub.fecha
    });

    if (ok) {
      ui.kickerEdicion.textContent = pub.numero || pub.categoria || 'Edición';
      ui.tituloEdicion.textContent = pub.titulo;
      mostrarVista('lector');
    } else {
      ocultarOverlayCarga();
    }
  } catch (e) {
    console.warn('No se pudo abrir la revista:', e);
    estado.pubPendiente = pub;
    ocultarOverlayCarga();
    mostrarPanelArchivo();
  } finally {
    estado.abriendo = false;
  }
}

/** Abre un PDF elegido a mano desde el equipo (sin publicarlo). */
async function cargarArchivoLocal(archivo) {
  if (!archivo) return;
  const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name || '');
  if (!esPdf) { avisar('Ese archivo no es un PDF.', true); return; }
  if (estado.cargandoLocal) return;

  estado.cargandoLocal = true;
  mostrarOverlayCarga('Abriendo «' + archivo.name + '»…', 'Archivo local');

  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const pub = {
      id: 'archivo-local',
      titulo: bonitarNombre(archivo.name),
      numero: 'PDF local',
      categoria: '',
      fecha: new Date().toISOString().slice(0, 10),
      paginas: 0,
      descripcion: 'Archivo abierto desde tu equipo. Escribe aquí tu propia ' +
        'descripción: se guarda automáticamente en este navegador.',
      bytes: bytes
    };
    estado.pubAbierta = pub;

    const ok = await abrirPDF(bytes, {
      nombre: pub.titulo,
      peso: formatearPeso(bytes.byteLength),
      fecha: pub.fecha
    });

    if (ok) {
      ui.kickerEdicion.textContent = 'PDF local';
      ui.tituloEdicion.textContent = pub.titulo;
      ocultarPanelArchivo();
      mostrarVista('lector');
    } else {
      ocultarOverlayCarga();
    }
  } catch (e) {
    console.error(e);
    ocultarOverlayCarga();
    avisar('No se pudo leer el archivo: ' + ((e && e.message) || e), true);
  } finally {
    estado.cargandoLocal = false;
    ui.inputArchivo.value = '';
  }
}

/** Libera el libro y el documento pdf.js abiertos. */
function destruirLibro() {
  if (estado.flip) {
    try { estado.flip.destroy(); } catch { /* noop */ }
    estado.flip = null;
  }
  ui.contenedorLibro.innerHTML = '';
  estado.imgs = [];
  estado.paginas = [];
  if (estado.doc) {
    try { estado.doc.destroy(); } catch { /* noop */ }
    estado.doc = null;
  }
  ui.miniaturas.innerHTML = '';
  ui.railMiniaturas.hidden = true;
  ui.railMiniaturas.classList.remove('visible');
  ui.btnRail.setAttribute('aria-pressed', 'false');
  estado.railVisible = false;
}

/* ========================= 10. SONIDO DE PÁGINA =========================== */
/* Inicialización perezosa: el Audio se crea al primer gesto para cumplir
   las políticas de autoplay de los navegadores. */

function inicializarSonido() {
  if (estado.sonidoInicializado) return;
  estado.sonidoInicializado = true;

  try {
    estado.sonidoActivo = localStorage.getItem(CLAVE_SONIDO) !== 'off';
  } catch { /* almacenamiento bloqueado: dejamos activo */ }

  ui.btnSonido.setAttribute('aria-pressed', String(estado.sonidoActivo));

  try {
    estado.audio = new Audio(RUTA_SONIDO);
    estado.audio.preload = 'auto';
    estado.audio.volume = 0.55;
  } catch { /* sin Audio: seguimos sin sonido */ }
}

function sonar() {
  if (!estado.sonidoActivo || !estado.audio) return;
  try {
    estado.audio.currentTime = 0;
    const promesa = estado.audio.play();
    if (promesa && promesa.catch) promesa.catch(() => { /* autoplay bloqueado */ });
  } catch { /* noop */ }
}

function alternarSonido() {
  inicializarSonido();
  estado.sonidoActivo = !estado.sonidoActivo;
  ui.btnSonido.setAttribute('aria-pressed', String(estado.sonidoActivo));
  try {
    localStorage.setItem(CLAVE_SONIDO, estado.sonidoActivo ? 'on' : 'off');
  } catch { /* noop */ }
  avisar(estado.sonidoActivo ? 'Sonido de página activado.' : 'Sonido de página silenciado.');
}

/* ========================= 11. NAVEGACIÓN Y TAMAÑO ======================== */

/** Ajusta el tamaño del libro al espacio disponible (libro abierto). */
function dimensionarLibro() {
  if (!estado.flip || !ui.contenedorLibro.isConnected) return;

  const cs = getComputedStyle(ui.zonaLibro);
  const dispW = ui.zonaLibro.clientWidth -
    (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  const dispH = ui.zonaLibro.clientHeight -
    (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
  if (dispW < 40 || dispH < 40) return;

  const rel = estado.altoBase / estado.anchoBase;   // alto/ancho de la página

  // Umbral de modo retrato: igual que StPageFlip (2 × minWidth = 580 px)
  let esRetrato = dispW < 620;
  let anchoPagina = esRetrato
    ? Math.min(dispW, dispH / rel)
    : Math.min(dispW / 2, dispH / rel);
  anchoPagina = Math.max(140, Math.floor(anchoPagina));
  if (!esRetrato && anchoPagina < 290) esRetrato = true;   // no caben dos caras

  ui.contenedorLibro.style.width = (esRetrato ? anchoPagina : anchoPagina * 2) + 'px';
  ui.contenedorLibro.style.minWidth = '0px';
  ui.contenedorLibro.style.height = Math.floor(anchoPagina * rel) + 'px';
  ui.contenedorLibro.style.minHeight = '0px';

  estado.flip.update();
}

/** Refresca indicador, botones, deslizador y miniatura activa. */
function actualizarNavegacion() {
  if (!estado.flip) return;
  const total = estado.paginas.length;
  if (!total) return;

  const p = limite(estado.flip.getCurrentPage(), 0, total - 1);
  const retrato = estado.flip.getOrientation && estado.flip.getOrientation() === 'portrait';

  let texto;
  if (retrato) {
    texto = 'página ' + (p + 1) + ' de ' + total;
  } else if (p % 2 === 0) {
    texto = 'páginas ' + (p + 1) + '–' + Math.min(p + 2, total) + ' de ' + total;
  } else {
    texto = 'página ' + (p + 1) + ' de ' + total;
  }
  ui.indicadorPagina.textContent = texto;

  ui.btnAnterior.disabled = p <= 0;
  ui.btnSiguiente.disabled = p >= total - 1;

  if (document.activeElement !== ui.sliderPagina) {
    ui.sliderPagina.value = String(p + 1);
  }
  ui.sliderPagina.max = String(total);
  ui.sliderPagina.style.setProperty('--relleno',
    (p / Math.max(1, total - 1)) * 100 + '%');

  marcarMiniatura(p);
}

/* ========================= 12. MINIATURAS ================================= */

/** Crea la miniatura de una página (dataURL) si aún no existe. */
async function pintarMiniatura(indice) {
  const item = estado.paginas[indice];
  if (!item || item.miniatura) return;

  try {
    const page = item.pdfPage;
    const escala = 130 / estado.anchoBase;
    const vp = page.getViewport({ scale: Math.max(0.1, escala) });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    item.miniatura = canvas.toDataURL('image/jpeg', 0.6);
    page.cleanup();

    // si el riel está abierto, insertarla ya
    if (estado.railVisible) insertarMiniatura(indice);
  } catch (e) {
    console.warn('Miniatura ' + (indice + 1) + ' no disponible:', e);
  }
}

/** Inserta (una sola vez) la miniatura de la página i en el riel. */
function insertarMiniatura(indice) {
  const item = estado.paginas[indice];
  if (!item || !item.miniatura) return;
  if (ui.miniaturas.querySelector('[data-mini="' + indice + '"]')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'miniatura';
  btn.dataset.mini = String(indice);
  btn.setAttribute('role', 'tab');
  btn.setAttribute('aria-selected', 'false');
  btn.setAttribute('aria-label', 'Ir a la página ' + (indice + 1));

  const img = document.createElement('img');
  img.src = item.miniatura;
  img.alt = '';

  const num = document.createElement('span');
  num.textContent = String(indice + 1);

  btn.appendChild(img);
  btn.appendChild(num);
  btn.addEventListener('click', () => {
    if (estado.flip) estado.flip.flip(indice);
  });

  // insertar respetando el orden
  const hijos = Array.from(ui.miniaturas.children);
  const siguiente = hijos.find((h) => Number(h.dataset.mini) > indice);
  ui.miniaturas.insertBefore(btn, siguiente || null);
}

function marcarMiniatura(indice) {
  if (!estado.railVisible) return;
  for (const hijo of ui.miniaturas.children) {
    hijo.setAttribute('aria-selected', String(Number(hijo.dataset.mini) === indice));
  }
}

/** Genera todas las miniaturas que falten (en cadena, sin saturar). */
async function generarMiniaturasFaltantes() {
  if (estado.generandoMiniaturas) return;
  estado.generandoMiniaturas = true;
  try {
    for (let i = 0; i < estado.paginas.length; i++) {
      if (!estado.railVisible) break;
      await pintarMiniatura(i);
      insertarMiniatura(i);
      await esperar(20);
    }
  } finally {
    estado.generandoMiniaturas = false;
  }
}

function alternarRail() {
  const activo = ui.btnRail.getAttribute('aria-pressed') === 'true';
  const nuevo = !activo;
  estado.railVisible = nuevo;
  ui.btnRail.setAttribute('aria-pressed', String(nuevo));

  if (nuevo) {
    ui.railMiniaturas.hidden = false;
    requestAnimationFrame(() => ui.railMiniaturas.classList.add('visible'));
    generarMiniaturasFaltantes();
  } else {
    ui.railMiniaturas.classList.remove('visible');
    setTimeout(() => { ui.railMiniaturas.hidden = true; }, 300);
  }
}

/* ========================= 13. PANTALLA COMPLETA ========================== */

function alternarPantallaCompleta() {
  const doc = document;
  const enPantalla = doc.fullscreenElement || doc.webkitFullscreenElement;
  try {
    if (!enPantalla) {
      const el = doc.documentElement;
      const promesa = el.requestFullscreen ? el.requestFullscreen()
        : (el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null);
      if (promesa && promesa.catch) {
        promesa.catch(() => avisar('El navegador no permitió la pantalla completa.', true));
      }
    } else {
      const promesa = doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen();
      if (promesa && promesa.catch) promesa.catch(() => { /* noop */ });
    }
  } catch (e) {
    avisar('No se pudo alternar la pantalla completa.', true);
  }
}

let temporizadorOcultarRaton = null;

function programarOcultarRaton() {
  document.body.classList.remove('pantalla-completa-oculta');
  clearTimeout(temporizadorOcultarRaton);
  const enPantalla = document.fullscreenElement || document.webkitFullscreenElement;
  if (enPantalla) {
    temporizadorOcultarRaton = setTimeout(() => {
      document.body.classList.add('pantalla-completa-oculta');
    }, 2500);
  }
}

/* ========================= 14. PANEL DE INFORMACIÓN ======================= */

function claveDescripcionActual() {
  return CLAVE_DESCRIPCION + (estado.pubAbierta ? estado.pubAbierta.id : 'archivo');
}

function descripcionPorDefecto() {
  if (estado.pubAbierta && estado.pubAbierta.descripcion) {
    return estado.pubAbierta.descripcion;
  }
  return 'Sin descripción. Escribe aquí la tuya: se guarda ' +
    'automáticamente en este navegador.';
}

function cargarTextoInfo() {
  let guardado = null;
  try { guardado = localStorage.getItem(claveDescripcionActual()); } catch { /* noop */ }
  ui.textoInfo.textContent = guardado || descripcionPorDefecto();
}

let temporizadorGuardarDescripcion = null;

function guardarDescripcion() {
  clearTimeout(temporizadorGuardarDescripcion);
  temporizadorGuardarDescripcion = setTimeout(() => {
    try {
      localStorage.setItem(claveDescripcionActual(), ui.textoInfo.textContent.trim());
    } catch { /* almacenamiento bloqueado */ }
  }, 400);
}

function actualizarDatosPanel() {
  const meta = estado.archivo || {};
  const pub = estado.pubAbierta;
  ui.datoArchivo.textContent = meta.nombre || (pub ? pub.titulo : '—');
  ui.datoPaginas.textContent = estado.paginas.length
    ? String(estado.paginas.length)
    : (pub && pub.paginas ? String(pub.paginas) : '—');
  ui.datoFormato.textContent = meta.peso || '—';
  ui.datoFecha.textContent = formatearFecha(meta.fecha || (pub && pub.fecha)) || '—';
  cargarTextoInfo();
}

function abrirPanel() {
  actualizarDatosPanel();
  ui.fondoPanel.hidden = false;
  ui.panelInfo.classList.add('abierto');
  ui.panelInfo.setAttribute('aria-hidden', 'false');
  ui.btnInfo.setAttribute('aria-expanded', 'true');
  ui.btnCerrarInfo.focus();
}

function cerrarPanel() {
  ui.panelInfo.classList.remove('abierto');
  ui.panelInfo.setAttribute('aria-hidden', 'true');
  ui.btnInfo.setAttribute('aria-expanded', 'false');
  ui.fondoPanel.hidden = true;
}

function alternarPanel() {
  if (ui.panelInfo.classList.contains('abierto')) cerrarPanel();
  else abrirPanel();
}

/* ========================= 15. VISTAS ===================================== */

function mostrarVista(v) {
  estado.vista = v;
  const lector = v === 'lector';

  document.body.classList.toggle('vista-biblioteca', !lector);
  document.body.classList.toggle('vista-lector', lector);

  ui.barraBiblioteca.hidden = lector;
  ui.barraLector.hidden = !lector;
  ui.vistaBiblioteca.hidden = lector;
  ui.vistaLector.hidden = !lector;

  if (!lector) {
    cerrarPanel();
    destruirLibro();
    estado.pubAbierta = null;
    estado.pubPendiente = null;
    renderizarChips();
    renderizarEstanteria();
  }
}

/* ========================= 16. CATÁLOGO =================================== */

async function cargarCatalogo() {
  try {
    const respuesta = await fetch('assets/revistas.json', { cache: 'no-store' });
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
    const datos = await respuesta.json();
    if (Array.isArray(datos) && datos.length) {
      estado.catalogo = datos;
      return;
    }
    throw new Error('manifiesto vacío');
  } catch (e) {
    console.info('Usando el catálogo residente (revistas.json ilegible):', e && e.message);
    estado.catalogo = CATALOGO_RESIDENTE.map((c) => Object.assign({}, c));
  }
}

/* ========================= 17. EVENTOS ==================================== */

let temporizadorResize = null;

function enlazarEventos() {
  /* --- Biblioteca --- */
  ui.inputBusqueda.addEventListener('input', () => {
    estado.filtro.texto = ui.inputBusqueda.value;
    renderizarEstanteria();
  });

  ui.btnVerTodas.addEventListener('click', () => {
    estado.filtro.texto = '';
    estado.filtro.categoria = '';
    ui.inputBusqueda.value = '';
    renderizarChips();
    renderizarEstanteria();
  });

  ui.btnPublicar.addEventListener('click', () => ui.inputPublicar.click());
  ui.inputPublicar.addEventListener('change', () => {
    publicarPDF(ui.inputPublicar.files && ui.inputPublicar.files[0]);
  });

  /* --- Lector: barra y dock --- */
  ui.btnVolver.addEventListener('click', () => mostrarVista('biblioteca'));
  ui.btnSonido.addEventListener('click', alternarSonido);
  ui.btnInfo.addEventListener('click', alternarPanel);
  ui.btnCerrarInfo.addEventListener('click', cerrarPanel);
  ui.fondoPanel.addEventListener('click', cerrarPanel);

  ui.btnAnterior.addEventListener('click', () => { if (estado.flip) estado.flip.flipPrev(); });
  ui.btnSiguiente.addEventListener('click', () => { if (estado.flip) estado.flip.flipNext(); });
  ui.btnRail.addEventListener('click', alternarRail);
  ui.btnPantallaCompleta.addEventListener('click', alternarPantallaCompleta);

  ui.sliderPagina.addEventListener('input', () => {
    if (!estado.flip) return;
    const destino = limite(Number(ui.sliderPagina.value) - 1, 0, estado.paginas.length - 1);
    estado.flip.flip(destino);
  });

  /* --- Panel: descripción editable --- */
  ui.textoInfo.addEventListener('input', guardarDescripcion);
  ui.textoInfo.addEventListener('paste', (e) => {
    e.preventDefault();
    const datos = e.clipboardData || window.clipboardData;
    const texto = datos ? datos.getData('text/plain') : '';
    document.execCommand('insertText', false, texto);
  });
  ui.btnRestaurarInfo.addEventListener('click', () => {
    try { localStorage.removeItem(claveDescripcionActual()); } catch { /* noop */ }
    ui.textoInfo.textContent = descripcionPorDefecto();
    avisar('Descripción restaurada.');
  });

  /* --- Selector manual de archivo (fallback file://) --- */
  ui.inputArchivo.addEventListener('change', () => {
    cargarArchivoLocal(ui.inputArchivo.files && ui.inputArchivo.files[0]);
  });
  ui.btnReintentar.addEventListener('click', () => {
    ocultarPanelArchivo();
    if (estado.pubPendiente) abrirPublicacion(estado.pubPendiente);
  });

  /* --- Teclado global --- */
  document.addEventListener('keydown', (e) => {
    const destino = e.target;
    const escribiendo = destino && destino.matches &&
      destino.matches('input, textarea, [contenteditable="true"]');
    if (escribiendo) {
      if (e.key === 'Escape') destino.blur();
      return;
    }

    if (e.key === 'Escape') {
      if (ui.panelInfo.classList.contains('abierto')) { cerrarPanel(); return; }
    }

    if (estado.vista !== 'lector' || !estado.flip) return;

    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault(); estado.flip.flipNext(); break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault(); estado.flip.flipPrev(); break;
      case 'Home':
        e.preventDefault(); estado.flip.flip(0); break;
      case 'End':
        e.preventDefault(); estado.flip.flip(estado.paginas.length - 1); break;
      case 'f':
      case 'F':
        alternarPantallaCompleta(); break;
    }
  });

  /* --- Arrastrar y soltar archivos --- */
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.body.classList.add('arastrando');
  });
  window.addEventListener('dragleave', (e) => {
    if (e.clientX <= 0 || e.clientY <= 0 ||
        e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
      document.body.classList.remove('arastrando');
    }
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('arastrando');
    const archivo = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!archivo) return;
    if (estado.vista === 'lector') cargarArchivoLocal(archivo);
    else publicarPDF(archivo);
  });

  /* --- Redimensionar y pantalla completa --- */
  window.addEventListener('resize', () => {
    clearTimeout(temporizadorResize);
    temporizadorResize = setTimeout(dimensionarLibro, 120);
  });
  ['fullscreenchange', 'webkitfullscreenchange'].forEach((ev) => {
    document.addEventListener(ev, () => {
      dimensionarLibro();
      programarOcultarRaton();
    });
  });
  document.addEventListener('mousemove', programarOcultarRaton);

  /* --- Primer gesto en pantalla: desbloquear el sonido --- */
  document.addEventListener('pointerdown', inicializarSonido, { once: true });
}

/* ========================= 18. ARRANQUE =================================== */

async function iniciar() {
  enlazarEventos();
  inicializarSonido();

  if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = RUTA_PDFJS + 'pdf.worker.min.js';
  }

  await cargarCatalogo();
  estado.publicadas = await listarPublicaciones();
  if (!estado.guardadoLocal) {
    avisar('Tu navegador no permite guardar publicaciones de forma permanente ' +
      '(probablemente por abrir el archivo directamente): durarán solo esta sesión.');
  }

  renderizarChips();
  renderizarEstanteria();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}

/* Gancho de depuración y pruebas (no usado por la interfaz). */
window.__interno = {
  estado,
  abrirPublicacion,
  cargarArchivoLocal,
  publicarPDF,
  renderizarEstanteria,
  renderizarChips,
  mostrarVista,
  abrirPanel,
  cerrarPanel,
  alternarRail,
  dimensionarLibro,
  formatearPeso,
  bonitarNombre,
  cerrarAviso: () => ui.aviso.classList.remove('visible')
};
