/**
 * Datos de demostración identificados temporalmente hasta que Miguel conecte la API real.
 *
 * Incluye los centros de referencia del diseño de Figma (ventanas Mapa y Detalle de centro)
 * y respeta las reglas del equipo:
 * - Una sede que ofrece varios servicios se mantiene en un solo registro sin duplicarse.
 * - No se inventan ubicaciones ni datos faltantes.
 */

export const MODO_DEMOSTRACION_ACTIVO = true;

export const CLINICAS_DEMO = [
  {
    id_clinica: 'demo-sanidad-oaxaca',
    nombre: 'Punto Fijo de Detección – Dirección de Sanidad',
    etiqueta_ubicacion: 'Oaxaca de Juárez · Centro',
    subtitulo_region: 'Oaxaca de Juárez · Oaxaca y zona metropolitana',
    municipio: 'Oaxaca de Juárez',
    direccion: 'Mártires de Tacubaya 315, Col. Centro, Oaxaca de Juárez',
    direccion_corta: 'Mártires de Tacubaya 315, Col. Centro',
    categorias: ['ITS'],
    etiqueta_categoria: 'DETECCIÓN DE ITS',
    descripcion: 'Pruebas de VIH, sífilis y hepatitis C. Orientación y consejería asociada al servicio.',
    servicios: ['Pruebas rápidas', 'Consejería'],
    horario: 'Lun. a vie. · 09:00 - 13:00 h',
    horario_detalle: 'Lun. a vie., 09:00–10:30 y 11:30–13:00 h',
    costo: 'Gratuito',
    requisitos: 'Presentar CURP',
    telefono: '951 516 8365',
    nota_visita: 'Para las pruebas rápidas presenta tu CURP. Puedes acudir sin cita previa durante el horario de atención indicado.',
    etiqueta_visita: 'Atención confidencial',
    latitud: 17.0608,
    longitud: -96.7253,
    posicion_mapa: { left: '25%', top: '33.33%', variante: 'dark' },
    es_demostracion: true,
  },
  {
    id_clinica: 'demo-imedi-oaxaca',
    nombre: 'IMEDI',
    etiqueta_ubicacion: 'Oaxaca de Juárez · Reforma',
    subtitulo_region: 'Oaxaca de Juárez · Oaxaca y zona metropolitana',
    municipio: 'Oaxaca de Juárez',
    direccion: 'Col. Reforma, Oaxaca de Juárez, Oax.',
    direccion_corta: 'Col. Reforma, Oaxaca de Juárez',
    categorias: ['ITS', 'Aborto'],
    etiqueta_categoria: 'DETECCIÓN DE ITS E ILE',
    descripcion: 'Atención integral en salud sexual, detección de ITS y orientación médica confidencial.',
    servicios: ['Detección de ITS'],
    horario: null,
    horario_detalle: 'Previa cita',
    costo: 'Cuota accesible',
    requisitos: 'Identificación oficial',
    telefono: null,
    nota_visita: 'Comunícate previamente o agenda tu visita para confirmar disponibilidad de horario.',
    etiqueta_visita: 'Atención confidencial',
    latitud: 17.0782,
    longitud: -96.7124,
    posicion_mapa: { left: '50%', top: '50%', variante: 'green' },
    es_demostracion: true,
  },
  {
    id_clinica: 'demo-capasits-salina-cruz',
    nombre: 'CAPASITS – Salina Cruz',
    etiqueta_ubicacion: 'Istmo',
    subtitulo_region: 'Salina Cruz · Región del Istmo',
    municipio: 'Salina Cruz',
    direccion: 'Salina Cruz, Oax.',
    direccion_corta: 'Salina Cruz, Oaxaca',
    categorias: ['ITS'],
    etiqueta_categoria: 'DETECCIÓN DE ITS',
    descripcion: 'Centro especializado en prevención, detección y atención ambulatoria de VIH e ITS.',
    servicios: ['Detección de ITS'],
    horario: null,
    horario_detalle: 'Horario matutino de lunes a viernes',
    costo: 'Gratuito',
    requisitos: 'Presentar CURP',
    telefono: null,
    nota_visita: 'Puedes acudir durante el horario de atención para orientación y pruebas rápidas.',
    etiqueta_visita: 'Atención confidencial',
    latitud: 16.1825,
    longitud: -95.1958,
    posicion_mapa: { left: '70.42%', top: '62.1%', variante: 'dark' },
    es_demostracion: true,
  },
  {
    id_clinica: 'demo-centro-salud-huatulco',
    nombre: 'Centro de Salud Huatulco',
    etiqueta_ubicacion: 'Costa',
    subtitulo_region: 'Santa María Huatulco · Región de la Costa',
    municipio: 'Santa María Huatulco',
    direccion: 'Santa María Huatulco, Oax.',
    direccion_corta: 'Santa María Huatulco, Oaxaca',
    categorias: ['ITS', 'Aborto'],
    etiqueta_categoria: 'SALUD SEXUAL Y CONSEJERÍA',
    descripcion: 'Servicios de orientación en salud sexual, detección oportuna y consejería comunitaria.',
    servicios: ['Salud sexual', 'Consejería'],
    horario: null,
    horario_detalle: 'Lunes a viernes en horario institucional',
    costo: 'Gratuito',
    requisitos: 'Presentar CURP',
    telefono: null,
    nota_visita: 'Consulta disponibilidad en el módulo de salud sexual y reproductiva al llegar.',
    etiqueta_visita: 'Atención confidencial',
    latitud: 15.7689,
    longitud: -96.1342,
    posicion_mapa: { left: '33.33%', top: '70.43%', variante: 'dark' },
    es_demostracion: true,
  },
];

