#!/usr/bin/env node
// Importa únicamente registros seleccionados y verificados del archivo de Filtración.
// No genera coordenadas, servicios ni horarios que no estén respaldados por el CSV.
//
// Uso:
//   node scripts/importar-filtracion.js --archivo /ruta/filtracion.csv          (simulación)
//   node scripts/importar-filtracion.js --archivo /ruta/filtracion.csv --apply  (aplica)
//
// Cabeceras reconocidas (sin distinguir acentos ni mayúsculas):
//   id_origen, nombre, categoria/servicios, municipio, localidad, direccion, codigo_postal,
//   telefono, correo_contacto, sitio_web, descripcion, tipo_institucion, nivel_atencion,
//   horario, latitud, longitud, situacion_ubicacion, verificacion_datos, seleccionado,
//   fuente, ubicacion_maps, links_relacionados, region, datos_por_confirmar, requisitos,
//   costo, costo_texto, detalle_servicio, requiere_cita.

const fs = require("node:fs");
const path = require("node:path");
const pool = require("../db");

const CATEGORIAS_CANONICAS = ["ITS", "ILE"];
const CAMPOS_TEXTO = [
  "nombre", "descripcion", "tipo_institucion", "telefono", "correo_contacto",
  "sitio_web", "imagen_portada_url", "municipio", "localidad", "direccion",
  "codigo_postal", "region", "fuente_origen", "links_relacionados",
  "ubicacion_maps_url", "nivel_atencion", "datos_por_confirmar", "requisitos",
  "costo_texto", "detalle_servicio",
];
const SITUACIONES = new Set(["fija", "pendiente", "itinerante", "reubicacion"]);
const ALIAS = {
  id_origen: ["id_origen", "id", "id_registro", "id_filtracion", "clave"],
  nombre: ["nombre", "unidad_de_salud", "unidad_salud", "centro", "clinica"],
  categoria: ["categoria", "categorias", "tipo_servicio", "servicio_principal"],
  servicios: ["servicios", "servicio", "servicios_ofrecidos"],
  municipio: ["municipio"],
  localidad: ["localidad", "colonia"],
  direccion: ["direccion"],
  codigo_postal: ["codigo_postal", "cp"],
  telefono: ["telefono", "tel"],
  correo_contacto: ["correo_contacto", "correo_electronico", "correo", "email"],
  sitio_web: ["sitio_web", "pagina_web", "url"],
  imagen_portada_url: ["imagen_portada_url", "imagen"],
  descripcion: ["descripcion"],
  tipo_institucion: ["tipo_institucion", "tipo"],
  nivel_atencion: ["nivel_atencion", "nivel_de_atencion"],
  horario: ["horario", "horario_texto", "horario_de_atencion"],
  apertura: ["apertura", "hora_apertura"],
  cierre: ["cierre", "hora_cierre"],
  dias: ["dias", "dias_atencion", "dia_semana"],
  latitud: ["latitud", "lat"],
  longitud: ["longitud", "lng", "lon"],
  situacion_ubicacion: ["situacion_ubicacion", "situacion", "tipo_ubicacion"],
  verificacion_datos: ["verificacion_datos", "verificacion", "estado_verificacion"],
  seleccionado: ["seleccionado", "seleccion", "incluir", "importar"],
  fuente_origen: ["fuente_origen", "fuente"],
  ubicacion_maps_url: ["ubicacion_maps_url", "ubicacion_maps", "maps"],
  links_relacionados: ["links_relacionados", "links", "enlaces"],
  region: ["region"],
  datos_por_confirmar: ["datos_por_confirmar", "pendientes"],
  requisitos: ["requisitos"],
  costo: ["costo", "precio"],
  costo_texto: ["costo_texto"],
  detalle_servicio: ["detalle_servicio", "detalle"],
  requiere_cita: ["requiere_cita", "cita"],
};

