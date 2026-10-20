require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.PGHOST || process.env.DB_HOST || "localhost",
  port: process.env.PGPORT || process.env.DB_PORT || 5432,
  database: process.env.PGDATABASE || process.env.DB_NAME || "puntoax_bd",
  user: process.env.PGUSER || process.env.DB_USER || "postgres",
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD || "password_seguro",
});

module.exports = pool;
