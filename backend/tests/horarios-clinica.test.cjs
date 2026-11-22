const test = require("node:test");
const assert = require("node:assert/strict");
const {
  registrarRutasAgendaClinica,
  normalizarHora,
  validarFranjaHorario,
  franjasSeSolapan,
} = require("../agendaClinica");

const autenticarToken = function autenticarToken() {};
const requerirRol = (roles) => Object.assign(function rol() {}, { roles });

function appFalsa() {
  const rutas = {};
  const agregar = (metodo) => (ruta, ...manejadores) => {
    rutas[`${metodo} ${ruta}`] = manejadores;
  };
  return {
    rutas,
    get: agregar("GET"),
    post: agregar("POST"),
    put: agregar("PUT"),
    patch: agregar("PATCH"),
    delete: agregar("DELETE"),
  };
}

function resFalsa() {
  return {
    codigo: null,
    cuerpo: null,
    status(c) {
      this.codigo = c;
      return this;
    },
    json(b) {
      this.cuerpo = b;
      return this;
    },
  };
}

test("todas las rutas de horarios exigen token y rol clinica", () => {
  const app = appFalsa();
  registrarRutasAgendaClinica(app, { pool: {}, autenticarToken, requerirRol });

  const rutasHorarios = [
    "GET /api/clinicas/mi-agenda/horarios",
    "POST /api/clinicas/mi-agenda/horarios",
    "PUT /api/clinicas/mi-agenda/horarios",
    "PUT /api/clinicas/mi-agenda/horarios/:id",
    "DELETE /api/clinicas/mi-agenda/horarios/:id",
  ];

  for (const ruta of rutasHorarios) {
    assert.ok(app.rutas[ruta], `Debe registrar ${ruta}`);
    const [primero, segundo] = app.rutas[ruta];
    assert.equal(primero, autenticarToken, `${ruta} debe pedir token`);
    assert.deepEqual(segundo.roles, ["clinica"], `${ruta} debe exigir rol clinica`);
  }
});

test("validarFranjaHorario acepta alias del formulario y rechaza valores invalidos", () => {
  assert.equal(normalizarHora("08:30:00"), "08:30");
  assert.equal(normalizarHora("25:00"), null);

  const okAlias = validarFranjaHorario({
    dia_semana: "1",
    hora_apertura: "09:00:00",
    hora_cierre: "17:00",
  });
  assert.deepEqual(okAlias.franja, {
    dia_semana: 1,
    apertura: "09:00",
    cierre: "17:00",
    es_24_horas: false,
  });

  const ok24h = validarFranjaHorario({ dia_semana: 6, es_24_horas: true });
  assert.deepEqual(ok24h.franja, {
    dia_semana: 6,
    apertura: "00:00",
    cierre: "00:00",
    es_24_horas: true,
  });

  assert.ok(validarFranjaHorario({ dia_semana: 7, apertura: "09:00", cierre: "17:00" }).error);
  assert.ok(validarFranjaHorario({ dia_semana: 1, apertura: "18:00", cierre: "09:00" }).error);
  assert.ok(validarFranjaHorario({ dia_semana: 1, apertura: "09:00", cierre: "09:00" }).error);
});

test("franjasSeSolapan detecta traslapes reales y permite franjas contiguas", () => {
  const manana = { dia_semana: 1, apertura: "08:00", cierre: "13:00", es_24_horas: false };
  const tardeContigua = { dia_semana: 1, apertura: "13:00", cierre: "17:00", es_24_horas: false };
  const traslape = { dia_semana: 1, apertura: "12:30", cierre: "16:00", es_24_horas: false };
  const otroDia = { dia_semana: 2, apertura: "09:00", cierre: "12:00", es_24_horas: false };
  const todoElDia = { dia_semana: 1, apertura: "00:00", cierre: "00:00", es_24_horas: true };

  assert.equal(franjasSeSolapan(manana, tardeContigua), false);
  assert.equal(franjasSeSolapan(manana, otroDia), false);
  assert.equal(franjasSeSolapan(manana, traslape), true);
  assert.equal(franjasSeSolapan(manana, todoElDia), true);
});

