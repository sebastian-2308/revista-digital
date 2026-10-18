/* =====================================================================
 * REVISTA DIGITAL · FLIPBOOK
 * app.js — Lógica completa de la aplicación
 * ---------------------------------------------------------------------
 *  1.  Configuración general
 *  2.  Estado de la aplicación
 *  3.  Utilidades
 *  4.  Arranque de la aplicación
 *  5.  Carga del PDF (automática, manual y por arrastre)
 *  6.  Montaje del libro con StPageFlip
 *  7.  Rasterizado de páginas (PDF.js → canvas → <img>)
 *  8.  Navegación: dock, slider, miniaturas y teclado
 *  9.  Sonido de paso de página
 * 10.  Editor de capas de texto (edición en vivo)
 * 11.  Exportación del PDF editado
 * 12.  Panel de información y preferencias
 * 13.  Avisos y mensajes
 * 14.  Eventos de la interfaz
 * ===================================================================== */
'use strict';

/* ---------------------------------------------------------------------
 * 1. CONFIGURACIÓN GENERAL
 * ------------------------------------------------------------------- */
const CONFIG = {
  /** PDF principal de la revista (relativo a index.html). */
  rutaPDF: 'assets/revista.pdf',

  /** Sonido realista de paso de página. Si no existe, se sintetiza. */
  rutaSonido: 'assets/pagina.mp3',

  /** Carpeta base de PDF.js en el CDN (worker, mapas y fuentes). */
  basePDFjs: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/',

  /** Ancho mínimo (px) de una página antes de pasar a vista vertical.
   *  Debe coincidir con la opción `minWidth` que recibe StPageFlip. */
  anchoMinimoPagina: 280,

  /** Calidad JPEG al volcar cada página a imagen (0 a 1). */
  calidadImagen: 0.92,
  calidadExportacion: 0.92,

  /** Resolución mínima (1 = tamaño real del PDF) y máxima del rasterizado. */
  escalaMinima: 1,
  escalaMaxima: 2.5,

  /** Duración de la animación de volteo (ms). */
  tiempoVolteo: 900,

  /** Volumen del sonido de página (0 a 1). */
  volumenSonido: 0.55,

  /** Ancho (px) de las miniaturas del riel de navegación. */
  anchoMiniatura: 140,

  /** Valores por defecto de las capas de texto. */
  fuenteCapa: '"Fraunces", Georgia, serif',
  tamanoCapa: 3,        // % del alto de la página
  anchoCapa: 42,        // % del ancho de la página
  textoCapa: 'Escribe aquí…',

  /** Descripción por defecto del panel de información. */
  descripcionPorDefecto:
    'Escribe aquí la descripción de la edición…\n\n' +
    '· Título de la revista\n· Número o volumen\n· Fecha de publicación\n' +
    '· Sumario breve o notas de la edición\n\n' +
    '(Este texto se guarda automáticamente en tu navegador.)'
};

/** Claves usadas para guardar preferencias en localStorage. */
const CLAVES = {
  titulo: 'revista:titulo',
  kicker: 'revista:kicker',
  descripcion: 'revista:descripcion',
  sonido: 'revista:sonido',
  capas: (nombre) => 'revista:capas:' + (nombre || 'desconocido')
};

const TITULO_POR_DEFECTO = 'Horizontes';
const KICKER_POR_DEFECTO = 'Edición N.º 01 · Vol. 1';

/* ¿El navegador permite editar solo texto plano en contenteditable? */
const EDITABLE_PLANO = (() => {
  const d = document.createElement('div');
  d.contentEditable = 'plaintext-only';
  return d.contentEditable === 'plaintext-only';
})();
const MODO_EDITABLE = EDITABLE_PLANO ? 'plaintext-only' : 'true';

/* ---------------------------------------------------------------------
 * 2. ESTADO DE LA APLICACIÓN
 * ------------------------------------------------------------------- */
const estado = {
  pdf: null,                  // documento cargado con PDF.js
  flip: null,                 // instancia de St.PageFlip
  paginas: [],                // <div> de cada página del libro
  renderizadas: new Set(),    // índices ya rasterizados
  fallidas: new Set(),        // páginas que no se pudieron rasterizar
  cola: new Set(),            // índices pendientes de rasterizar
  procesando: false,
  exportando: false,
  generacion: 0,              // invalida tareas al cambiar de revista
  totalPaginas: 0,
  indiceActual: 0,
  ratio: 1.414,               // alto / ancho de una página del PDF
  escala: 1.5,
  altoPaginaPx: 700,          // alto real de una página en pantalla
  archivo: { nombre: '—', peso: '—', fecha: null },
  sonidoActivo: true,
  sonidoMP3Listo: false,

  /* Editor de capas */
  capas: {},                  // { numeroPagina: [capa, capa…] }
  modoEdicion: false,
  seleccion: null,            // { pagina, id }
  historial: [],              // pila de "deshacer"
  miniaturas: [],             // <img> de cada miniatura
  temporizadorGuardado: null,
  botonesBorrado: 0           // control del borrado en dos toques
};

/** Referencias a elementos del DOM. */
const ui = {};

/* ---------------------------------------------------------------------
 * 3. UTILIDADES
 * ------------------------------------------------------------------- */
const $ = (selector) => document.querySelector(selector);
const limitar = (v, min, max) => Math.max(min, Math.min(max, v));

