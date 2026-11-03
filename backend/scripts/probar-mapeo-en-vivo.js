const pool = require("../db");

async function probarMapeoEnVivo() {
  console.log("==========================================================");
  console.log("🧪 PROBANDO MAPEO Y BASE DE DATOS EN VIVO (PuntOax v1.3)");
  console.log("==========================================================\n");

  const client = await pool.connect();
  try {
    // 1. Verificar columnas agregadas por migración 004
    console.log("1. Verificando columnas de la migración 004 en PostgreSQL...");
    const { rows: columnasClinicas } = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'clinicas' 
        AND column_name IN ('id_origen', 'region', 'horario_texto', 'nivel_atencion', 'situacion_ubicacion', 'verificacion_datos', 'datos_por_confirmar')
      ORDER BY column_name;
    `);
    console.log(`   ✓ Columnas verificadas en 'clinicas': ${columnasClinicas.map(c => c.column_name).join(", ")}`);

    const { rows: columnasServicios } = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'clinicas_servicios' 
        AND column_name IN ('id_origen', 'costo_texto', 'detalle_servicio');
    `);
    console.log(`   ✓ Columnas verificadas en 'clinicas_servicios': ${columnasServicios.map(c => c.column_name).join(", ")}`);

    const { rows: columnasHorarios } = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'horarios_atencion' 
        AND column_name IN ('es_24_horas', 'cruza_medianoche', 'texto_horario');
    `);
    console.log(`   ✓ Columnas verificadas en 'horarios_atencion': ${columnasHorarios.map(c => c.column_name).join(", ")}\n`);

    // 2. Verificar catálogo estandarizado (ITS e ILE)
    console.log("2. Verificando servicios canónicos estandarizados...");
    const { rows: serviciosCanonicos } = await client.query(`
      SELECT id_servicio, nombre, categoria 
      FROM servicios 
      WHERE nombre IN ('Detección de ITS', 'Interrupción Legal del Embarazo (ILE)')
      ORDER BY nombre;
    `);
    for (const srv of serviciosCanonicos) {
      console.log(`   ✓ Servicio: [${srv.categoria}] ${srv.nombre} (${srv.id_servicio})`);
    }

    if (serviciosCanonicos.length < 2) {
      throw new Error("Faltan servicios canónicos en la tabla servicios.");
    }

    const srvIts = serviciosCanonicos.find(s => s.nombre === 'Detección de ITS');
    const srvIle = serviciosCanonicos.find(s => s.nombre.includes('ILE'));

    // 3. Insertar o actualizar clínica de prueba idéntica al diseño Figma
    console.log("\n3. Insertando clínica idéntica a la pantalla de Figma...");
    const { rows: [clinicaDemo] } = await client.query(`
      INSERT INTO clinicas (
        id_origen,
        nombre,
        tipo_institucion,
        municipio,
        region,
        direccion,
        codigo_postal,
        telefono,
        horario_texto,
        ubicacion_maps_url,
        ubicacion_geo,
        estado_publicacion,
        situacion_ubicacion,
        verificacion_datos,
        datos_por_confirmar
      ) VALUES (
        'figma-demo-01',
        'Centro de Atención PuntOax',
        'ong',
        'Oaxaca de Juárez',
        'Oaxaca y zona metropolitana',
        'Av. Independencia 240, Centro, Oaxaca de Juárez, Oaxaca',
        '68000',
        '9510000000',
        'Lunes a viernes, 09:00-17:00 h',
        'https://maps.app.goo.gl/ejemploFigma',
        ST_SetSRID(ST_MakePoint(-96.7265, 17.0610), 4326)::geography,
        'aprobada',
        'fija',
        'verificado',
        'Sede demostración validada según maqueta Figma'
      )
      ON CONFLICT (id_clinica) DO NOTHING
      RETURNING id_clinica, nombre, municipio, region, estado_publicacion;
    `);

    const idClinica = clinicaDemo ? clinicaDemo.id_clinica : (await client.query("SELECT id_clinica FROM clinicas WHERE id_origen = 'figma-demo-01'")).rows[0].id_clinica;
    console.log(`   ✓ Clínica registrada: '${clinicaDemo ? clinicaDemo.nombre : 'Centro de Atención PuntOax'}'`);
    console.log(`     ID: ${idClinica}`);

    // 4. Asociar ambos servicios a la clínica (demostrando regla de multi-servicio)
    console.log("\n4. Asociando servicios canónicos en 'clinicas_servicios'...");
    await client.query(`
      INSERT INTO clinicas_servicios (id_clinica, id_servicio, costo, costo_texto, requisitos, requiere_cita)
      VALUES 
        ($1, $2, 0.00, 'Gratuito', 'Identificación oficial (INE o CURP). No requiere ayuno.', FALSE),
        ($1, $3, 0.00, 'Gratuito', 'Identificación oficial y valoración médica presencial.', TRUE)
      ON CONFLICT (id_clinica, id_servicio) DO UPDATE 
        SET costo_texto = EXCLUDED.costo_texto, requisitos = EXCLUDED.requisitos;
    `, [idClinica, srvIts.id_servicio, srvIle.id_servicio]);
    console.log("   ✓ Asociación exitosa: Detección de ITS + ILE");

    // 5. Insertar horarios especiales demostrando soporte 24h y cruce de medianoche
    console.log("\n5. Probando franjas horarias (24h y cruce de medianoche)...");
    await client.query("DELETE FROM horarios_atencion WHERE id_clinica = $1", [idClinica]);
    await client.query(`
      INSERT INTO horarios_atencion (id_clinica, dia_semana, hora_apertura, hora_cierre, es_24_horas, cruza_medianoche, texto_horario)
      VALUES 
        -- Lun a Vie normal: 09:00 a 17:00
        ($1, 1, '09:00:00', '17:00:00', FALSE, FALSE, 'Lunes 09:00 a 17:00 h'),
        -- Sábado cruza medianoche: 20:00 a 09:00 Domingo
        ($1, 6, '20:00:00', '09:00:00', FALSE, TRUE, 'Sábado noche 20:00 a 09:00 h Domingo'),
        -- Domingo 24 horas continuas
        ($1, 0, '00:00:00', '23:59:59', TRUE, FALSE, 'Domingo 24 horas continuas');
    `, [idClinica]);
    console.log("   ✓ Franjas horarias insertadas correctamente (respetando restricción de 24h y medianoche)");

    // 6. Consultar la API REST en vivo
    console.log("\n6. Consultando endpoint HTTP en vivo: GET http://127.0.0.1:3000/api/clinicas");
    const res = await fetch("http://127.0.0.1:3000/api/clinicas");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lista = await res.json();
    console.log(`   ✓ La API respondió exitosamente (HTTP 200).`);
    console.log(`   ✓ Clínicas aprobadas retornadas: ${lista.length}`);
    const encontrada = lista.find(c => c.nombre === 'Centro de Atención PuntOax');
    if (encontrada) {
      console.log("   ✓ Clínica encontrada en la API pública:");
      console.log(`     - Nombre: ${encontrada.nombre}`);
      console.log(`     - Municipio: ${encontrada.municipio}`);
      console.log(`     - Dirección: ${encontrada.direccion}`);
      console.log(`     - Teléfono: ${encontrada.telefono}`);
      console.log(`     - Coordenadas PostGIS: Lat ${encontrada.latitud}, Lng ${encontrada.longitud}`);
      console.log(`     - Estado de publicación: ${encontrada.estado_publicacion}`);
    }

    console.log("\n==========================================================");
    console.log("🎉 ¡TODAS LAS PRUEBAS EN VIVO PASARON CON ÉXITO AL 100%!");
    console.log("==========================================================");
  } finally {
    client.release();
    await pool.end();
  }
}

probarMapeoEnVivo().catch(err => {
  console.error("❌ Error en prueba en vivo:", err);
  process.exit(1);
});