test("POST /api/clinicas/mi-agenda/horarios guarda un horario nuevo con id_clinica del JWT", async () => {
  const app = appFalsa();
  const idClinica = "11111111-1111-4111-8111-111111111111";
  const idAjeno = "99999999-9999-4999-8999-999999999999";
  const paramsRegistrados = [];

  const cliente = {
    async query(sql, params = []) {
      paramsRegistrados.push(params);
      if (/FROM clinicas WHERE id_clinica/.test(sql)) {
        return { rows: [{ estado_publicacion: "aprobada" }] };
      }
      if (/FROM horarios_atencion WHERE id_clinica/.test(sql)) {
        return {
          rows: [{ id_horario: "h1", dia_semana: 1, apertura: "08:00", cierre: "12:00", es_24_horas: false }],
        };
      }
      if (/INSERT INTO horarios_atencion/.test(sql)) {
        return {
          rows: [{
            id_horario: "22222222-2222-4222-8222-222222222222",
            dia_semana: 1,
            apertura: "14:00",
            cierre: "18:00",
            es_24_horas: false,
            cruza_medianoche: false,
          }],
        };
      }
      return { rows: [] };
    },
    release() {},
  };

  registrarRutasAgendaClinica(app, {
    pool: { connect: async () => cliente },
    autenticarToken,
    requerirRol,
  });

  const res = resFalsa();
  await app.rutas["POST /api/clinicas/mi-agenda/horarios"].at(-1)(
    {
      usuario: { id: idClinica, rol: "clinica" },
      body: { id_clinica: idAjeno, dia_semana: 1, hora_apertura: "14:00", hora_cierre: "18:00" },
    },
    res
  );

  assert.equal(res.codigo, 201);
  assert.equal(res.cuerpo.horario.id_horario, "22222222-2222-4222-8222-222222222222");
  assert.ok(!paramsRegistrados.flat().includes(idAjeno), "Nunca debe usar id_clinica del body");
});

test("POST /api/clinicas/mi-agenda/horarios rechaza traslape con 409", async () => {
  const app = appFalsa();
  const cliente = {
    async query(sql) {
      if (/FROM clinicas WHERE id_clinica/.test(sql)) return { rows: [{ estado_publicacion: "aprobada" }] };
      if (/FROM horarios_atencion WHERE id_clinica/.test(sql)) {
        return {
          rows: [{ id_horario: "h1", dia_semana: 2, apertura: "09:00", cierre: "14:00", es_24_horas: false }],
        };
      }
      return { rows: [] };
    },
    release() {},
  };
  registrarRutasAgendaClinica(app, { pool: { connect: async () => cliente }, autenticarToken, requerirRol });

  const res = resFalsa();
  await app.rutas["POST /api/clinicas/mi-agenda/horarios"].at(-1)(
    { usuario: { id: "c1" }, body: { dia_semana: 2, apertura: "13:00", cierre: "17:00" } },
    res
  );

  assert.equal(res.codigo, 409);
});

