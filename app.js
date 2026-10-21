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

/** Endpoint del guardado compartido (Cloudflare Pages Functions + KV). */
const RUTA_API_SITIO = '/api/sitio';

/** Huella FNV-1a de la contraseña que protege la configuración del sitio.
    Al ser un sitio estático esto no es seguridad real (el código es público):
    sirve para que nadie entre al editor por accidente. Para cambiarla, abre la
    consola y ejecuta __interno.calcularHuella('nueva-contraseña'); pega el
    resultado aquí. */
const HUELLA_CLAVE_SITIO = 'c22adf43';

/* ========================= 1.1 TEMA DEL SITIO ============================= */
/* La apariencia se guarda junto con los textos y las fotos, dentro de
   revista:sitio. Estos son los valores de fábrica y las familias disponibles:
   no se descargan fuentes nuevas, solo se elige entre las que ya carga el
   sitio o entre pilas del sistema. */

const TEMA_POR_DEFECTO = {
  acento: '#ffd43b',
  fondo: '#080f13',
  superficie: '#101b21',
  texto: '#f7f8f3',
  papel: '#fffaf0',
  titulos: 'fraunces',
  textoFuente: 'archivo',
  radio: 4,
  borde: 4,
  cinta: true
};

const FUENTES_TEMA = {
  fraunces: '"Fraunces", Georgia, "Times New Roman", serif',
  georgia: 'Georgia, "Times New Roman", serif',
  archivo: '"Archivo", "Segoe UI", system-ui, -apple-system, sans-serif',
  sistema: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
  mono: 'ui-monospace, "Cascadia Mono", Consolas, monospace'
};

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
   permite leer archivos locales (file://) o falla la red. La biblioteca nace
   vacía: el equipo publica sus propias revistas desde la interfaz. */

const CATALOGO_RESIDENTE = [];

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
  sitio: { textos: {}, fotos: {}, ocultos: [], descripciones: {} },
  guardandoSitio: false,        // petición de guardado en línea en curso
  sitioEnLinea: false,          // hay una versión compartida cargada

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

  divs: [],                      // <div class="pagina"> originales del libro

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
  btnGuardarEnLinea: $('#btnGuardarEnLinea'),
  estadoGuardado: $('#estadoGuardado'),
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
  bibliotecaVacioTexto: $('#bibliotecaVacioTexto'),
  inputBusqueda: $('#inputBusqueda'),
  inputPublicar: $('#inputPublicar'),
  btnPublicar: $('#btnPublicar'),
  btnPublicarVacio: $('#btnPublicarVacio'),
  btnVerTodas: $('#btnVerTodas'),
  modalVistaPrevia: $('#modalVistaPrevia'),
  previaPortada: $('#previaPortada'),
  previaSinPortada: $('#previaSinPortada'),
  previaCategoria: $('#previaCategoria'),
  previaTitulo: $('#previaTitulo'),
  previaMeta: $('#previaMeta'),
  previaDescripcion: $('#previaDescripcion'),
  previaAyudaEdicion: $('#previaAyudaEdicion'),
  previaMuestra: $('#previaMuestra'),
  previaMuestras: $('#previaMuestras'),
  btnLeerPrevia: $('#btnLeerPrevia'),
  btnDescargarPrevia: $('#btnDescargarPrevia'),
  btnCerrarPrevia: $('#btnCerrarPrevia'),

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
  aviso: $('#aviso'),

  // apariencia del sitio
  btnApariencia: $('#btnApariencia'),
  modalApariencia: $('#modalApariencia'),
  btnCerrarApariencia: $('#btnCerrarApariencia'),
  btnAparienciaListo: $('#btnAparienciaListo'),
  btnTemaRestablecer: $('#btnTemaRestablecer'),
  temaAcento: $('#temaAcento'),
  temaFondo: $('#temaFondo'),
  temaSuperficie: $('#temaSuperficie'),
  temaTexto: $('#temaTexto'),
  temaPapel: $('#temaPapel'),
  temaFuenteTitulos: $('#temaFuenteTitulos'),
  temaFuenteTexto: $('#temaFuenteTexto'),
  temaRadio: $('#temaRadio'),
  temaRadioValor: $('#temaRadioValor'),
  temaBorde: $('#temaBorde'),
  temaBordeValor: $('#temaBordeValor'),
  temaCinta: $('#temaCinta'),
  temaContraste: $('#temaContraste')
};

/** Limita un número a un rango. */
const limite = (valor, min, max) => Math.min(max, Math.max(min, valor));

/* --- Tema: normalización, mezclas y aplicación de variables --------------- */

const COLOR_HEX = /^#[0-9a-f]{6}$/i;

function colorTema(valor, defecto) {
  return COLOR_HEX.test(String(valor || '').trim()) ? String(valor).trim().toLowerCase() : defecto;
}

function numeroTema(valor, defecto, min, max) {
  const n = Number(valor);
  return Number.isFinite(n) ? limite(Math.round(n), min, max) : defecto;
}

