const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const { buscarCentros } = require("../asistenteIA");
const { obtenerResumenAdmin } = require("../adminSupervision");

if (process.env.PUNTOAX_TEST_DB !== "1" || !process.env.PGDATABASE?.startsWith("puntoax_s4_test") ||
    !["127.0.0.1", "localhost"].includes(process.env.PGHOST) ||
    ["5432", "55441"].includes(process.env.PGPORT)) throw new Error("Solo BD local de QA.");
const base = `http://127.0.0.1:${process.env.PUNTOAX_TEST_API_PORT}`;
async function api(ruta, token, body, method = body ? "POST" : "GET") {
  const r = await fetch(base + ruta, { method, headers: {
    "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
}

test("API real: catálogo, fichas, filtros, citas, teléfono, permisos e IA", async () => {
  const pool = new Pool();
  const correo = () => `qa-${randomUUID()}@puntoax.online`;
  const password = "QA-Segura123!";
  const hash = await bcrypt.hash(password, 4);
  const crearUsuario = async () => {
    const email = correo();
    const { rows } = await pool.query(`INSERT INTO usuarios(correo,password_hash,correo_verificado_en,telefono)
      VALUES($1,$2,now(),'1234567890') RETURNING id_usuario`, [email, hash]);
    const login = await api("/api/auth/login-usuario", null, { correo: email, password });
    assert.equal(login.status, 200, "el teléfono antiguo no bloquea la cuenta");
    return { id: rows[0].id_usuario, token: login.body.token };
  };
  const crearClinica = async (nombre) => {
    const email = correo();
    const { rows } = await pool.query(`INSERT INTO clinicas(nombre,correo_acceso,password_hash,correo_verificado_en)
      VALUES($1,$2,$3,now()) RETURNING id_clinica`, [nombre, email, hash]);
    const login = await api("/api/auth/login-clinica", null, { correo: email, password });
    assert.equal(login.status, 200);
    return { id: rows[0].id_clinica, token: login.body.token };
  };
  try {
    const usuario = await crearUsuario();
    const ajeno = await crearUsuario();
    const clinica = await crearClinica("Centro QA municipio");
    const ficticia = await crearClinica("Prueba profa QA");
    const catalogo = await api("/api/municipios");
    assert.equal(catalogo.status, 200);
    assert.equal(catalogo.body.municipios.length, 570);
    assert.equal(catalogo.body.municipios.filter((m) => m.nombre === "Oaxaca de Juárez").length, 1);
    for (const body of [
      { municipio: "Inventado" }, { municipio_clave: "20999" }, { municipio_clave: 20067 },
      { municipio_clave: "20067", municipio: "Abejones" }, { municipio: null }, { telefono: [] },
    ]) assert.equal((await api("/api/clinicas/mi-ficha", clinica.token, body, "PUT")).status, 400, JSON.stringify(body));
    const guardada = await api("/api/clinicas/mi-ficha", clinica.token,
      { municipio_clave: "20067", telefono: "+52 (951) 123-4567", direccion: "Calle controlada", latitud: 17.06, longitud: -96.72 }, "PUT");
    assert.equal(guardada.status, 200, JSON.stringify(guardada.body));
    assert.equal(guardada.body.clinica.municipio, "Oaxaca de Juárez");
    assert.equal(guardada.body.clinica.municipio_clave, "20067");
    assert.equal(guardada.body.clinica.telefono, "+529511234567");
    assert.equal((await api("/api/clinicas/mi-ficha", usuario.token, { municipio_clave: "20001" }, "PUT")).status, 403);
    await pool.query("UPDATE clinicas SET estado_publicacion='aprobada' WHERE id_clinica=$1", [clinica.id]);
    const servicio = (await pool.query("INSERT INTO servicios(nombre,categoria) VALUES($1,'its') RETURNING id_servicio", [`QA ${randomUUID()}`])).rows[0].id_servicio;
    const cs = (await pool.query("INSERT INTO clinicas_servicios(id_clinica,id_servicio) VALUES($1,$2) RETURNING id_clinica_servicio", [clinica.id, servicio])).rows[0].id_clinica_servicio;
    const espacio = (await pool.query("INSERT INTO espacios_disponibles(id_clinica_servicio,fecha_hora_inicio) VALUES($1,now()+interval '8 days') RETURNING id_espacio", [cs])).rows[0].id_espacio;
    for (const filtro of ["municipio=OAXACA%20DE%20JUAREZ", "municipio_clave=20067"]) {
      const r = await api(`/api/clinicas?${filtro}`, usuario.token);
      assert.equal(r.status, 200);
      assert.ok(r.body.some((c) => c.id_clinica === clinica.id));
      assert.ok(!r.body.some((c) => c.id_clinica === ficticia.id));
      assert.ok(!JSON.stringify(r.body).includes("paciente_telefono"));
    }
    assert.equal((await api("/api/clinicas?municipio_clave=20999", usuario.token)).status, 400);
    assert.equal((await api("/api/clinicas")).status, 401);
    assert.equal((await buscarCentros(pool, { texto: "Prueba profa QA" })).total, 0);
    assert.ok((await buscarCentros(pool, { municipio: "oaxaca de juarez" })).centros.some((c) => c.id_clinica === clinica.id));
    assert.equal((await buscarCentros(pool, { municipio: "Inventado" })).total, 0);
    assert.ok((await obtenerResumenAdmin(pool)).body.municipios.some((m) => m.municipio_clave === "20067"));
    for (const telefono of [1234567890, {}, [], "1234567890", "1111111111", "+5219511234567"]) {
      assert.equal((await api("/api/auth/perfil", usuario.token, { telefono }, "PATCH")).status, 400);
    }
    assert.equal((await api("/api/auth/perfil", usuario.token, { nombre: "Paciente QA" }, "PATCH")).status, 200);
    assert.equal((await pool.query("SELECT telefono FROM usuarios WHERE id_usuario=$1", [usuario.id])).rows[0].telefono, "1234567890");
    for (const telefono of [undefined, null, "", "1234567890", 9511234567]) {
      assert.equal((await api("/api/citas", usuario.token, { id_espacio: espacio, telefono })).status, 400);
    }
    const cita = await api("/api/citas", usuario.token, { id_espacio: espacio, telefono: "+52 (55) 1234-5678", nombre: "Paciente", apellidos: "QA" });
    assert.equal(cita.status, 201, JSON.stringify(cita.body));
    assert.equal(cita.body.cita.paciente_telefono, "+525512345678");
    const idCita = cita.body.cita.id_cita;
    assert.equal((await api(`/api/citas/${idCita}`, ajeno.token)).status, 404);
    assert.equal((await api("/api/clinicas/mi-citas", usuario.token)).status, 403);
    const propias = await api("/api/clinicas/mi-citas", clinica.token);
    assert.equal(propias.status, 200);
    assert.ok(JSON.stringify(propias.body).includes("+525512345678"));
    assert.equal((await api("/api/auth/perfil", clinica.token, { telefono: "9511234567" }, "PATCH")).status, 403);
    assert.equal((await api("/api/citas", clinica.token, { id_espacio: espacio, telefono: "9511234567" })).status, 403);
    assert.equal((await api(`/api/citas/${idCita}/cancelar`, usuario.token, {}, "PATCH")).status, 200);
    assert.equal((await api(`/api/citas/${idCita}`, usuario.token)).body.cita.estado, "cancelada");
    const contacto = await api("/api/clinicas/mi-ficha/datos-publicados", clinica.token, { telefono: "81 1122 3344" }, "PATCH");
    assert.equal(contacto.status, 200);
    assert.equal(contacto.body.clinica.telefono, "+528111223344");
    assert.equal((await api("/api/clinicas/mi-ficha/solicitud-actualizacion", clinica.token,
      { municipio_clave: "20999", motivo: "Cambio controlado de sede" })).status, 400);
    const solicitud = await api("/api/clinicas/mi-ficha/solicitud-actualizacion", clinica.token,
      { municipio_clave: "20001", motivo: "Cambio controlado de sede" });
    assert.equal(solicitud.status, 201, JSON.stringify(solicitud.body));
    const almacenada = (await pool.query("SELECT datos_ficha FROM solicitudes_clinicas WHERE id_clinica=$1 ORDER BY fecha_solicitud DESC LIMIT 1", [clinica.id])).rows[0];
    assert.equal(almacenada.datos_ficha.datos_nuevos.municipio_clave, "20001");
    assert.equal((await pool.query("SELECT municipio_clave FROM clinicas WHERE id_clinica=$1", [clinica.id])).rows[0].municipio_clave, "20067");
  } finally { await pool.end(); }
});
