/**
 * Listado de usuarios registrados para el panel de administración.
 *
 *   GET /api/admin/usuarios   (solo rol administrador)
 *
 * El listado es de solo lectura y devuelve únicamente datos de contacto y
 * estado de la cuenta. Nunca incluye password_hash ni google_sub: solo los
 * indicadores booleanos de cómo puede iniciar sesión la persona.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMITE_USUARIOS = 200;
const { responderErrorEsquema } = require("./erroresEsquema");

const COLUMNAS_PUBLICAS = `
  id_usuario,
  nombre,
  apellidos,
  correo,
  telefono,
  fecha_registro,
  activo,
  correo_verificado_en IS NOT NULL AS correo_verificado,
  (password_hash IS NOT NULL) AS acceso_password,
  (google_sub IS NOT NULL) AS acceso_google
`;

const esUuid = (valor) => typeof valor === "string" && UUID_RE.test(valor);

async function listarUsuarios(pool, { limite = LIMITE_USUARIOS, page, limit, q } = {}) {
  const paginado = page !== undefined || limit !== undefined;
  const tope = paginado
    ? ([10, 20, 50].includes(Number(limit)) ? Number(limit) : 10)
    : (Number.isInteger(limite) && limite > 0 ? Math.min(limite, LIMITE_USUARIOS) : LIMITE_USUARIOS);
  const paginaActual = paginado && Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const offset = (paginaActual - 1) * tope;
  const busqueda = typeof q === "string" ? q.trim() : "";

  const condiciones = [];
  const params = [];
  if (busqueda) {
    params.push(`%${busqueda}%`);
    condiciones.push(
      `(correo ILIKE $${params.length} OR COALESCE(nombre, '') ILIKE $${params.length} OR COALESCE(apellidos, '') ILIKE $${params.length} OR COALESCE(telefono, '') ILIKE $${params.length})`
    );
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

  const paramsListado = [...params, tope];
  const clausulaOffset = paginado ? ` OFFSET $${paramsListado.push(offset)}` : "";

  const { rows } = await pool.query(
    `SELECT ${COLUMNAS_PUBLICAS}
       FROM usuarios
       ${where}
      ORDER BY fecha_registro DESC, correo ASC
      LIMIT $${params.length + 1}${clausulaOffset}`,
    paramsListado
  );
  const conteo = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE correo_verificado_en IS NOT NULL)::int AS total_verificados
       FROM usuarios
       ${where}`,
    params
  );
  const total = conteo.rows[0]?.total ?? rows.length;
  const totalVerificados = conteo.rows[0]?.total_verificados ?? rows.filter((u) => u.correo_verificado).length;

  return {
    status: 200,
    body: {
      usuarios: rows,
      total,
      total_verificados: totalVerificados,
      page: paginaActual,
      limit: tope,
      total_paginas: Math.max(1, Math.ceil(total / tope)),
    },
  };
}

async function consultarUsuario(pool, idUsuario) {
  if (!esUuid(idUsuario)) {
    return { status: 400, body: { error: "Identificador de usuario no válido." } };
  }
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS_PUBLICAS},
            'usuario'::text AS rol,
            (SELECT COUNT(*)::int FROM citas c WHERE c.id_usuario = usuarios.id_usuario) AS total_citas
       FROM usuarios
      WHERE id_usuario = $1`,
    [idUsuario]
  );
  if (!rows[0]) {
    return { status: 404, body: { error: "Usuario no encontrado." } };
  }
  return { status: 200, body: { usuario: rows[0] } };
}

async function cambiarEstadoUsuario(pool, idUsuario, cuerpo, idAdminActual) {
  if (!esUuid(idUsuario)) {
    return { status: 400, body: { error: "Identificador de usuario no válido." } };
  }
  if (typeof cuerpo?.activo !== "boolean") {
    return { status: 400, body: { error: "Indica un estado válido (activo: true o false)." } };
  }
  if (idAdminActual && idUsuario === idAdminActual) {
    return { status: 409, body: { error: "No puedes desactivar tu propia cuenta." } };
  }

  const { rows } = await pool.query(
    `UPDATE usuarios
        SET activo = $1,
            version_sesion = CASE WHEN $1 = FALSE THEN version_sesion + 1 ELSE version_sesion END
      WHERE id_usuario = $2
      RETURNING ${COLUMNAS_PUBLICAS}, 'usuario'::text AS rol`,
    [cuerpo.activo, idUsuario]
  );
  if (!rows[0]) {
    return { status: 404, body: { error: "Usuario no encontrado." } };
  }
  return {
    status: 200,
    body: {
      mensaje: cuerpo.activo
        ? "La cuenta de usuario fue reactivada."
        : "La cuenta de usuario fue desactivada. Sus sesiones activas quedaron cerradas.",
      usuario: rows[0],
    },
  };
}

function registrarRutasAdminUsuarios(app, { pool, autenticarToken, requerirRol }) {
  const soloAdmin = [autenticarToken, requerirRol(["administrador"])];

  app.get("/api/admin/usuarios", ...soloAdmin, async (req, res) => {
    try {
      const resultado = await listarUsuarios(pool, {
        page: req.query?.page,
        limit: req.query?.limit,
        q: req.query?.q,
      });
      return res.status(resultado.status).json(resultado.body);
    } catch (error) {
      console.error("Error al consultar los usuarios:", error.message);
      if (responderErrorEsquema(res, error)) return;
      return res.status(500).json({ error: "No se pudo obtener el listado de usuarios." });
    }
  });

  app.get("/api/admin/usuarios/:id", ...soloAdmin, async (req, res) => {
    try {
      const resultado = await consultarUsuario(pool, req.params.id);
      return res.status(resultado.status).json(resultado.body);
    } catch (error) {
      console.error("Error al consultar el usuario:", error.message);
      if (responderErrorEsquema(res, error)) return;
      return res.status(500).json({ error: "No se pudo obtener el detalle del usuario." });
    }
  });

  app.patch("/api/admin/usuarios/:id/estado", ...soloAdmin, async (req, res) => {
    try {
      const resultado = await cambiarEstadoUsuario(pool, req.params.id, req.body, req.usuario?.id);
      return res.status(resultado.status).json(resultado.body);
    } catch (error) {
      console.error("Error al cambiar el estado del usuario:", error.message);
      if (responderErrorEsquema(res, error)) return;
      return res.status(500).json({ error: "No se pudo actualizar el estado de la cuenta." });
    }
  });
}

module.exports = {
  registrarRutasAdminUsuarios,
  listarUsuarios,
  consultarUsuario,
  cambiarEstadoUsuario,
};
