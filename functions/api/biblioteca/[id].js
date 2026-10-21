/* Sirve el PDF completo o la portada de una revista de la biblioteca.
   GET /api/biblioteca/:id              → PDF (inline)
   GET /api/biblioteca/:id?portada=1    → portada (JPEG, PNG o WebP)
   GET /api/biblioteca/:id?descargar=1  → PDF como descarga */

const CLAVE_PUBLICACION = 'publicacion/';
const RE_ID = /^[a-z0-9][a-z0-9-]{7,63}$/;

function noEncontrado(texto) {
  return new Response(texto || 'No encontrado', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function nombreSeguro(nombre) {
  return String(nombre || 'revista.pdf')
    .replace(/[\r\n"]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(0, 120) || 'revista.pdf';
}

export async function onRequestGet({ params, request, env }) {
  if (!env.SITIO_KV) return noEncontrado('Biblioteca no configurada.');
  const id = params.id || '';
  if (!RE_ID.test(id)) return noEncontrado('Revista no válida.');

  const url = new URL(request.url);

  if (url.searchParams.get('portada') === '1') {
    try {
      const portada = await env.SITIO_KV.getWithMetadata(
        'portada/' + id, 'arrayBuffer');
      if (!portada.value) return noEncontrado('Portada no encontrada.');
      return new Response(portada.value, {
        headers: {
          'Content-Type': (portada.metadata && portada.metadata.tipo) || 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff'
        }
      });
    } catch {
      return noEncontrado('No se pudo leer la portada.');
    }
  }

  let interna = null;
  try {
    interna = await env.SITIO_KV.get(CLAVE_PUBLICACION + id, 'json');
  } catch {
    return noEncontrado('No se pudo leer la revista.');
  }
  if (!interna) return noEncontrado('Revista no encontrada.');

  const trozos = Math.max(1, Number(interna.trozos) || 1);
  let indice = 0;

  const flujo = new ReadableStream({
    async pull(controlador) {
      if (indice >= trozos) {
        controlador.close();
        return;
      }
      try {
        const fragmento = await env.SITIO_KV.get(
          'pdf/' + id + '/' + indice, 'arrayBuffer');
        if (!fragmento) {
          controlador.error(new Error('Fragmento no encontrado'));
          return;
        }
        indice++;
        controlador.enqueue(new Uint8Array(fragmento));
      } catch (e) {
        controlador.error(e);
      }
    }
  });

  const descargar = url.searchParams.get('descargar') === '1';
  const nombre = nombreSeguro(interna.archivoNombre || interna.titulo + '.pdf');
  const cabeceras = {
    'Content-Type': 'application/pdf',
    'Content-Length': String(interna.tamano || ''),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Disposition': (descargar ? 'attachment' : 'inline') +
      '; filename="' + nombre + '"',
    'X-Content-Type-Options': 'nosniff'
  };

  return new Response(flujo, { headers: cabeceras });
}