function formatearPeso(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatearFecha(fecha) {
  try {
    return new Intl.DateTimeFormat('es', { dateStyle: 'long', timeStyle: 'short' }).format(fecha);
  } catch (e) {
    return fecha.toLocaleString();
  }
}

function guardarPreferencia(clave, valor) {
  try { localStorage.setItem(clave, valor); } catch (e) { /* modo privado */ }
}

function leerPreferencia(clave) {
  try { return localStorage.getItem(clave); } catch (e) { return null; }
}

function idCapa() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------------
 * 4. ARRANQUE DE LA APLICACIÓN
 * ------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', iniciar);

let inicioRealizado = false;

async function iniciar() {
  // Guarda contra una doble activación del evento (nunca debe haber dos
  // juegos de listeners de la interfaz registrados).
  if (inicioRealizado) return;
  inicioRealizado = true;

  prepararDOM();
  enlazarEventos();
  cargarPreferencias();
  inicializarSonido();

  if (typeof window.pdfjsLib === 'undefined' || typeof window.St === 'undefined') {
    ocultarOverlayCarga();
    mostrarAviso(
      'No se pudieron cargar las librerías (PDF.js / StPageFlip). ' +
      'Comprueba tu conexión a internet y vuelve a cargar la página.'
    );
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = CONFIG.basePDFjs + 'build/pdf.worker.min.js';

  await cargarRevistaAutomatica();
}

function prepararDOM() {
  ui.titulo = $('#tituloEdicion');
  ui.kicker = $('#kickerEdicion');
  ui.zonaLibro = $('#zonaLibro');
  ui.overlayCarga = $('#overlayCarga');
  ui.textoCarga = $('#textoCarga');
  ui.detalleCarga = $('#detalleCarga');
  ui.lineaProgreso = $('#lineaProgreso');
  ui.barraProgreso = $('#barraProgreso');
  ui.panelArchivo = $('#panelArchivo');
  ui.inputArchivo = $('#inputArchivo');
  ui.btnReintentar = $('#btnReintentar');
  ui.btnAnterior = $('#btnAnterior');
  ui.btnSiguiente = $('#btnSiguiente');
  ui.indicador = $('#indicadorPagina');
  ui.slider = $('#sliderPagina');
  ui.btnRail = $('#btnRail');
  ui.rail = $('#railMiniaturas');
  ui.miniaturas = $('#miniaturas');
  ui.btnPantallaCompleta = $('#btnPantallaCompleta');
  ui.btnSonido = $('#btnSonido');
  ui.btnInfo = $('#btnInfo');
  ui.btnEditar = $('#btnEditar');
  ui.btnExportar = $('#btnExportar');
  ui.chipModo = $('#chipModo');
  ui.barraCapas = $('#barraCapas');
  ui.capaFuente = $('#capaFuente');
  ui.capaTamano = $('#capaTamano');
  ui.capaMas = $('#capaMas');
  ui.capaMenos = $('#capaMenos');
  ui.capaNegrita = $('#capaNegrita');
  ui.capaCursiva = $('#capaCursiva');
  ui.capaColor = $('#capaColor');
  ui.capaDuplicar = $('#capaDuplicar');
  ui.capaBorrar = $('#capaBorrar');
  ui.btnCerrarInfo = $('#btnCerrarInfo');
  ui.btnRestaurarInfo = $('#btnRestaurarInfo');
  ui.btnBorrarCapas = $('#btnBorrarCapas');
  ui.panelInfo = $('#panelInfo');
  ui.fondoPanel = $('#fondoPanel');
  ui.textoInfo = $('#textoInfo');
  ui.datoArchivo = $('#datoArchivo');
  ui.datoPaginas = $('#datoPaginas');
  ui.datoFormato = $('#datoFormato');
  ui.datoFecha = $('#datoFecha');
  ui.datoCapas = $('#datoCapas');
  ui.datoPaginasCapas = $('#datoPaginasCapas');
  ui.aviso = $('#aviso');
}

/* ---------------------------------------------------------------------
 * 5. CARGA DEL PDF (automática, manual y por arrastre)
 * ------------------------------------------------------------------- */
async function cargarRevistaAutomatica() {
  mostrarOverlayCarga('Buscando assets/revista.pdf', 'Leyendo la revista del proyecto');

  try {
    const respuesta = await fetch(CONFIG.rutaPDF, { cache: 'no-store' });
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);

    const datos = await respuesta.arrayBuffer();
    await abrirPDF(datos, {
      nombre: CONFIG.rutaPDF.split('/').pop(),
      peso: formatearPeso(datos.byteLength),
      fecha: new Date()
    });
  } catch (error) {
    // Causa habitual: abrir index.html con doble clic (protocolo file://).
    console.warn('No se pudo cargar', CONFIG.rutaPDF, error);
    ocultarOverlayCarga();
    mostrarPanelArchivo();
  }
}

async function abrirPDF(datos, metaArchivo) {
  mostrarOverlayCarga('Abriendo el PDF', 'Leyendo estructura y fuentes');

  let tarea;
  try {
    tarea = pdfjsLib.getDocument({
      data: datos,
      cMapUrl: CONFIG.basePDFjs + 'cmaps/',
      cMapPacked: true,
      standardFontDataUrl: CONFIG.basePDFjs + 'standard_fonts/'
    });
    tarea.onProgress = ({ loaded, total }) => {
      if (total) mostrarProgreso(0.05 + 0.25 * (loaded / total));
    };
    estado.pdf = await tarea.promise;
  } catch (error) {
    ocultarOverlayCarga();
    if (error && error.name === 'PasswordException') {
      mostrarAviso('El PDF está protegido con contraseña. Desbloquéalo y vuelve a intentarlo.');
    } else {
      console.error(error);
      mostrarAviso('No se pudo abrir el PDF: ' + (error && error.message ? error.message : 'error desconocido'));
    }
    return false;
  }

  estado.archivo = metaArchivo;
  cargarCapasGuardadas();
  await montarLibro();
  return true;
}

async function cargarArchivoLocal(archivo) {
  if (!archivo) return;

  const esPDF = /pdf/i.test(archivo.type) || /\.pdf$/i.test(archivo.name);
  if (!esPDF) {
    mostrarAviso('Solo se admiten archivos PDF.');
    return;
  }

  mostrarOverlayCarga('Leyendo «' + archivo.name + '»', 'Preparando la edición');

  try {
    const datos = await archivo.arrayBuffer();
    const abiertos = await abrirPDF(datos, {
      nombre: archivo.name,
      peso: formatearPeso(archivo.size),
      fecha: archivo.lastModified ? new Date(archivo.lastModified) : new Date()
    });
    if (abiertos) ocultarPanelArchivo();
  } catch (error) {
    console.error(error);
    ocultarOverlayCarga();
    mostrarAviso('No se pudo leer el archivo: ' + error.message);
  }
}

/* ---------------------------------------------------------------------
 * 6. MONTAJE DEL LIBRO CON STPAGEFLIP
 * ------------------------------------------------------------------- */
async function montarLibro() {
  destruirLibroAnterior();

  if (!estado.pdf || estado.pdf.numPages === 0) {
    ocultarOverlayCarga();
    mostrarAviso('El PDF no contiene ninguna página.');
    mostrarPanelArchivo();
    return;
  }

  // --- 6.1. Proporción de una página (para no deformar el PDF) ---------
  const paginaBase = await estado.pdf.getPage(1);
  const cajaBase = paginaBase.getViewport({ scale: 1 });
  estado.ratio = cajaBase.height / cajaBase.width;
  paginaBase.cleanup();

  // --- 6.2. Tamaño del libro y escala de rasterizado ------------------
  const medidas = medirDisponibles();
  estado.escala = calcularEscala(cajaBase.width, medidas.anchoPagina);

  // --- 6.3. Un <div> por página + riel de miniaturas ------------------
  crearPaginas();
  crearMiniaturas();

  // --- 6.4. Arranque del flipbook 3D ----------------------------------
  iniciarFlipbook(medidas);

  // --- 6.5. Rasteriza las primeras páginas antes de mostrar el libro --
  mostrarProgreso(0.35);
  await renderizarPagina(0);
  await renderizarPagina(1);
  mostrarProgreso(0.95);

  ocultarOverlayCarga();
  ocultarPanelArchivo();
  actualizarMetricas();       // tamaño real de página (para las capas)
  redibujarCapas();
  actualizarDatosPanel();
  actualizarControles();

  // --- 6.6. El resto se rasteriza en segundo plano, por prioridad ----
  programarRenderizado();
}

function medirDisponibles() {
  const cs = getComputedStyle(ui.zonaLibro);
  const dispW = ui.zonaLibro.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const dispH = ui.zonaLibro.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);

  // Misma regla que usa StPageFlip: por debajo de 2 × anchoMinimoPagina
  // el libro pasa a mostrarse de una sola página (modo vertical).
  const vertical = dispW < 2 * CONFIG.anchoMinimoPagina;

  let anchoLibro = vertical
    ? Math.min(dispW, dispH / estado.ratio)
    : Math.min(dispW, (2 * dispH) / estado.ratio);

  anchoLibro = Math.max(160, Math.floor(anchoLibro));

  return {
    anchoLibro,
    anchoPagina: vertical ? anchoLibro : anchoLibro / 2,
    altoPagina: (vertical ? anchoLibro : anchoLibro / 2) * estado.ratio,
    vertical
  };
}

function colocarContenedor(anchoLibro) {
  const contenedor = $('#contenedorLibro');
  if (contenedor) contenedor.style.width = Math.floor(anchoLibro) + 'px';
}

