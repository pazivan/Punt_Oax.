/**
 * Listado de usuarios registrados para el panel de administración.
 *
 *   GET /api/admin/usuarios   (solo rol administrador)
 *
 * El listado es de solo lectura y devuelve únicamente datos de contacto y
 * estado de la cuenta. Nunca incluye password_hash ni google_sub: solo los
 * indicadores booleanos de cómo puede iniciar sesión la persona.
 */

const LIMITE_USUARIOS = 200;

const COLUMNAS_PUBLICAS = `
  id_usuario,
  nombre,
  apellidos,
  correo,
  telefono,
  fecha_registro,
  correo_verificado_en IS NOT NULL AS correo_verificado,
  (password_hash IS NOT NULL) AS acceso_password,
  (google_sub IS NOT NULL) AS acceso_google
`;

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
      return res.status(500).json({ error: "No se pudo obtener el listado de usuarios." });
    }
  });
}

module.exports = {
  registrarRutasAdminUsuarios,
  listarUsuarios,
};
