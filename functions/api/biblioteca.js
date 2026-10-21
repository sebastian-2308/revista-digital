/* ==========================================================================
   Biblioteca compartida de Noti-Misión.

   GET    /api/biblioteca        → lista de revistas publicadas.
   POST   /api/biblioteca        → publica un PDF (multipart/form-data).
   DELETE /api/biblioteca?id=…   → retira una revista.

   Solo el editor (cabecera X-Clave-Editor) puede publicar o retirar. Los PDFs
   se guardan en KV por fragmentos de 20 MB para no superar el límite de un
   valor; la descarga los reconstruye en streaming. Límite total: 50 MB.
   ========================================================================== */

const CLAVE_LISTA = 'biblioteca';
const CLAVE_PUBLICACION = 'publicacion/';
const HUELLA_EDITOR = 'c22adf43';
const TAMANO_MAX = 50 * 1024 * 1024;
const TAMANO_TROZO = 20 * 1024 * 1024;
const MAX_PUBLICACIONES = 200;
const RE_ID = /^[a-z0-9][a-z0-9-]{7,63}$/;

function json(datos, estado) {
  return new Response(JSON.stringify(datos), {
    status: estado || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function texto(valor, maximo, defecto) {
  const limpio = String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();
  return (limpio || defecto || '').slice(0, maximo);
}

function esPdf(bytes) {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 &&
    bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

function publica(p) {
  const base = '/api/biblioteca/' + encodeURIComponent(p.id);
  return {
    id: p.id,
    titulo: p.titulo,
    categoria: p.categoria,
    descripcion: p.descripcion,
    paginas: p.paginas,
    paginasVisibles: Math.min(Number(p.paginas) || 0, 12),
    fecha: p.fecha,
    tamano: p.tamano,
    archivoNombre: p.archivoNombre,
    portada: p.tienePortada ? base + '?portada=1' : '',
    pdf: base
  };
}

async function listaActual(env) {
  const guardada = await env.SITIO_KV.get(CLAVE_LISTA, 'json');
  return Array.isArray(guardada) ? guardada : [];
}

export async function onRequestGet({ env }) {
  if (!env.SITIO_KV) {
    return json({ ok: false, error: 'Falta configurar el almacén de la biblioteca.' }, 503);
  }
  try {
    const lista = await listaActual(env);
    return json({ ok: true, publicaciones: lista.map(publica) });
  } catch (e) {
    return json({ ok: false, error: 'No se pudo cargar la biblioteca.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.SITIO_KV) {
    return json({ ok: false, error: 'Falta configurar el almacén de la biblioteca.' }, 503);
  }
  if (request.headers.get('X-Clave-Editor') !== HUELLA_EDITOR) {
    return json({ ok: false, error: 'Clave de edición incorrecta.' }, 401);
  }

  let formulario;
  try {
    formulario = await request.formData();
  } catch {
    return json({ ok: false, error: 'No se pudo leer el formulario.' }, 400);
  }

  const archivo = formulario.get('pdf');
  if (!archivo || typeof archivo.arrayBuffer !== 'function') {
    return json({ ok: false, error: 'Falta el archivo PDF.' }, 400);
  }
  if (archivo.size > TAMANO_MAX) {
    return json({ ok: false, error: 'El PDF supera los 50 MB permitidos.' }, 413);
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  if (!esPdf(bytes)) {
    return json({ ok: false, error: 'El archivo no es un PDF válido.' }, 400);
  }

  const lista = await listaActual(env);
  if (lista.length >= MAX_PUBLICACIONES) {
    return json({ ok: false, error: 'La biblioteca alcanzó su límite de revistas.' }, 409);
  }

  const id = crypto.randomUUID().toLowerCase();
  const paginas = Math.max(0, Math.min(5000, parseInt(formulario.get('paginas'), 10) || 0));
  const titulo = texto(formulario.get('titulo'), 140,
    texto(archivo.name.replace(/\.pdf$/i, ''), 140, 'Revista'));
  const categoria = texto(formulario.get('categoria'), 60, 'General');
  const descripcion = texto(formulario.get('descripcion'), 600,
    'Edición de la biblioteca de Noti-Misión.');
  const fecha = new Date().toISOString().slice(0, 10);
  const trozos = Math.max(1, Math.ceil(bytes.byteLength / TAMANO_TROZO));
  let tienePortada = false;

  try {
    for (let i = 0; i < trozos; i++) {
      const inicio = i * TAMANO_TROZO;
      const fin = Math.min(bytes.byteLength, inicio + TAMANO_TROZO);
      const fragmento = bytes.slice(inicio, fin);
      await env.SITIO_KV.put('pdf/' + id + '/' + i, fragmento.buffer);
    }

    const portada = formulario.get('portada');
    if (portada && typeof portada.arrayBuffer === 'function' && portada.size > 0 &&
        portada.size <= 2 * 1024 * 1024 &&
        /^image\/(jpeg|png|webp)$/i.test(portada.type || '')) {
      const bytesPortada = new Uint8Array(await portada.arrayBuffer());
      await env.SITIO_KV.put('portada/' + id, bytesPortada.buffer, {
        metadata: { tipo: portada.type || 'image/jpeg' }
      });
      tienePortada = true;
    }

    const interna = {
      id,
      titulo,
      categoria,
      descripcion,
      paginas,
      fecha,
      tamano: bytes.byteLength,
      archivoNombre: archivo.name || 'revista.pdf',
      trozos,
      tienePortada
    };
    await env.SITIO_KV.put(CLAVE_PUBLICACION + id, JSON.stringify(interna));

    lista.unshift(interna);
    await env.SITIO_KV.put(CLAVE_LISTA, JSON.stringify(lista));

    return json({ ok: true, publicacion: publica(interna) }, 201);
  } catch (e) {
    // Si algo falló a mitad, no dejamos fragmentos huérfanos en KV.
    try {
      for (let i = 0; i < trozos; i++) {
        await env.SITIO_KV.delete('pdf/' + id + '/' + i);
      }
      if (tienePortada) await env.SITIO_KV.delete('portada/' + id);
      await env.SITIO_KV.delete(CLAVE_PUBLICACION + id);
    } catch { /* limpieza best-effort */ }
    return json({ ok: false, error: 'No se pudo guardar la revista.' }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  if (!env.SITIO_KV) {
    return json({ ok: false, error: 'Falta configurar el almacén de la biblioteca.' }, 503);
  }
  if (request.headers.get('X-Clave-Editor') !== HUELLA_EDITOR) {
    return json({ ok: false, error: 'Clave de edición incorrecta.' }, 401);
  }

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!RE_ID.test(id)) {
    return json({ ok: false, error: 'Identificador de revista no válido.' }, 400);
  }

  try {
    const lista = await listaActual(env);
    const interna = await env.SITIO_KV.get(CLAVE_PUBLICACION + id, 'json');
    if (!interna && !lista.some((p) => p.id === id)) {
      return json({ ok: false, error: 'La revista ya no existe.' }, 404);
    }

    const trozos = Math.max(1, Number(interna && interna.trozos) || 1);
    for (let i = 0; i < trozos; i++) {
      await env.SITIO_KV.delete('pdf/' + id + '/' + i);
    }
    await env.SITIO_KV.delete('portada/' + id);
    await env.SITIO_KV.delete(CLAVE_PUBLICACION + id);

    const nueva = lista.filter((p) => p.id !== id);
    await env.SITIO_KV.put(CLAVE_LISTA, JSON.stringify(nueva));
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: 'No se pudo retirar la revista.' }, 500);
  }
}
