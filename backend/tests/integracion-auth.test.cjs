const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Rechazar cualquier ejecución accidental contra una base compartida.
if (process.env.PUNTOAX_TEST_DB !== '1' ||
    !process.env.PGDATABASE?.startsWith('puntoax_s4_test') ||
    !['localhost', '127.0.0.1'].includes(process.env.PGHOST)) {
  throw new Error('Usa PUNTOAX_TEST_DB=1 y una base puntoax_s4_test* en localhost.');
}
if (process.env.PGPORT === '55441' || process.env.PGPORT === '5432') {
  throw new Error('No uses los puertos de la base de desarrollo ni de Sprint 3 para las pruebas.');
}

const pool = new Pool();
const puerto = Number(process.env.PUNTOAX_TEST_API_PORT);
if (!process.env.PUNTOAX_TEST_API_PORT || !Number.isInteger(puerto) ||
    puerto < 1024 || puerto > 65535 || puerto === 3000) {
  throw new Error('Configura PUNTOAX_TEST_API_PORT con un puerto local de API aislada distinto de 3000.');
}
const url = `http://127.0.0.1:${puerto}`;

async function llamar(ruta, { datos, token } = {}) {
  const respuesta = await fetch(`${url}${ruta}`, {
    method: datos ? 'POST' : 'GET',
    headers: {
      ...(datos ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: datos ? JSON.stringify(datos) : undefined,
  });
  return { status: respuesta.status, cuerpo: await respuesta.json() };
}

test('registro, inicio de sesión y permisos reales contra API y BD aisladas', async () => {
  const correo = `integracion-${randomUUID()}@ejemplo.com`;
  const correoClinica = `  Clinica-${randomUUID()}@Ejemplo.COM  `;
  const correoClinicaNormalizado = correoClinica.trim().toLowerCase();
  const correoAdmin = `admin-${randomUUID()}@ejemplo.com`;
  const password = `Clave-${randomUUID()}`;

  try {
    // ---------------------------------------------------------------
    // Salud y registro de usuarios (Kelly)
    // ---------------------------------------------------------------
    assert.equal((await llamar('/health')).status, 200);
    const registro = await llamar('/api/auth/registro-usuario', { datos: { correo, password } });
    assert.equal(registro.status, 201);
    assert.equal(registro.cuerpo.usuario.correo, correo);
    assert.equal(typeof registro.cuerpo.token, 'string');
    const { rows } = await pool.query('SELECT nombre, password_hash FROM usuarios WHERE correo = $1', [correo]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].nombre, null);
    assert.notEqual(rows[0].password_hash, password);
    assert.equal(await bcrypt.compare(password, rows[0].password_hash), true);

    assert.equal((await llamar('/api/auth/registro-usuario', { datos: { correo, password } })).status, 409);
    assert.equal((await llamar('/api/auth/registro-usuario', { datos: { correo: 'inválido', password } })).status, 400);
    assert.equal((await llamar('/api/auth/registro-usuario', { datos: { correo: 42, password: null } })).status, 400);
    assert.equal((await llamar('/api/auth/login-usuario', { datos: { correo, password: 42 } })).status, 400);
    assert.equal((await llamar('/api/auth/login-usuario', { datos: { correo, password: 'otra-contraseña' } })).status, 401);

    const usuario = await llamar('/api/auth/login-usuario', { datos: { correo, password } });
    assert.equal(usuario.status, 200);
    assert.equal(usuario.cuerpo.usuario.correo, correo);
    assert.equal((await llamar('/api/auth/perfil', { token: usuario.cuerpo.token })).cuerpo.usuarioAutenticado.rol, 'usuario');
    assert.equal((await llamar('/api/admin/panel-prueba', { token: usuario.cuerpo.token })).status, 403);
    assert.equal((await llamar('/api/auth/perfil', { token: 'inválido' })).status, 403);
    assert.equal((await llamar('/api/auth/perfil')).status, 401);

    // ---------------------------------------------------------------
    // Registro de clínicas (Sprint 4)
    // ---------------------------------------------------------------
    const baseClinica = { nombre: 'Clínica Comunitaria San Jacinto', correo: correoClinicaNormalizado, password };

    // Validaciones de entrada: 400 sin tocar la base.
    for (const datos of [
      { ...baseClinica, nombre: '   ' },
      { ...baseClinica, nombre: undefined },
      { ...baseClinica, correo: 'invalido' },
      { ...baseClinica, correo: 'a@b' },
      { ...baseClinica, correo: 42 },
      { ...baseClinica, password: '1234567' },
      { ...baseClinica, password: 'a'.repeat(73) },
      { ...baseClinica, nombre: 'a'.repeat(256) },
      { ...baseClinica, password: null },
    ]) {
      const respuesta = await llamar('/api/auth/registro-clinica', { datos });
      assert.equal(respuesta.status, 400, `debería rechazar ${JSON.stringify(datos)}`);
      assert.equal(typeof respuesta.cuerpo.error, 'string');
    }

    // Registro exitoso con nombre y correo con espacios/mayúsculas.
    const registroClinica = await llamar('/api/auth/registro-clinica', {
      datos: { nombre: '  Clínica Comunitaria San Jacinto  ', correo: correoClinica, password },
    });
    assert.equal(registroClinica.status, 201);
    assert.equal(registroClinica.cuerpo.mensaje, 'Cuenta de clínica creada correctamente.');
    assert.deepEqual(Object.keys(registroClinica.cuerpo).sort(), ['clinica', 'mensaje']);
    assert.equal(registroClinica.cuerpo.clinica.nombre, 'Clínica Comunitaria San Jacinto');
    assert.equal(registroClinica.cuerpo.clinica.correo, correoClinicaNormalizado);
    assert.equal(registroClinica.cuerpo.clinica.rol, 'clinica');
    assert.equal(registroClinica.cuerpo.clinica.estado_publicacion, 'borrador');
    assert.equal(typeof registroClinica.cuerpo.clinica.id, 'string');
    assert.equal('token' in registroClinica.cuerpo, false, 'el registro no emite sesión');
    assert.equal('password' in registroClinica.cuerpo.clinica, false);
    assert.equal('password_hash' in registroClinica.cuerpo.clinica, false);
    assert.equal(JSON.stringify(registroClinica.cuerpo).includes(password), false);

    const clinicaId = registroClinica.cuerpo.clinica.id;

    // Persistencia: hash bcrypt, estado borrador y sin solicitud administrativa.
    const clinicaDb = await pool.query(
      `SELECT id_clinica, nombre, correo_acceso, password_hash, estado_publicacion
       FROM clinicas WHERE correo_acceso = $1`,
      [correoClinicaNormalizado]
    );
    assert.equal(clinicaDb.rows.length, 1);
    assert.equal(clinicaDb.rows[0].id_clinica, clinicaId);
    assert.equal(clinicaDb.rows[0].nombre, 'Clínica Comunitaria San Jacinto');
    assert.equal(clinicaDb.rows[0].estado_publicacion, 'borrador');
    assert.notEqual(clinicaDb.rows[0].password_hash, password);
    assert.equal(await bcrypt.compare(password, clinicaDb.rows[0].password_hash), true);
    const solicitudes = await pool.query('SELECT 1 FROM solicitudes_clinicas WHERE id_clinica = $1', [clinicaId]);
    assert.equal(solicitudes.rowCount, 0);

    // Correo duplicado: 409 aunque cambien mayúsculas y espacios.
    const duplicado = await llamar('/api/auth/registro-clinica', {
      datos: { nombre: 'Otra clínica', correo: `  ${correoClinicaNormalizado.toUpperCase()}  `, password },
    });
    assert.equal(duplicado.status, 409);

    // El cliente no puede inyectar rol ni estado de publicación.
    const intentoRol = await llamar('/api/auth/registro-clinica', {
      datos: {
        nombre: 'Clínica con rol inyectado',
        correo: `rol-${randomUUID()}@ejemplo.com`,
        password,
        rol: 'administrador',
        estado_publicacion: 'aprobada',
      },
    });
    assert.equal(intentoRol.status, 201);
    assert.equal(intentoRol.cuerpo.clinica.rol, 'clinica');
    assert.equal(intentoRol.cuerpo.clinica.estado_publicacion, 'borrador');
    const estadoInyectado = await pool.query('SELECT estado_publicacion FROM clinicas WHERE id_clinica = $1',
      [intentoRol.cuerpo.clinica.id]);
    assert.equal(estadoInyectado.rows[0].estado_publicacion, 'borrador');

    // Inicio de sesión de la cuenta institucional recién creada.
    const clinica = await llamar('/api/auth/login-clinica', {
      datos: { correo: `  ${correoClinicaNormalizado.toUpperCase()}  `, password },
    });
    assert.equal(clinica.status, 200);
    assert.equal(clinica.cuerpo.clinica.id, clinicaId);
    assert.equal(clinica.cuerpo.clinica.correo, correoClinicaNormalizado);
    assert.equal(clinica.cuerpo.clinica.rol, 'clinica');
    assert.equal(typeof clinica.cuerpo.token, 'string');
    assert.equal((await llamar('/api/auth/login-clinica', {
      datos: { correo: correoClinicaNormalizado, password: 'incorrecta' },
    })).status, 401);

    const perfilClinica = await llamar('/api/auth/perfil', { token: clinica.cuerpo.token });
    assert.equal(perfilClinica.status, 200);
    assert.equal(perfilClinica.cuerpo.usuarioAutenticado.rol, 'clinica');
    assert.equal(perfilClinica.cuerpo.usuarioAutenticado.id, clinicaId);
    assert.equal((await llamar('/api/admin/panel-prueba', { token: clinica.cuerpo.token })).status, 403);

    // Catálogo público: solo aprobadas; la nueva cuenta sigue en borrador.
    const directorioInicial = await llamar('/api/clinicas');
    assert.equal(directorioInicial.status, 200);
    assert.ok(Array.isArray(directorioInicial.cuerpo));
    assert.equal(directorioInicial.cuerpo.some((c) => c.id_clinica === clinicaId), false);

    const aprobada = await pool.query(
      `INSERT INTO clinicas (nombre, estado_publicacion) VALUES ($1, 'aprobada') RETURNING id_clinica`,
      ['Clínica aprobada de prueba']
    );
    const directorio = await llamar('/api/clinicas');
    assert.equal(directorio.status, 200);
    assert.ok(directorio.cuerpo.some((c) => c.id_clinica === aprobada.rows[0].id_clinica));
    assert.equal(directorio.cuerpo.some((c) => c.id_clinica === clinicaId), false);

    // ---------------------------------------------------------------
    // Acceso administrativo (Jonathan)
    // ---------------------------------------------------------------
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO administradores (nombre, correo, password_hash) VALUES ($1,$2,$3)',
      ['Admin de prueba', correoAdmin, hash]);
    const admin = await llamar('/api/auth/login-admin', { datos: { correo: correoAdmin, password } });
    assert.equal(admin.status, 200);
    assert.equal((await llamar('/api/admin/panel-prueba', { token: admin.cuerpo.token })).status, 200);
  } finally {
    await pool.end();
  }
});
