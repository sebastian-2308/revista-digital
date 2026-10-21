/* ==========================================================================
   API del contenido compartido de Noti-Misión.

   GET  /api/sitio  → devuelve la última versión guardada.
   POST /api/sitio  → reemplaza el contenido compartido.

   El contenido vive en el espacio de nombres KV «SITIO_KV». El POST exige
   la misma huella de la contraseña que usa el editor del sitio. No es una
   seguridad fuerte (el sitio es estático y la huella es pública), pero evita
   escrituras accidentales o anónimas.
   ========================================================================== */

const CLAVE_KV = 'sitio';
const HUELLA_EDITOR = 'c22adf43';
const LIMITE_BYTES = 20 * 1024 * 1024;

function json(datos, estado, extra) {
  return new Response(JSON.stringify(datos), {
    status: estado || 200,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }, extra || {})
  });
}

export async function onRequestGet({ env }) {
  if (!env.SITIO_KV) {
    return json({ ok: false, error: 'Falta configurar el almacén compartido.' }, 503);
  }
  try {
    const guardado = await env.SITIO_KV.get(CLAVE_KV, 'json');
    if (!guardado || !guardado.sitio) {
      return json({ ok: true, sitio: null });
    }
    return json({
      ok: true,
      sitio: guardado.sitio,
      actualizado: guardado.actualizado || null,
      version: guardado.version || null
    });
  } catch (e) {
    return json({ ok: false, error: 'No se pudo leer el contenido compartido.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.SITIO_KV) {
    return json({ ok: false, error: 'Falta configurar el almacén compartido.' }, 503);
  }
  if (request.headers.get('X-Clave-Editor') !== HUELLA_EDITOR) {
    return json({ ok: false, error: 'Clave de edición incorrecta.' }, 401);
  }

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ ok: false, error: 'El cuerpo no es JSON válido.' }, 400);
  }
  if (!cuerpo || !cuerpo.sitio || typeof cuerpo.sitio !== 'object' ||
      Array.isArray(cuerpo.sitio)) {
    return json({ ok: false, error: 'Falta el contenido del sitio.' }, 400);
  }

  const serializado = JSON.stringify(cuerpo.sitio);
  if (serializado.length > LIMITE_BYTES) {
    return json({ ok: false, error: 'El contenido supera el límite permitido.' }, 413);
  }

  const ahora = new Date().toISOString();
  const version = Date.now();
  try {
    await env.SITIO_KV.put(CLAVE_KV, JSON.stringify({
      sitio: cuerpo.sitio,
      actualizado: ahora,
      version: version
    }));
    return json({ ok: true, actualizado: ahora, version: version });
  } catch (e) {
    return json({ ok: false, error: 'No se pudo guardar el contenido compartido.' }, 500);
  }
}