function calcularEscala(anchoPDF, anchoPaginaCSS) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const objetivo = anchoPaginaCSS * dpr * 1.05;
  const escala = objetivo / anchoPDF;
  return Math.max(CONFIG.escalaMinima, Math.min(CONFIG.escalaMaxima, escala));
}

function crearPaginas() {
  const contenedor = $('#contenedorLibro');
  contenedor.innerHTML = '';
  estado.paginas = [];
  estado.renderizadas.clear();
  estado.fallidas.clear();
  estado.cola.clear();
  estado.totalPaginas = estado.pdf.numPages;
  estado.indiceActual = 0;

  for (let i = 0; i < estado.totalPaginas; i++) {
    const div = document.createElement('div');
    div.className = 'pagina';
    if (i === 0 || i === estado.totalPaginas - 1) div.dataset.density = 'hard';
    div.innerHTML =
      '<div class="pagina__espera"><span class="pagina__spinner"></span>' +
      '<span>Página ' + (i + 1) + '</span></div>';
    contenedor.appendChild(div);
    estado.paginas.push(div);
  }
}

function iniciarFlipbook(medidas) {
  const contenedor = $('#contenedorLibro');

  estado.flip = new St.PageFlip(contenedor, {
    width: Math.max(1, Math.round(medidas.anchoPagina)),
    height: Math.max(1, Math.round(medidas.altoPagina)),
    size: 'stretch',
    minWidth: CONFIG.anchoMinimoPagina,
    maxWidth: 2600,
    minHeight: 120,
    maxHeight: 3600,
    drawShadow: true,
    maxShadowOpacity: 0.55,
    flippingTime: CONFIG.tiempoVolteo,
    usePortrait: true,
    autoSize: true,
    showCover: true,
    showPageCorners: true,
    mobileScrollSupport: false,
    clickEventForward: true,
    useMouseEvents: true,
    startZIndex: 0
  });

  estado.flip.loadFromHTML(estado.paginas);

  // StPageFlip fuerza unos mínimos de tamaño y un ancho del 100 % que
  // romperían el responsive: los anulamos y medimos nosotros.
  contenedor.style.minWidth = '0px';
  contenedor.style.minHeight = '0px';
  colocarContenedor(medidas.anchoLibro);
  estado.flip.update();

  estado.flip
    .on('flip', (ev) => onPaginaCambiada(ev.data))
    .on('changeState', (ev) => { if (ev.data === 'flipping') reproducirSonido(); })
    .on('changeOrientation', () => { ajustarLibro(); actualizarControles(); actualizarMetricas(); })
    .on('init', () => { actualizarControles(); actualizarMetricas(); });
}

function destruirLibroAnterior() {
  estado.generacion++;
  estado.cola.clear();
  estado.procesando = false;
  deseleccionarCapa();

  if (estado.flip) {
    try { estado.flip.destroy(); } catch (e) { console.warn(e); }
    estado.flip = null;
  }

  const contenedorViejo = $('#contenedorLibro');
  const contenedorNuevo = document.createElement('div');
  contenedorNuevo.className = 'contenedor-libro';
  contenedorNuevo.id = 'contenedorLibro';
  if (contenedorViejo) contenedorViejo.replaceWith(contenedorNuevo);
  else ui.zonaLibro.appendChild(contenedorNuevo);

  estado.paginas = [];
  estado.totalPaginas = 0;
  estado.indiceActual = 0;
  estado.miniaturas = [];
  if (ui.miniaturas) ui.miniaturas.innerHTML = '';
}

function ajustarLibro() {
  if (!estado.flip) return;

  const medidas = medirDisponibles();
  const contenedor = $('#contenedorLibro');
  const anchoActual = contenedor ? parseFloat(contenedor.style.width) || 0 : 0;

  if (Math.abs(anchoActual - medidas.anchoLibro) > 1) {
    colocarContenedor(medidas.anchoLibro);
    try { estado.flip.update(); } catch (e) { console.warn(e); }
  }
}

/** Refresca el alto real de las páginas (para dimensionar las capas). */
function actualizarMetricas() {
  if (!estado.flip) return;
  try {
    const rect = estado.flip.getBoundsRect();
    if (rect && rect.height) estado.altoPaginaPx = rect.height;
  } catch (e) { /* aún no medido */ }
  actualizarTamanoCapas();
}

/* ---------------------------------------------------------------------
 * 7. RASTERIZADO DE PÁGINAS (PDF.js → canvas → <img>)
 * ------------------------------------------------------------------- */
function programarRenderizado() {
  for (let i = 0; i < estado.totalPaginas; i++) {
    if (!estado.renderizadas.has(i) && !estado.fallidas.has(i)) estado.cola.add(i);
  }
  procesarCola();
}

async function procesarCola() {
  if (estado.procesando) return;
  estado.procesando = true;
  const miGeneracion = estado.generacion;

  try {
    while (estado.cola.size > 0 && miGeneracion === estado.generacion && !estado.exportando) {
      const objetivo = paginaMasCercana();
      if (objetivo === null) break;
      estado.cola.delete(objetivo);
      await renderizarPagina(objetivo, miGeneracion);
      await espera(0);                       // deja respirar a la interfaz
    }
  } finally {
    estado.procesando = false;
  }
}

function paginaMasCercana() {
  let mejor = null;
  let mejorDistancia = Infinity;
  for (const i of estado.cola) {
    const d = Math.abs(i - estado.indiceActual);
    if (d < mejorDistancia) { mejorDistancia = d; mejor = i; }
  }
  return mejor;
}

/**
 * Rasteriza una página del PDF y coloca el resultado en su <div>.
 * Se genera un <img> (y no un <canvas>) porque StPageFlip clona los
 * elementos durante el volteo y un canvas clonado saldría en blanco.
 */
async function renderizarPagina(indice, generacion = estado.generacion) {
  if (generacion !== estado.generacion) return;
  if (estado.renderizadas.has(indice)) return;
  const div = estado.paginas[indice];
  if (!div) return;

  try {
    const pagina = await estado.pdf.getPage(indice + 1);
    const viewport = pagina.getViewport({ scale: estado.escala });

    const lienzo = document.createElement('canvas');
    lienzo.width = Math.max(1, Math.floor(viewport.width));
    lienzo.height = Math.max(1, Math.floor(viewport.height));
    const ctx = lienzo.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);

    await pagina.render({ canvasContext: ctx, viewport }).promise;
    pagina.cleanup();

    if (generacion !== estado.generacion) return;

    // Imagen de la página
    const url = await lienzoAImagen(lienzo, CONFIG.calidadImagen);
    const img = new Image();
    img.className = 'pagina__imagen';
    img.alt = 'Página ' + (indice + 1);
    img.decoding = 'async';
    img.src = url;

    div.innerHTML = '';
    div.appendChild(img);
    img.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });

    // Miniatura del riel de navegación
    refrescarMiniatura(indice, lienzo);

    // Capas de texto guardadas sobre esta página
    colocarCapasPagina(indice);

    estado.renderizadas.add(indice);
  } catch (error) {
    console.error('Error al rasterizar la página ' + (indice + 1), error);
    estado.fallidas.add(indice);
    div.innerHTML = '<p class="pagina__error">No se pudo cargar esta página.</p>';
  }
}

