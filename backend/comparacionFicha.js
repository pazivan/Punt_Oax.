const { validarCoordenadas } = require("./ubicacion");
const { validarMunicipioEntrada } = require("../frontend/src/utils/municipios.mjs");

const ETIQUETAS_TIPO = {
  publica: "Institución pública",
  privada: "Clínica privada",
  ong: "Organización social (ONG)",
  otra: "Otra institución",
};

const ETIQUETAS_AREA = {
  its: "Detección de ITS",
  ile: "Interrupción Legal del Embarazo (ILE)",
};

const TIPOS_INSTITUCION = new Set(Object.keys(ETIQUETAS_TIPO));

function normalizarTexto(valor) {
  if (typeof valor !== "string") return "";
  return valor.trim().replace(/\s+/g, " ");
}

function normalizarCoord(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Calcula y valida en el servidor los cambios reales que requieren revisión
 * administrativa comparando la ficha aprobada en BD contra lo solicitado.
 */
function calcularCambiosRevisionServidor(fichaActual, body) {
  const errores = {};
  const cambios = [];
  const datosAnteriores = {};
  const datosNuevos = {};

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { errores: { cuerpo: "Envía los datos a actualizar." }, cambios, datosAnteriores, datosNuevos };
  }

  const clinica = fichaActual.clinica || {};
  const tiene = (campo) => Object.hasOwn(body, campo);

  const revisarCampoTexto = (campo, etiqueta, max, validar, msgError, formateador = (v) => v || "No especificado") => {
    if (!tiene(campo)) return;
    const raw = body[campo];
    if (raw !== null && raw !== undefined && typeof raw !== "string") {
      errores[campo] = "Debe ser texto.";
      return;
    }
    const nuevo = normalizarTexto(raw || "");
    if (nuevo && nuevo.length > max) {
      errores[campo] = `No puede superar los ${max} caracteres.`;
      return;
    }
    if (nuevo && validar && !validar(nuevo)) {
      errores[campo] = msgError;
      return;
    }
    const anterior = normalizarTexto(clinica[campo] || "");
    if (anterior !== nuevo) {
      cambios.push({
        campo,
        etiqueta,
        valor_anterior: formateador(anterior),
        valor_nuevo: formateador(nuevo),
      });
      datosAnteriores[campo] = anterior || null;
      datosNuevos[campo] = nuevo || null;
    }
  };

  if (tiene("nombre")) {
    const nuevoNombre = normalizarTexto(typeof body.nombre === "string" ? body.nombre : "");
    if (!nuevoNombre) {
      errores.nombre = "El nombre institucional es obligatorio.";
    } else {
      revisarCampoTexto("nombre", "Nombre institucional", 255);
    }
  }

  revisarCampoTexto(
    "tipo_institucion",
    "Tipo de institución",
    30,
    (v) => TIPOS_INSTITUCION.has(v),
    "Selecciona un tipo de institución válido.",
    (v) => ETIQUETAS_TIPO[v] || v || "No especificado"
  );
  const municipio = validarMunicipioEntrada(body);
  if (municipio.error) errores.municipio = municipio.error;
  else if (municipio.municipio) {
    body = { ...body, municipio: municipio.municipio };
    revisarCampoTexto("municipio", "Municipio", 100);
    if (municipio.municipio_clave !== clinica.municipio_clave) {
      if (!datosNuevos.municipio) {
        cambios.push({ campo: "municipio_clave", etiqueta: "Clave de municipio INEGI",
          valor_anterior: clinica.municipio_clave || "Sin clave", valor_nuevo: municipio.municipio_clave });
      }
      datosAnteriores.municipio_clave = clinica.municipio_clave || null;
      datosNuevos.municipio_clave = municipio.municipio_clave;
      datosNuevos.municipio = municipio.municipio;
    }
  }
  revisarCampoTexto("codigo_postal", "Código postal", 5, (v) => /^\d{5}$/.test(v), "El código postal debe tener 5 dígitos.");
  revisarCampoTexto("direccion", "Dirección", 500);

  let ubicacionSolicitada = null;
  if (tiene("latitud") || tiene("longitud")) {
    if (!tiene("latitud") || !tiene("longitud")) {
      errores.ubicacion = "Envía latitud y longitud juntas.";
    } else {
      const coords = validarCoordenadas(body.latitud, body.longitud);
      if (coords.error) {
        errores.ubicacion = coords.error;
      } else {
        const latBase = normalizarCoord(clinica.latitud);
        const lngBase = normalizarCoord(clinica.longitud);
        if (latBase !== coords.latitud || lngBase !== coords.longitud) {
          ubicacionSolicitada = coords;
          cambios.push({
            campo: "ubicacion",
            etiqueta: "Ubicación geográfica (coordenadas)",
            valor_anterior: latBase !== null && lngBase !== null ? `${latBase.toFixed(6)}, ${lngBase.toFixed(6)}` : "Sin ubicación previa",
            valor_nuevo: `${coords.latitud.toFixed(6)}, ${coords.longitud.toFixed(6)}`,
          });
          datosAnteriores.ubicacion = latBase !== null && lngBase !== null ? { latitud: latBase, longitud: lngBase } : null;
          datosNuevos.ubicacion = coords;
        }
      }
    }
  }

  if (tiene("areas_servicio")) {
    if (!Array.isArray(body.areas_servicio) || body.areas_servicio.length === 0 ||
        body.areas_servicio.some((c) => !Object.hasOwn(ETIQUETAS_AREA, c))) {
      errores.areas_servicio = "Selecciona al menos un área válida (ITS o ILE).";
    } else {
      const nuevasAreas = [...new Set(body.areas_servicio)].sort();
      const actualesAreas = [...new Set((fichaActual.servicios || []).map((s) => String(s.categoria || "").trim().toLowerCase()).filter((c) => Object.hasOwn(ETIQUETAS_AREA, c)))].sort();
      if (JSON.stringify(actualesAreas) !== JSON.stringify(nuevasAreas)) {
        cambios.push({
          campo: "areas_servicio",
          etiqueta: "Áreas de atención (ITS / ILE)",
          valor_anterior: actualesAreas.map((c) => ETIQUETAS_AREA[c]).join(", ") || "Sin áreas",
          valor_nuevo: nuevasAreas.map((c) => ETIQUETAS_AREA[c]).join(", "),
        });
        datosAnteriores.areas_servicio = actualesAreas;
        datosNuevos.areas_servicio = nuevasAreas;
      }
    }
  }

  return {
    errores,
    cambios,
    datosAnteriores,
    datosNuevos,
    ubicacionSolicitada,
  };
}

module.exports = {
  calcularCambiosRevisionServidor,
  ETIQUETAS_AREA,
};
