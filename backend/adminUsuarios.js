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

async function listarUsuarios(pool, { limite = LIMITE_USUARIOS } = {}) {
  const tope = Number.isInteger(limite) && limite > 0 ? Math.min(limite, LIMITE_USUARIOS) : LIMITE_USUARIOS;
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS_PUBLICAS}
       FROM usuarios
      ORDER BY fecha_registro DESC, correo ASC
      LIMIT $1`,
    [tope]
  );
  const conteo = await pool.query("SELECT COUNT(*)::int AS total FROM usuarios");
  return {
    status: 200,
    body: {
      usuarios: rows,
      total: conteo.rows[0]?.total ?? rows.length,
    },
  };
}

function registrarRutasAdminUsuarios(app, { pool, autenticarToken, requerirRol }) {
  const soloAdmin = [autenticarToken, requerirRol(["administrador"])];

  app.get("/api/admin/usuarios", ...soloAdmin, async (req, res) => {
    try {
      const resultado = await listarUsuarios(pool);
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