function lienzoAImagen(lienzo, calidad) {
  return new Promise((resolve, reject) => {
    lienzo.toBlob((blob) => {
      if (blob) resolve(URL.createObjectURL(blob));
      else reject(new Error('No se pudo convertir el lienzo en imagen'));
    }, 'image/jpeg', calidad);
  });
}

/* --- Miniaturas del riel de navegación ------------------------------ */
function crearMiniaturas() {
  ui.miniaturas.innerHTML = '';
  estado.miniaturas = [];

  for (let i = 0; i < estado.totalPaginas; i++) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'miniatura';
    boton.setAttribute('role', 'tab');
    boton.setAttribute('aria-label', 'Ir a la página ' + (i + 1));
    boton.innerHTML =
      '<span class="miniatura__espera">…</span>' +
      '<img alt="" aria-hidden="true">' +
      '<span class="miniatura__num">' + (i + 1) + '</span>';
    boton.addEventListener('click', () => {
      if (estado.flip) estado.flip.turnToPage(i);
    });

    const img = boton.querySelector('img');
    img.addEventListener('load', () => {
      const espera = boton.querySelector('.miniatura__espera');
      if (espera) espera.remove();
    }, { once: true });

    ui.miniaturas.appendChild(boton);
    estado.miniaturas.push(img);
  }
}

function refrescarMiniatura(indice, lienzo) {
  const img = estado.miniaturas[indice];
  if (!img || !lienzo) return;

  try {
    const escala = Math.min(1, CONFIG.anchoMiniatura / lienzo.width);
    const mini = document.createElement('canvas');
    mini.width = Math.max(1, Math.round(lienzo.width * escala));
    mini.height = Math.max(1, Math.round(lienzo.height * escala));
    mini.getContext('2d').drawImage(lienzo, 0, 0, mini.width, mini.height);

    // Miniatura pequeña (≈140 px): un dataURL directo es suficiente
    img.src = mini.toDataURL('image/jpeg', 0.6);
  } catch (e) { /* las miniaturas son decorativas */ }
}

/* ---------------------------------------------------------------------
 * 8. NAVEGACIÓN: DOCK, SLIDER, MINIATURAS Y TECLADO
 * ------------------------------------------------------------------- */
function onPaginaCambiada(indice) {
  estado.indiceActual = indice;
  actualizarControles();
  programarRenderizado();
}

function actualizarControles() {
  const total = estado.totalPaginas;
  const indice = estado.indiceActual;

  if (!estado.flip || total === 0) {
    ui.indicador.textContent = '— / —';
    ui.btnAnterior.disabled = true;
    ui.btnSiguiente.disabled = true;
    ui.slider.max = 1;
    ui.slider.value = 1;
    ui.slider.disabled = true;
    return;
  }

  // En vista de doble página mostramos el par "3–4"
  const enDoble = estado.flip.getOrientation() === 'landscape' && indice > 0 && indice < total - 1;
  const actual = enDoble && indice + 1 < total ? (indice + 1) + '–' + (indice + 2) : String(indice + 1);

  ui.indicador.textContent = 'Página ' + actual + ' de ' + total;

  ui.btnAnterior.disabled = indice <= 0;
  ui.btnSiguiente.disabled = indice >= total - 1;

  // Deslizador + porcentaje recorrido
  ui.slider.max = String(total);
  ui.slider.value = String(indice + 1);
  ui.slider.disabled = false;
  ui.slider.style.setProperty('--progreso', ((indice + 1) / total) * 100 + '%');

  // Miniatura activa
  const activa = estado.miniaturas[indice];
  if (activa) {
    estado.miniaturas.forEach((im) => im.parentElement && im.parentElement.classList.remove('activa'));
    activa.parentElement.classList.add('activa');
    if (!ui.rail.hidden && activa.parentElement.scrollIntoView) {
      activa.parentElement.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }
}

function paginaAnterior() { if (estado.flip) estado.flip.flipPrev(); }
function paginaSiguiente() { if (estado.flip) estado.flip.flipNext(); }

function alternarRail() {
  const abierto = ui.rail.hidden;
  ui.rail.hidden = !abierto;
  ui.btnRail.setAttribute('aria-pressed', String(abierto));
  if (abierto) actualizarControles();
}

function alternarPantallaCompleta() {
  if (!document.fullscreenElement) {
    const promesa = ui.zonaLibro.requestFullscreen
      ? ui.zonaLibro.requestFullscreen()
      : (ui.zonaLibro.webkitRequestFullscreen && ui.zonaLibro.webkitRequestFullscreen());
    if (promesa && promesa.catch) {
      promesa.catch((e) => mostrarAviso('No se pudo activar la pantalla completa: ' + e.message));
    }
  } else {
    document.exitFullscreen();
  }
}

/* ---------------------------------------------------------------------
 * 9. SONIDO DE PASO DE PÁGINA
 * ------------------------------------------------------------------- */
let audioElemento = null;
let contextoAudio = null;

function inicializarSonido() {
  audioElemento = new Audio(CONFIG.rutaSonido);
  audioElemento.preload = 'auto';
  audioElemento.volume = CONFIG.volumenSonido;
  audioElemento.addEventListener('canplaythrough', () => { estado.sonidoMP3Listo = true; }, { once: true });
  audioElemento.addEventListener('error', () => {
    estado.sonidoMP3Listo = false;
    console.info('No se encontró ' + CONFIG.rutaSonido + ': se usará un sonido sintetizado.');
  }, { once: true });
}

function reproducirSonido() {
  if (!estado.sonidoActivo) return;

  if (estado.sonidoMP3Listo && audioElemento) {
    try {
      audioElemento.currentTime = 0;
      const promesa = audioElemento.play();
      if (promesa && promesa.catch) promesa.catch(sintetizarSonidoDePagina);
      return;
    } catch (e) { /* bloqueado: usamos el sonido sintetizado */ }
  }
  sintetizarSonidoDePagina();
}

function sintetizarSonidoDePagina() {
  try {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return;
    if (!contextoAudio) contextoAudio = new Contexto();
    if (contextoAudio.state === 'suspended') contextoAudio.resume();

    const ctx = contextoAudio;
    const inicio = ctx.currentTime;
    const duracion = 0.32;

    const muestras = Math.max(1, Math.floor(ctx.sampleRate * duracion));
    const buffer = ctx.createBuffer(1, muestras, ctx.sampleRate);
    const datos = buffer.getChannelData(0);
    for (let i = 0; i < muestras; i++) datos[i] = Math.random() * 2 - 1;

    const fuente = ctx.createBufferSource();
    fuente.buffer = buffer;

    const filtro = ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.Q.value = 0.9;
    filtro.frequency.setValueAtTime(650, inicio);
    filtro.frequency.exponentialRampToValueAtTime(2600, inicio + duracion * 0.45);
    filtro.frequency.exponentialRampToValueAtTime(750, inicio + duracion);

    const ganancia = ctx.createGain();
    ganancia.gain.setValueAtTime(0.0001, inicio);
    ganancia.gain.exponentialRampToValueAtTime(CONFIG.volumenSonido * 0.8, inicio + 0.05);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);

    fuente.connect(filtro);
    filtro.connect(ganancia);
    ganancia.connect(ctx.destination);

    fuente.start(inicio);
    fuente.stop(inicio + duracion + 0.02);
  } catch (e) { /* el sonido nunca debe romper la lectura */ }
}