test("PUT /api/clinicas/mi-agenda/horarios/:id actualiza horario propio y deshabilita cupos fuera de rango", async () => {
  const app = appFalsa();
  const idHorario = "33333333-3333-4333-8333-333333333333";
  const cliente = {
    async query(sql) {
      if (/FROM clinicas WHERE id_clinica/.test(sql)) return { rows: [{ estado_publicacion: "aprobada" }] };
      if (/FROM horarios_atencion WHERE id_clinica/.test(sql)) {
        return {
          rows: [{ id_horario: idHorario, dia_semana: 3, apertura: "08:00", cierre: "16:00", es_24_horas: false }],
        };
      }
      if (/UPDATE horarios_atencion/.test(sql)) {
        return {
          rows: [{ id_horario: idHorario, dia_semana: 3, apertura: "09:00", cierre: "14:00", es_24_horas: false, cruza_medianoche: false }],
        };
      }
      if (/UPDATE espacios_disponibles/.test(sql)) {
        return { rows: [{ id_espacio: "e1" }, { id_espacio: "e2" }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  registrarRutasAgendaClinica(app, { pool: { connect: async () => cliente }, autenticarToken, requerirRol });

  const res = resFalsa();
  await app.rutas["PUT /api/clinicas/mi-agenda/horarios/:id"].at(-1)(
    {
      usuario: { id: "c1" },
      params: { id: idHorario },
      body: { dia_semana: 3, apertura: "09:00", cierre: "14:00" },
    },
    res
  );

  assert.equal(res.codigo, 200);
  assert.equal(res.cuerpo.cupos_deshabilitados, 2);
  assert.equal(res.cuerpo.horario.apertura, "09:00");
});

test("PUT /api/clinicas/mi-agenda/horarios/:id valida UUID y pertenencia", async () => {
  const app = appFalsa();
  const idOtro = "44444444-4444-4444-8444-444444444444";
  const cliente = {
    async query(sql) {
      if (/FROM clinicas WHERE id_clinica/.test(sql)) return { rows: [{ estado_publicacion: "aprobada" }] };
      if (/FROM horarios_atencion WHERE id_clinica/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  };
  registrarRutasAgendaClinica(app, { pool: { connect: async () => cliente }, autenticarToken, requerirRol });
  const handler = app.rutas["PUT /api/clinicas/mi-agenda/horarios/:id"].at(-1);

  const resInvalido = resFalsa();
  await handler({ usuario: { id: "c1" }, params: { id: "no-uuid" }, body: { dia_semana: 1, apertura: "09:00", cierre: "12:00" } }, resInvalido);
  assert.equal(resInvalido.codigo, 400);

  const resNoEncontrado = resFalsa();
  await handler({ usuario: { id: "c1" }, params: { id: idOtro }, body: { dia_semana: 1, apertura: "09:00", cierre: "12:00" } }, resNoEncontrado);
  assert.equal(resNoEncontrado.codigo, 404);
});

test("DELETE /api/clinicas/mi-agenda/horarios/:id elimina horario y deshabilita cupos libres", async () => {
  const app = appFalsa();
  const idHorario = "55555555-5555-4555-8555-555555555555";
  const cliente = {
    async query(sql) {
      if (/FROM clinicas WHERE id_clinica/.test(sql)) return { rows: [{ estado_publicacion: "aprobada" }] };
      if (/DELETE FROM horarios_atencion/.test(sql)) return { rows: [{ id_horario: idHorario }] };
      if (/UPDATE espacios_disponibles/.test(sql)) return { rows: [{ id_espacio: "e1" }] };
      return { rows: [] };
    },
    release() {},
  };
  registrarRutasAgendaClinica(app, { pool: { connect: async () => cliente }, autenticarToken, requerirRol });

  const res = resFalsa();
  await app.rutas["DELETE /api/clinicas/mi-agenda/horarios/:id"].at(-1)(
    { usuario: { id: "c1" }, params: { id: idHorario } },
    res
  );

  assert.equal(res.codigo, 200);
  assert.equal(res.cuerpo.cupos_deshabilitados, 1);
});

test("GET /api/clinicas/mi-agenda/horarios carga horarios guardados con metadatos para el panel y solo usa id del JWT", async () => {
  const app = appFalsa();
  const idClinica = "11111111-1111-4111-8111-111111111111";
  const idAjeno = "99999999-9999-4999-8999-999999999999";
  const paramsUsados = [];

  const pool = {
    async query(sql, params = []) {
      paramsUsados.push(params);
      if (/FROM clinicas WHERE id_clinica/.test(sql)) {
        return { rows: [{ estado_publicacion: "aprobada", horario_texto: "Lunes a viernes 09:00-17:00" }] };
      }
      if (/FROM horarios_atencion/.test(sql)) {
        return {
          rows: [
            {
              id_horario: "66666666-6666-4666-8666-666666666666",
              dia_semana: 1,
              apertura: "09:00",
              cierre: "17:00",
              es_24_horas: false,
              cruza_medianoche: false,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  registrarRutasAgendaClinica(app, { pool, autenticarToken, requerirRol });
  const res = resFalsa();
  await app.rutas["GET /api/clinicas/mi-agenda/horarios"].at(-1)(
    { usuario: { id: idClinica, rol: "clinica" }, query: { id_clinica: idAjeno } },
    res
  );

  assert.equal(res.codigo, 200);
  assert.equal(res.cuerpo.estado_publicacion, "aprobada");
  assert.equal(res.cuerpo.puede_editar_horarios, true);
  assert.equal(res.cuerpo.horario_texto, "Lunes a viernes 09:00-17:00");
  assert.equal(res.cuerpo.total, 1);
  assert.equal(res.cuerpo.maximo_franjas, 14);
  assert.equal(res.cuerpo.horarios[0].dia_nombre, "Lunes");
  assert.ok(!paramsUsados.flat().includes(idAjeno), "Nunca debe usar id_clinica de query");
});

test("GET /api/clinicas/mi-agenda/horarios responde 404 si la clinica no existe", async () => {
  const app = appFalsa();
  const pool = { async query() { return { rows: [] }; } };
  registrarRutasAgendaClinica(app, { pool, autenticarToken, requerirRol });

  const res = resFalsa();
  await app.rutas["GET /api/clinicas/mi-agenda/horarios"].at(-1)(
    { usuario: { id: "11111111-1111-4111-8111-111111111111", rol: "clinica" } },
    res
  );

  assert.equal(res.codigo, 404);
});
