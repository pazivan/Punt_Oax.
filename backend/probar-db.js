const pool = require("./db");

async function probarConexion() {
  try {
    const resultado = await pool.query(
      "SELECT current_user, current_database(), (SELECT count(*) FROM clinicas) AS clinicas"
    );

    console.log("Conexión exitosa:");
    console.log(resultado.rows[0]);
  } catch (error) {
    console.error("Error al conectar:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

probarConexion();