function alternarSonido() {
  estado.sonidoActivo = !estado.sonidoActivo;
  ui.btnSonido.setAttribute('aria-pressed', String(estado.sonidoActivo));
  guardarPreferencia(CLAVES.sonido, estado.sonidoActivo ? '1' : '0');
}

/* ---------------------------------------------------------------------
 * 10. EDITOR DE CAPAS DE TEXTO (EDICIÓN EN VIVO)
 * ------------------------------------------------------------------- */

/* --- 10.1. Modo edición -------------------------------------------- */
function alternarModoEdicion() {
  aplicarModoEdicion(!estado.modoEdicion);
}

function aplicarModoEdicion(activo) {
  estado.modoEdicion = activo;
  document.body.classList.toggle('modo-edicion', activo);

  ui.btnEditar.setAttribute('aria-pressed', String(activo));
  ui.chipModo.hidden = !activo;

  if (!activo) {
    deseleccionarCapa();
    activarEsquinas(true);
  } else {
    // En modo edición los clics crean texto: evitamos que el libro voltee.
    activarEsquinas(false);
  }

  estado.paginas.forEach((div) => {
    div.querySelectorAll('.capa__texto').forEach((t) => {
      t.contentEditable = activo ? MODO_EDITABLE : 'false';
    });
  });
}

/** Activa o desactiva las "esquinas" y el volteo por clic de StPageFlip. */
function activarEsquinas(activo) {
  if (!estado.flip) return;
  try {
    const ajustes = estado.flip.getSettings();
    ajustes.showPageCorners = activo;
    ajustes.disableFlipByClick = !activo;
  } catch (e) { /* la librería decidirá */ }
}

/* --- 10.2. Modelo y dibujo de capas --------------------------------- */
function capasDePagina(indice) {
  if (!estado.capas[indice]) estado.capas[indice] = [];
  return estado.capas[indice];
}

function buscarCapa(indice, id) {
  return capasDePagina(indice).find((c) => c.id === id) || null;
}

function crearCapa(indice, datos) {
  const capa = Object.assign({
    id: idCapa(),
    x: 10, y: 10,
    w: CONFIG.anchoCapa,
    fs: CONFIG.tamanoCapa,
    texto: CONFIG.textoCapa,
    fuente: CONFIG.fuenteCapa,
    color: '#14161c',
    negrita: false,
    cursiva: false,
    centrada: false
  }, datos || {});

  guardarHistorial();
  capasDePagina(indice).push(capa);
  colocarCapasPagina(indice);
  seleccionarCapa(indice, capa.id);
  programarGuardado();
  actualizarDatosPanel();
  return capa;
}

function borrarCapa(indice, id) {
  const lista = capasDePagina(indice);
  const pos = lista.findIndex((c) => c.id === id);
  if (pos < 0) return;

  guardarHistorial();
  lista.splice(pos, 1);
  deseleccionarCapa();
  colocarCapasPagina(indice);
  programarGuardado();
  actualizarDatosPanel();
}

function duplicarCapa() {
  const sel = estado.seleccion;
  if (!sel) return;
  const original = buscarCapa(sel.pagina, sel.id);
  if (!original) return;

  crearCapa(sel.pagina, Object.assign({}, original, {
    id: idCapa(),
    x: limitar(original.x + 4, 0, 100 - original.w),
    y: limitar(original.y + 4, 0, 96)
  }));
}

/** Reconstruye el DOM de las capas de una página a partir del modelo. */
function colocarCapasPagina(indice) {
  const div = estado.paginas[indice];
  if (!div) return;

  div.querySelectorAll('.capa').forEach((el) => el.remove());
  capasDePagina(indice).forEach((capa) => div.appendChild(construirCapa(indice, capa)));
}

/** Reconstruye todas las capas (al cargar una revista o deshacer). */
function redibujarCapas() {
  for (let i = 0; i < estado.totalPaginas; i++) colocarCapasPagina(i);
  actualizarTamanoCapas();
  actualizarDatosPanel();
}

function construirCapa(indice, capa) {
  const el = document.createElement('div');
  el.className = 'capa';
  el.dataset.id = capa.id;
  el.dataset.pagina = String(indice);

  const etiqueta = document.createElement('span');
  etiqueta.className = 'capa__etiqueta';
  etiqueta.textContent = 'texto';

  const texto = document.createElement('div');
  texto.className = 'capa__texto';
  texto.textContent = capa.texto;
  texto.contentEditable = estado.modoEdicion ? MODO_EDITABLE : 'false';

  el.append(etiqueta, texto);
  aplicarEstiloCapa(el, texto, capa);

  if (estado.seleccion && estado.seleccion.id === capa.id && estado.seleccion.pagina === indice) {
    el.classList.add('seleccionada');
  }
  return el;
}

function aplicarEstiloCapa(el, textoEl, capa) {
  el.style.left = capa.x + '%';
  el.style.top = capa.y + '%';
  el.style.width = capa.w + '%';

  textoEl.style.fontFamily = capa.fuente;
  textoEl.style.color = capa.color;
  textoEl.style.fontWeight = capa.negrita ? '700' : '400';
  textoEl.style.fontStyle = capa.cursiva ? 'italic' : 'normal';
  textoEl.style.textAlign = capa.centrada ? 'center' : 'left';
  textoEl.style.fontSize = (estado.altoPaginaPx * capa.fs / 100) + 'px';
}

/** Recalcula el tamaño de la letra de todas las capas (al cambiar de tamaño el libro). */
function actualizarTamanoCapas() {
  ui.zonaLibro.querySelectorAll('.capa').forEach((el) => {
    const capa = buscarCapa(Number(el.dataset.pagina), el.dataset.id);
    const textoEl = el.querySelector('.capa__texto');
    if (capa && textoEl) {
      textoEl.style.fontSize = (estado.altoPaginaPx * capa.fs / 100) + 'px';
    }
  });
}

/* --- 10.3. Selección y barra de herramientas ------------------------ */
function seleccionarCapa(indice, id) {
  estado.seleccion = { pagina: indice, id };
  ui.zonaLibro.querySelectorAll('.capa.seleccionada').forEach((el) => el.classList.remove('seleccionada'));

  const el = ui.zonaLibro.querySelector('.capa[data-id="' + id + '"]');
  if (el) el.classList.add('seleccionada');

  const capa = buscarCapa(indice, id);
  if (capa) sincronizarBarraCapas(capa);
}

function deseleccionarCapa() {
  estado.seleccion = null;
  ui.zonaLibro.querySelectorAll('.capa.seleccionada').forEach((el) => el.classList.remove('seleccionada'));
  if (ui.barraCapas) ui.barraCapas.hidden = true;
}

function capaSeleccionada() {
  if (!estado.seleccion) return null;
  return buscarCapa(estado.seleccion.pagina, estado.seleccion.id);
}

function sincronizarBarraCapas(capa) {
  ui.barraCapas.hidden = false;
  ui.capaFuente.value = capa.fuente;
  ui.capaTamano.textContent = capa.fs.toFixed(1).replace('.0', '') + ' %';
  ui.capaColor.value = capa.color;
  ui.capaNegrita.setAttribute('aria-pressed', String(capa.negrita));
  ui.capaCursiva.setAttribute('aria-pressed', String(capa.cursiva));
}

function modificarCapaSeleccionada(cambios) {
  const capa = capaSeleccionada();
  if (!capa) return;

  guardarHistorial();
  Object.assign(capa, cambios);

  const el = ui.zonaLibro.querySelector('.capa[data-id="' + capa.id + '"]');
  if (el) {
    aplicarEstiloCapa(el, el.querySelector('.capa__texto'), capa);
  }
  sincronizarBarraCapas(capa);
  programarGuardado();
}