function normalizarCabecera(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizarTexto(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function limpiar(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

function parsearCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = "";
  let entreComillas = false;

  for (let i = 0; i < texto.length; i += 1) {
    const caracter = texto[i];
    if (entreComillas) {
      if (caracter === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          entreComillas = false;
        }
      } else {
        campo += caracter;
      }
    } else if (caracter === '"') {
      entreComillas = true;
    } else if (caracter === ",") {
      fila.push(campo);
      campo = "";
    } else if (caracter === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else if (caracter !== "\r") {
      campo += caracter;
    }
  }

  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  return filas.filter((f) => f.some((valor) => limpiar(valor) !== ""));
}

function leerRegistros(texto) {
  const filas = parsearCSV(texto.replace(/^\uFEFF/, ""));
  if (filas.length < 2) return [];

  const cabeceras = filas[0].map(normalizarCabecera);
  const cabecerasSet = new Set(cabeceras);
  return filas.slice(1).map((fila, indice) => {
    const registro = { __linea: indice + 2, __cabeceras: cabecerasSet };
    cabeceras.forEach((cabecera, posicion) => {
      if (!cabecera) return;
      registro[cabecera] = limpiar(fila[posicion] ?? "");
    });
    return registro;
  }).filter((registro) =>
    Object.entries(registro).some(([clave, valor]) => !clave.startsWith("__") && valor !== "")
  );
}

function obtener(registro, campo) {
  for (const alias of ALIAS[campo] || [campo]) {
    if (registro[alias]) return registro[alias];
  }
  return "";
}

function esVerdadero(valor) {
  return new Set(["si", "sí", "1", "true", "x", "seleccionado", "seleccionada", "yes"])
    .has(normalizarTexto(valor));
}

function normalizarBoolean(valor, porDefecto = true) {
  const texto = normalizarTexto(valor);
  if (["si", "sí", "1", "true", "x", "requiere", "requerida"].includes(texto)) return true;
  if (["no", "0", "false", "sin cita", "no requiere"].includes(texto)) return false;
  return porDefecto;
}

function normalizarTipoInstitucion(valor) {
  const texto = normalizarTexto(valor);
  if (!texto) return null;
  if (texto.includes("privad")) return "privada";
  if (texto.includes("ong") || texto.includes("no gubernamental") || texto.includes("social")) return "ong";
  if (texto.includes("public") || texto.includes("gobierno") || texto.includes("secretaria")) return "publica";
  if (texto.includes("otra") || texto.includes("otro")) return "otra";
  return null;
}

function normalizarCodigoPostal(valor) {
  const texto = limpiar(valor);
  return /^\d{5}$/.test(texto) ? texto : null;
}

function numero(valor) {
  const texto = limpiar(valor).replace(/\s/g, "");
  if (!texto) return null;
  const normalizado = texto.includes(",") && !texto.includes(".")
    ? texto.replace(",", ".")
    : texto;
  const resultado = Number(normalizado);
  return Number.isFinite(resultado) ? resultado : null;
}

function coordenadas(registro) {
  let lat = numero(obtener(registro, "latitud"));
  let lng = numero(obtener(registro, "longitud"));
  if (lat === null || lng === null) {
    const maps = obtener(registro, "ubicacion_maps_url");
    if (maps) {
      const q = maps.match(/query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      const at = maps.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      if (q) {
        lat = Number(q[1]);
        lng = Number(q[2]);
      } else if (at) {
        lat = Number(at[1]);
        lng = Number(at[2]);
      }
    }
  }
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function categoriasDe(registro) {
  const texto = normalizarTexto(`${obtener(registro, "categoria")} ${obtener(registro, "servicios")}`);
  const categorias = new Set();
  if (/\bambos\b/.test(texto)) {
    categorias.add("ITS");
    categorias.add("ILE");
  }
  if (/\bits\b|\bvih\b|sifilis|hepatitis|\bvhc\b|\bvph\b|transmision sexual|prueba[s]? rapida[s]?/.test(texto)) {
    categorias.add("ITS");
  }
  if (/\bile\b|aborto|interrupcion|ameu|misoprostol|aspiracion/.test(texto)) {
    categorias.add("ILE");
  }
  return categorias;
}

function diasDesdeTexto(textoNormalizado) {
  if (/todos los dias|lunes a domingo|diario|24 horas|24 h/.test(textoNormalizado)) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  if (/lunes a viernes|lun(?:es)?\s*-\s*vie/.test(textoNormalizado)) return [1, 2, 3, 4, 5];
  if (/lunes a sabado|lun(?:es)?\s*-\s*sab/.test(textoNormalizado)) return [1, 2, 3, 4, 5, 6];
  if (/sabado y domingo|fines de semana|fin de semana|sab(?:ado)?\s*-\s*dom/.test(textoNormalizado)) {
    return [6, 0];
  }

  const dias = new Set();
  const nombres = [
    [1, "lunes"], [2, "martes"], [3, "miercoles"], [4, "jueves"],
    [5, "viernes"], [6, "sabado"], [0, "domingo"],
  ];
  for (const [numeroDia, nombre] of nombres) {
    if (textoNormalizado.includes(nombre)) dias.add(numeroDia);
  }

  const rango = textoNormalizado.match(/\b([0-6])\s*(?:-|a)\s*([0-6])\b/);
  if (rango) {
    const inicio = Number(rango[1]);
    const fin = Number(rango[2]);
    if (inicio <= fin) {
      for (let dia = inicio; dia <= fin; dia += 1) dias.add(dia);
    }
  }
  return [...dias].sort((a, b) => a - b);
}

function horaValida(hora, minuto, sufijo) {
  let horas = Number(hora);
  const minutos = Number(minuto || 0);
  if (sufijo === "pm" && horas < 12) horas += 12;
  if (sufijo === "am" && horas === 12) horas = 0;
  if (horas > 23 || minutos > 59) return null;
  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
}

function parsearHorario(registro) {
  const texto = obtener(registro, "horario");
  const diasTexto = normalizarTexto(obtener(registro, "dias"));
  const dias = diasDesdeTexto(normalizarTexto(`${diasTexto} ${texto}`));
  if (dias.length === 0) return [];

  if (/24\s*(?:h|horas|hrs)|siempre abierto/.test(normalizarTexto(texto))) {
    return dias.map((dia) => ({
      dia_semana: dia, apertura: "00:00", cierre: "00:00",
      es_24_horas: true, cruza_medianoche: false, texto_horario: texto,
    }));
  }

  const apertura = limpiar(obtener(registro, "apertura"));
  const cierre = limpiar(obtener(registro, "cierre"));
  let intervalos = [];

  if (apertura && cierre) {
    const inicio = apertura.match(/^(\d{1,2}):(\d{2})$/);
    const fin = cierre.match(/^(\d{1,2}):(\d{2})$/);
    if (inicio && fin) {
      intervalos.push({
        apertura: horaValida(inicio[1], inicio[2]),
        cierre: horaValida(fin[1], fin[2]),
      });
    }
  }

  if (intervalos.length === 0) {
    const patron = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|a|–|—)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/g;
    for (const coincidencia of normalizarTexto(texto).matchAll(patron)) {
      intervalos.push({
        apertura: horaValida(coincidencia[1], coincidencia[2], coincidencia[3]),
        cierre: horaValida(coincidencia[4], coincidencia[5], coincidencia[6]),
      });
    }
  }

  const horarios = [];
  for (const intervalo of intervalos) {
    if (!intervalo.apertura || !intervalo.cierre) continue;
    if (intervalo.apertura === intervalo.cierre) continue;
    for (const dia of dias) {
      horarios.push({
        dia_semana: dia,
        apertura: intervalo.apertura,
        cierre: intervalo.cierre,
        es_24_horas: false,
        cruza_medianoche: intervalo.apertura > intervalo.cierre,
        texto_horario: texto,
      });
    }
  }
  return horarios;
}

function validarFila(registro) {
  const idOrigen = limpiar(obtener(registro, "id_origen"));
  let nombre = limpiar(obtener(registro, "nombre"));
  const cabeceras = registro.__cabeceras || new Set();

  const tieneSeleccionado = [...(ALIAS.seleccionado || [])].some((alias) => cabeceras.has(alias));
  if (tieneSeleccionado && !esVerdadero(obtener(registro, "seleccionado"))) {
    return { ok: false, motivo: "no seleccionado" };
  }

  const tieneVerificacion = [...(ALIAS.verificacion_datos || [])].some((alias) => cabeceras.has(alias));
  const verificadoTexto = normalizarTexto(obtener(registro, "verificacion_datos"));
  if (tieneVerificacion && verificadoTexto !== "verificado") {
    return { ok: false, motivo: "verificación distinta de 'verificado'" };
  }

  if (!idOrigen) return { ok: false, motivo: "sin id_origen" };
  if (idOrigen.length > 50) return { ok: false, motivo: "id_origen mayor a 50 caracteres" };

  // Deducir nombre de unidad si no viene en columna específica (ej. catálogo ITS de COESIDA)
  if (!nombre) {
    const dir = limpiar(obtener(registro, "direccion"));
    if (/^(Casa de Salud[^-–—]*[-–—][^,]+)/i.test(dir)) {
      nombre = dir.match(/^(Casa de Salud[^-–—]*[-–—][^,]+)/i)[1].trim();
    } else if (/^(Consultorio Municipal)/i.test(dir)) {
      nombre = "Consultorio Municipal - Santa Cruz Xoxocotlán";
    } else if (/Centro ["“]Mujer, T[uú] Espacio["”]/i.test(dir)) {
      nombre = "Centro Mujer, Tú Espacio";
    } else {
      const paren = dir ? [...dir.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim()) : [];
      const nameParen = paren.find((p) =>
        !/^C\.?P\.?\s*\d+/i.test(p) &&
        !/A un costado/i.test(p) &&
        !/Unidad m[oó]vil/i.test(p) &&
        !/Calle Moctezuma/i.test(p) &&
        !/Servicio/i.test(p) &&
        !/Murgu[ií]a/i.test(p) &&
        !/Aviso/i.test(p) &&
        !/entre /i.test(p) &&
        p.length > 2
      );
      if (nameParen) {
        nombre = nameParen;
      } else if (idOrigen === "coesdia 1") {
        nombre = "Punto Fijo de Detección – Dirección de Sanidad";
      } else if (idOrigen) {
        nombre = `Punto de Detección (${idOrigen})`;
      }
    }
  }

  if (!nombre) return { ok: false, motivo: "sin nombre de la unidad" };
  if (nombre.length > 255) return { ok: false, motivo: "nombre mayor a 255 caracteres" };

  const categorias = categoriasDe(registro);
  if (categorias.size === 0) {
    return { ok: false, motivo: "sin servicio ITS/ILE identificable" };
  }

  const punto = coordenadas(registro);
  const situacionTexto = normalizarTexto(obtener(registro, "situacion_ubicacion"));
  let situacion = SITUACIONES.has(situacionTexto) ? situacionTexto : "pendiente";
  if (!punto) situacion = "pendiente";

  return {
    ok: true,
    datos: {
      id_origen: idOrigen,
      nombre,
      categorias,
      punto,
      situacion_ubicacion: situacion,
      verificacion_datos: "verificado",
      municipio: limpiar(obtener(registro, "municipio")) || null,
      localidad: limpiar(obtener(registro, "localidad")) || null,
      direccion: limpiar(obtener(registro, "direccion")) || null,
      codigo_postal: normalizarCodigoPostal(obtener(registro, "codigo_postal")),
      telefono: limpiar(obtener(registro, "telefono")).slice(0, 20) || null,
      correo_contacto: limpiar(obtener(registro, "correo_contacto")) || null,
      sitio_web: limpiar(obtener(registro, "sitio_web")) || null,
      imagen_portada_url: limpiar(obtener(registro, "imagen_portada_url")) || null,
      descripcion: limpiar(obtener(registro, "descripcion")) || null,
      tipo_institucion: normalizarTipoInstitucion(obtener(registro, "tipo_institucion")),
      nivel_atencion: limpiar(obtener(registro, "nivel_atencion")).slice(0, 50) || null,
      region: limpiar(obtener(registro, "region")).slice(0, 100) || null,
      fuente_origen: limpiar(obtener(registro, "fuente_origen")) || null,
      links_relacionados: limpiar(obtener(registro, "links_relacionados")) || null,
      ubicacion_maps_url: limpiar(obtener(registro, "ubicacion_maps_url")) || null,
      horario_texto: limpiar(obtener(registro, "horario")) || null,
      datos_por_confirmar: limpiar(obtener(registro, "datos_por_confirmar")) || null,
      requisitos: limpiar(obtener(registro, "requisitos")).slice(0, 2000) || null,
      costo: numero(obtener(registro, "costo")),
      costo_texto: limpiar(obtener(registro, "costo_texto")).slice(0, 100) || null,
      detalle_servicio: limpiar(obtener(registro, "detalle_servicio")).slice(0, 2000) || null,
      requiere_cita: normalizarBoolean(obtener(registro, "requiere_cita")),
      horarios: parsearHorario(registro),
      linea: registro.__linea,
    },
  };
}

function fusionar(destino, origen) {
  for (const campo of CAMPOS_TEXTO) {
    if (!destino[campo] && origen[campo]) destino[campo] = origen[campo];
  }
  for (const categoria of origen.categorias) destino.categorias.add(categoria);
  if (!destino.punto && origen.punto) destino.punto = origen.punto;
  if (destino.situacion_ubicacion === "pendiente" && origen.situacion_ubicacion !== "pendiente") {
    destino.situacion_ubicacion = origen.situacion_ubicacion;
  }
  if (origen.costo !== null && destino.costo === null) destino.costo = origen.costo;
  if (!destino.requisitos && origen.requisitos) destino.requisitos = origen.requisitos;

  const clavesHorario = new Set(destino.horarios.map((h) =>
    `${h.dia_semana}-${h.apertura}-${h.cierre}-${h.es_24_horas}`
  ));
  for (const horario of origen.horarios) {
    const clave = `${horario.dia_semana}-${horario.apertura}-${horario.cierre}-${horario.es_24_horas}`;
    if (!clavesHorario.has(clave)) {
      clavesHorario.add(clave);
      destino.horarios.push(horario);
    }
  }

  if (destino.links_relacionados && origen.links_relacionados) {
    const enlaces = new Set(
      `${destino.links_relacionados}\n${origen.links_relacionados}`
        .split(/[\n,]+/).map((enlace) => enlace.trim()).filter(Boolean)
    );
    destino.links_relacionados = [...enlaces].join("\n");
  }
}

async function obtenerServicios(client) {
  const { rows } = await client.query(`
    SELECT id_servicio, categoria, nombre
    FROM servicios
    WHERE activo = TRUE AND categoria = ANY($1::text[])
  `, [CATEGORIAS_CANONICAS]);

  const mapa = new Map(rows.map((fila) => [fila.categoria, fila]));
  const faltantes = CATEGORIAS_CANONICAS.filter((categoria) => !mapa.has(categoria));
  if (faltantes.length > 0) {
    throw new Error(`Faltan los servicios canónicos en la base: ${faltantes.join(", ")}. Aplica la migración 004.`);
  }
  return mapa;
}

function combinarEnlaces(actuales, nuevos) {
  const enlaces = new Set(
    `${actuales || ""}\n${nuevos || ""}`
      .split(/[\n,]+/).map((enlace) => enlace.trim()).filter(Boolean)
  );
  return enlaces.size > 0 ? [...enlaces].join("\n") : null;
}

async function buscarExistente(client, datos) {
  const porOrigen = await client.query(
    "SELECT id_clinica, id_origen, links_relacionados FROM clinicas WHERE id_origen = $1",
    [datos.id_origen]
  );
  if (porOrigen.rows.length === 1) return { fila: porOrigen.rows[0], tipo: "id_origen" };
  if (porOrigen.rows.length > 1) return { ambiguo: true, motivo: "id_origen repetido en la base" };

  const porNombre = await client.query(`
    SELECT id_clinica, id_origen, links_relacionados
    FROM clinicas
    WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))
      AND LOWER(TRIM(COALESCE(municipio, ''))) = LOWER(TRIM(COALESCE($2, '')))
  `, [datos.nombre, datos.municipio]);

  if (porNombre.rows.length === 1) {
    const fila = porNombre.rows[0];
    if (fila.id_origen && fila.id_origen !== datos.id_origen) {
      return { ambiguo: true, motivo: "mismo nombre y municipio con otro id_origen" };
    }
    return { fila, tipo: "nombre" };
  }
  if (porNombre.rows.length > 1) {
    return { ambiguo: true, motivo: "varias sedes con el mismo nombre y municipio" };
  }
  return null;
}

async function insertarClinica(client, datos) {
  const { rows } = await client.query(`
    INSERT INTO clinicas (
      nombre, descripcion, tipo_institucion, telefono, correo_contacto, sitio_web,
      imagen_portada_url, municipio, localidad, direccion, codigo_postal,
      id_origen, region, fuente_origen, links_relacionados, horario_texto,
      ubicacion_maps_url, nivel_atencion, situacion_ubicacion, verificacion_datos,
      datos_por_confirmar, estado_publicacion, ubicacion_geo
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21, 'aprobada',
      CASE WHEN $22::double precision IS NULL OR $23::double precision IS NULL
        THEN NULL
        ELSE ST_SetSRID(ST_MakePoint($23::double precision, $22::double precision), 4326)::geography
      END
    ) RETURNING id_clinica
  `, [
    datos.nombre, datos.descripcion, datos.tipo_institucion, datos.telefono,
    datos.correo_contacto, datos.sitio_web, datos.imagen_portada_url, datos.municipio,
    datos.localidad, datos.direccion, datos.codigo_postal, datos.id_origen,
    datos.region, datos.fuente_origen, datos.links_relacionados, datos.horario_texto,
    datos.ubicacion_maps_url, datos.nivel_atencion, datos.situacion_ubicacion,
    datos.verificacion_datos, datos.datos_por_confirmar,
    datos.punto?.lat ?? null, datos.punto?.lng ?? null,
  ]);
  return rows[0].id_clinica;
}

async function actualizarClinica(client, idClinica, datos) {
  await client.query(`
    UPDATE clinicas SET
      id_origen = $2,
      nombre = $3,
      descripcion = COALESCE($4, descripcion),
      tipo_institucion = COALESCE($5, tipo_institucion),
      telefono = COALESCE($6, telefono),
      correo_contacto = COALESCE($7, correo_contacto),
      sitio_web = COALESCE($8, sitio_web),
      imagen_portada_url = COALESCE($9, imagen_portada_url),
      municipio = COALESCE($10, municipio),
      localidad = COALESCE($11, localidad),
      direccion = COALESCE($12, direccion),
      codigo_postal = COALESCE($13, codigo_postal),
      region = COALESCE($14, region),
      fuente_origen = COALESCE($15, fuente_origen),
      links_relacionados = COALESCE($16, links_relacionados),
      horario_texto = COALESCE($17, horario_texto),
      ubicacion_maps_url = COALESCE($18, ubicacion_maps_url),
      nivel_atencion = COALESCE($19, nivel_atencion),
      situacion_ubicacion = CASE
        WHEN $20::varchar = 'pendiente' THEN situacion_ubicacion
        ELSE $20
      END,
      verificacion_datos = 'verificado',
      datos_por_confirmar = COALESCE($21, datos_por_confirmar),
      estado_publicacion = 'aprobada',
      ubicacion_geo = CASE
        WHEN $22::double precision IS NULL OR $23::double precision IS NULL THEN ubicacion_geo
        ELSE ST_SetSRID(ST_MakePoint($23::double precision, $22::double precision), 4326)::geography
      END
    WHERE id_clinica = $1
  `, [
    idClinica, datos.id_origen, datos.nombre, datos.descripcion, datos.tipo_institucion,
    datos.telefono, datos.correo_contacto, datos.sitio_web, datos.imagen_portada_url,
    datos.municipio, datos.localidad, datos.direccion, datos.codigo_postal, datos.region,
    datos.fuente_origen, datos.links_relacionados, datos.horario_texto,
    datos.ubicacion_maps_url, datos.nivel_atencion, datos.situacion_ubicacion,
    datos.datos_por_confirmar, datos.punto?.lat ?? null, datos.punto?.lng ?? null,
  ]);
}

async function guardarServicios(client, idClinica, datos, servicios) {
  let guardados = 0;
  for (const categoria of datos.categorias) {
    const servicio = servicios.get(categoria);
    await client.query(`
      INSERT INTO clinicas_servicios (
        id_clinica, id_servicio, requisitos, costo, costo_texto, detalle_servicio,
        requiere_cita, activo, id_origen
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
      ON CONFLICT (id_clinica, id_servicio) DO UPDATE SET
        activo = TRUE,
        requisitos = COALESCE(EXCLUDED.requisitos, clinicas_servicios.requisitos),
        costo = COALESCE(EXCLUDED.costo, clinicas_servicios.costo),
        costo_texto = COALESCE(EXCLUDED.costo_texto, clinicas_servicios.costo_texto),
        detalle_servicio = COALESCE(EXCLUDED.detalle_servicio, clinicas_servicios.detalle_servicio),
        requiere_cita = EXCLUDED.requiere_cita
    `, [
      idClinica, servicio.id_servicio, datos.requisitos, datos.costo, datos.costo_texto,
      datos.detalle_servicio, datos.requiere_cita, datos.id_origen,
    ]);
    guardados += 1;
  }
  return guardados;
}

async function guardarHorarios(client, idClinica, datos) {
  let guardados = 0;
  const vistos = new Set();
  for (const horario of datos.horarios) {
    const clave = `${horario.dia_semana}-${horario.apertura}-${horario.cierre}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const resultado = await client.query(`
      INSERT INTO horarios_atencion (
        id_clinica, dia_semana, hora_apertura, hora_cierre,
        es_24_horas, cruza_medianoche, texto_horario
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id_clinica, dia_semana, hora_apertura, hora_cierre) DO NOTHING
    `, [
      idClinica, horario.dia_semana, horario.apertura, horario.cierre,
      horario.es_24_horas, horario.cruza_medianoche, horario.texto_horario,
    ]);
    guardados += resultado.rowCount;
  }
  return guardados;
}

function imprimirAyuda() {
  console.log(`Uso: node scripts/importar-filtracion.js --archivo <ruta.csv> [--apply]

Por defecto solo simula y revierte la transacción. --apply confirma los cambios.
También se puede indicar la ruta con la variable FILTRACION_CSV.
Solo se importan filas marcadas como seleccionadas y con verificación "verificado".`);
}

async function procesarImportacion(registros, dbPool = pool, opciones = {}) {
  const aplicar = Boolean(opciones.aplicar);
  const omitidos = [];
  const centros = new Map();
  let seleccionadosVerificados = 0;
  let fusionados = 0;

  for (const registro of registros) {
    const validacion = validarFila(registro);
    if (!validacion.ok) {
      omitidos.push({ linea: registro.__linea, motivo: validacion.motivo });
      continue;
    }
    seleccionadosVerificados += 1;
    const datos = validacion.datos;
    if (centros.has(datos.id_origen)) {
      fusionar(centros.get(datos.id_origen), datos);
      fusionados += 1;
    } else {
      centros.set(datos.id_origen, datos);
    }
  }

  if (centros.size === 0) {
    return {
      ok: false,
      error: "No hay filas seleccionadas y verificadas con datos importables.",
      omitidos,
      resumen: { nuevos: 0, actualizados: 0, ambiguos: 0, servicios: 0, horarios: 0, sinCoordenadas: 0 },
      seleccionadosVerificados: 0,
      centrosUnicos: 0,
      fusionados: 0,
    };
  }

  const client = await dbPool.connect();
  const resumen = {
    nuevos: 0, actualizados: 0, ambiguos: 0,
    servicios: 0, horarios: 0, sinCoordenadas: 0,
  };

  try {
    await client.query("BEGIN");
    const servicios = await obtenerServicios(client);

    for (const datos of centros.values()) {
      if (!datos.punto) resumen.sinCoordenadas += 1;

      const existente = await buscarExistente(client, datos);
      if (existente?.ambiguo) {
        resumen.ambiguos += 1;
        omitidos.push({ linea: datos.linea, motivo: existente.motivo });
        continue;
      }

      let idClinica;
      if (existente) {
        idClinica = existente.fila.id_clinica;
        datos.links_relacionados = combinarEnlaces(
          existente.fila.links_relacionados,
          datos.links_relacionados
        );
        await actualizarClinica(client, idClinica, datos);
        resumen.actualizados += 1;
      } else {
        idClinica = await insertarClinica(client, datos);
        resumen.nuevos += 1;
      }

      resumen.servicios += await guardarServicios(client, idClinica, datos, servicios);
      resumen.horarios += await guardarHorarios(client, idClinica, datos);
    }

    if (aplicar) {
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }

    return {
      ok: true,
      aplicar,
      filasLeidas: registros.length,
      seleccionadosVerificados,
      centrosUnicos: centros.size,
      fusionados,
      resumen,
      omitidos,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const argumentos = process.argv.slice(2);
  if (argumentos.includes("--help") || argumentos.includes("-h")) {
    imprimirAyuda();
    return;
  }

  const indiceArchivo = argumentos.findIndex((arg) => arg === "--archivo" || arg === "--file");
  const archivo = (indiceArchivo >= 0 ? argumentos[indiceArchivo + 1] : null) ||
    process.env.FILTRACION_CSV;
  const aplicar = argumentos.includes("--apply") || argumentos.includes("--aplicar");

  if (!archivo) {
    imprimirAyuda();
    process.exitCode = 1;
    return;
  }

  const ruta = path.resolve(archivo);
  if (!fs.existsSync(ruta)) {
    console.error(`No existe el archivo de Filtración: ${ruta}`);
    process.exitCode = 1;
    return;
  }

  const registros = leerRegistros(fs.readFileSync(ruta, "utf8"));
  if (registros.length === 0) {
    console.error("El archivo no contiene filas de datos.");
    process.exitCode = 1;
    return;
  }

  const resultado = await procesarImportacion(registros, pool, { aplicar });

  if (!resultado.ok) {
    console.error(resultado.error);
    for (const omitido of resultado.omitidos.slice(0, 20)) {
      console.error(`  Línea ${omitido.linea}: ${omitido.motivo}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`${aplicar ? "Importación aplicada" : "Simulación (sin cambios; usa --apply para aplicar)"}`);
  console.log(`Filas leídas: ${resultado.filasLeidas}`);
  console.log(`Filas seleccionadas y verificadas: ${resultado.seleccionadosVerificados}`);
  console.log(`Centros únicos: ${resultado.centrosUnicos} (${resultado.fusionados} filas duplicadas fusionadas)`);
  console.log(`Centros nuevos: ${resultado.resumen.nuevos}`);
  console.log(`Centros actualizados: ${resultado.resumen.actualizados}`);
  console.log(`Centros ambiguos no importados: ${resultado.resumen.ambiguos}`);
  console.log(`Servicios asignados: ${resultado.resumen.servicios}`);
  console.log(`Franjas horarias guardadas: ${resultado.resumen.horarios}`);
  console.log(`Centros sin coordenadas (no se dibujan en el mapa): ${resultado.resumen.sinCoordenadas}`);
  console.log(`Filas omitidas: ${resultado.omitidos.length}`);
  for (const omitido of resultado.omitidos.slice(0, 20)) {
    console.log(`  Línea ${omitido.linea}: ${omitido.motivo}`);
  }
  if (resultado.omitidos.length > 20) {
    console.log(`  ... y ${resultado.omitidos.length - 20} más`);
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Error al importar: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = {
  CATEGORIAS_CANONICAS,
  CAMPOS_TEXTO,
  ALIAS,
  normalizarCabecera,
  normalizarTexto,
  parsearCSV,
  leerRegistros,
  validarFila,
  fusionar,
  categoriasDe,
  coordenadas,
  diasDesdeTexto,
  parsearHorario,
  combinarEnlaces,
  insertarClinica,
  actualizarClinica,
  guardarServicios,
  guardarHorarios,
  procesarImportacion,
  main,
};
