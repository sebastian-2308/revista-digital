/* ==========================================================================
   NOTI-MISIÓN · SITIO + BIBLIOTECA DE REVISTAS DIGITALES
   app.js — lógica completa de la aplicación.

   Qué hace este archivo:
     1. SITIO con secciones (Inicio, Testimonios, Nuestras misiones,
        Extensión, Consejos, Información y Biblioteca) navegables por hash
        (#/inicio, #/testimonios…).
     2. MODO EDICIÓN DEL SITIO: textos, fotos y bloques editables u
        ocultables, con guardado en el navegador y exportación/importación
        de un archivo JSON de cambios.
     3. BIBLIOTECA de revistas (estantería con portadas, buscador y
        categorías) construida desde assets/revistas.json.
     4. PUBLICAR un PDF propio: portada generada con PDF.js y guardado en
        el navegador (IndexedDB).
     5. LECTOR tipo libro (StPageFlip): volteo 3D, sonido de página,
        miniaturas, pantalla completa y panel de descripción editable.
     6. EDITOR DE TEXTO SOBRE LAS PÁGINAS (capas): títulos y notas que se
        guardan por revista y se pueden exportar en un PDF editado.

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
const CLAVE_SITIO = 'revista:sitio';
const CLAVE_CAPAS = 'revista:capas:';

/** Huella FNV-1a de la contraseña que protege la configuración del sitio.
    Al ser un sitio estático esto no es seguridad real (el código es público):
    sirve para que nadie entre al editor por accidente. Para cambiarla, abre la
    consola y ejecuta __interno.calcularHuella('nueva-contraseña'); pega el
    resultado aquí. */
const HUELLA_CLAVE_SITIO = 'c22adf43';

/** Secciones del sitio (enrutado por hash #/nombre). */
const SECCIONES = ['inicio', 'testimonios', 'misiones', 'extension',
  'consejos', 'informacion', 'biblioteca'];

/** Nombre visible de cada sección (para los avisos). */
const NOMBRES_SECCION = {
  inicio: 'Inicio',
  testimonios: 'Testimonios',
  misiones: 'Nuestras misiones',
  extension: 'Extensión',
  consejos: 'Consejos',
  informacion: 'Información',
  biblioteca: 'Biblioteca'
};

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
  seccion: 'inicio',            // sección visible del sitio (hash)
  catalogo: [],                 // revistas del manifiesto
  publicadas: [],               // revistas publicadas por la persona (IndexedDB)
  filtro: { texto: '', categoria: '' },

  // modo edición del sitio
  modoEdicionSitio: false,
  sitioDesbloqueado: false,     // contraseña correcta en esta visita
  sitio: { textos: {}, fotos: {}, ocultos: [] },

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

  // editor de texto sobre páginas (capas)
  divs: [],                      // <div class="pagina"> originales del libro
  capas: {},                     // { pagina: [capa…] } de la revista abierta
  seleccion: null,               // id de la capa seleccionada
  historialCapas: [],            // snapshots para deshacer (Ctrl+Z)
  modoTexto: false,
  altoPaginaPx: 1100,            // alto real de la página en el lector
  exportando: false,

  guardadoLocal: true            // false si IndexedDB no está disponible
};

/* ========================= 4. UTILIDADES ================================== */

const $ = (sel) => document.querySelector(sel);