/* --- 10.4. Historial (deshacer) y guardado -------------------------- */
function guardarHistorial() {
  estado.historial.push(JSON.stringify(estado.capas));
  if (estado.historial.length > 40) estado.historial.shift();
}

function deshacer() {
  if (!estado.historial.length) {
    mostrarAviso('No hay nada que deshacer.', 'informativo');
    return;
  }
  estado.capas = JSON.parse(estado.historial.pop());
  deseleccionarCapa();
  redibujarCapas();
  programarGuardado();
  mostrarAviso('Cambio deshecho.', 'informativo');
}

function programarGuardado() {
  clearTimeout(estado.temporizadorGuardado);
  estado.temporizadorGuardado = setTimeout(guardarCapas, 400);
}

function guardarCapas() {
  guardarPreferencia(CLAVES.capas(estado.archivo.nombre), JSON.stringify(estado.capas));
}

function cargarCapasGuardadas() {
  estado.capas = {};
  estado.historial = [];
  const bruto = leerPreferencia(CLAVES.capas(estado.archivo.nombre));
  if (!bruto) return;
  try {
    const datos = JSON.parse(bruto);
    if (datos && typeof datos === 'object') estado.capas = datos;
  } catch (e) { /* datos corruptos: empezamos de cero */ }
}

function borrarTodasLasCapas() {
  // Borrado en dos toques (sustituye a un diálogo modal)
  if (estado.botonesBorrado === 0) {
    estado.botonesBorrado = 1;
    ui.btnBorrarCapas.textContent = '¿Seguro? Pulsa otra vez';
    setTimeout(() => {
      if (estado.botonesBorrado === 1) {
        estado.botonesBorrado = 0;
        ui.btnBorrarCapas.textContent = 'Borrar textos añadidos';
      }
    }, 4000);
    return;
  }

  estado.botonesBorrado = 0;
  ui.btnBorrarCapas.textContent = 'Borrar textos añadidos';
  guardarHistorial();
  estado.capas = {};
  deseleccionarCapa();
  redibujarCapas();
  programarGuardado();
  mostrarAviso('Se han borrado todos los textos añadidos. Puedes deshacer con Ctrl+Z.', 'informativo');
}

/* --- 10.5. Interacciones con el puntero ----------------------------- */
let arrastre = null;   // { id, pagina, offsetX, offsetY, x0, y0, movido }

function onPunteroAbajo(e) {
  if (!estado.modoEdicion) return;

  const capaEl = e.target.closest('.capa');
  if (!capaEl) return;

  // Evitamos que StPageFlip interprete el gesto como un volteo
  e.stopPropagation();

  const indice = Number(capaEl.dataset.pagina);
  const capa = buscarCapa(indice, capaEl.dataset.id);
  if (!capa) return;

  seleccionarCapa(indice, capa.id);

  const rectPagina = capaEl.parentElement.getBoundingClientRect();
  arrastre = {
    id: capa.id,
    pagina: indice,
    x0: e.clientX,
    y0: e.clientY,
    xInicial: capa.x,
    yInicial: capa.y,
    anchoPagina: rectPagina.width,
    altoPagina: rectPagina.height,
    movido: false
  };
}

function onPunteroMover(e) {
  if (!arrastre) return;

  const dx = ((e.clientX - arrastre.x0) / arrastre.anchoPagina) * 100;
  const dy = ((e.clientY - arrastre.y0) / arrastre.altoPagina) * 100;

  if (!arrastre.movido && Math.abs(e.clientX - arrastre.x0) + Math.abs(e.clientY - arrastre.y0) < 5) return;
  if (!arrastre.movido) {
    arrastre.movido = true;
    guardarHistorial();
    document.body.style.userSelect = 'none';
  }

  const capa = buscarCapa(arrastre.pagina, arrastre.id);
  if (!capa) return;

  capa.x = limitar(arrastre.xInicial + dx, 0, 100 - capa.w);
  capa.y = limitar(arrastre.yInicial + dy, 0, 97);

  const el = ui.zonaLibro.querySelector('.capa[data-id="' + capa.id + '"]');
  if (el) { el.style.left = capa.x + '%'; el.style.top = capa.y + '%'; }
}

function onPunteroArriba() {
  if (!arrastre) return;
  if (arrastre.movido) {
    document.body.style.userSelect = '';
    programarGuardado();
  }
  arrastre = null;
}

function onClicPagina(e) {
  if (!estado.modoEdicion) return;
  if (e.target.closest('.capa')) return;

  const div = e.target.closest('.pagina');
  if (!div) return;

  const indice = estado.paginas.indexOf(div);
  if (indice < 0) return;

  const rect = div.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;

  crearCapa(indice, {
    x: limitar(x, 0, 96),
    y: limitar(y - 1, 0, 96),
    texto: CONFIG.textoCapa
  });
}

function onTextoCapa(e) {
  const capaEl = e.target.closest('.capa');
  if (!capaEl) return;
  const capa = buscarCapa(Number(capaEl.dataset.pagina), capaEl.dataset.id);
  if (!capa) return;

  // innerText respeta los saltos de línea; en navegadores muy antiguos caemos a textContent
  const bruto = e.target.innerText != null ? e.target.innerText : (e.target.textContent || '');
  capa.texto = String(bruto).replace(/\n$/, '');
  programarGuardado();
}

/* ---------------------------------------------------------------------
 * 11. EXPORTACIÓN DEL PDF EDITADO
 * ------------------------------------------------------------------- */

/** Pinta una página (imagen + capas) en un lienzo listo para exportar. */
function pintarPaginaExportada(indice) {
  const img = estado.paginas[indice].querySelector('.pagina__imagen');
  if (!img) return null;

  const ancho = img.naturalWidth || img.width || 1000;
  const alto = img.naturalHeight || img.height || 1414;

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(img, 0, 0, ancho, alto);

  capasDePagina(indice).forEach((capa) => pintarCapa(ctx, capa, ancho, alto));
  return lienzo;
}

function pintarCapa(ctx, capa, ancho, alto) {
  const fs = alto * capa.fs / 100;
  const rellenoX = fs * 0.45;
  const rellenoY = fs * 0.3;

  ctx.save();
  ctx.font =
    (capa.cursiva ? 'italic ' : '') +
    (capa.negrita ? '700 ' : '400 ') +
    fs + 'px ' + capa.fuente;
  ctx.fillStyle = capa.color;
  ctx.textBaseline = 'top';

  const x = ancho * capa.x / 100 + rellenoX;
  const y = alto * capa.y / 100 + rellenoY;
  const anchoMax = Math.max(fs, ancho * capa.w / 100 - rellenoX * 2);
  const alineado = capa.centrada ? 'center' : 'left';
  const destinoX = capa.centrada ? x + anchoMax / 2 : x;

  ajustarLineas(ctx, capa.texto, anchoMax).forEach((linea, i) => {
    ctx.fillText(linea, destinoX, y + i * fs * 1.25);
  });

  ctx.restore();
}

/** Parte un texto en líneas que caben en un ancho dado (píxeles). */
function ajustarLineas(ctx, texto, anchoMax) {
  const lineas = [];
  (texto || '').split('\n').forEach((parrafo) => {
    let actual = '';
    parrafo.split(/\s+/).forEach((palabra) => {
      const prueba = actual ? actual + ' ' + palabra : palabra;
      if (ctx.measureText(prueba).width > anchoMax && actual) {
        lineas.push(actual);
        actual = palabra;
      } else {
        actual = prueba;
      }
    });
    lineas.push(actual);
  });
  return lineas;
}

