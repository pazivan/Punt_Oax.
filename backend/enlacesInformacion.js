const MAX_ENLACES = 20;

function validarEnlacesInformacion(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !Array.isArray(body.enlaces) || body.enlaces.length > MAX_ENLACES) {
    return { error: "Envía una lista de hasta 20 fuentes de información." };
  }
  const enlaces = [];
  for (const item of body.enlaces) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        typeof item.titulo !== "string" || typeof item.url !== "string") {
      return { error: "Cada fuente debe tener título y enlace." };
    }
    const titulo = item.titulo.trim();
    const url = item.url.trim();
    if (!titulo || titulo.length > 120 || !url || url.length > 1000 ||
        !/^https?:\/\//i.test(url)) {
      return { error: "Cada fuente necesita un título (máximo 120 caracteres) y un enlace (máximo 1000 caracteres)." };
    }
    try {
      const parsed = new URL(url);
      if (!["https:", "http:"].includes(parsed.protocol) || !parsed.hostname.includes(".") ||
          /\s/.test(url) || parsed.username || parsed.password) throw new Error("URL no válida");
      enlaces.push({ titulo, url: parsed.href });
    } catch {
      return { error: "Los enlaces deben ser direcciones completas http:// o https:// válidas." };
    }
  }
  return { enlaces };
}

async function actualizarEnlacesInformacion(pool, idClinica, body) {
  const { error, enlaces } = validarEnlacesInformacion(body);
  if (error) return { status: 400, body: { error } };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT estado_publicacion FROM clinicas WHERE id_clinica = $1 FOR UPDATE",
      [idClinica]
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return { status: 404, body: { error: "No se encontró tu clínica." } };
    }
    const pendientes = await client.query(
      "SELECT 1 FROM solicitudes_clinicas WHERE id_clinica = $1 AND estado = 'pendiente' LIMIT 1",
      [idClinica]
    );
    if (pendientes.rows.length) {
      await client.query("ROLLBACK");
      return {
        status: 409,
        body: { error: "No puedes cambiar las fuentes mientras tu postulación esté pendiente de revisión." },
      };
    }
    const guardado = await client.query(
      `UPDATE clinicas SET enlaces_informacion = $1::jsonb
       WHERE id_clinica = $2 RETURNING enlaces_informacion`,
      [JSON.stringify(enlaces), idClinica]
    );
    await client.query("COMMIT");
    return { status: 200, body: { enlaces: guardado.rows[0].enlaces_informacion } };
  } catch (errorActual) {
    await client.query("ROLLBACK").catch(() => {});
    throw errorActual;
  } finally {
    client.release();
  }
}

module.exports = { validarEnlacesInformacion, actualizarEnlacesInformacion };
