const path = require("node:path");
const dotenv = require("dotenv");
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../.env") });
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.PGHOST || process.env.DB_HOST || "localhost",
  port: process.env.PGPORT || process.env.DB_PORT || 5432,
  database: process.env.PGDATABASE || process.env.DB_NAME || "puntoax_bd",
  user: process.env.PGUSER || process.env.DB_USER || "postgres",
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD || "password_seguro",
  connectionTimeoutMillis: 3000,
});

// Un cliente ocioso puede desconectarse al caer PostgreSQL. El pool lo elimina;
// no convertir ese evento en una excepción que derribe también la API.
pool.on("error", (error) => console.error("Conexión ociosa de BD interrumpida:", error.code || error.name));

module.exports = pool;