function lienzoABlob(lienzo, calidad) {
  return new Promise((resolve, reject) => {
    lienzo.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo convertir el lienzo en imagen'));
    }, 'image/jpeg', calidad);
  });
}

/**
 * Construye un PDF real a partir de páginas ya rasterizadas (JPEG incrustados).
 * Se escribe byte a byte para que la tabla xref sea exacta.
 */
function construirPDFEditado(paginas) {
  const enc = new TextEncoder();
  const partes = [];
  let offset = 0;
  const offsets = [];

  const empujar = (dato) => {
    const bytes = typeof dato === 'string' ? enc.encode(dato) : dato;
    partes.push(bytes);
    offset += bytes.length;
  };
  const marcar = () => offsets.push(offset);   // posición de "N 0 obj"

  empujar('%PDF-1.4\n');
  empujar(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));   // marca binaria

  const totalObjetos = 2 + paginas.length * 3;

  marcar();
  empujar('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  const hijos = paginas.map((_, i) => (3 + i * 3) + ' 0 R').join(' ');
  marcar();
  empujar('2 0 obj\n<< /Type /Pages /Kids [' + hijos + '] /Count ' + paginas.length + ' >>\nendobj\n');

  paginas.forEach((pagina, i) => {
    const numPagina = 3 + i * 3;
    const numContenido = numPagina + 1;
    const numImagen = numPagina + 2;

    // Píxeles → puntos (72 pt = 96 px)
    const anchoPt = (pagina.ancho * 72 / 96).toFixed(2);
    const altoPt = (pagina.alto * 72 / 96).toFixed(2);
    const contenido = 'q ' + anchoPt + ' 0 0 ' + altoPt + ' 0 0 cm /Im' + i + ' Do Q\n';

    marcar();
    empujar(numPagina + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
      anchoPt + ' ' + altoPt + '] /Resources << /XObject << /Im' + i + ' ' + numImagen +
      ' 0 R >> >> /Contents ' + numContenido + ' 0 R >>\nendobj\n');

    marcar();
    empujar(numContenido + ' 0 obj\n<< /Length ' + contenido.length + ' >>\nstream\n' +
      contenido + 'endstream\nendobj\n');

    marcar();
    empujar(numImagen + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + pagina.ancho +
      ' /Height ' + pagina.alto + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
      pagina.bytes.length + ' >>\nstream\n');
    empujar(pagina.bytes);
    empujar('\nendstream\nendobj\n');
  });

  const inicioXref = offset;
  let xref = 'xref\n0 ' + (totalObjetos + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i <= totalObjetos; i++) {
    xref += String(offsets[i - 1]).padStart(10, '0') + ' 00000 n \n';
  }
  empujar(xref);
  empujar('trailer\n<< /Size ' + (totalObjetos + 1) + ' /Root 1 0 R >>\nstartxref\n' +
    inicioXref + '\n%%EOF');

  const salida = new Uint8Array(offset);
  let posicion = 0;
  partes.forEach((b) => { salida.set(b, posicion); posicion += b.length; });
  return salida;
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function exportarRevista() {
  if (!estado.pdf || estado.exportando) return;

  estado.exportando = true;
  ui.btnExportar.disabled = true;

  try {
    mostrarAviso('Preparando el PDF editado…', 'informativo');

    // 1. Aseguramos que todas las páginas estén rasterizadas
    for (let i = 0; i < estado.totalPaginas; i++) {
      await renderizarPagina(i);
    }

    // 2. Pintamos cada página con sus capas y la convertimos en JPEG
    const paginas = [];
    for (let i = 0; i < estado.totalPaginas; i++) {
      mostrarAviso('Componiendo la página ' + (i + 1) + ' de ' + estado.totalPaginas + '…', 'informativo');
      const lienzo = pintarPaginaExportada(i);
      if (!lienzo) continue;
      const blob = await lienzoABlob(lienzo, CONFIG.calidadExportacion);
      paginas.push({
        bytes: new Uint8Array(await blob.arrayBuffer()),
        ancho: lienzo.width,
        alto: lienzo.height
      });
    }

    if (!paginas.length) throw new Error('No hay páginas para exportar');

    // 3. Construimos y descargamos el PDF
    const pdf = construirPDFEditado(paginas);
    const nombre = (estado.archivo.nombre || 'revista.pdf').replace(/\.pdf$/i, '') + '-editada.pdf';
    descargar(new Blob([pdf], { type: 'application/pdf' }), nombre);

    mostrarAviso('PDF exportado: ' + nombre + ' (' + formatearPeso(pdf.length) + ')', 'informativo');
  } catch (error) {
    console.error(error);
    mostrarAviso('No se pudo exportar el PDF: ' + error.message);
  } finally {
    estado.exportando = false;
    ui.btnExportar.disabled = false;
  }
}

/* ---------------------------------------------------------------------
 * 12. PANEL DE INFORMACIÓN Y PREFERENCIAS
 * ------------------------------------------------------------------- */
function cargarPreferencias() {
  ui.titulo.textContent = leerPreferencia(CLAVES.titulo) || TITULO_POR_DEFECTO;
  ui.kicker.textContent = leerPreferencia(CLAVES.kicker) || KICKER_POR_DEFECTO;
  ui.textoInfo.textContent = leerPreferencia(CLAVES.descripcion) || CONFIG.descripcionPorDefecto;

  const sonido = leerPreferencia(CLAVES.sonido);
  estado.sonidoActivo = sonido !== '0';
  ui.btnSonido.setAttribute('aria-pressed', String(estado.sonidoActivo));
}

function alternarPanelInfo(abrir) {
  const debeAbrir = typeof abrir === 'boolean'
    ? abrir
    : !ui.panelInfo.classList.contains('abierto');

  ui.panelInfo.classList.toggle('abierto', debeAbrir);
  ui.panelInfo.setAttribute('aria-hidden', String(!debeAbrir));
  ui.btnInfo.setAttribute('aria-expanded', String(debeAbrir));

  ui.fondoPanel.hidden = false;
  ui.fondoPanel.classList.toggle('visible', debeAbrir);

  if (debeAbrir) { actualizarDatosPanel(); ui.btnCerrarInfo.focus(); }
  else ui.btnInfo.focus();
}

function cerrarPanelInfo() {
  if (ui.panelInfo.classList.contains('abierto')) alternarPanelInfo(false);
}

function actualizarDatosPanel() {
  ui.datoArchivo.textContent = estado.archivo.nombre || '—';
  ui.datoPaginas.textContent = estado.totalPaginas ? estado.totalPaginas + ' páginas' : '—';
  ui.datoFormato.textContent = estado.archivo.peso || '—';
  ui.datoFecha.textContent = estado.archivo.fecha ? formatearFecha(estado.archivo.fecha) : '—';

  let total = 0;
  let paginasModificadas = 0;
  Object.keys(estado.capas).forEach((k) => {
    const lista = estado.capas[k];
    if (Array.isArray(lista) && lista.length) {
      total += lista.length;
      paginasModificadas++;
    }
  });
  ui.datoCapas.textContent = String(total);
  ui.datoPaginasCapas.textContent = String(paginasModificadas);
}

/* ---------------------------------------------------------------------
 * 13. AVISOS Y MENSAJES
 * ------------------------------------------------------------------- */
let temporizadorAviso = null;

function mostrarAviso(texto, tipo = 'aviso') {
  ui.aviso.textContent = texto;
  ui.aviso.classList.toggle('informativo', tipo === 'informativo');
  ui.aviso.classList.add('visible');

  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => ui.aviso.classList.remove('visible'), 6000);
}