const ui = {
  // sitio (cabecera, secciones y modo edición)
  cabeceraSitio: $('#cabeceraSitio'),
  cintaSitio: $('#cintaSitio'),
  sitio: $('#principal'),
  pieSitio: $('#pieSitio'),
  menuSitio: $('#menuSitio'),
  btnMenu: $('#btnMenu'),
  btnModoEdicion: $('#btnModoEdicion'),
  barraEdicion: $('#barraEdicion'),
  modalClave: $('#modalClave'),
  formClave: $('#formClave'),
  inputClave: $('#inputClave'),
  errorClave: $('#errorClave'),
  btnCancelarClave: $('#btnCancelarClave'),
  btnEntrarClave: $('#btnEntrarClave'),
  btnDescargarCambios: $('#btnDescargarCambios'),
  btnImportarCambios: $('#btnImportarCambios'),
  inputImportar: $('#inputImportar'),
  inputImagen: $('#inputImagen'),
  btnRestablecerSitio: $('#btnRestablecerSitio'),
  btnMostrarOcultos: $('#btnMostrarOcultos'),
  btnSalirEdicion: $('#btnSalirEdicion'),
  btnAgregarBloque: $('#btnAgregarBloque'),
  panelPlantillas: $('#panelPlantillas'),
  btnCerrarPlantillas: $('#btnCerrarPlantillas'),
  listaPlantillas: $('#listaPlantillas'),

  barraLector: $('.barra--lector'),
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
  btnEditarTexto: $('#btnEditarTexto'),
  btnExportar: $('#btnExportar'),
  barraCapas: $('#barraCapas'),
  capaFuente: $('#capaFuente'),
  capaTamano: $('#capaTamano'),
  capaMas: $('#capaMas'),
  capaMenos: $('#capaMenos'),
  capaColor: $('#capaColor'),
  capaNegrita: $('#capaNegrita'),
  capaCursiva: $('#capaCursiva'),
  capaCentrada: $('#capaCentrada'),
  capaDuplicar: $('#capaDuplicar'),
  capaDeshacer: $('#capaDeshacer'),
  capaBorrar: $('#capaBorrar'),
  chipModo: $('#chipModo'),

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

/**
 * Red de seguridad para las operaciones largas: si dentro de `segundos`
 * el overlay de carga sigue visible, se oculta y se avisa del fallo.
 * Devuelve la función que cancela el vigilante (llamar al terminar).
 */
function vigilanteCarga(segundos) {
  const id = setTimeout(() => {
    if (!ui.overlayCarga.classList.contains('oculto')) {
      ocultarOverlayCarga();
      estado.abriendo = false;
      estado.publicando = false;
      estado.cargandoLocal = false;
      avisar('La operación tardó demasiado: comprueba tu conexión ' +
        'a Internet y vuelve a intentarlo.', true);
    }
  }, segundos * 1000);
  return () => clearTimeout(id);
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

/* --- Librerías del CDN -----------------------------------------------------
   pdf.min.js y page-flip van con `async` en el HTML, así que pueden llegar
   tarde (o nunca, si no hay conexión). Estas funciones esperan a que estén
   disponibles con un tiempo máximo, en vez de fallar con un ReferenceError. */

/** Espera a que una librería del CDN esté disponible (máx. `msMax` ms). */
async function esperarLibreria(obtener, nombre, msMax = 10000) {
  const inicio = Date.now();
  let lib = obtener();
  while (!lib) {
    if (Date.now() - inicio >= msMax) {
      throw new Error('No se pudo cargar «' + nombre + '» (¿sin conexión a Internet?).');
    }
    await new Promise((resolver) => setTimeout(resolver, 150));
    lib = obtener();
  }
  return lib;
}

/** Devuelve PDF.js listo para usar (con el worker configurado). */
async function obtenerPdfjs(msMax) {
  const lib = await esperarLibreria(() => window.pdfjsLib, 'PDF.js', msMax);
  lib.GlobalWorkerOptions.workerSrc = RUTA_PDFJS + 'pdf.worker.min.js';
  return lib;
}

/** Genera portada (dataURL) y nº de páginas de un PDF. */
async function generarPortada(bytesCopia) {
  const pdfjs = window.pdfjsLib;
  if (!pdfjs) throw new Error('PDF.js no está disponible.');
  const carga = pdfjs.getDocument({ data: bytesCopia });
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

  estado.publicando = true;
  mostrarOverlayCarga('Preparando «' + archivo.name + '»…', 'Generando portada y ficha');
  const pararVigilante = vigilanteCarga(60);

  try {
    // Espera a que PDF.js (CDN asíncrono) esté listo; si no llega, el
    // catch inferior avisa, cierra el overlay y reactiva el botón.
    await obtenerPdfjs();

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
    pararVigilante();
    estado.publicando = false;
    ui.inputPublicar.value = '';
  }
}

/* ========================= 9. ABRIR UNA REVISTA =========================== */

/** Carga y monta un PDF en el lector. Devuelve true si salió bien. */
async function abrirPDF(bytes, meta) {
  // Espera (máx. ~10 s) a que las librerías del CDN asíncrono estén listas.
  // Los llamadores ya han mostrado el overlay de carga con «Abriendo…».
  let pdfjs = null;
  let PageFlip = null;
  try {
    pdfjs = await obtenerPdfjs();
    PageFlip = (await esperarLibreria(() => window.St, 'page-flip')).PageFlip;
  } catch (e) {
    avisar((e && e.message) ||
      'No se pudieron cargar las librerías. Comprueba tu conexión a Internet.', true);
    return false;
  }

  destruirLibro();
  estado.archivo = meta;
  mostrarOverlayCarga('Procesando «' + meta.nombre + '»…', '');

  try {
    const carga = pdfjs.getDocument({
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
    estado.divs = [];
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
      estado.divs.push(div);
      estado.imgs.push(img);
      estado.paginas.push({ pdfPage, pintada: false, pintando: false, miniatura: null });
    }

    ui.contenedorLibro.innerHTML = '';
    elems.forEach((el) => ui.contenedorLibro.appendChild(el));

    // Instanciar el flipbook en modo libro abierto
    const flip = new PageFlip(ui.contenedorLibro, {
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

    // Capas guardadas de esta revista (editor de texto sobre páginas)
    cargarCapasGuardadas();
    colocarCapasPaginas();
    actualizarMetricas();

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
  const pararVigilante = vigilanteCarga(45);

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
  const pararVigilante = vigilanteCarga(45);

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
    pararVigilante();
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
  estado.divs = [];
  estado.capas = {};
  estado.seleccion = null;
  estado.historialCapas = [];
  aplicarModoTexto(false);
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
  actualizarMetricas();
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

/* ========================= 15. RUTAS DEL SITIO =========================== */

/** Aplica la sección indicada por el hash (#/inicio, #/testimonios…). */
function aplicarRuta() {
  const bruto = (location.hash || '').replace(/^#\/?/, '').trim();
  const seccion = SECCIONES.includes(bruto) ? bruto : 'inicio';
  estado.seccion = seccion;

  document.querySelectorAll('.web[data-seccion]').forEach((sec) => {
    sec.hidden = sec.dataset.seccion !== seccion;
  });

  document.querySelectorAll('#menuSitio a[data-ruta]').forEach((a) => {
    if (a.dataset.ruta === seccion) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  document.body.classList.toggle('en-biblioteca', seccion === 'biblioteca');
  ui.menuSitio.classList.remove('menu--abierto');
  ui.btnMenu.setAttribute('aria-expanded', 'false');
  ui.btnAgregarBloque.disabled = (seccion === 'biblioteca');
  ui.sitio.scrollTop = 0;
}

/** Navega a una sección (del lector vuelve primero al sitio). */
function irA(seccion) {
  if (estado.vista === 'lector') mostrarVista('biblioteca');
  const destino = SECCIONES.includes(seccion) ? seccion : 'inicio';
  if (('#/' + destino) === location.hash) aplicarRuta();
  else location.hash = '#/' + destino;
}

/* ========================= 16. EDICIÓN DEL SITIO ========================= */
/* Textos, fotos y bloques del sitio se guardan en el navegador de quien
   edita (localStorage) y pueden exportarse/importarse como JSON. */

const originalesSitio = new Map();   // contenido base capturado al arrancar
let temporizadorGuardarSitio = null;

/* --- Bloques predefinidos (galería «Agregar bloque») ----------------------
   Cada plantilla genera un bloque con diseño ya hecho y textos guía; el
   equipo solo reescribe encima. Se guardan en estado.sitio.nuevos como
   {id, plantilla, seccion} y sus textos/fotos usan la clave «nuevo.<id>…». */
const PLANTILLAS_BLOQUE = {
  texto: {
    nombre: 'Bloque de texto',
    desc: 'Un título y un párrafo para añadir más información.',
    icono: '<path d="M4 6h16"/><path d="M4 12h11"/><path d="M4 17h7"/>',
    html: (c) =>
      '<article class="bloque">' +
      '<h2 data-editable="' + c + '.titulo">Título del nuevo bloque</h2>' +
      '<p class="texto-guia" data-editable="' + c + '.texto">' +
      'Escribe aquí lo que quieras contar: una actividad, una noticia, ' +
      'un recordatorio o cualquier información nueva del grupo.</p>' +
      '</article>'
  },
  lista: {
    nombre: 'Lista con viñetas',
    desc: 'Un título con varios puntos clave.',
    icono: '<circle cx="5" cy="6" r="1.6"/><circle cx="5" cy="12" r="1.6"/>' +
      '<circle cx="5" cy="18" r="1.6"/><path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/>',
    html: (c) =>
      '<article class="bloque">' +
      '<h2 data-editable="' + c + '.titulo">Título de la lista</h2>' +
      '<ul class="lista-puntos">' +
      '<li data-editable="' + c + '.p1">Primer punto de la lista…</li>' +
      '<li data-editable="' + c + '.p2">Segundo punto…</li>' +
      '<li data-editable="' + c + '.p3">Tercer punto…</li>' +
      '</ul></article>'
  },
  foto: {
    nombre: 'Foto con pie',
    desc: 'Una imagen con su texto explicativo debajo.',
    icono: '<rect x="3" y="5" width="18" height="14" rx="2"/>' +
      '<circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-6 6"/>',
    html: (c) =>
      '<article class="bloque bloque--foto">' +
      '<figure class="foto foto--paisaje" data-foto="' + c + '.foto">' +
      '<img class="foto__img" alt="Foto del bloque" hidden>' +
      '<span class="foto__hueco" aria-hidden="true"><em>Sube una foto</em></span>' +
      '<button class="foto__cambiar boton boton--suave" type="button">Cambiar foto</button>' +
      '</figure>' +
      '<p class="foto__pie" data-editable="' + c + '.pie">' +
      'Pie de la foto: cuéntale a qué se refiere.</p>' +
      '</article>'
  },
  fotoGrande: {
    nombre: 'Foto grande',
    desc: 'Imagen a todo el ancho, ideal para fotos de grupo o de misión.',
    icono: '<rect x="2" y="5" width="20" height="14" rx="2"/>' +
      '<circle cx="8" cy="10" r="1.8"/><path d="m22 16-6-6-8 8"/>',
    html: (c) =>
      '<article class="bloque bloque--ancho bloque--foto-grande">' +
      '<figure class="foto foto--ancha" data-foto="' + c + '.foto">' +
      '<img class="foto__img" alt="Foto grande" hidden>' +
      '<span class="foto__hueco" aria-hidden="true"><em>Sube una foto grande</em></span>' +
      '<button class="foto__cambiar boton boton--suave" type="button">Cambiar foto</button>' +
      '</figure>' +
      '<p class="foto__pie" data-editable="' + c + '.pie">' +
      'Pie de la foto: cuéntale al visitante qué se ve.</p>' +
      '</article>'
  },
  testimonio: {
    nombre: 'Testimonio',
    desc: 'Foto, cita y nombre de quien habla.',
    icono: '<path d="M4 5h16v11H9l-5 4V5z"/><path d="M8 9h8"/><path d="M8 12h5"/>',
    html: (c) =>
      '<article class="testimonio">' +
      '<figure class="foto foto--retrato" data-foto="' + c + '.foto">' +
      '<img class="foto__img" alt="Retrato del testimonio" hidden>' +
      '<span class="foto__hueco" aria-hidden="true"><em>Añade una foto</em></span>' +
      '<button class="foto__cambiar boton boton--suave" type="button">Cambiar foto</button>' +
      '</figure>' +
      '<blockquote class="texto-guia" data-editable="' + c + '.cita">' +
      '«Escribe aquí la frase que quieras destacar de este testimonio…»</blockquote>' +
      '<p class="testimonio__autor" data-editable="' + c + '.autor">— Nombre y apellido</p>' +
      '</article>'
  },
  integrante: {
    nombre: 'Ficha de integrante',
    desc: 'Foto, nombre y función: ideal para nuevos miembros.',
    icono: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    html: (c) =>
      '<article class="bloque bloque--integrante">' +
      '<div class="integrante">' +
      '<figure class="foto foto--retrato integrante__foto" data-foto="' + c + '.foto">' +
      '<img class="foto__img" alt="Foto del integrante" hidden>' +
      '<span class="foto__hueco" aria-hidden="true"><em>Foto</em></span>' +
      '<button class="foto__cambiar boton boton--suave" type="button">Cambiar foto</button>' +
      '</figure>' +
      '<div class="integrante__datos">' +
      '<h2 data-editable="' + c + '.nombre">Nombre del integrante</h2>' +
      '<p class="integrante__rol texto-guia" data-editable="' + c + '.rol">Función o rol en el grupo</p>' +
      '<p class="texto-guia" data-editable="' + c + '.bio">' +
      'Breve presentación: desde cuándo está en el grupo, qué le gusta y qué aporta.</p>' +
      '</div></div></article>'
  },
  cita: {
    nombre: 'Cita destacada',
    desc: 'Frase grande entrecomillada con su autor.',
    icono: '<path d="M7 7h4v4a4 4 0 0 1-4 4"/><path d="M14 7h4v4a4 4 0 0 1-4 4"/>',
    html: (c) =>
      '<article class="bloque bloque--cita">' +
      '<blockquote class="cita-grande texto-guia" data-editable="' + c + '.texto">' +
      '«Escribe aquí la frase que quieres destacar…»</blockquote>' +
      '<p class="cita-autor" data-editable="' + c + '.autor">— Nombre de quien la dice</p>' +
      '</article>'
  },
  llamada: {
    nombre: 'Llamada con botón',
    desc: 'Aviso con mensaje y botón enlazable.',
    icono: '<rect x="3" y="6" width="18" height="13" rx="3"/>' +
      '<path d="M7 12.5h6"/><path d="m12 10 2.5 2.5L12 15"/>',
    html: (c) =>
      '<article class="bloque llamada">' +
      '<div>' +
      '<h2 data-editable="' + c + '.titulo">Mensaje de llamada</h2>' +
      '<p class="texto-guia" data-editable="' + c + '.texto">' +
      'Invita a hacer algo: escribiros, apuntaros o venir a la próxima salida.</p>' +
      '</div>' +
      '<a class="boton boton--acento" data-link data-editable="' + c + '.boton" href="#">Escríbenos</a>' +
      '</article>'
  }
};

function normalizarSitio(datos) {
  const d = datos && typeof datos === 'object' ? datos : {};
  const vistos = new Set();
  const nuevos = (Array.isArray(d.nuevos) ? d.nuevos : [])
    .filter((e) => {
      if (!e || typeof e.id !== 'string' || !e.id || vistos.has(e.id)) return false;
      if (!PLANTILLAS_BLOQUE[e.plantilla]) return false;
      vistos.add(e.id);
      return true;
    })
    .map((e) => ({
      id: e.id,
      plantilla: e.plantilla,
      seccion: SECCIONES.includes(e.seccion) ? e.seccion : 'inicio'
    }));
  return {
    textos: (d.textos && typeof d.textos === 'object') ? d.textos : {},
    fotos: (d.fotos && typeof d.fotos === 'object') ? d.fotos : {},
    ocultos: Array.isArray(d.ocultos) ? d.ocultos.slice() : [],
    nuevos: nuevos
  };
}

/** Guarda (con retardo) los cambios del modo edición. */
function guardarSitioProgramado() {
  clearTimeout(temporizadorGuardarSitio);
  temporizadorGuardarSitio = setTimeout(guardarSitio, 350);
}

function guardarSitio() {
  try {
    localStorage.setItem(CLAVE_SITIO, JSON.stringify(estado.sitio));
  } catch {
    avisar('No se pudieron guardar los cambios (almacenamiento lleno o bloqueado).', true);
  }
}

function cargarSitio() {
  estado.sitio = normalizarSitio(null);
  try {
    const guardado = localStorage.getItem(CLAVE_SITIO);
    if (guardado) estado.sitio = normalizarSitio(JSON.parse(guardado));
  } catch { /* almacenamiento bloqueado */ }
}

/** Copia el contenido original de cada marcador (para restablecer). */
function capturarOriginales() {
  document.querySelectorAll('[data-editable]').forEach((el) => {
    originalesSitio.set('t:' + el.dataset.editable, el.innerHTML);
  });
  document.querySelectorAll('[data-foto]').forEach((fig) => {
    const img = fig.querySelector('.foto__img');
    originalesSitio.set('f:' + fig.dataset.foto, img ? img.getAttribute('src') : null);
  });
}

/** Intenta traer la base publicada del proyecto (opcional; 404 tolerado). */
async function cargarEdicionesPublicadas() {
  try {
    const r = await fetch('assets/ediciones.json', { cache: 'no-store' });
    if (!r.ok) return;
    const datos = normalizarSitio(await r.json());
    const locales = estado.sitio;
    // los bloques nuevos propios mandan sobre los de la base (mismo id)
    const porId = new Map();
    datos.nuevos.concat(locales.nuevos).forEach((e) => porId.set(e.id, e));
    estado.sitio = normalizarSitio({
      textos: Object.assign({}, datos.textos, locales.textos),
      fotos: Object.assign({}, datos.fotos, locales.fotos),
      ocultos: Array.from(new Set(datos.ocultos.concat(locales.ocultos))),
      nuevos: Array.from(porId.values())
    });
  } catch { /* file:// o sin archivo: seguimos con lo local */ }
}

function aplicarFoto(fig, dataURL) {
  const img = fig.querySelector('.foto__img');
  const hueco = fig.querySelector('.foto__hueco');
  if (!img) return;
  if (dataURL) {
    img.src = dataURL;
    img.hidden = false;
    if (hueco) hueco.hidden = true;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
    if (hueco) hueco.hidden = false;
  }
}

/** Aplica los cambios guardados sobre los marcadores del sitio. */
function aplicarEdicionesSitio() {
  renderizarNuevosBloques();

  document.querySelectorAll('[data-editable]').forEach((el) => {
    const clave = el.dataset.editable;
    const texto = estado.sitio.textos[clave];
    if (typeof texto === 'string') el.innerHTML = texto;
    else if (originalesSitio.has('t:' + clave)) el.innerHTML = originalesSitio.get('t:' + clave);
  });

  document.querySelectorAll('[data-foto]').forEach((fig) => {
    const clave = fig.dataset.foto;
    const guardada = estado.sitio.fotos[clave];
    aplicarFoto(fig, typeof guardada === 'string'
      ? guardada : originalesSitio.get('f:' + clave));
  });

  document.querySelectorAll('[data-bloque]').forEach((bloque) => {
    bloque.hidden = estado.sitio.ocultos.includes(bloque.dataset.bloque);
  });
}

/** Huella FNV-1a (32 bits) para no guardar la contraseña en texto plano. */
function huellaClave(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

let focoAntesClave = null;

/** Muestra u oculta el diálogo de contraseña de la configuración. */
function alternarModalClave(abrir) {
  if (abrir) {
    focoAntesClave = document.activeElement;
    ui.inputClave.value = '';
    ocultarErrorClave();
    ui.modalClave.classList.remove('oculto');
    setTimeout(() => ui.inputClave.focus(), 30);
  } else {
    ui.modalClave.classList.add('oculto');
    ui.inputClave.value = '';
    ocultarErrorClave();
    if (focoAntesClave && typeof focoAntesClave.focus === 'function') {
      focoAntesClave.focus();
    }
    focoAntesClave = null;
  }
}

/** Quita el aviso de error y el estado inválido del campo. */
function ocultarErrorClave() {
  ui.errorClave.hidden = true;
  ui.inputClave.removeAttribute('aria-invalid');
  ui.modalClave.classList.remove('clave--error');
}

/** Comprueba la contraseña y, si es correcta, abre la configuración. */
function entrarConfiguracion(ev) {
  if (ev) ev.preventDefault();

  if (huellaClave(ui.inputClave.value) !== HUELLA_CLAVE_SITIO) {
    ui.errorClave.hidden = false;
    ui.inputClave.setAttribute('aria-invalid', 'true');
    ui.modalClave.classList.remove('clave--error');
    void ui.modalClave.offsetWidth; // reinicia la animación de aviso
    ui.modalClave.classList.add('clave--error');
    ui.inputClave.select();
    return;
  }

  estado.sitioDesbloqueado = true;
  alternarModalClave(false);
  alternarModoEdicionSitio(true);
}

/** Alterna el modo edición del sitio (textos, fotos y bloques). */
function alternarModoEdicionSitio(activo) {
  estado.modoEdicionSitio = activo;
  document.body.classList.toggle('modo-edicion', activo);
  ui.btnModoEdicion.setAttribute('aria-pressed', String(activo));
  ui.barraEdicion.hidden = !activo;

  document.querySelectorAll('[data-editable]').forEach((el) => {
    if (activo) el.contentEditable = 'true';
    else el.removeAttribute('contenteditable');
  });

  if (activo) {
    if (estado.vista === 'lector') mostrarVista('biblioteca');
    inyectarBotonesBloque();
    avisar('Configuración: pulsa un texto para escribir, «Cambiar foto» en ' +
      'las fotos, «Agregar bloque» para añadir contenido nuevo y ✕ en los ' +
      'bloques para ocultarlos (o borrar los agregados).');
  } else {
    quitarBotonesBloque();
    guardarSitio();
    // «quitarBotonesBloque» desoculta todo: reaplicamos la lista de ocultos
    // para que los bloques que la persona ocultó sigan ocultos al salir.
    document.querySelectorAll('[data-bloque]').forEach((bloque) => {
      bloque.hidden = estado.sitio.ocultos.includes(bloque.dataset.bloque);
    });
  }
}

/** Añade a cada bloque un botón ✕ (solo en modo edición).
    En los bloques predefinidos oculta; en los agregados, elimina en 2 toques. */
function inyectarBotonesBloque() {
  document.querySelectorAll('[data-bloque]').forEach((bloque) => {
    if (bloque.querySelector(':scope > .bloque__ocultar')) return;
    const esNuevo = bloque.hasAttribute('data-bloque-nuevo');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bloque__ocultar';
    btn.title = esNuevo ? 'Eliminar este bloque' : 'Ocultar este bloque';
    btn.setAttribute('aria-label', btn.title);
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" class="icono" aria-hidden="true">' +
      '<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (esNuevo) confirmarEliminacionBloque(btn, bloque);
      else ocultarBloque(bloque.dataset.bloque);
    });
    bloque.appendChild(btn);
  });
}

function quitarBotonesBloque() {
  document.querySelectorAll('.bloque__ocultar').forEach((b) => b.remove());
  document.querySelectorAll('[data-bloque]').forEach((b) => { b.hidden = false; });
}

function ocultarBloque(clave) {
  if (!estado.sitio.ocultos.includes(clave)) estado.sitio.ocultos.push(clave);
  const bloque = document.querySelector('[data-bloque="' + clave + '"]');
  if (bloque) bloque.hidden = true;
  guardarSitio();
  avisar('Bloque oculto. «Mostrar bloques ocultos» lo recupera.');
}

function mostrarBloquesOcultos() {
  if (!estado.sitio.ocultos.length) {
    avisar('No hay bloques ocultos.');
    return;
  }
  estado.sitio.ocultos = [];
  guardarSitio();
  aplicarEdicionesSitio();
  if (estado.modoEdicionSitio) inyectarBotonesBloque();
  avisar('Todos los bloques vuelven a verse.');
}

/* --- Bloques nuevos (galería de plantillas predefinidas) --- */

/** Contenedor donde se insertan los bloques nuevos de una sección. */
function zonaDeBloques(nombreSeccion) {
  const sec = document.querySelector('.web[data-seccion="' + nombreSeccion + '"]');
  return sec ? sec.querySelector('[data-zona-nuevos]') : null;
}

/** Pinta las tarjetas de la galería (una sola vez). */
function renderizarPlantillas() {
  if (ui.listaPlantillas.childElementCount) return;
  Object.keys(PLANTILLAS_BLOQUE).forEach((id) => {
    const p = PLANTILLAS_BLOQUE[id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'plantilla';
    btn.dataset.plantilla = id;
    btn.innerHTML =
      '<span class="plantilla__icono" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" class="icono">' + p.icono + '</svg></span>' +
      '<span class="plantilla__nombre">' + p.nombre + '</span>' +
      '<span class="plantilla__desc">' + p.desc + '</span>';
    btn.addEventListener('click', () => agregarBloqueNuevo(id));
    ui.listaPlantillas.appendChild(btn);
  });
}

function abrirPanelPlantillas() {
  const zona = zonaDeBloques(estado.seccion);
  if (!zona) {
    avisar('La Biblioteca no admite bloques: abre una sección del sitio ' +
      '(Inicio, Testimonios…) para agregar.', true);
    return;
  }
  renderizarPlantillas();
  ui.panelPlantillas.classList.remove('oculto');
  const primero = ui.listaPlantillas.querySelector('.plantilla');
  if (primero) primero.focus();
}

function cerrarPanelPlantillas() {
  if (ui.panelPlantillas.classList.contains('oculto')) return;
  ui.panelPlantillas.classList.add('oculto');
  if (estado.modoEdicionSitio) ui.btnAgregarBloque.focus();
}

/** Construye el nodo DOM de un bloque guardado (entrada de `nuevos`). */
function construirBloqueNuevo(entrada) {
  const plantilla = PLANTILLAS_BLOQUE[entrada.plantilla];
  const prefijo = 'nuevo.' + entrada.id;
  const caja = document.createElement('div');
  caja.innerHTML = plantilla ? plantilla.html(prefijo) : '';
  const el = caja.firstElementChild;
  el.setAttribute('data-bloque', prefijo);
  el.setAttribute('data-bloque-nuevo', entrada.id);
  return el;
}

/** Deja un bloque recién creado listo para editar (si hay modo edición). */
function prepararBloqueNuevo(el) {
  if (!estado.modoEdicionSitio) return;
  el.querySelectorAll('[data-editable]').forEach((t) => { t.contentEditable = 'true'; });
  inyectarBotonesBloque();
}

/** Sincroniza el DOM con estado.sitio.nuevos (añade y retira bloques). */
function renderizarNuevosBloques() {
  document.querySelectorAll('[data-bloque-nuevo]').forEach((el) => {
    const id = el.dataset.bloqueNuevo;
    if (!estado.sitio.nuevos.some((e) => e.id === id)) el.remove();
  });
  estado.sitio.nuevos.forEach((entrada) => {
    if (document.querySelector('[data-bloque-nuevo="' + entrada.id + '"]')) return;
    const zona = zonaDeBloques(entrada.seccion);
    if (!zona) return;   // sección no disponible: se conserva en el guardado
    const el = construirBloqueNuevo(entrada);
    zona.appendChild(el);
    prepararBloqueNuevo(el);
  });
}

/** Agrega un bloque de la plantilla indicada en la sección visible. */
function agregarBloqueNuevo(plantillaId) {
  const plantilla = PLANTILLAS_BLOQUE[plantillaId];
  const zona = zonaDeBloques(estado.seccion);
  if (!plantilla || !zona) {
    avisar('No se pudo añadir el bloque en esta sección.', true);
    return null;
  }
  const entrada = {
    id: 'b' + Date.now().toString(36) + Math.floor(Math.random() * 1000000).toString(36),
    plantilla: plantillaId,
    seccion: estado.seccion
  };
  estado.sitio.nuevos.push(entrada);
  const el = construirBloqueNuevo(entrada);
  zona.appendChild(el);
  prepararBloqueNuevo(el);
  guardarSitio();

  cerrarPanelPlantillas();
  if (typeof el.scrollIntoView === 'function') {
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* opcional */ }
  }
  const primero = el.querySelector('[data-editable]');
  if (primero) primero.focus();
  avisar('Bloque añadido en «' + (NOMBRES_SECCION[estado.seccion] || estado.seccion) +
    '»: escribe encima de la guía y pon su foto.');
  return el;
}

/** ✕ de un bloque nuevo: primer toque pide confirmación, segundo lo borra. */
function confirmarEliminacionBloque(btn, bloque) {
  if (btn.dataset.confirmar !== 'si') {
    btn.dataset.confirmar = 'si';
    btn.classList.add('peligro');
    btn.title = '¿Seguro? Pulsa otra vez para eliminar';
    avisar('Pulsa ✕ otra vez para eliminar este bloque (no se puede deshacer).');
    btn.temporizadorConfirmacion = setTimeout(() => {
      btn.dataset.confirmar = '';
      btn.classList.remove('peligro');
      btn.title = 'Eliminar este bloque';
    }, 3500);
    return;
  }
  clearTimeout(btn.temporizadorConfirmacion);
  eliminarBloqueNuevo(bloque.dataset.bloqueNuevo);
}

/** Elimina un bloque nuevo y todo lo que se guardó con sus claves. */
function eliminarBloqueNuevo(id) {
  const prefijo = 'nuevo.' + id + '.';
  estado.sitio.nuevos = estado.sitio.nuevos.filter((e) => e.id !== id);
  Object.keys(estado.sitio.textos).forEach((k) => {
    if (k.indexOf(prefijo) === 0) delete estado.sitio.textos[k];
  });
  Object.keys(estado.sitio.fotos).forEach((k) => {
    if (k.indexOf(prefijo) === 0) delete estado.sitio.fotos[k];
  });
  estado.sitio.ocultos = estado.sitio.ocultos
    .filter((k) => k !== 'nuevo.' + id && k.indexOf(prefijo) !== 0);
  const el = document.querySelector('[data-bloque-nuevo="' + id + '"]');
  if (el) el.remove();
  guardarSitio();
  avisar('Bloque eliminado.');
}

/* --- Fotos del sitio --- */
let fotoPendiente = null;

function pedirFoto(clave) {
  fotoPendiente = clave;
  ui.inputImagen.click();
}

async function procesarFoto(archivo) {
  const clave = fotoPendiente;
  fotoPendiente = null;
  ui.inputImagen.value = '';
  if (!clave || !archivo) return;

  if (!/^image\//.test(archivo.type || '')) {
    avisar('El archivo elegido no es una imagen.', true);
    return;
  }

  try {
    const dataURL = await archivoADataURL(archivo, 1400, 0.82);
    estado.sitio.fotos[clave] = dataURL;
    const fig = document.querySelector('[data-foto="' + clave + '"]');
    if (fig) aplicarFoto(fig, dataURL);
    guardarSitio();
    avisar('Foto actualizada.');
  } catch (e) {
    avisar('No se pudo cargar la imagen: ' + ((e && e.message) || e), true);
  }
}

/** Lee una imagen y la reduce si hace falta (devuelve dataURL JPEG). */
function archivoADataURL(archivo, maxLado, calidad) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error('no se pudo leer el archivo'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => rechazar(new Error('formato de imagen no reconocido'));
      img.onload = () => {
        try {
          const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * escala);
          canvas.height = Math.round(img.height * escala);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolver(canvas.toDataURL('image/jpeg', calidad));
        } catch (err) { rechazar(err); }
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

/* --- Enlaces (en modo edición se cambia la URL con un clic) --- */
function onClicEnlace(e) {
  if (!estado.modoEdicionSitio) return;
  const a = e.target.closest && e.target.closest('a[data-link]');
  if (!a) return;
  e.preventDefault();
  const actual = a.getAttribute('href') || '';
  const url = window.prompt('Dirección del enlace (URL completa, por ejemplo ' +
    'https://…):', actual === '#' ? '' : actual);
  if (url === null) return;
  a.setAttribute('href', url.trim() || '#');
  avisar('Enlace actualizado.');
}

/* --- Textos: guardado delegado --- */
function onInputEditable(e) {
  const el = e.target.closest && e.target.closest('[data-editable]');
  if (!el || !estado.modoEdicionSitio) return;
  estado.sitio.textos[el.dataset.editable] = el.innerHTML;
  guardarSitioProgramado();
}

function onPasteEditable(e) {
  const el = e.target.closest && e.target.closest('[data-editable]');
  if (!el || !estado.modoEdicionSitio) return;
  e.preventDefault();
  const datos = e.clipboardData || window.clipboardData;
  const texto = datos ? datos.getData('text/plain') : '';
  document.execCommand('insertText', false, texto);
}

/* --- Exportar / importar / restablecer --- */
function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function descargarCambiosSitio() {
  const blob = new Blob([JSON.stringify(estado.sitio, null, 2)],
    { type: 'application/json' });
  descargarBlob(blob, 'ediciones-notimision.json');
  avisar('Cambios descargados. Puedes cargarlos en otro navegador con ' +
    '«Importar cambios».');
}

function importarCambiosSitio(archivo) {
  if (!archivo) return;
  const lector = new FileReader();
  lector.onerror = () => avisar('No se pudo leer el archivo JSON.', true);
  lector.onload = () => {
    try {
      const datos = normalizarSitio(JSON.parse(lector.result));
      const porId = new Map();
      estado.sitio.nuevos.concat(datos.nuevos).forEach((e) => porId.set(e.id, e));
      estado.sitio = normalizarSitio({
        textos: Object.assign({}, estado.sitio.textos, datos.textos),
        fotos: Object.assign({}, estado.sitio.fotos, datos.fotos),
        ocultos: Array.from(new Set(estado.sitio.ocultos.concat(datos.ocultos))),
        nuevos: Array.from(porId.values())
      });
      guardarSitio();
      aplicarEdicionesSitio();
      if (estado.modoEdicionSitio) inyectarBotonesBloque();
      avisar('Cambios importados.');
    } catch {
      avisar('El archivo no es un JSON de cambios válido.', true);
    }
  };
  lector.readAsText(archivo);
}

let restablecerPendiente = false;
let temporizadorRestablecer = null;

/** Restablece el sitio original (confirmación en dos toques). */
function restablecerSitio() {
  if (!restablecerPendiente) {
    restablecerPendiente = true;
    ui.btnRestablecerSitio.classList.add('peligro');
    ui.btnRestablecerSitio.textContent = '¿Seguro?';
    avisar('Pulsa «¿Seguro?» otra vez para borrar todos los cambios del sitio.');
    clearTimeout(temporizadorRestablecer);
    temporizadorRestablecer = setTimeout(() => {
      restablecerPendiente = false;
      ui.btnRestablecerSitio.classList.remove('peligro');
      ui.btnRestablecerSitio.textContent = 'Restablecer';
    }, 3500);
    return;
  }

  clearTimeout(temporizadorRestablecer);
  restablecerPendiente = false;
  ui.btnRestablecerSitio.classList.remove('peligro');
  ui.btnRestablecerSitio.textContent = 'Restablecer';

  estado.sitio = normalizarSitio(null);
  try { localStorage.removeItem(CLAVE_SITIO); } catch { /* noop */ }
  aplicarEdicionesSitio();
  if (estado.modoEdicionSitio) inyectarBotonesBloque();
  avisar('Sitio restablecido al contenido original (los bloques agregados se eliminaron).');
}

/* ============ 17. EDITOR DE TEXTO SOBRE LAS PÁGINAS (CAPAS) =============== */
/* Cada revista guarda sus capas (títulos y notas superpuestos) en el
   navegador. En modo texto, un clic sobre una página crea un texto nuevo. */

const FUENTES_CAPA = {
  serif: '"Fraunces", Georgia, "Times New Roman", serif',
  sans: '"Archivo", system-ui, Arial, sans-serif',
  mono: 'ui-monospace, "Cascadia Mono", Consolas, monospace'
};

function claveCapasActual() {
  return CLAVE_CAPAS + (estado.pubAbierta ? estado.pubAbierta.id : 'archivo-local');
}

function nuevaCapa(datos) {
  return Object.assign({
    id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    pagina: 0,
    x: 6, y: 8, w: 60,
    fs: 3.2,                      // tamaño de letra en % del alto de página
    texto: 'Escribe aquí…',
    fuente: 'serif',
    color: '#14161c',
    negrita: false,
    cursiva: false,
    centrada: false
  }, datos || {});
}

function capasDePagina(indice) {
  return estado.capas[indice] || [];
}

function buscarCapa(id) {
  for (const k of Object.keys(estado.capas)) {
    const f = estado.capas[k].find((c) => c.id === id);
    if (f) return f;
  }
  return null;
}

function capaActual() {
  return estado.seleccion ? buscarCapa(estado.seleccion) : null;
}

/** Dibuja (o refresca) la capa dentro del <div class="pagina"> indicado. */
function pintarCapaDOM(capa, cont) {
  let el = cont.querySelector('.capa[data-id="' + capa.id + '"]');
  if (!el) {
    el = document.createElement('div');
    el.className = 'capa';
    el.dataset.id = capa.id;
    el.innerHTML =
      '<span class="capa__etiqueta" aria-hidden="true">Aa</span>' +
      '<div class="capa__texto"></div>';
    cont.appendChild(el);
  }

  el.style.left = capa.x + '%';
  el.style.top = capa.y + '%';
  el.style.width = capa.w + '%';

  const texto = el.querySelector('.capa__texto');
  if (document.activeElement !== texto) texto.textContent = capa.texto;
  texto.style.fontFamily = FUENTES_CAPA[capa.fuente] || FUENTES_CAPA.serif;
  texto.style.color = capa.color;
  texto.style.fontWeight = capa.negrita ? '700' : '400';
  texto.style.fontStyle = capa.cursiva ? 'italic' : 'normal';
  texto.style.textAlign = capa.centrada ? 'center' : 'left';
  texto.style.fontSize = (estado.altoPaginaPx * capa.fs / 100) + 'px';
  texto.contentEditable = estado.modoTexto ? 'true' : 'false';
  el.classList.toggle('capa--seleccionada', estado.seleccion === capa.id);
  return el;
}

function colocarCapasPagina(indice) {
  const cont = estado.divs[indice];
  if (!cont) return;
  capasDePagina(indice).forEach((capa) => pintarCapaDOM(capa, cont));
}

function colocarCapasPaginas() {
  Object.keys(estado.capas).forEach((k) => colocarCapasPagina(Number(k)));
}

function refrescarCapas() {
  Object.keys(estado.capas).forEach((k) => {
    const indice = Number(k);
    const cont = estado.divs[indice];
    if (!cont) return;
    capasDePagina(indice).forEach((c) => pintarCapaDOM(c, cont));
  });
}

/** Mide la página real para dimensionar las letras de las capas. */
function actualizarMetricas() {
  let alto = 0;
  if (estado.divs[0]) alto = estado.divs[0].getBoundingClientRect().height;
  if (!alto && ui.contenedorLibro) alto = ui.contenedorLibro.clientHeight;
  if (alto) estado.altoPaginaPx = alto;
  actualizarTamanoCapas();
}

function actualizarTamanoCapas() {
  Object.keys(estado.capas).forEach((k) => {
    const indice = Number(k);
    const cont = estado.divs[indice];
    if (!cont) return;
    capasDePagina(indice).forEach((capa) => {
      const el = cont.querySelector('.capa[data-id="' + capa.id + '"] .capa__texto');
      if (el) el.style.fontSize = (estado.altoPaginaPx * capa.fs / 100) + 'px';
    });
  });
}

function crearCapaEnPagina(indice, datos) {
  if (!estado.divs[indice]) return null;
  if (!estado.capas[indice]) estado.capas[indice] = [];

  const capa = nuevaCapa(Object.assign({ pagina: indice }, datos));
  estado.capas[indice].push(capa);
  pintarCapaDOM(capa, estado.divs[indice]);
  seleccionarCapa(capa.id);
  registrarHistorial();
  programarGuardadoCapas();
  return capa;
}

function seleccionarCapa(id) {
  estado.seleccion = id;
  refrescarCapas();
  sincronizarBarraCapas();
}

function deseleccionarCapa() {
  estado.seleccion = null;
  refrescarCapas();
}

function mutarCapaActual(mutador) {
  const capa = capaActual();
  if (!capa) return;
  mutador(capa);
  refrescarCapas();
  sincronizarBarraCapas();
  registrarHistorial();
  programarGuardadoCapas();
}

function duplicarCapa() {
  const capa = capaActual();
  if (!capa) return;
  const copia = crearCapaEnPagina(capa.pagina, {
    x: limite(capa.x + 3, 0, Math.max(0, 100 - capa.w)),
    y: limite(capa.y + 4, 0, 95),
    w: capa.w, fs: capa.fs, texto: capa.texto, fuente: capa.fuente,
    color: capa.color, negrita: capa.negrita, cursiva: capa.cursiva,
    centrada: capa.centrada
  });
  if (copia) seleccionarCapa(copia.id);
}

function borrarCapaActual() {
  const capa = capaActual();
  if (!capa) return;
  estado.capas[capa.pagina] = capasDePagina(capa.pagina).filter((c) => c.id !== capa.id);

  const cont = estado.divs[capa.pagina];
  if (cont) {
    const el = cont.querySelector('.capa[data-id="' + capa.id + '"]');
    if (el) el.remove();
  }
  estado.seleccion = null;
  sincronizarBarraCapas();
  registrarHistorial();
  programarGuardadoCapas();
}

/* --- Barra de herramientas de capas --- */
function sincronizarBarraCapas() {
  const capa = capaActual();
  const controles = ['capaMas', 'capaMenos', 'capaNegrita', 'capaCursiva',
    'capaCentrada', 'capaDuplicar', 'capaBorrar'];
  controles.forEach((k) => { ui[k].disabled = !capa; });
  ui.capaFuente.disabled = !capa;
  ui.capaColor.disabled = !capa;

  if (!capa) {
    ui.capaTamano.textContent = '—';
    ui.capaNegrita.setAttribute('aria-pressed', 'false');
    ui.capaCursiva.setAttribute('aria-pressed', 'false');
    ui.capaCentrada.setAttribute('aria-pressed', 'false');
    return;
  }
  ui.capaFuente.value = capa.fuente;
  ui.capaColor.value = capa.color;
  ui.capaTamano.textContent = capa.fs.toFixed(1).replace('.', ',') + ' %';
  ui.capaNegrita.setAttribute('aria-pressed', String(!!capa.negrita));
  ui.capaCursiva.setAttribute('aria-pressed', String(!!capa.cursiva));
  ui.capaCentrada.setAttribute('aria-pressed', String(!!capa.centrada));
}

/* --- Historial (Ctrl+Z) ---
   La pila guarda instantáneas completas de estado.capas; la de arriba del
   todo es SIEMPRE el estado actual. Deshacer descarta la última y vuelve a
   aplicar la anterior. */
function registrarHistorial() {
  const actual = JSON.stringify(estado.capas);
  if (estado.historialCapas[estado.historialCapas.length - 1] === actual) return;
  estado.historialCapas.push(actual);
  if (estado.historialCapas.length > 40) estado.historialCapas.shift();
}

function deshacerCapas() {
  if (estado.historialCapas.length <= 1) { avisar('No hay nada que deshacer.'); return; }
  estado.historialCapas.pop();   // descartamos el estado actual
  estado.capas = JSON.parse(estado.historialCapas[estado.historialCapas.length - 1]);
  if (!buscarCapa(estado.seleccion)) estado.seleccion = null;

  estado.divs.forEach((div) => {
    if (div) div.querySelectorAll('.capa').forEach((c) => c.remove());
  });
  colocarCapasPaginas();
  actualizarTamanoCapas();
  sincronizarBarraCapas();
  programarGuardadoCapas();
  avisar('Cambio deshecho.');
}

/* --- Guardado por revista --- */
let temporizadorGuardarCapas = null;

function programarGuardadoCapas() {
  clearTimeout(temporizadorGuardarCapas);
  temporizadorGuardarCapas = setTimeout(guardarCapas, 350);
}

function guardarCapas() {
  try {
    localStorage.setItem(claveCapasActual(), JSON.stringify(estado.capas));
  } catch { /* almacenamiento bloqueado */ }
}

function cargarCapasGuardadas() {
  estado.capas = {};
  estado.seleccion = null;
  estado.historialCapas = [];
  try {
    const guardado = localStorage.getItem(claveCapasActual());
    if (guardado) {
      const datos = JSON.parse(guardado);
      if (datos && typeof datos === 'object') estado.capas = datos;
    }
  } catch { /* almacenamiento bloqueado */ }
  registrarHistorial();   // estado inicial por si hay que deshacer
}

/* --- Modo texto --- */
function alternarModoTexto() {
  aplicarModoTexto(!estado.modoTexto);
}

function aplicarModoTexto(activo) {
  estado.modoTexto = activo;
  document.body.classList.toggle('modo-texto', activo);
  ui.btnEditarTexto.setAttribute('aria-pressed', String(activo));
  ui.chipModo.hidden = !activo;
  ui.barraCapas.hidden = !activo;
  activarEsquinas(!activo);

  estado.divs.forEach((div) => {
    if (!div) return;
    div.querySelectorAll('.capa__texto').forEach((t) => {
      t.contentEditable = activo ? 'true' : 'false';
    });
  });

  if (activo) {
    avisar('Modo texto: pulsa sobre una página para añadir un título o nota, ' +
      'arrástralo para moverlo y usa la barra para darle estilo.');
  } else {
    deseleccionarCapa();
    guardarCapas();
  }
}

/** Oculta las esquinas de volteo mientras se edita (si la librería lo admite). */
function activarEsquinas(activo) {
  if (!estado.flip) return;
  try {
    const ajustes = estado.flip.getSettings();
    ajustes.showPageCorners = activo;
  } catch { /* la librería decidirá */ }
}

/* --- Interacción puntero sobre las capas --- */
let arrastreCapa = null;

/** Captura (fase de captura) el puntero: en modo texto el libro no voltea. */
function onPunteroAbajoZona(e) {
  if (!estado.modoTexto) return;
  e.stopPropagation();

  const capaEl = e.target.closest ? e.target.closest('.capa') : null;
  if (!capaEl) return;
  const capa = buscarCapa(capaEl.dataset.id);
  if (!capa) return;

  seleccionarCapa(capa.id);

  const cont = estado.divs[capa.pagina];
  if (!cont) return;
  const rect = cont.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  arrastreCapa = {
    id: capa.id,
    xInicial: capa.x,
    yInicial: capa.y,
    px: rect.width,
    py: rect.height,
    xPuntero: e.clientX,
    yPuntero: e.clientY,
    movido: false
  };
}

function onPunteroMoverZona(e) {
  if (!arrastreCapa) return;
  const capa = buscarCapa(arrastreCapa.id);
  if (!capa) { arrastreCapa = null; return; }

  const dx = ((e.clientX - arrastreCapa.xPuntero) / arrastreCapa.px) * 100;
  const dy = ((e.clientY - arrastreCapa.yPuntero) / arrastreCapa.py) * 100;
  if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) arrastreCapa.movido = true;

  capa.x = limite(arrastreCapa.xInicial + dx, 0, Math.max(0, 100 - capa.w));
  capa.y = limite(arrastreCapa.yInicial + dy, 0, 97);

  const cont = estado.divs[capa.pagina];
  const el = cont && cont.querySelector('.capa[data-id="' + capa.id + '"]');
  if (el) { el.style.left = capa.x + '%'; el.style.top = capa.y + '%'; }
}

function onPunteroArribaZona() {
  if (!arrastreCapa) return;
  if (arrastreCapa.movido) {
    registrarHistorial();
    programarGuardadoCapas();
  }
  arrastreCapa = null;
}

/** Captura (fase de captura): en modo texto un clic crea una capa. */
function onClicPagina(e) {
  if (!estado.modoTexto) return;
  e.stopPropagation();   // los clics no voltean el libro mientras se edita
  if (e.target.closest && e.target.closest('.capa')) return;

  const div = e.target.closest ? e.target.closest('.pagina') : null;
  if (!div) return;
  const indice = estado.divs.indexOf(div);
  if (indice < 0) return;

  const rect = div.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;

  const capa = crearCapaEnPagina(indice, {
    x: limite(x, 0, 90),
    y: limite(y - 1.5, 0, 95)
  });
  if (!capa) return;

  const el = div.querySelector('.capa[data-id="' + capa.id + '"] .capa__texto');
  if (el) {
    el.focus();
    const rango = document.createRange();
    rango.selectNodeContents(el);
    const seleccion = window.getSelection();
    seleccion.removeAllRanges();
    seleccion.addRange(rango);
  }
}

/** Texto escrito dentro de una capa → modelo + guardado. */
function onInputCapa(e) {
  const el = e.target.closest && e.target.closest('.capa__texto');
  if (!el) return;
  const capaEl = el.closest('.capa');
  const capa = capaEl ? buscarCapa(capaEl.dataset.id) : null;
  if (!capa) return;
  capa.texto = el.textContent;
  programarGuardadoCapas();
}

/* ============ 18. EXPORTACIÓN DEL PDF EDITADO ============================= */
/* Compone cada página (imagen + capas) en un lienzo y escribe un PDF a mano
   (JPEG embebidos, sin librerías externas). */

function pintarCapaExportada(ctx, capa, ancho, alto) {
  const fs = Math.max(6, alto * capa.fs / 100);
  const familia = FUENTES_CAPA[capa.fuente] || FUENTES_CAPA.serif;
  ctx.save();
  ctx.fillStyle = capa.color || '#14161c';
  ctx.font = (capa.cursiva ? 'italic ' : '') + (capa.negrita ? '700 ' : '400 ') +
    fs + 'px ' + familia;
  ctx.textBaseline = 'top';

  const x = ancho * capa.x / 100;
  const y = alto * capa.y / 100;
  const anchoMax = ancho * capa.w / 100;
  ctx.textAlign = capa.centrada ? 'center' : 'left';
  const xLinea = capa.centrada ? x + anchoMax / 2 : x;

  const lineas = ajustarLineas(ctx, capa.texto || '', anchoMax);
  lineas.forEach((linea, i) => ctx.fillText(linea, xLinea, y + i * fs * 1.25));
  ctx.restore();
}

/** Parte un texto en líneas que caben en `anchoMax` px. */
function ajustarLineas(ctx, texto, anchoMax) {
  const lineas = [];
  String(texto).split('\n').forEach((parrafo) => {
    const palabras = parrafo.split(/\s+/).filter(Boolean);
    if (!palabras.length) { lineas.push(''); return; }
    let actual = palabras[0];
    for (let i = 1; i < palabras.length; i++) {
      const prueba = actual + ' ' + palabras[i];
      if (ctx.measureText(prueba).width <= anchoMax) actual = prueba;
      else { lineas.push(actual); actual = palabras[i]; }
    }
    lineas.push(actual);
  });
  return lineas;
}

/** Pinta la página i (imagen + capas) en un lienzo listo para exportar. */
function pintarPaginaExportada(indice) {
  const img = estado.imgs[indice];
  const ancho = (img && img.naturalWidth) || ANCHO_RASTER;
  const alto = (img && img.naturalHeight) ||
    Math.round(ancho * estado.altoBase / estado.anchoBase);

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ancho, alto);
  if (img && img.complete && img.naturalWidth) ctx.drawImage(img, 0, 0, ancho, alto);

  capasDePagina(indice).forEach((capa) => pintarCapaExportada(ctx, capa, ancho, alto));
  return canvas;
}

/** Escribe un PDF mínimo con las páginas (JPEG) dadas. */
function construirPDFEditado(paginas) {
  const enc = new TextEncoder();
  const partes = [];
  const offsets = [];
  let byte = 0;

  const empujar = (dato) => {
    const b = typeof dato === 'string' ? enc.encode(dato) : dato;
    partes.push(b);
    byte += b.length;
  };
  const marcar = () => { offsets.push(byte); };

  empujar('%PDF-1.4\n');

  const totalObjetos = 2 + paginas.length * 3;

  marcar();
  empujar('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  const hijos = paginas.map((_, i) => (3 + i * 3) + ' 0 R').join(' ');
  marcar();
  empujar('2 0 obj\n<< /Type /Pages /Kids [' + hijos + '] /Count ' +
    paginas.length + ' >>\nendobj\n');

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
      anchoPt + ' ' + altoPt + '] /Resources << /XObject << /Im' + i + ' ' +
      numImagen + ' 0 R >> >> /Contents ' + numContenido + ' 0 R >>\nendobj\n');

    marcar();
    empujar(numContenido + ' 0 obj\n<< /Length ' + contenido.length +
      ' >>\nstream\n' + contenido + 'endstream\nendobj\n');

    marcar();
    empujar(numImagen + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' +
      pagina.ancho + ' /Height ' + pagina.alto +
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
      pagina.jpeg.length + ' >>\nstream\n');
    empujar(pagina.jpeg);
    empujar('\nendstream\nendobj\n');
  });

  const inicioXref = byte;
  let xref = 'xref\n0 ' + (totalObjetos + 1) + '\n0000000000 65535 f \n';
  offsets.forEach((o) => { xref += String(o).padStart(10, '0') + ' 00000 n \n'; });
  empujar(xref);
  empujar('trailer\n<< /Size ' + (totalObjetos + 1) + ' /Root 1 0 R >>\nstartxref\n' +
    inicioXref + '\n%%EOF\n');

  return new Blob(partes, { type: 'application/pdf' });
}

/** Exporta la revista abierta con sus capas ya escritas encima. */
async function exportarRevista() {
  if (!estado.doc || estado.exportando) return;
  estado.exportando = true;
  ui.btnExportar.disabled = true;
  mostrarOverlayCarga('Exportando el PDF editado…', 'Componiendo páginas y textos');
  const pararVigilante = vigilanteCarga(120);

  try {
    const paginas = [];
    for (let i = 0; i < estado.paginas.length; i++) {
      await pintarPrioridad(i);   // garantiza la imagen de la página
      const img = estado.imgs[i];
      if (!img || !img.complete || !img.naturalWidth) continue;

      const lienzo = pintarPaginaExportada(i);
      const blob = await new Promise((resolver, rechazar) => {
        lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error('toBlob devolvió null'))),
          'image/jpeg', 0.86);
      });
      const jpeg = new Uint8Array(await blob.arrayBuffer());
      paginas.push({ ancho: lienzo.width, alto: lienzo.height, jpeg });

      ui.detalleCarga.textContent = (i + 1) + ' de ' + estado.paginas.length + ' páginas';
      await esperar(0);
    }

    if (!paginas.length) throw new Error('No hay páginas para exportar');

    const pdf = construirPDFEditado(paginas);
    const nombre = (estado.pubAbierta ? estado.pubAbierta.titulo : 'revista') + '-editada.pdf';
    descargarBlob(pdf, nombre);
    ocultarOverlayCarga();
    avisar('PDF exportado: ' + nombre + ' (' + formatearPeso(pdf.size) + ')');
  } catch (e) {
    console.error(e);
    ocultarOverlayCarga();
    avisar('No se pudo exportar el PDF: ' + ((e && e.message) || e), true);
  } finally {
    pararVigilante();
    estado.exportando = false;
    ui.btnExportar.disabled = false;
  }
}

/* ========================= 19. VISTAS ===================================== */

function mostrarVista(v) {
  const lector = v === 'lector';
  estado.vista = lector ? 'lector' : 'biblioteca';

  document.body.classList.toggle('vista-biblioteca', !lector);
  document.body.classList.toggle('vista-lector', lector);

  ui.cabeceraSitio.hidden = lector;
  ui.cintaSitio.hidden = lector;
  ui.sitio.hidden = lector;
  ui.pieSitio.hidden = lector;
  ui.barraLector.hidden = !lector;
  ui.vistaLector.hidden = !lector;

  if (!lector) {
    cerrarPanel();
    destruirLibro();
    estado.pubAbierta = null;
    estado.pubPendiente = null;
    aplicarRuta();
    renderizarChips();
    renderizarEstanteria();
  } else if (estado.flip) {
    // El libro se monta con la vista aún oculta (mide 0×0); al hacerla
    // visible hay que recalcular el tamaño y la orientación en el
    // siguiente cuadro, cuando el navegador ya conoce las medidas reales.
    requestAnimationFrame(() => {
      if (!estado.flip || estado.vista !== 'lector') return;
      dimensionarLibro();
      actualizarNavegacion();
    });
  }
}

/* ========================= 20. CATÁLOGO =================================== */

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

/* ========================= 21. EVENTOS ==================================== */

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
  ui.btnVolver.addEventListener('click', () => irA('biblioteca'));
  ui.btnSonido.addEventListener('click', alternarSonido);
  ui.btnInfo.addEventListener('click', alternarPanel);
  ui.btnCerrarInfo.addEventListener('click', cerrarPanel);
  ui.fondoPanel.addEventListener('click', cerrarPanel);

  /* --- Sitio: rutas y menú --- */
  window.addEventListener('hashchange', aplicarRuta);
  ui.btnMenu.addEventListener('click', () => {
    const abierto = ui.menuSitio.classList.toggle('menu--abierto');
    ui.btnMenu.setAttribute('aria-expanded', String(abierto));
  });

  /* --- Configuración del sitio (protegida con contraseña) --- */
  ui.btnModoEdicion.addEventListener('click', () => {
    if (estado.modoEdicionSitio) {
      alternarModoEdicionSitio(false);
    } else if (estado.sitioDesbloqueado) {
      alternarModoEdicionSitio(true);
    } else {
      alternarModalClave(true);
    }
  });
  ui.formClave.addEventListener('submit', entrarConfiguracion);
  ui.btnCancelarClave.addEventListener('click', () => alternarModalClave(false));
  ui.inputClave.addEventListener('input', ocultarErrorClave);
  ui.modalClave.addEventListener('click', (e) => {
    // clic en el fondo del overlay: cierra el diálogo
    if (e.target === ui.modalClave) alternarModalClave(false);
  });
  document.addEventListener('keydown', (e) => {
    if (ui.modalClave.classList.contains('oculto')) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      alternarModalClave(false);
      return;
    }

    if (e.key !== 'Tab') return;
    // Mantén el foco dentro del diálogo mientras está abierto.
    const focos = Array.from(ui.modalClave.querySelectorAll('input, button'))
      .filter((el) => !el.disabled && el.offsetParent !== null);
    if (!focos.length) return;
    const primero = focos[0];
    const ultimo = focos[focos.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  });
  ui.btnSalirEdicion.addEventListener('click', () => alternarModoEdicionSitio(false));
  ui.btnDescargarCambios.addEventListener('click', descargarCambiosSitio);
  ui.btnImportarCambios.addEventListener('click', () => ui.inputImportar.click());
  ui.inputImportar.addEventListener('change', () => {
    importarCambiosSitio(ui.inputImportar.files && ui.inputImportar.files[0]);
  });
  ui.btnMostrarOcultos.addEventListener('click', mostrarBloquesOcultos);
  ui.btnRestablecerSitio.addEventListener('click', restablecerSitio);
  ui.btnAgregarBloque.addEventListener('click', abrirPanelPlantillas);
  ui.btnCerrarPlantillas.addEventListener('click', cerrarPanelPlantillas);
  ui.panelPlantillas.addEventListener('click', (e) => {
    // clic en el fondo del overlay: cierra la galería
    if (e.target === ui.panelPlantillas) cerrarPanelPlantillas();
  });
  ui.inputImagen.addEventListener('change', () => {
    procesarFoto(ui.inputImagen.files && ui.inputImagen.files[0]);
  });

  document.addEventListener('input', (e) => {
    onInputCapa(e);
    onInputEditable(e);
  });
  document.addEventListener('paste', onPasteEditable);
  document.addEventListener('click', onClicEnlace);
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.foto__cambiar');
    if (!btn || !estado.modoEdicionSitio) return;
    const fig = btn.closest('[data-foto]');
    if (fig) pedirFoto(fig.dataset.foto);
  });

  /* --- Editor de texto sobre páginas (capas) --- */
  ui.btnEditarTexto.addEventListener('click', alternarModoTexto);
  ui.btnExportar.addEventListener('click', exportarRevista);

  // Fase de captura: mientras hay modo texto, los clics no llegan al libro
  ui.zonaLibro.addEventListener('pointerdown', onPunteroAbajoZona, true);
  ui.zonaLibro.addEventListener('click', onClicPagina, true);
  window.addEventListener('pointermove', onPunteroMoverZona);
  window.addEventListener('pointerup', onPunteroArribaZona);

  ui.capaMas.addEventListener('click',
    () => mutarCapaActual((c) => { c.fs = limite(c.fs + 0.3, 0.8, 40); }));
  ui.capaMenos.addEventListener('click',
    () => mutarCapaActual((c) => { c.fs = limite(c.fs - 0.3, 0.8, 40); }));
  ui.capaNegrita.addEventListener('click',
    () => mutarCapaActual((c) => { c.negrita = !c.negrita; }));
  ui.capaCursiva.addEventListener('click',
    () => mutarCapaActual((c) => { c.cursiva = !c.cursiva; }));
  ui.capaCentrada.addEventListener('click',
    () => mutarCapaActual((c) => { c.centrada = !c.centrada; }));
  ui.capaFuente.addEventListener('change',
    () => mutarCapaActual((c) => { c.fuente = ui.capaFuente.value; }));
  ui.capaColor.addEventListener('input',
    () => mutarCapaActual((c) => { c.color = ui.capaColor.value; }));
  ui.capaDuplicar.addEventListener('click', duplicarCapa);
  ui.capaBorrar.addEventListener('click', borrarCapaActual);
  ui.capaDeshacer.addEventListener('click', deshacerCapas);

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
      if (!ui.panelPlantillas.classList.contains('oculto')) { cerrarPanelPlantillas(); return; }
      if (estado.modoTexto) { aplicarModoTexto(false); return; }
      if (ui.panelInfo.classList.contains('abierto')) { cerrarPanel(); return; }
      if (estado.modoEdicionSitio) { alternarModoEdicionSitio(false); return; }
    }

    if (estado.vista !== 'lector' || !estado.flip) return;

    // Atajos del editor de texto sobre páginas
    if (estado.modoTexto) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault(); borrarCapaActual(); return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault(); deshacerCapas(); return;
      }
      if (e.key === 'e' || e.key === 'E') { aplicarModoTexto(false); return; }
      return;   // en modo texto las flechas no voltean el libro
    }
    if (e.key === 'e' || e.key === 'E') { aplicarModoTexto(true); return; }

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

