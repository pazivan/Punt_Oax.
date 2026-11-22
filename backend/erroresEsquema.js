// No exponer nombres de tablas, columnas ni instrucciones de migración al cliente.
function responderErrorEsquema(res, error) {
  if (error?.code !== "42703" && error?.code !== "42P01") return false;
  res.status(503).json({
    error: "La configuración de datos del servidor no es compatible con esta versión. Contacta al equipo de PuntOax.",
    codigo: "ESQUEMA_INCOMPATIBLE",
  });
  return true;
}

module.exports = { responderErrorEsquema };