function mostrarOverlayCarga(texto, detalle) {
  ui.textoCarga.textContent = texto || 'Cargando revista…';
  ui.detalleCarga.textContent = detalle || '';
  ui.overlayCarga.classList.remove('oculto');
  ui.lineaProgreso.hidden = false;
}

function ocultarOverlayCarga() {
  ui.overlayCarga.classList.add('oculto');
  mostrarProgreso(0);
}

function mostrarProgreso(valor) {
  const v = Math.max(0, Math.min(1, valor || 0));
  ui.barraProgreso.style.width = Math.round(v * 100) + '%';
  ui.lineaProgreso.hidden = v <= 0 || v >= 1;
}

function mostrarPanelArchivo() { ui.panelArchivo.classList.remove('oculto'); }
function ocultarPanelArchivo() { ui.panelArchivo.classList.add('oculto'); }

/* ---------------------------------------------------------------------
 * 14. EVENTOS DE LA INTERFAZ
 * ------------------------------------------------------------------- */
function enlazarEventos() {
  /* --- Navegación --- */
  ui.btnAnterior.addEventListener('click', paginaAnterior);
  ui.btnSiguiente.addEventListener('click', paginaSiguiente);
  ui.btnPantallaCompleta.addEventListener('click', alternarPantallaCompleta);
  ui.btnRail.addEventListener('click', alternarRail);

  ui.slider.addEventListener('input', () => {
    if (!estado.flip) return;
    estado.flip.turnToPage(Number(ui.slider.value) - 1);
  });

  /* --- Sonido --- */
  ui.btnSonido.addEventListener('click', alternarSonido);

  /* --- Edición y exportación --- */
  ui.btnEditar.addEventListener('click', alternarModoEdicion);
  ui.btnExportar.addEventListener('click', exportarRevista);

  ui.capaFuente.addEventListener('change', () => modificarCapaSeleccionada({ fuente: ui.capaFuente.value }));
  ui.capaColor.addEventListener('input', () => modificarCapaSeleccionada({ color: ui.capaColor.value }));
  ui.capaNegrita.addEventListener('click', () => {
    const c = capaSeleccionada();
    if (c) modificarCapaSeleccionada({ negrita: !c.negrita });
  });
  ui.capaCursiva.addEventListener('click', () => {
    const c = capaSeleccionada();
    if (c) modificarCapaSeleccionada({ cursiva: !c.cursiva });
  });
  ui.capaMas.addEventListener('click', () => {
    const c = capaSeleccionada();
    if (c) modificarCapaSeleccionada({ fs: limitar(c.fs + 0.25, 0.8, 20) });
  });
  ui.capaMenos.addEventListener('click', () => {
    const c = capaSeleccionada();
    if (c) modificarCapaSeleccionada({ fs: limitar(c.fs - 0.25, 0.8, 20) });
  });
  ui.capaDuplicar.addEventListener('click', duplicarCapa);
  ui.capaBorrar.addEventListener('click', () => {
    if (estado.seleccion) borrarCapa(estado.seleccion.pagina, estado.seleccion.id);
  });

  /* --- Puntero sobre el libro (crear, seleccionar y arrastrar capas) --- */
  ui.zonaLibro.addEventListener('pointerdown', onPunteroAbajo, true);
  window.addEventListener('pointermove', onPunteroMover);
  window.addEventListener('pointerup', onPunteroArriba);
  ui.zonaLibro.addEventListener('click', onClicPagina);
  ui.zonaLibro.addEventListener('input', onTextoCapa);

  /* --- Panel de información --- */
  ui.btnInfo.addEventListener('click', () => alternarPanelInfo());
  ui.btnCerrarInfo.addEventListener('click', cerrarPanelInfo);
  ui.fondoPanel.addEventListener('click', cerrarPanelInfo);
  ui.btnRestaurarInfo.addEventListener('click', () => {
    ui.textoInfo.textContent = CONFIG.descripcionPorDefecto;
    guardarPreferencia(CLAVES.descripcion, CONFIG.descripcionPorDefecto);
  });
  ui.btnBorrarCapas.addEventListener('click', borrarTodasLasCapas);

  /* --- Textos editables de la interfaz --- */
  ui.titulo.addEventListener('input', () => guardarPreferencia(CLAVES.titulo, ui.titulo.textContent.trim()));
  ui.kicker.addEventListener('input', () => guardarPreferencia(CLAVES.kicker, ui.kicker.textContent.trim()));
  ui.textoInfo.addEventListener('input', () => guardarPreferencia(CLAVES.descripcion, ui.textoInfo.textContent));

  [ui.titulo, ui.kicker].forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    });
  });

  /* --- Carga manual de archivos --- */
  ui.inputArchivo.addEventListener('change', (e) => {
    const archivo = e.target.files && e.target.files[0];
    if (archivo) cargarArchivoLocal(archivo);
    e.target.value = '';
  });
  ui.btnReintentar.addEventListener('click', () => cargarRevistaAutomatica());

  /* --- Arrastrar y soltar un PDF sobre la ventana --- */
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.body.classList.add('arrastrando');
  });
  window.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) document.body.classList.remove('arrastrando');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('arrastrando');
    const archivo = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (archivo) cargarArchivoLocal(archivo);
  });

  /* --- Redimensionado y pantalla completa --- */
  window.addEventListener('resize', () => { ajustarLibro(); actualizarMetricas(); });
  document.addEventListener('fullscreenchange', () => {
    ajustarLibro();
    actualizarMetricas();
    ui.btnPantallaCompleta.title = document.fullscreenElement
      ? 'Salir de pantalla completa (Esc)'
      : 'Pantalla completa (tecla F)';
  });

  /* --- Atajos de teclado --- */
  document.addEventListener('keydown', (e) => {
    const destino = e.target;
    if (destino && (destino.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(destino.tagName))) {
      // Con el foco en un texto editable no capturamos atajos (el navegador
      // se queda con Ctrl+Z para el propio texto); solo Escape para salir.
      if (e.key === 'Escape' && estado.modoEdicion) aplicarModoEdicion(false);
      return;
    }
    if (!estado.flip) return;

    // Deshacer global
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      deshacer();
      return;
    }

    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        paginaSiguiente();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        paginaAnterior();
        break;
      case 'Home':
        e.preventDefault();
        estado.flip.turnToPage(0);
        break;
      case 'End':
        e.preventDefault();
        estado.flip.turnToPage(estado.totalPaginas - 1);
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        alternarPantallaCompleta();
        break;
      case 'Delete':
      case 'Backspace':
        if (estado.seleccion) {
          e.preventDefault();
          borrarCapa(estado.seleccion.pagina, estado.seleccion.id);
        }
        break;
      case 'Escape':
        if (estado.seleccion) deseleccionarCapa();
        else if (estado.modoEdicion) aplicarModoEdicion(false);
        else cerrarPanelInfo();
        break;
      case 'e':
      case 'E':
        e.preventDefault();
        alternarModoEdicion();
        break;
    }
  });
}
