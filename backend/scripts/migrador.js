const fs = require("fs");
const path = require("path");
const pool = require("../db");

const MIGRATIONS_DIR = path.resolve(__dirname, "../../db/migrations");

async function asegurarTablaMigraciones(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(50) PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function obtenerMigracionesAplicadas(client) {
  const { rows } = await client.query(`
    SELECT version, nombre, aplicada_en
    FROM schema_migrations
    ORDER BY version ASC;
  `);
  return rows;
}

function obtenerArchivosMigracion() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`El directorio de migraciones no existe: ${MIGRATIONS_DIR}`);
  }

  const archivos = fs.readdirSync(MIGRATIONS_DIR);
  const upFiles = archivos
    .filter((f) => f.endsWith(".up.sql"))
    .sort();

  return upFiles.map((upFile) => {
    const version = upFile.split("_")[0];
    const baseName = upFile.replace(".up.sql", "");
    const downFile = `${baseName}.down.sql`;
    return {
      version,
      nombre: baseName,
      upPath: path.join(MIGRATIONS_DIR, upFile),
      downPath: path.join(MIGRATIONS_DIR, downFile),
      hasDown: fs.existsSync(path.join(MIGRATIONS_DIR, downFile)),
    };
  });
}

async function migrarUp() {
  const client = await pool.connect();
  try {
    await asegurarTablaMigraciones(client);
    const aplicadas = await obtenerMigracionesAplicadas(client);
    const versionesAplicadas = new Set(aplicadas.map((m) => m.version));
    const disponibles = obtenerArchivosMigracion();

    // Los datos demo incluyen contraseñas públicas: nunca sembrarlos por defecto.
    const pendientes = disponibles.filter((m) =>
      !versionesAplicadas.has(m.version) &&
      (m.version !== '002' || process.env.ALLOW_DEMO_SEEDS === '1')
    );

    if (pendientes.length === 0) {
      console.log("✓ La base de datos ya está al día. No hay migraciones pendientes.");
      return;
    }

    console.log(`Ejecutando ${pendientes.length} migración(es) pendiente(s)...`);

    for (const mig of pendientes) {
      console.log(`\n→ Aplicando: ${mig.nombre}...`);
      const sql = fs.readFileSync(mig.upPath, "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version, nombre) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
          [mig.version, mig.nombre]
        );
        await client.query("COMMIT");
        console.log(`✓ Éxito: ${mig.nombre} aplicada correctamente.`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`✗ Error al aplicar ${mig.nombre}:`, err.message);
        throw err;
      }
    }

    console.log("\n✓ Todas las migraciones fueron ejecutadas exitosamente.");
  } finally {
    client.release();
  }
}

async function migrarDown() {
  const client = await pool.connect();
  try {
    await asegurarTablaMigraciones(client);
    const aplicadas = await obtenerMigracionesAplicadas(client);

    if (aplicadas.length === 0) {
      console.log("No hay migraciones aplicadas para revertir.");
      return;
    }

    const ultima = aplicadas[aplicadas.length - 1];
    const disponibles = obtenerArchivosMigracion();
    const info = disponibles.find((m) => m.version === ultima.version);

    if (!info || !info.hasDown) {
      throw new Error(`No se encontró el archivo .down.sql para la versión ${ultima.version} (${ultima.nombre})`);
    }

    console.log(`\n← Revirtiendo: ${ultima.nombre}...`);
    const sql = fs.readFileSync(info.downPath, "utf8");

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("DELETE FROM schema_migrations WHERE version = $1", [ultima.version]);
      await client.query("COMMIT");
      console.log(`✓ Éxito: ${ultima.nombre} revertida correctamente.`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`✗ Error al revertir ${ultima.nombre}:`, err.message);
      throw err;
    }
  } finally {
    client.release();
  }
}

async function mostrarEstado() {
  const client = await pool.connect();
  try {
    await asegurarTablaMigraciones(client);
    const aplicadas = await obtenerMigracionesAplicadas(client);
    const mapaAplicadas = new Map(aplicadas.map((m) => [m.version, m]));
    const disponibles = obtenerArchivosMigracion();

    console.log("\n=== ESTADO DE MIGRACIONES (PuntOax) ===");
    for (const mig of disponibles) {
      const aplicada = mapaAplicadas.get(mig.version);
      if (aplicada) {
        console.log(`[APLICADA]  ${mig.version} - ${mig.nombre} (el ${new Date(aplicada.aplicada_en).toLocaleString()})`);
      } else {
        console.log(`[PENDIENTE] ${mig.version} - ${mig.nombre}`);
      }
    }
    console.log("=========================================\n");
  } finally {
    client.release();
  }
}

async function main() {
  const comando = process.argv[2] || "up";

  try {
    if (comando === "up") {
      await migrarUp();
    } else if (comando === "down") {
      await migrarDown();
    } else if (comando === "status") {
      await mostrarEstado();
    } else if (comando === "reset") {
      console.log("Reiniciando migraciones...");
      const client = await pool.connect();
      try {
        await asegurarTablaMigraciones(client);
        let aplicadas = await obtenerMigracionesAplicadas(client);
        while (aplicadas.length > 0) {
          await migrarDown();
          aplicadas = await obtenerMigracionesAplicadas(client);
        }
      } finally {
        client.release();
      }
      await migrarUp();
    } else {
      console.log(`Comando desconocido: ${comando}. Usa 'up', 'down', 'status' o 'reset'.`);
    }
  } catch (error) {
    console.error("Error durante la operación de migración:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
