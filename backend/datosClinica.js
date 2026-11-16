/**
 * Datos de una clínica ya publicada (Sprint 7 · Kelly · issue #65)
 *
 * PUT /api/clinicas/mi-ficha solo permite editar mientras la clínica está en
 * borrador o rechazada. Una vez aprobada, la ficha queda bloqueada. Este módulo
 * permite que el panel de la clínica consulte y actualice los datos de contacto
 * y el detalle de sus servicios SIN volver a pasar por revisión:
 *
 *   GET   /api/clinicas/mi-ficha/datos-publicados   consultar
 *   PATCH /api/clinicas/mi-ficha/datos-publicados   actualizar
 *
 * Se pueden cambiar: telefono, correo_contacto, sitio_web, descripcion y, de los
 * servicios que la clínica YA ofrece: detalle_servicio, costo, costo_texto,
 * requisitos y requiere_cita.
 *
 * No se pueden cambiar aquí (necesitan revisión del administrador): nombre,
 * dirección, ubicación, tipo de institución, agregar o quitar servicios.
 * Los horarios se manejan en las rutas de Iván (#71 y #72).
 *
 * La clínica se identifica SIEMPRE con el token (req.usuario.id).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const { MENSAJE_TELEFONO, validarTelefono } = require("./validacionesRegistro");
const REGEX_CORREO = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const ESTADOS_PUBLICADOS = ["aprobada", "suspendida"];
const CAMPOS_CLINICA = ["telefono", "correo_contacto", "sitio_web", "descripcion"];
const CAMPOS_SERVICIO = ["detalle_servicio", "costo", "costo_texto", "requisitos", "requiere_cita"];

const respuesta = (status, body) => ({ status, body });
const esUrl = (v) => {
  try { return ["http:", "https:"].includes(new URL(v).protocol); } catch { return false; }
};

async function enTransaccion(pool, trabajo) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const resultado = await trabajo(client);
    await client.query(resultado.status < 400 ? "COMMIT" : "ROLLBACK");
    return resultado;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Texto opcional: "" o null borran el valor; si viene, se valida longitud y formato.
function textoOpcional(valor, max, validar, mensaje) {
  if (valor === null || valor === "") return { valor: null };
  if (typeof valor !== "string") return { error: "Debe ser texto." };
  const limpio = valor.trim();
  if (!limpio) return { valor: null };
  if (limpio.length > max) return { error: `No puede superar los ${max} caracteres.` };
  if (validar && !validar(limpio)) return { error: mensaje };
  return { valor: limpio };
}

const REGLAS_CLINICA = {
  telefono: (v) => textoOpcional(v, 20, (t) => !validarTelefono(t),
    MENSAJE_TELEFONO),
  correo_contacto: (v) => textoOpcional(v, 255, (t) => REGEX_CORREO.test(t),
    "El correo de contacto no es válido."),
  sitio_web: (v) => textoOpcional(v, 1000, esUrl, "El sitio web debe iniciar con http:// o https://."),
  descripcion: (v) => textoOpcional(v, 2000),
};

const REGLAS_SERVICIO = {
  detalle_servicio: (v) => textoOpcional(v, 2000),
  costo_texto: (v) => textoOpcional(v, 100),
  requisitos: (v) => textoOpcional(v, 2000),
  costo: (v) => {
    if (v === null || v === "") return { valor: null };
    const numero = typeof v === "string" ? Number(v.trim()) : v;
    if (typeof numero !== "number" || !Number.isFinite(numero) || numero < 0 || numero > 99999999) {
      return { error: "El costo debe ser un número mayor o igual a 0." };
    }
    return { valor: Math.round(numero * 100) / 100 };
  },
  requiere_cita: (v) => (typeof v === "boolean" ? { valor: v } : { error: "Debe ser verdadero o falso." }),
};

// Valida el cuerpo completo y devuelve los cambios limpios o la lista de errores por campo.
function validarCambios(body) {
  const errores = {};
  const clinica = {};
  const servicios = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { errores: { cuerpo: "Envía un objeto con los campos a actualizar." } };
  }
  for (const campo of Object.keys(body)) {
    if (campo === "servicios") continue;
    if (!CAMPOS_CLINICA.includes(campo)) {
      errores[campo] = "Este dato no se puede cambiar desde el panel; requiere revisión del administrador.";
      continue;
    }
    const r = REGLAS_CLINICA[campo](body[campo]);
    if (r.error) errores[campo] = r.error; else clinica[campo] = r.valor;
  }

  if (Object.hasOwn(body, "servicios")) {
    if (!Array.isArray(body.servicios) || body.servicios.length > 20) {
      errores.servicios = "Los servicios deben enviarse como una lista.";
    } else {
      const vistos = new Set();
      body.servicios.forEach((item, i) => {
        const clave = `servicios[${i}]`;
        if (!item || typeof item !== "object" || Array.isArray(item) || !UUID_RE.test(item.id_servicio || "")) {
          errores[clave] = "Cada servicio debe indicar un id_servicio válido.";
          return;
        }
        if (vistos.has(item.id_servicio)) {
          errores[clave] = "No repitas el mismo servicio.";
          return;
        }
        vistos.add(item.id_servicio);
        const cambios = {};
        for (const campo of Object.keys(item)) {
          if (campo === "id_servicio") continue;
          if (!CAMPOS_SERVICIO.includes(campo)) {
            errores[`${clave}.${campo}`] = "Este dato del servicio no se puede cambiar.";
            continue;
          }
          const r = REGLAS_SERVICIO[campo](item[campo]);
          if (r.error) errores[`${clave}.${campo}`] = r.error; else cambios[campo] = r.valor;
        }
        if (Object.keys(cambios).length) servicios.push({ id_servicio: item.id_servicio, cambios });
      });
    }
  }
  if (!Object.keys(errores).length && !Object.keys(clinica).length && !servicios.length) {
    errores.cuerpo = "No enviaste ningún dato para actualizar.";
  }
  return { errores, clinica, servicios };
}

async function consultarDatosPublicados(db, idClinica) {
  const { rows } = await db.query(
    `SELECT id_clinica, nombre, estado_publicacion, telefono, correo_contacto, sitio_web, descripcion,
            municipio, direccion
     FROM clinicas WHERE id_clinica = $1`,
    [idClinica]
  );
  const clinica = rows[0];
  if (!clinica) return respuesta(404, { error: "No se encontró tu clínica." });
  const servicios = await db.query(
    `SELECT s.id_servicio, s.nombre, s.categoria, cs.detalle_servicio, cs.costo, cs.costo_texto,
            cs.requisitos, cs.requiere_cita
     FROM clinicas_servicios cs
     INNER JOIN servicios s ON s.id_servicio = cs.id_servicio
     WHERE cs.id_clinica = $1 AND cs.activo = TRUE AND s.activo = TRUE
     ORDER BY s.nombre`,
    [idClinica]
  );
  return respuesta(200, {
    clinica: { ...clinica, puede_editar_datos: ESTADOS_PUBLICADOS.includes(clinica.estado_publicacion) },
    servicios: servicios.rows.map((s) => ({ ...s, costo: s.costo === null ? null : Number(s.costo) })),
  });
}

async function actualizarDatosPublicados(pool, idClinica, body) {
  const { errores, clinica, servicios } = validarCambios(body);
  if (Object.keys(errores).length) {
    return respuesta(400, { error: "Revisa los campos marcados.", campos: errores });
  }
  return enTransaccion(pool, async (db) => {
    const { rows } = await db.query(
      "SELECT estado_publicacion FROM clinicas WHERE id_clinica = $1 FOR UPDATE",
      [idClinica]
    );
    if (!rows[0]) return respuesta(404, { error: "No se encontró tu clínica." });
    if (!ESTADOS_PUBLICADOS.includes(rows[0].estado_publicacion)) {
      return respuesta(409, {
        error: "Tu clínica aún no está publicada. Mientras tanto edita tu ficha con PUT /api/clinicas/mi-ficha.",
      });
    }

    const columnas = Object.keys(clinica);
    if (columnas.length) {
      const asignaciones = columnas.map((c, i) => `${c} = $${i + 1}`);
      await db.query(
        `UPDATE clinicas SET ${asignaciones.join(", ")} WHERE id_clinica = $${columnas.length + 1}`,
        [...columnas.map((c) => clinica[c]), idClinica]
      );
    }

    for (const { id_servicio: idServicio, cambios } of servicios) {
      const campos = Object.keys(cambios);
      const asignaciones = campos.map((c, i) => `${c} = $${i + 1}`);
      const actualizado = await db.query(
        `UPDATE clinicas_servicios SET ${asignaciones.join(", ")}
         WHERE id_clinica = $${campos.length + 1} AND id_servicio = $${campos.length + 2} AND activo = TRUE
         RETURNING id_clinica_servicio`,
        [...campos.map((c) => cambios[c]), idClinica, idServicio]
      );
      if (!actualizado.rows.length) {
        return respuesta(400, {
          error: "Uno de los servicios no pertenece a tu clínica. Para agregar un servicio nuevo se necesita revisión.",
          campos: { servicios: idServicio },
        });
      }
    }

    const datos = await consultarDatosPublicados(db, idClinica);
    return respuesta(200, { mensaje: "Datos de tu clínica actualizados.", ...datos.body });
  });
}

function registrarRutasDatosClinica(app, { pool, autenticarToken, requerirRol }) {
  const soloClinica = [autenticarToken, requerirRol(["clinica"])];
  const manejar = (etiqueta, accion) => async (req, res) => {
    try {
      const { status, body } = await accion(req);
      return res.status(status).json(body);
    } catch (error) {
      console.error(`Error al ${etiqueta}:`, error.message);
      return res.status(500).json({ error: `No se pudo ${etiqueta}.` });
    }
  };

  app.get("/api/clinicas/mi-ficha/datos-publicados", ...soloClinica,
    manejar("consultar los datos de tu clínica", (req) => consultarDatosPublicados(pool, req.usuario.id)));

  app.patch("/api/clinicas/mi-ficha/datos-publicados", ...soloClinica,
    manejar("actualizar los datos de tu clínica", (req) =>
      actualizarDatosPublicados(pool, req.usuario.id, req.body)));
}

module.exports = {
  registrarRutasDatosClinica,
  consultarDatosPublicados,
  actualizarDatosPublicados,
  validarCambios,
};
