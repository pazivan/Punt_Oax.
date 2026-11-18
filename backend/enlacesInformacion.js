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
    if (!titulo || titulo.length > 120 || !url || url.length > 1000) {
      return { error: "Cada fuente necesita un título (máximo 120 caracteres) y un enlace (máximo 1000 caracteres)." };
    }
    try {
      const parsed = new URL(url);
      if (!["https:", "http:"].includes(parsed.protocol) || !parsed.hostname.includes(".") ||
          /\s/.test(url) || parsed.username || parsed.password) throw new Error("URL no válida");
    } catch {
      return { error: "Los enlaces deben ser direcciones completas http:// o https:// válidas." };
    }
    enlaces.push({ titulo, url });
  }
  return { enlaces };
}

module.exports = { validarEnlacesInformacion };