/* ========================= 22. ARRANQUE =================================== */

async function iniciar() {
  enlazarEventos();
  inicializarSonido();

  // PDF.js llega por CDN con `async`: si aún no está, obtenerPdfjs() lo
  // esperará en el momento de abrir/publicar. Aquí solo se aprovecha si ya cargó.
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = RUTA_PDFJS + 'pdf.worker.min.js';
  }

  capturarOriginales();
  cargarSitio();
  aplicarEdicionesSitio();

  await cargarCatalogo();
  estado.publicadas = await listarPublicaciones();
  if (!estado.guardadoLocal) {
    avisar('Tu navegador no permite guardar publicaciones de forma permanente ' +
      '(probablemente por abrir el archivo directamente): durarán solo esta sesión.');
  }

  renderizarChips();
  renderizarEstanteria();
  aplicarRuta();

  // Base publicada del proyecto (si assets/ediciones.json existe)
  cargarEdicionesPublicadas().then(() => {
    aplicarEdicionesSitio();
    if (estado.modoEdicionSitio) inyectarBotonesBloque();
  });
}

/** Arranque: si algo falla, se registra y se pinta al menos la estantería. */
function arrancar() {
  iniciar().catch((e) => {
    console.error('No se pudo iniciar la aplicación:', e);
    try {
      renderizarChips();
      renderizarEstanteria();
      aplicarRuta();
    } catch { /* sin más red de seguridad */ }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', arrancar);
} else {
  arrancar();
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
  // sitio, rutas y editores
  aplicarRuta,
  irA,
  alternarModoEdicionSitio,
  alternarModalClave,
  entrarConfiguracion,
  calcularHuella: huellaClave,
  aplicarEdicionesSitio,
  cargarSitio,
  guardarSitio,
  ocultarBloque,
  mostrarBloquesOcultos,
  restablecerSitio,
  descargarCambiosSitio,
  importarCambiosSitio,
  procesarFoto,
  // bloques predefinidos (galería «Agregar bloque»)
  agregarBloqueNuevo,
  eliminarBloqueNuevo,
  abrirPanelPlantillas,
  cerrarPanelPlantillas,
  plantillas: PLANTILLAS_BLOQUE,
  // editor de texto sobre páginas
  aplicarModoTexto,
  crearCapaEnPagina,
  seleccionarCapa,
  borrarCapaActual,
  duplicarCapa,
  deshacerCapas,
  guardarCapas,
  cargarCapasGuardadas,
  colocarCapasPaginas,
  actualizarMetricas,
  sincronizarBarraCapas,
  pintarPaginaExportada,
  exportarRevista,
  construirPDFEditado,
  cerrarAviso: () => ui.aviso.classList.remove('visible')
};
