/**
 * Crea o restablece una cuenta de administrador en la base configurada
 * (mismas variables PG* / DB_* que usa el backend).
 *
 * La migración 002 (datos demo) se omite por defecto, así que una base nueva
 * no tiene ningún administrador. Este script crea uno sin depender de la
 * semilla ni de contraseñas publicadas en el repositorio.
 *
 * Uso:
 *   node scripts/crear-admin.js --correo=admin@dominio.mx --password='ClaveSegura123!' \
 *     [--nombre="Administrador Central"] [--actualizar]
 *
 * También acepta variables de entorno:
 *   ADMIN_CORREO, ADMIN_PASSWORD, ADMIN_NOMBRE
 *
 * --actualizar permite cambiar la contraseña de un administrador existente.
 * Sin esa bandera, el script se detiene si el correo ya está registrado.
 *
 * En Docker:
 *   docker compose exec backend node scripts/crear-admin.js ...
 */
const bcrypt = require("bcryptjs");
const pool = require("../db");

const REGEX_CORREO = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const BCRYPT_ROUNDS = 10;

function leerArgumentos(argv) {
  const opciones = { actualizar: false };

  for (const arg of argv) {
    if (arg === "--actualizar") {
      opciones.actualizar = true;
      continue;
    }
    const coincidencia = arg.match(/^--(correo|password|nombre)=(.*)$/s);
    if (coincidencia) {
      opciones[coincidencia[1]] = coincidencia[2];
    }
  }

  opciones.correo = opciones.correo || process.env.ADMIN_CORREO;
  opciones.password = opciones.password || process.env.ADMIN_PASSWORD;
  opciones.nombre = opciones.nombre || process.env.ADMIN_NOMBRE;

  return opciones;
}

function normalizarCorreo(correo) {
  return String(correo).trim().toLowerCase();
}

async function main() {
  const { correo, password, nombre, actualizar } = leerArgumentos(process.argv.slice(2));

  if (!correo || !password) {
    console.error(
      "Faltan datos. Usa:\n" +
        "  node scripts/crear-admin.js --correo=admin@dominio.mx --password='ClaveSegura123!' [--nombre='...'] [--actualizar]\n" +
        "o define ADMIN_CORREO y ADMIN_PASSWORD."
    );
    process.exitCode = 1;
    return;
  }

  const correoLimpio = normalizarCorreo(correo);

  if (!REGEX_CORREO.test(correoLimpio)) {
    console.error("El correo no tiene un formato válido.");
    process.exitCode = 1;
    return;
  }

  if (typeof password !== "string" || password.length < 12) {
    console.error("La contraseña debe tener al menos 12 caracteres.");
    process.exitCode = 1;
    return;
  }

  const nombreLimpio = typeof nombre === "string" && nombre.trim()
    ? nombre.trim().slice(0, 150)
    : null;
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const { rows } = await pool.query(
    "SELECT id_administrador, nombre FROM administradores WHERE LOWER(TRIM(correo)) = $1",
    [correoLimpio]
  );

  if (rows.length > 0) {
    if (!actualizar) {
      console.error(
        `El administrador ${correoLimpio} ya existe. ` +
          "Usa --actualizar para restablecer su contraseña."
      );
      process.exitCode = 1;
      return;
    }

    await pool.query(
      "UPDATE administradores SET nombre = $1, correo = $2, password_hash = $3 WHERE id_administrador = $4",
      [nombreLimpio || rows[0].nombre, correoLimpio, hash, rows[0].id_administrador]
    );
    console.log(`✓ Contraseña actualizada para ${correoLimpio}`);
    return;
  }

  const insertado = await pool.query(
    "INSERT INTO administradores (nombre, correo, password_hash) VALUES ($1, $2, $3) RETURNING id_administrador",
    [nombreLimpio || "Administrador Central PuntOax", correoLimpio, hash]
  );
  console.log(`✓ Administrador creado: ${correoLimpio} (${insertado.rows[0].id_administrador})`);
}

main()
  .catch((error) => {
    if (error.code === "42P01") {
      console.error("La tabla administradores no existe. Aplica primero las migraciones (npm run migrate).");
    } else if (error.code === "23505") {
      console.error("Ya existe un administrador con ese correo.");
    } else {
      console.error("Error al crear el administrador:", error.message);
    }
    process.exitCode = 1;
  })
  .finally(() => pool.end());