/** Deja el tema en una forma segura y completa (sirve para importar JSON). */
function normalizarTema(datos) {
  const d = datos && typeof datos === 'object' ? datos : {};
  return {
    acento: colorTema(d.acento, TEMA_POR_DEFECTO.acento),
    fondo: colorTema(d.fondo, TEMA_POR_DEFECTO.fondo),
    superficie: colorTema(d.superficie, TEMA_POR_DEFECTO.superficie),
    texto: colorTema(d.texto, TEMA_POR_DEFECTO.texto),
    papel: colorTema(d.papel, TEMA_POR_DEFECTO.papel),
    titulos: FUENTES_TEMA[d.titulos] ? d.titulos : TEMA_POR_DEFECTO.titulos,
    textoFuente: FUENTES_TEMA[d.textoFuente] ? d.textoFuente : TEMA_POR_DEFECTO.textoFuente,
    radio: numeroTema(d.radio, TEMA_POR_DEFECTO.radio, 0, 18),
    borde: numeroTema(d.borde, TEMA_POR_DEFECTO.borde, 0, 8),
    cinta: d.cinta !== false
  };
}

function hexARgb(hex) {
  const limpio = String(hex || '#000000').replace('#', '');
  return [
    parseInt(limpio.slice(0, 2), 16) || 0,
    parseInt(limpio.slice(2, 4), 16) || 0,
    parseInt(limpio.slice(4, 6), 16) || 0
  ];
}

function rgbAHex(r, g, b) {
  return '#' + [r, g, b].map((v) =>
    Math.round(limite(v, 0, 255)).toString(16).padStart(2, '0')).join('');
}

/** Mezcla dos colores: cantidad 0 = a, cantidad 1 = b. */
function mezclarHex(a, b, cantidad) {
  const ca = hexARgb(a);
  const cb = hexARgb(b);
  const p = limite(cantidad, 0, 1);
  return rgbAHex(
    ca[0] + (cb[0] - ca[0]) * p,
    ca[1] + (cb[1] - ca[1]) * p,
    ca[2] + (cb[2] - ca[2]) * p
  );
}

function luminanciaHex(hex) {
  const canales = hexARgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * canales[0] + 0.7152 * canales[1] + 0.0722 * canales[2];
}

