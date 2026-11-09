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
    // Registro de clínicas: solo nombre, correo y contraseña (Sprint 4)
    // ---------------------------------------------------------------
    const servicioPrueba = await pool.query(
      "SELECT id_servicio FROM servicios WHERE nombre = 'Detección de ITS' AND activo = TRUE"
    );
    assert.equal(servicioPrueba.rows.length, 1, 'aplicar la migración 004 solo en BD aislada');
    const idServicio = servicioPrueba.rows[0].id_servicio;
    const baseClinica = {
      nombre: 'Clínica Comunitaria San Jacinto',
      correo: correoClinicaNormalizado,
      password,
    };

    // Validaciones de entrada: 400 sin crear cuenta.
    for (const datos of [
      {},
      { ...baseClinica, nombre: '   ' },
      { ...baseClinica, nombre: undefined },
      { ...baseClinica, nombre: 'a'.repeat(256) },
      { ...baseClinica, correo: 'invalido' },
      { ...baseClinica, correo: 'a@b' },
      { ...baseClinica, correo: 42 },
      { ...baseClinica, password: '1234567' },
      { ...baseClinica, password: 'a'.repeat(73) },
      { ...baseClinica, password: null },
    ]) {
      const respuesta = await llamar('/api/auth/registro-clinica', { datos });
      assert.equal(respuesta.status, 400, `debería rechazar ${JSON.stringify(datos)}`);
      assert.equal(typeof respuesta.cuerpo.error, 'string');
    }
    const sinCuentasInvalidas = await pool.query(
      'SELECT COUNT(*)::int AS total FROM clinicas WHERE correo_acceso = $1',
      [correoClinicaNormalizado]
    );
    assert.equal(sinCuentasInvalidas.rows[0].total, 0);

    // Registro exitoso: normaliza nombre/correo e ignora los campos ajenos.
    const registroClinica = await llamar('/api/auth/registro-clinica', {
      datos: {
        ...baseClinica,
        nombre: '  Clínica Comunitaria San Jacinto  ',
        correo: correoClinica,
        rol: 'administrador',
        estado_publicacion: 'aprobada',
        tipo_institucion: 'ong',
        servicios: [{ categoria: 'its', detalle: 'No debe guardarse' }],
      },
    });
    assert.equal(registroClinica.status, 201);
    assert.match(registroClinica.cuerpo.mensaje, /^Cuenta de clínica creada correctamente\./);
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

    // Persistencia: solo los tres datos de cuenta; hash bcrypt y estado borrador.
    const clinicaDb = await pool.query(
      `SELECT id_clinica, nombre, correo_acceso, password_hash, estado_publicacion,
        tipo_institucion, municipio, direccion, telefono, codigo_postal, descripcion
       FROM clinicas WHERE correo_acceso = $1`,
      [correoClinicaNormalizado]
    );
    assert.equal(clinicaDb.rows.length, 1);
    assert.equal(clinicaDb.rows[0].id_clinica, clinicaId);
    assert.equal(clinicaDb.rows[0].nombre, 'Clínica Comunitaria San Jacinto');
    assert.equal(clinicaDb.rows[0].estado_publicacion, 'borrador');
    for (const campo of ['tipo_institucion', 'municipio', 'direccion', 'telefono', 'codigo_postal', 'descripcion']) {
      assert.equal(clinicaDb.rows[0][campo], null, `${campo} no forma parte del registro de cuenta`);
    }
    assert.notEqual(clinicaDb.rows[0].password_hash, password);
    assert.equal(await bcrypt.compare(password, clinicaDb.rows[0].password_hash), true);
    for (const tabla of ['solicitudes_clinicas', 'clinicas_servicios', 'horarios_atencion', 'clinicas_documentos']) {
      const filas = await pool.query(`SELECT 1 FROM ${tabla} WHERE id_clinica = $1`, [clinicaId]);
      assert.equal(filas.rowCount, 0, `${tabla} debe quedar vacía al crear la cuenta`);
    }
    const catalogoServicios = await llamar('/api/servicios');
    assert.equal(catalogoServicios.status, 200);
    assert.ok(Array.isArray(catalogoServicios.cuerpo));

    // Correo duplicado: 409 aunque cambien mayúsculas y espacios.
    const duplicado = await llamar('/api/auth/registro-clinica', {
      datos: { ...baseClinica, nombre: 'Otra clínica', correo: `  ${correoClinicaNormalizado.toUpperCase()}  ` },
    });
    assert.equal(duplicado.status, 409);

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

    // Entrada a la cuenta: la ficha se consulta desde el JWT, no desde la URL.
    const ficha = await llamar('/api/clinicas/mi-ficha', { token: clinica.cuerpo.token });
    assert.equal(ficha.status, 200);
    assert.equal(ficha.cuerpo.clinica.id_clinica, clinicaId);
    assert.equal(ficha.cuerpo.clinica.nombre, 'Clínica Comunitaria San Jacinto');
    assert.equal(ficha.cuerpo.clinica.estado_publicacion, 'borrador');
    assert.equal(ficha.cuerpo.clinica.estado_ficha, 'incompleta');
    assert.equal(ficha.cuerpo.clinica.puede_editar, true);
    assert.equal(ficha.cuerpo.clinica.puede_postular, false);
    assert.deepEqual(ficha.cuerpo.servicios, []);
    assert.deepEqual(ficha.cuerpo.horarios, []);
    assert.deepEqual(ficha.cuerpo.documentos, []);
    assert.equal(ficha.cuerpo.postulacion, null);
    assert.ok(ficha.cuerpo.faltantes.length > 0);
    assert.equal((await llamar('/api/clinicas/mi-ficha', { token: usuario.cuerpo.token })).status, 403);
    assert.equal((await llamar('/api/clinicas/mi-ficha')).status, 401);
    assert.equal((await llamar('/api/admin/panel-prueba', { token: clinica.cuerpo.token })).status, 403);

    // Catálogo público: solo aprobadas; la nueva cuenta sigue en borrador.
    assert.equal((await llamar('/api/clinicas')).status, 401);
    assert.equal((await llamar(`/api/clinicas/${clinicaId}`)).status, 401);
    assert.equal((await llamar('/api/clinicas', { token: 'inválido' })).status, 403);
    const directorioInicial = await llamar('/api/clinicas', { token: clinica.cuerpo.token });
    assert.equal(directorioInicial.status, 200);
    assert.ok(Array.isArray(directorioInicial.cuerpo));
    assert.equal(directorioInicial.cuerpo.some((c) => c.id_clinica === clinicaId), false);

    const aprobada = await pool.query(
      `INSERT INTO clinicas (nombre, municipio, estado_publicacion)
       VALUES ($1, $2, 'aprobada') RETURNING id_clinica`,
      ['Clínica aprobada de prueba', 'Oaxaca de Juárez']
    );
    await pool.query(
      'INSERT INTO clinicas_servicios (id_clinica, id_servicio) VALUES ($1, $2)',
      [aprobada.rows[0].id_clinica, idServicio]
    );
    const directorio = await llamar('/api/clinicas', { token: clinica.cuerpo.token });
    assert.equal(directorio.status, 200);
    assert.ok(directorio.cuerpo.some((c) => c.id_clinica === aprobada.rows[0].id_clinica));
    assert.equal(directorio.cuerpo.some((c) => c.id_clinica === clinicaId), false);

    // Los filtros de Kelly se combinan sobre las aprobadas; no filtran borradores.
    for (const ruta of [
      '/api/clinicas?nombre=aprobada',
      '/api/clinicas?municipio=oaxaca%20de%20ju%C3%A1rez',
      '/api/clinicas?servicios=ITS',
      '/api/clinicas?nombre=aprobada&municipio=Oaxaca%20de%20Ju%C3%A1rez&servicios=ITS,ILE',
    ]) {
      const filtrado = await llamar(ruta, { token: clinica.cuerpo.token });
      assert.equal(filtrado.status, 200, ruta);
      assert.ok(filtrado.cuerpo.some((c) => c.id_clinica === aprobada.rows[0].id_clinica), ruta);
      assert.equal(filtrado.cuerpo.some((c) => c.id_clinica === clinicaId), false, ruta);
    }
    const sinCoincidencia = await llamar('/api/clinicas?nombre=sin-coincidencia', { token: clinica.cuerpo.token });
    assert.equal(sinCoincidencia.status, 200);
    assert.equal(sinCoincidencia.cuerpo.some((c) => c.id_clinica === aprobada.rows[0].id_clinica), false);
    for (const ruta of ['/api/clinicas?nombre=A&nombre=B', '/api/clinicas?municipio=A&municipio=B',
      '/api/clinicas?servicios=ITS&servicios=ILE', '/api/clinicas?servicios=,,,']) {
      assert.equal((await llamar(ruta, { token: clinica.cuerpo.token })).status, 400, ruta);
    }

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
