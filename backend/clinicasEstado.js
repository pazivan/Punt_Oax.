/**
 * Estado operativo de una clínica.
 *
 * La ficha y el perfil siguen disponibles para cualquier clínica autenticada,
 * pero las funciones de operación (citas, agenda y edición de datos publicados)
 * solo se habilitan cuando la clínica fue aprobada por administración.
 */

const ESTADOS_OPERATIVOS = ["aprobada"];

function esEstadoOperativo(estado) {
  return ESTADOS_OPERATIVOS.includes(estado);
}

async function consultarEstadoClinica(db, idClinica) {
  const { rows } = await db.query(
    "SELECT estado_publicacion FROM clinicas WHERE id_clinica = $1",
    [idClinica]
  );
  return rows[0]?.estado_publicacion || null;
}

async function clinicaOperativa(db, idClinica) {
  return esEstadoOperativo(await consultarEstadoClinica(db, idClinica));
}

function respuestaNoAprobada(estado) {
  return {
    error: "Tu clínica aún no está aprobada. Completa y envía tu postulación para habilitar esta función.",
    codigo: "CLINICA_NO_APROBADA",
    estado_publicacion: estado,
  };
}

module.exports = {
  ESTADOS_OPERATIVOS,
  esEstadoOperativo,
  consultarEstadoClinica,
  clinicaOperativa,
  respuestaNoAprobada,
};