function contrasteHex(a, b) {
  const x = luminanciaHex(a);
  const y = luminanciaHex(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Tinta legible sobre el color principal. */
function tintaPara(hex) {
  return contrasteHex(hex, '#14120c') >= contrasteHex(hex, '#fffaf0')
    ? '#14120c' : '#fffaf0';
}

/** Texto legible sobre el papel claro/oscuro. */
function textoPapelPara(hex) {
  return luminanciaHex(hex) > 0.42 ? '#2a261c' : '#f4efe2';
}

/** Aplica el tema guardado a las variables CSS del documento. */
function aplicarTema() {
  const t = normalizarTema(estado.sitio && estado.sitio.tema);
  const r = document.documentElement.style;
  const tinta = tintaPara(t.acento);
  const textoPapel = textoPapelPara(t.papel);

  r.setProperty('--acento', t.acento);
  r.setProperty('--acento-2', t.acento);
  r.setProperty('--acento-suave', mezclarHex(t.acento, '#ffffff', 0.35));
  r.setProperty('--acento-tenue', 'rgba(' + hexARgb(t.acento).join(', ') + ', 0.16)');
  r.setProperty('--fondo', t.fondo);
  r.setProperty('--superficie', t.superficie);
  r.setProperty('--superficie-2', mezclarHex(t.superficie, t.texto, 0.08));
  r.setProperty('--superficie-3', mezclarHex(t.superficie, t.texto, 0.15));
  r.setProperty('--borde', mezclarHex(t.superficie, t.texto, 0.24));
  r.setProperty('--borde-fuerte', mezclarHex(t.superficie, t.texto, 0.4));
  r.setProperty('--texto', t.texto);
  r.setProperty('--texto-2', mezclarHex(t.texto, t.fondo, 0.22));
  r.setProperty('--texto-3', mezclarHex(t.texto, t.fondo, 0.45));
  r.setProperty('--crema', t.papel);
  r.setProperty('--crema-2', mezclarHex(t.papel, t.acento, 0.08));
  r.setProperty('--tinta', tinta);
  r.setProperty('--texto-acento-2', mezclarHex(tinta, t.acento, 0.14));
  r.setProperty('--texto-papel', textoPapel);
  r.setProperty('--texto-papel-2', mezclarHex(textoPapel, t.papel, 0.24));
  r.setProperty('--radio-tarjeta', t.radio + 'px');
  r.setProperty('--borde-tarjeta', t.borde + 'px');
  r.setProperty('--fuente-display', FUENTES_TEMA[t.titulos]);
  r.setProperty('--fuente-texto', FUENTES_TEMA[t.textoFuente]);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.fondo);
  document.body.classList.toggle('sin-cinta', !t.cinta);

  if (ui.temaContraste) {
    const bajoAcento = contrasteHex(t.acento, t.fondo) < 4.5;
    const bajoTexto = contrasteHex(t.texto, t.fondo) < 4.5;
    ui.temaContraste.hidden = !(bajoAcento || bajoTexto);
    ui.temaContraste.textContent = bajoAcento
      ? 'El color principal no contrasta lo suficiente con el fondo. Prueba con un tono más claro u oscuro.'
      : 'El color del texto no contrasta lo suficiente con el fondo.';
  }
}

/** Vuelca el tema actual en los controles del panel de apariencia. */
function sincronizarControlesTema() {
  if (!ui.modalApariencia) return;
  const t = normalizarTema(estado.sitio && estado.sitio.tema);
  ui.temaAcento.value = t.acento;
  ui.temaFondo.value = t.fondo;
  ui.temaSuperficie.value = t.superficie;
  ui.temaTexto.value = t.texto;
  ui.temaPapel.value = t.papel;
  ui.temaFuenteTitulos.value = t.titulos;
  ui.temaFuenteTexto.value = t.textoFuente;
  ui.temaRadio.value = String(t.radio);
  ui.temaRadioValor.textContent = t.radio + ' px';
  ui.temaBorde.value = String(t.borde);
  ui.temaBordeValor.textContent = t.borde + ' px';
  ui.temaCinta.checked = t.cinta;
}

/** Lee un control y aplica el cambio en vivo. */
function cambiarTema(campo, valor) {
  estado.sitio.tema = normalizarTema(Object.assign({}, estado.sitio.tema, { [campo]: valor }));
  aplicarTema();
  guardarSitioProgramado();
}

/** Abre o cierra el panel de apariencia. */
function alternarApariencia(abrir) {
  if (!ui.modalApariencia) return;
  if (abrir) {
    sincronizarControlesTema();
    aplicarTema();
    ui.modalApariencia.classList.remove('oculto');
    setTimeout(() => ui.temaAcento.focus(), 30);
  } else {
    ui.modalApariencia.classList.add('oculto');
    if (ui.btnApariencia) ui.btnApariencia.focus();
  }
}

/** Devuelve solo la apariencia a los valores de fábrica. */
function restablecerTema() {
  estado.sitio.tema = normalizarTema(null);
  aplicarTema();
  sincronizarControlesTema();
  guardarSitio();
  avisar('Apariencia restablecida. Los textos y las fotos no se han tocado.');
}

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

  // Sin revistas, los filtros no aportan nada.
  ui.chipsCategorias.hidden = catalogoCompleto().length === 0;
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

  // Acciones rápidas: ver la ficha antes de abrir y descargar el PDF original.
  const acciones = document.createElement('div');
  acciones.className = 'ficha__acciones';

  const btnPrevia = document.createElement('button');
  btnPrevia.type = 'button';
  btnPrevia.className = 'ficha__accion';
  btnPrevia.innerHTML =
    '<svg viewBox="0 0 24 24" class="icono" aria-hidden="true">' +
    '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/>' +
    '<circle cx="12" cy="12" r="2.6"/></svg><span>Vista previa</span>';
  btnPrevia.setAttribute('aria-label', 'Vista previa de «' + pub.titulo + '»');
  btnPrevia.addEventListener('click', (e) => {
    e.stopPropagation();
    abrirVistaPrevia(pub);
  });
  btnPrevia.addEventListener('keydown', (e) => e.stopPropagation());

  const btnDescargar = document.createElement('button');
  btnDescargar.type = 'button';
  btnDescargar.className = 'ficha__accion';
  btnDescargar.innerHTML =
    '<svg viewBox="0 0 24 24" class="icono" aria-hidden="true">' +
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg><span>Descargar</span>';
  btnDescargar.setAttribute('aria-label', 'Descargar el PDF de «' + pub.titulo + '»');
  btnDescargar.addEventListener('click', (e) => {
    e.stopPropagation();
    descargarPublicacion(pub);
  });
  btnDescargar.addEventListener('keydown', (e) => e.stopPropagation());

  acciones.appendChild(btnPrevia);
  acciones.appendChild(btnDescargar);
  ficha.appendChild(acciones);

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
  // Con la biblioteca vacía, el estado vacío ya ofrece «Publicar la primera»:
  // evitamos duplicar la misma acción con una ficha más.
  if (total > 0) ui.estanteria.appendChild(fichaNueva);

  visibles.forEach((pub, i) => ui.estanteria.appendChild(crearFicha(pub, i + 1)));

  ui.bibliotecaVacia.hidden = visibles.length > 0;

  const filtrando = !!(estado.filtro.texto.trim() || estado.filtro.categoria);
  const palabra = total === 1 ? 'publicación' : 'publicaciones';

  if (total === 0) {
    ui.contarRevistas.textContent = 'Aún no hay publicaciones';
    ui.bibliotecaVacioTexto.textContent =
      'La biblioteca está vacía. Publica la primera revista para empezar.';
    ui.btnPublicarVacio.hidden = false;
    ui.btnVerTodas.hidden = true;
  } else {
    ui.contarRevistas.textContent = filtrando
      ? visibles.length + ' de ' + total + ' ' + palabra
      : total + ' ' + palabra;
    ui.bibliotecaVacioTexto.textContent = 'Ninguna revista coincide con tu búsqueda.';
    ui.btnPublicarVacio.hidden = true;
    ui.btnVerTodas.hidden = false;
  }
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

/** Devuelve los bytes del PDF de una publicación (propia o del catálogo). */
async function obtenerBytesPublicacion(pub) {
  if (pub.bytes) {
    return pub.bytes instanceof Uint8Array ? pub.bytes : new Uint8Array(pub.bytes);
  }
  const respuesta = await fetch(pub.pdf, { cache: 'no-store' });
  if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
  return new Uint8Array(await respuesta.arrayBuffer());
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
    const bytes = await obtenerBytesPublicacion(pub);

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

/* --- Vista previa y descarga desde la biblioteca ------------------------- */

let pubPrevia = null;
let focoAntesPrevia = null;

/** Abre la ficha ampliada de una revista antes de leerla o descargarla. */
function abrirVistaPrevia(pub) {
  if (!pub || !ui.modalVistaPrevia) return;
  pubPrevia = pub;
  focoAntesPrevia = document.activeElement;

  ui.previaCategoria.textContent = pub.categoria ||
    (pub.propia ? 'Tu publicación' : 'Biblioteca');
  ui.previaTitulo.textContent = pub.titulo || 'Revista';
  ui.previaMeta.textContent = [
    pub.numero,
    pub.paginas ? pub.paginas + ' páginas' : null,
    pub.fecha ? formatearFecha(pub.fecha) : null
  ].filter(Boolean).join(' · ');
  ui.previaDescripcion.textContent = descripcionDePublicacion(pub);
  actualizarEdicionDescripcionPrevia();

  if (pub.portada) {
    ui.previaPortada.src = pub.portada;
    ui.previaPortada.hidden = false;
    ui.previaSinPortada.hidden = true;
  } else {
    ui.previaPortada.removeAttribute('src');
    ui.previaPortada.hidden = true;
    ui.previaSinPortada.hidden = false;
  }

  ui.modalVistaPrevia.classList.remove('oculto');
  iniciarMuestraPrevia(pub);
  setTimeout(() => ui.btnLeerPrevia.focus(), 30);
}

/** Cierra la vista previa y devuelve el foco a la ficha de origen. */
function cerrarVistaPrevia() {
  if (!ui.modalVistaPrevia) return;
  ui.modalVistaPrevia.classList.add('oculto');
  tokenMuestraPrevia++;
  ui.previaDescripcion.removeAttribute('contenteditable');
  if (ui.previaAyudaEdicion) ui.previaAyudaEdicion.hidden = true;
  pubPrevia = null;
  if (focoAntesPrevia && typeof focoAntesPrevia.focus === 'function') {
    focoAntesPrevia.focus();
  }
  focoAntesPrevia = null;
}

/** Permite corregir la descripción desde la ficha cuando el sitio
    está en modo edición. Se guarda por revista en este navegador. */
function actualizarEdicionDescripcionPrevia() {
  if (!ui.previaDescripcion) return;
  const activo = estado.modoEdicionSitio && !!pubPrevia;
  if (activo) {
    ui.previaDescripcion.setAttribute('contenteditable', 'true');
    ui.previaDescripcion.setAttribute('role', 'textbox');
    ui.previaDescripcion.setAttribute('aria-multiline', 'true');
    ui.previaDescripcion.setAttribute('aria-label',
      'Descripción de la revista. Editable en este navegador.');
  } else {
    ui.previaDescripcion.removeAttribute('contenteditable');
    ui.previaDescripcion.removeAttribute('role');
    ui.previaDescripcion.removeAttribute('aria-multiline');
    ui.previaDescripcion.removeAttribute('aria-label');
  }
  if (ui.previaAyudaEdicion) ui.previaAyudaEdicion.hidden = !activo;
}

let temporizadorGuardarDescripcionPrevia = null;

function guardarDescripcionPrevia() {
  if (!pubPrevia) return;
  const pub = pubPrevia;
  const texto = ui.previaDescripcion.textContent.trim();
  clearTimeout(temporizadorGuardarDescripcionPrevia);
  temporizadorGuardarDescripcionPrevia = setTimeout(() => {
    guardarDescripcionDe(pub, texto);
  }, 400);
}

/* --- Muestra corta del PDF dentro de la vista previa --------------------- */
/* No se monta el libro completo: solo se rasterizan un par de páginas para
   que la persona se haga una idea antes de abrir el lector. */

let tokenMuestraPrevia = 0;
const cacheMuestrasPrevia = new Map();

function pintarMuestraPrevia(paginas) {
  if (!ui.previaMuestra || !ui.previaMuestras) return;
  if (!paginas || !paginas.length) {
    ui.previaMuestra.hidden = true;
    ui.previaMuestras.innerHTML = '';
    return;
  }
  ui.previaMuestra.hidden = false;
  ui.previaMuestras.innerHTML = paginas.map((p) =>
    '<figure><img src="' + p.url + '" alt="Página ' + p.n + ' de la revista" ' +
    'loading="lazy" decoding="async"><figcaption>Página ' + p.n + '</figcaption></figure>'
  ).join('');
}

async function cargarMuestraPrevia(pub, token) {
  if (!ui.previaMuestra || !ui.previaMuestras) return;
  const enCache = cacheMuestrasPrevia.get(pub.id);
  if (enCache) { pintarMuestraPrevia(enCache); return; }

  ui.previaMuestra.hidden = false;
  ui.previaMuestras.innerHTML =
    '<p class="vista-previa__muestra-estado">Cargando muestra…</p>';

  try {
    const bytes = await obtenerBytesPublicacion(pub);
    const pdfjs = await obtenerPdfjs(4000);
    const doc = await pdfjs.getDocument({
      data: bytes.slice(0),
      cMapUrl: RUTA_CMAPS,
      cMapPacked: true,
      standardFontDataUrl: RUTA_FUENTES
    }).promise;

    if (doc.numPages < 2) {
      try { doc.destroy(); } catch { /* noop */ }
      if (token === tokenMuestraPrevia) pintarMuestraPrevia([]);
      return;
    }

    // La portada ya se ve a la izquierda: mostramos las dos páginas siguientes.
    const numeros = [];
    for (let n = 2; n <= Math.min(3, doc.numPages); n++) numeros.push(n);

    const paginas = [];
    for (const n of numeros) {
      const page = await doc.getPage(n);
      const vp1 = page.getViewport({ scale: 1 });
      const escala = Math.max(0.1, 150 / vp1.width);
      const vp = page.getViewport({ scale: escala });

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      paginas.push({ n: n, url: canvas.toDataURL('image/jpeg', 0.72) });
      try { page.cleanup(); } catch { /* noop */ }
    }

    try { doc.destroy(); } catch { /* noop */ }
    if (token !== tokenMuestraPrevia) return;
    cacheMuestrasPrevia.set(pub.id, paginas);
    pintarMuestraPrevia(paginas);
  } catch (e) {
    console.warn('No se pudo cargar la muestra de la revista:', e);
    if (token === tokenMuestraPrevia) pintarMuestraPrevia([]);
  }
}

function iniciarMuestraPrevia(pub) {
  tokenMuestraPrevia++;
  if (ui.previaMuestra) ui.previaMuestra.hidden = true;
  if (ui.previaMuestras) ui.previaMuestras.innerHTML = '';
  cargarMuestraPrevia(pub, tokenMuestraPrevia);
}

/** Nombre de archivo seguro (sin acentos ni signos raros). */
function nombreArchivoPdf(titulo) {
  return String(titulo || 'revista')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'revista';
}

/** Descarga el PDF original de una publicación propia o del catálogo. */
async function descargarPublicacion(pub) {
  if (!pub) return;
  try {
    let blob;
    if (pub.bytes) {
      const datos = pub.bytes instanceof Uint8Array ? pub.bytes : new Uint8Array(pub.bytes);
      blob = new Blob([datos], { type: 'application/pdf' });
    } else {
      const respuesta = await fetch(pub.pdf, { cache: 'no-store' });
      if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
      blob = await respuesta.blob();
    }
    descargarBlob(blob, nombreArchivoPdf(pub.titulo) + '.pdf');
    avisar('Descargando «' + pub.titulo + '».');
  } catch (e) {
    console.warn('No se pudo descargar la revista:', e);
    avisar('No se pudo descargar el PDF. Comprueba la conexión e inténtalo de nuevo.', true);
  }
}

/** Mantiene el foco dentro de un diálogo abierto. */
function trampaFoco(contenedor, ev) {
  const focos = Array.from(contenedor.querySelectorAll(
    'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'
  )).filter((el) => !el.disabled && el.offsetParent !== null);
  if (!focos.length) return;
  const primero = focos[0];
  const ultimo = focos[focos.length - 1];
  if (ev.shiftKey && document.activeElement === primero) {
    ev.preventDefault();
    ultimo.focus();
  } else if (!ev.shiftKey && document.activeElement === ultimo) {
    ev.preventDefault();
    primero.focus();
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

  // StPageFlip 2.x expone getCurrentPageIndex(); algunas versiones antiguas
  // (y los dobles de prueba) usan getCurrentPage(). Aceptamos ambas.
  const pagina = typeof estado.flip.getCurrentPageIndex === 'function'
    ? estado.flip.getCurrentPageIndex()
    : estado.flip.getCurrentPage();
  const p = limite(pagina, 0, total - 1);
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

function claveDescripcionDe(pub) {
  return CLAVE_DESCRIPCION + (pub && pub.id ? pub.id : 'archivo');
}

/** Descripción editada de una revista: primero la copia compartida y,
    si no existe, la que este navegador guardó antes. */
function descripcionGuardadaDe(pub) {
  const id = pub && pub.id;
  if (id && estado.sitio && estado.sitio.descripciones) {
    const compartida = estado.sitio.descripciones[id];
    if (typeof compartida === 'string' && compartida) return compartida;
  }
  let local = null;
  try { local = localStorage.getItem(claveDescripcionDe(pub)); } catch { /* noop */ }
  return local || null;
}

function guardarDescripcionDe(pub, texto) {
  const limpio = String(texto == null ? '' : texto).trim();
  if (pub && pub.id && estado.sitio && estado.sitio.descripciones) {
    estado.sitio.descripciones[pub.id] = limpio;
    guardarSitioProgramado();
  }
  try { localStorage.setItem(claveDescripcionDe(pub), limpio); } catch { /* noop */ }
}

function borrarDescripcionDe(pub) {
  if (pub && pub.id && estado.sitio && estado.sitio.descripciones) {
    delete estado.sitio.descripciones[pub.id];
    guardarSitioProgramado();
  }
  try { localStorage.removeItem(claveDescripcionDe(pub)); } catch { /* noop */ }
}

/** Devuelve la descripción editada de una revista o, si no hay,
    la que trae la publicación. Se comparte entre lector y vista previa. */
function descripcionDePublicacion(pub) {
  const guardado = descripcionGuardadaDe(pub);
  if (guardado) return guardado;
  if (pub && pub.descripcion) return pub.descripcion;
  return 'Una edición de la biblioteca de Noti‑Misión. Ábrela para hojearla ' +
    'o descarga el PDF original.';
}

function descripcionPorDefecto() {
  if (estado.pubAbierta && estado.pubAbierta.descripcion) {
    return estado.pubAbierta.descripcion;
  }
  return 'Sin descripción. Escribe aquí la tuya: se guarda ' +
    'automáticamente en este navegador.';
}

function cargarTextoInfo() {
  const guardado = descripcionGuardadaDe(estado.pubAbierta);
  ui.textoInfo.textContent = guardado || descripcionPorDefecto();
}

let temporizadorGuardarDescripcion = null;

function guardarDescripcion() {
  clearTimeout(temporizadorGuardarDescripcion);
  temporizadorGuardarDescripcion = setTimeout(() => {
    guardarDescripcionDe(estado.pubAbierta, ui.textoInfo.textContent);
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
/* Textos, fotos, descripciones y tema se guardan mientras se edita en el
   navegador (localStorage). El botón «Guardar» los publica en el almacén
   compartido (API /api/sitio sobre Cloudflare KV); también pueden
   exportarse/importarse como copia JSON. */

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
  const descripciones = {};
  if (d.descripciones && typeof d.descripciones === 'object') {
    Object.keys(d.descripciones).forEach((id) => {
      if (typeof d.descripciones[id] === 'string') {
        descripciones[id] = d.descripciones[id];
      }
    });
  }
  return {
    textos: (d.textos && typeof d.textos === 'object') ? d.textos : {},
    fotos: (d.fotos && typeof d.fotos === 'object') ? d.fotos : {},
    ocultos: Array.isArray(d.ocultos) ? d.ocultos.slice() : [],
    nuevos: nuevos,
    descripciones: descripciones,
    tema: normalizarTema(d.tema)
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
  if (estado.modoEdicionSitio && !estado.guardandoSitio) {
    marcarEstadoGuardado('Cambios sin guardar. Pulsa «Guardar» para publicarlos.');
  }
}

function cargarSitio() {
  estado.sitio = normalizarSitio(null);
  try {
    const guardado = localStorage.getItem(CLAVE_SITIO);
    if (guardado) estado.sitio = normalizarSitio(JSON.parse(guardado));
  } catch { /* almacenamiento bloqueado */ }

  // Las descripciones por revista vivían en claves separadas: las pasamos
  // al modelo del sitio para que también se puedan guardar en línea.
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i);
      if (!clave || clave.indexOf(CLAVE_DESCRIPCION) !== 0) continue;
      const id = clave.slice(CLAVE_DESCRIPCION.length);
      if (!id || estado.sitio.descripciones[id]) continue;
      const texto = localStorage.getItem(clave);
      if (texto) estado.sitio.descripciones[id] = texto;
    }
  } catch { /* almacenamiento bloqueado */ }
}

/** Trae la versión compartida. Si existe, manda sobre la copia local. */
async function cargarSitioEnLinea() {
  if (location.protocol === 'file:') return false;
  const control = new AbortController();
  const limite = setTimeout(() => control.abort(), 5000);
  try {
    const r = await fetch(RUTA_API_SITIO + '?t=' + Date.now(), {
      cache: 'no-store',
      signal: control.signal,
      headers: { Accept: 'application/json' }
    });
    if (!r.ok) return false;
    const datos = await r.json();
    if (!datos || !datos.sitio || typeof datos.sitio !== 'object') return false;
    estado.sitio = normalizarSitio(datos.sitio);
    estado.sitioEnLinea = true;
    return true;
  } catch {
    // Sin conexión, API lenta o abierto como archivo local: seguimos con lo local.
    return false;
  } finally {
    clearTimeout(limite);
  }
}

function marcarEstadoGuardado(texto, tipo) {
  if (!ui.estadoGuardado) return;
  ui.estadoGuardado.textContent = texto || '';
  ui.estadoGuardado.classList.toggle('barra-edicion__estado--ok', tipo === 'ok');
  ui.estadoGuardado.classList.toggle('barra-edicion__estado--error', tipo === 'error');
}

/** Publica los cambios en el almacén compartido (KV de Cloudflare). */
async function guardarSitioEnLinea() {
  if (estado.guardandoSitio) return;
  estado.guardandoSitio = true;
  if (ui.btnGuardarEnLinea) ui.btnGuardarEnLinea.disabled = true;
  marcarEstadoGuardado('Guardando en línea…');
  guardarSitio();

  const control = new AbortController();
  const limite = setTimeout(() => control.abort(), 30000);
  try {
    const r = await fetch(RUTA_API_SITIO, {
      method: 'POST',
      cache: 'no-store',
      signal: control.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Clave-Editor': HUELLA_CLAVE_SITIO
      },
      body: JSON.stringify({ sitio: estado.sitio })
    });
    const datos = await r.json().catch(() => null);
    if (!r.ok) {
      throw new Error((datos && datos.error) || ('HTTP ' + r.status));
    }
    estado.sitioEnLinea = true;
    marcarEstadoGuardado('Guardado en todos los dispositivos.', 'ok');
    avisar('Cambios guardados. Ya se ven en otros navegadores y dispositivos.');
  } catch (e) {
    const detalle = (e && e.name === 'AbortError')
      ? 'tiempo de espera agotado.'
      : ((e && e.message) || e);
    marcarEstadoGuardado('No se pudo guardar en línea.', 'error');
    avisar('No se pudo guardar en línea: ' + detalle, true);
  } finally {
    clearTimeout(limite);
    estado.guardandoSitio = false;
    if (ui.btnGuardarEnLinea) ui.btnGuardarEnLinea.disabled = false;
  }
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
  actualizarEdicionDescripcionPrevia();

  if (activo) {
    if (estado.vista === 'lector') mostrarVista('biblioteca');
    inyectarBotonesBloque();
    marcarEstadoGuardado(estado.sitioEnLinea
      ? 'Versión compartida cargada. Pulsa «Guardar» al terminar.'
      : 'Aún no hay una versión compartida. Pulsa «Guardar» para publicarla.',
    estado.sitioEnLinea ? 'ok' : '');
    avisar('Configuración: pulsa un texto para escribir, «Cambiar foto» en ' +
      'las fotos, «Agregar bloque» para añadir contenido nuevo y ✕ en los ' +
      'bloques para ocultarlos. Al terminar, pulsa «Guardar» para aplicar ' +
      'los cambios en todos los dispositivos.');
  } else {
    quitarBotonesBloque();
    guardarSitio();
    marcarEstadoGuardado('');
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
      const crudo = JSON.parse(lector.result);
      const datos = normalizarSitio(crudo);
      const porId = new Map();
      estado.sitio.nuevos.concat(datos.nuevos).forEach((e) => porId.set(e.id, e));
      estado.sitio = normalizarSitio({
        textos: Object.assign({}, estado.sitio.textos, datos.textos),
        fotos: Object.assign({}, estado.sitio.fotos, datos.fotos),
        ocultos: Array.from(new Set(estado.sitio.ocultos.concat(datos.ocultos))),
        nuevos: Array.from(porId.values()),
        descripciones: Object.assign({}, estado.sitio.descripciones, datos.descripciones),
        // Un archivo antiguo sin «tema» no debe borrar la apariencia actual.
        tema: (crudo && crudo.tema)
          ? Object.assign({}, estado.sitio.tema, datos.tema)
          : estado.sitio.tema
      });
      guardarSitio();
      aplicarTema();
      aplicarEdicionesSitio();
      if (estado.modoEdicionSitio) inyectarBotonesBloque();
      marcarEstadoGuardado('Cambios importados en este navegador. Pulsa «Guardar» ' +
        'para aplicarlos en todos los dispositivos.', 'ok');
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
  aplicarTema();
  aplicarEdicionesSitio();
  if (estado.modoEdicionSitio) inyectarBotonesBloque();
  marcarEstadoGuardado('Sitio restablecido en este navegador. Pulsa «Guardar» ' +
    'para aplicarlo en todos los dispositivos.', 'ok');
  avisar('Sitio restablecido al contenido original (los bloques agregados se eliminaron).');
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
    // Un catálogo vacío es válido: la biblioteca empieza sin revistas de
    // ejemplo y solo muestra lo que publique el equipo.
    if (Array.isArray(datos)) {
      estado.catalogo = datos;
      return;
    }
    throw new Error('manifiesto ilegible');
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
  ui.btnPublicarVacio.addEventListener('click', () => ui.inputPublicar.click());
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
  ui.btnGuardarEnLinea.addEventListener('click', guardarSitioEnLinea);
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

  /* --- Apariencia del sitio --- */
  ui.btnApariencia.addEventListener('click', () => alternarApariencia(true));
  ui.btnCerrarApariencia.addEventListener('click', () => alternarApariencia(false));
  ui.btnAparienciaListo.addEventListener('click', () => alternarApariencia(false));
  ui.modalApariencia.addEventListener('click', (e) => {
    if (e.target === ui.modalApariencia) alternarApariencia(false);
  });
  ui.btnTemaRestablecer.addEventListener('click', restablecerTema);

  const escucharColor = (el, campo) => {
    el.addEventListener('input', () => cambiarTema(campo, el.value));
  };
  escucharColor(ui.temaAcento, 'acento');
  escucharColor(ui.temaFondo, 'fondo');
  escucharColor(ui.temaSuperficie, 'superficie');
  escucharColor(ui.temaTexto, 'texto');
  escucharColor(ui.temaPapel, 'papel');

  ui.temaFuenteTitulos.addEventListener('change',
    () => cambiarTema('titulos', ui.temaFuenteTitulos.value));
  ui.temaFuenteTexto.addEventListener('change',
    () => cambiarTema('textoFuente', ui.temaFuenteTexto.value));

  ui.temaRadio.addEventListener('input', () => {
    ui.temaRadioValor.textContent = ui.temaRadio.value + ' px';
    cambiarTema('radio', ui.temaRadio.value);
  });
  ui.temaBorde.addEventListener('input', () => {
    ui.temaBordeValor.textContent = ui.temaBorde.value + ' px';
    cambiarTema('borde', ui.temaBorde.value);
  });
  ui.temaCinta.addEventListener('change',
    () => cambiarTema('cinta', ui.temaCinta.checked));

  /* --- Vista previa de la biblioteca --- */
  ui.btnCerrarPrevia.addEventListener('click', cerrarVistaPrevia);
  ui.modalVistaPrevia.addEventListener('click', (e) => {
    if (e.target === ui.modalVistaPrevia) cerrarVistaPrevia();
  });
  ui.previaPortada.addEventListener('error', () => {
    ui.previaPortada.hidden = true;
    ui.previaSinPortada.hidden = false;
  });
  ui.btnLeerPrevia.addEventListener('click', () => {
    const pub = pubPrevia;
    cerrarVistaPrevia();
    if (pub) abrirPublicacion(pub);
  });
  ui.btnDescargarPrevia.addEventListener('click', () => {
    if (pubPrevia) descargarPublicacion(pubPrevia);
  });
  ui.previaDescripcion.addEventListener('input', guardarDescripcionPrevia);
  ui.previaDescripcion.addEventListener('paste', (e) => {
    if (!estado.modoEdicionSitio) return;
    e.preventDefault();
    const datos = e.clipboardData || window.clipboardData;
    const texto = datos ? datos.getData('text/plain') : '';
    document.execCommand('insertText', false, texto);
  });

  document.addEventListener('input', onInputEditable);
  document.addEventListener('paste', onPasteEditable);
  // En edición, un texto editable dentro de un enlace no debe navegar.
  document.addEventListener('click', (e) => {
    if (!estado.modoEdicionSitio || !e.target.closest) return;
    if (e.target.closest('[data-editable]') && e.target.closest('a')) {
      e.preventDefault();
    }
  }, true);
  document.addEventListener('click', onClicEnlace);
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.foto__cambiar');
    if (!btn || !estado.modoEdicionSitio) return;
    const fig = btn.closest('[data-foto]');
    if (fig) pedirFoto(fig.dataset.foto);
  });

  /* --- Controles del lector --- */
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
    borrarDescripcionDe(estado.pubAbierta);
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
    // Los diálogos nuevos atrapan el foco y se cierran con Escape.
    const dialogoAbierto = !ui.modalVistaPrevia.classList.contains('oculto')
      ? ui.modalVistaPrevia
      : (!ui.modalApariencia.classList.contains('oculto') ? ui.modalApariencia : null);
    if (dialogoAbierto) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (dialogoAbierto === ui.modalVistaPrevia) cerrarVistaPrevia();
        else alternarApariencia(false);
        return;
      }
      if (e.key === 'Tab') { trampaFoco(dialogoAbierto, e); return; }
    }

    const destino = e.target;
    const escribiendo = destino && destino.matches &&
      destino.matches('input, textarea, [contenteditable="true"]');
    if (escribiendo) {
      if (e.key === 'Escape') destino.blur();
      return;
    }

    if (e.key === 'Escape') {
      if (!ui.panelPlantillas.classList.contains('oculto')) { cerrarPanelPlantillas(); return; }
      if (ui.panelInfo.classList.contains('abierto')) { cerrarPanel(); return; }
      if (estado.modoEdicionSitio) { alternarModoEdicionSitio(false); return; }
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
  await cargarSitioEnLinea();
  aplicarTema();
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
  cargarSitioEnLinea,
  guardarSitio,
  guardarSitioEnLinea,
  marcarEstadoGuardado,
  descripcionDePublicacion,
  guardarDescripcionDe,
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
  cerrarAviso: () => ui.aviso.classList.remove('visible')
};