/**
 * Normaliza y unifica una lista de clínicas evitando duplicar sedes entre categorías.
 *
 * @param {Array<Object>} lista - Registros de clínicas crudos (API o demostración).
 * @returns {Array<Object>} Lista de clínicas sin duplicados por sede.
 */
export function normalizarYUnificarClinicas(lista = []) {
  if (!Array.isArray(lista)) return [];

  const mapaPorClave = new Map();

  for (const item of lista) {
    if (!item || typeof item !== 'object') continue;

    const nombreLimpio = typeof item.nombre === 'string' ? item.nombre.trim() : '';
    if (!nombreLimpio) continue;

    const municipioLimpio = typeof item.municipio === 'string' && item.municipio.trim()
      ? item.municipio.trim()
      : null;

    const claveUnica = `${nombreLimpio.toLowerCase()}::${(municipioLimpio || '').toLowerCase()}`;

    const serviciosEntrada = Array.isArray(item.servicios)
      ? item.servicios.filter((s) => typeof s === 'string' && s.trim())
      : typeof item.servicio === 'string' && item.servicio.trim()
        ? [item.servicio.trim()]
        : [];

    const categoriasEntrada = Array.isArray(item.categorias)
      ? item.categorias.filter((c) => typeof c === 'string' && c.trim())
      : typeof item.categoria === 'string' && item.categoria.trim()
        ? [item.categoria.trim()]
        : [];

    if (!mapaPorClave.has(claveUnica)) {
      mapaPorClave.set(claveUnica, {
        id_clinica: item.id_clinica ?? claveUnica,
        nombre: nombreLimpio,
        etiqueta_ubicacion: item.etiqueta_ubicacion || municipioLimpio || 'Oaxaca',
        subtitulo_region: item.subtitulo_region || (municipioLimpio ? `${municipioLimpio} · Oaxaca` : 'Oaxaca'),
        etiqueta_categoria: item.etiqueta_categoria || 'DETECCIÓN DE ITS',
        tipo_institucion: item.tipo_institucion || null,
        municipio: municipioLimpio,
        localidad: item.localidad || null,
        direccion: item.direccion || null,
        direccion_corta: item.direccion_corta || item.direccion || municipioLimpio || 'Oaxaca',
        codigo_postal: item.codigo_postal || null,
        telefono: item.telefono || null,
        horario: item.horario || null,
        horario_detalle: item.horario_detalle || item.horario || 'Consultar en sede',
        costo: item.costo || 'Gratuito',
        requisitos: item.requisitos || 'Presentar CURP',
        descripcion:
          item.descripcion ||
          'Pruebas de VIH, sífilis y hepatitis C. Orientación y consejería asociada al servicio.',
        nota_visita:
          item.nota_visita ||
          'Para las pruebas rápidas presenta tu CURP. Puedes acudir sin cita previa durante el horario de atención indicado.',
        etiqueta_visita: item.etiqueta_visita || 'Atención confidencial',
        latitud: typeof item.latitud === 'number' ? item.latitud : null,
        longitud: typeof item.longitud === 'number' ? item.longitud : null,
        posicion_mapa: item.posicion_mapa || null,
        categorias: [...new Set(categoriasEntrada)],
        servicios: [...new Set(serviciosEntrada)],
        es_demostracion: Boolean(item.es_demostracion),
      });
    } else {
      const existente = mapaPorClave.get(claveUnica);
      existente.categorias = [...new Set([...existente.categorias, ...categoriasEntrada])];
      existente.servicios = [...new Set([...existente.servicios, ...serviciosEntrada])];
      if (!existente.direccion && item.direccion) existente.direccion = item.direccion;
      if (!existente.telefono && item.telefono) existente.telefono = item.telefono;
      if (!existente.horario && item.horario) existente.horario = item.horario;
      if (existente.latitud === null && typeof item.latitud === 'number') {
        existente.latitud = item.latitud;
        existente.longitud = item.longitud;
      }
    }
  }

  return Array.from(mapaPorClave.values());
}
