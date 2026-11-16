#!/usr/bin/env node
// Provisiona cuentas de acceso y cupos de una hora para las fichas ITS.
// Simula por defecto; --apply requiere ruta privada para el TXT de credenciales.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { leerRegistros } = require('./importar-filtracion');
const { festivoNacional } = require('../agendaClinica');

const ZONA = 'America/Mexico_City';
const DIAS = 14;
const fechaLocal = (fecha) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(fecha);

function franjas(texto) {
  const resultado = [];
  // Se admiten los formatos presentes en el CSV: L-V, S, D, Martes y Jueves,
  // Lunes a Viernes; "y Sábados" y horas HH:MM.
  const partes = String(texto).split(/\s*(?:;|\.\s+y\s+|\s+y\s+(?=S[aá]bados?\b))\s*/i);
  for (const parte of partes) {
    const horas = [...parte.matchAll(/(\d{1,2}):(\d{2})\s*[-–—a]\s*(\d{1,2}):(\d{2})/g)];
    if (!horas.length) continue;
    let dias = [];
    if (/lunes\s+a\s+viernes|l-v/i.test(parte)) dias = [1, 2, 3, 4, 5];
    else if (/martes\s+y\s+jueves/i.test(parte)) dias = [2, 4];
    else if (/viernes/i.test(parte)) dias = [5];
    else if (/s[aá]bados?|^s\b/i.test(parte)) dias = [6];
    else if (/domingos?|^d\b/i.test(parte)) dias = [0];
    else throw new Error(`Días no reconocidos: ${parte}`);
    for (const h of horas) {
      const inicio = Number(h[1]) * 60 + Number(h[2]);
      const fin = Number(h[3]) * 60 + Number(h[4]);
      if (inicio < 0 || fin > 1440 || fin <= inicio || Number(h[2]) > 59 || Number(h[4]) > 59) {
        throw new Error(`Horas no válidas: ${parte}`);
      }
      resultado.push({ dias, inicio, fin });
    }
  }
  if (!resultado.length) throw new Error(`Horario sin franjas: ${texto}`);
  return resultado;
}

function planificar(registros, hoy = new Date(), dias = DIAS) {
  const inicio = fechaLocal(hoy);
  const fechas = [];
  const mediodia = new Date(`${inicio}T12:00:00Z`);
  for (let i = 0; i < dias; i++) {
    const fecha = new Date(mediodia);
    fecha.setUTCDate(fecha.getUTCDate() + i);
    const iso = fecha.toISOString().slice(0, 10);
    if (!festivoNacional(iso)) fechas.push({ iso, dia: fecha.getUTCDay() });
  }
  return registros.map((r) => {
    if (r.categoria !== 'ITS' || !r.latitud || !r.longitud || !r.id_origen) {
      throw new Error(`Fila no apta para reservar: ${r.id_origen}`);
    }
    const tramos = franjas(r.horario);
    const espacios = new Set();
    for (const fecha of fechas) {
      for (const tramo of tramos) {
        if (!tramo.dias.includes(fecha.dia)) continue;
        for (let minuto = tramo.inicio; minuto + 60 <= tramo.fin; minuto += 60) {
          // No publicar una hora ya iniciada el día de la ejecución.
          const hora = `${String(Math.floor(minuto / 60)).padStart(2, '0')}:${String(minuto % 60).padStart(2, '0')}`;
          espacios.add(`${fecha.iso} ${hora}`);
        }
      }
    }
    return { origen: r.id_origen, nombre: r.nombre, tramos, espacios: [...espacios].sort() };
  });
}

async function ejecutar({ archivo, credenciales, aplicar = false, dbPool = pool, ahora = new Date() }) {
  const registros = leerRegistros(fs.readFileSync(archivo, 'utf8'));
  if (registros.length !== 26) throw new Error(`Se esperaban 26 sedes ITS, llegaron ${registros.length}`);
  const planes = planificar(registros, ahora);
  if (new Set(planes.map((p) => p.origen)).size !== planes.length) throw new Error('IDs repetidos');
  const client = await dbPool.connect();
  let archivoCreado = false;
  let confirmado = false;
  const claves = [];
  const resumen = { sedes: 0, cuentas: 0, cupos: 0, existentes: 0 };
  try {
    await client.query('BEGIN');
    for (const plan of planes) {
      const { rows } = await client.query(`
        SELECT c.id_clinica, c.nombre, c.correo_acceso, cs.id_clinica_servicio
        FROM clinicas c JOIN clinicas_servicios cs ON cs.id_clinica = c.id_clinica
        JOIN servicios s ON s.id_servicio = cs.id_servicio
        WHERE c.id_origen = $1 AND c.estado_publicacion = 'aprobada'
          AND cs.activo AND s.activo AND s.categoria = 'ITS'
        FOR UPDATE OF c`, [plan.origen]);
      if (rows.length !== 1) throw new Error(`Sede/servicio ITS inexistente o ambiguo: ${plan.origen}`);
      const sede = rows[0];
      resumen.sedes++;
      // No reemplazar cuentas existentes ni exponer nuevas claves para ellas.
      if (!sede.correo_acceso) {
        const correo = `sede-${plan.origen.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@demo.puntoax.invalid`;
        const clave = crypto.randomBytes(18).toString('base64url');
        const hash = await bcrypt.hash(clave, 12);
        await client.query('UPDATE clinicas SET correo_acceso = $2, password_hash = $3 WHERE id_clinica = $1',
          [sede.id_clinica, correo, hash]);
        claves.push(`${plan.origen}\t${sede.nombre}\t${correo}\t${clave}`);
        resumen.cuentas++;
      } else {
        resumen.existentes++;
      }
      for (const tramo of plan.tramos) {
        for (const dia of tramo.dias) {
          const hora = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
          await client.query(`INSERT INTO horarios_atencion
            (id_clinica, dia_semana, hora_apertura, hora_cierre, texto_horario)
            VALUES ($1, $2, $3::time, $4::time, 'Cupos de una hora')
            ON CONFLICT (id_clinica, dia_semana, hora_apertura, hora_cierre) DO NOTHING`,
          [sede.id_clinica, dia, hora(tramo.inicio), hora(tramo.fin)]);
        }
      }
      for (const local of plan.espacios) {
        const { rowCount } = await client.query(`INSERT INTO espacios_disponibles
          (id_clinica_servicio, fecha_hora_inicio)
          SELECT $1, ($2::timestamp AT TIME ZONE 'America/Mexico_City')
          WHERE ($2::timestamp AT TIME ZONE 'America/Mexico_City') > NOW()
          ON CONFLICT (id_clinica_servicio, fecha_hora_inicio) DO NOTHING`,
        [sede.id_clinica_servicio, local]);
        resumen.cupos += rowCount;
      }
    }
    if (aplicar) {
      if (claves.length) {
        if (!credenciales || fs.existsSync(credenciales)) {
          throw new Error('Indica una ruta nueva y privada para --credenciales');
        }
        fs.writeFileSync(credenciales, `ID\tSede\tCorreo de acceso\tContraseña temporal\n${claves.join('\n')}\n`,
          { flag: 'wx', mode: 0o600 });
        archivoCreado = true;
      }
      await client.query('COMMIT');
      confirmado = true;
    } else {
      await client.query('ROLLBACK');
    }
    return resumen;
  } catch (error) {
    if (!confirmado) await client.query('ROLLBACK').catch(() => {});
    if (archivoCreado && !confirmado) fs.unlinkSync(credenciales);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const valor = (flag) => args[args.indexOf(flag) + 1];
  const archivo = args.includes('--archivo') ? valor('--archivo') : 'data/its-coordenadas.csv';
  const aplicar = args.includes('--apply');
  const credenciales = args.includes('--credenciales') ? valor('--credenciales') : '';
  const resumen = await ejecutar({ archivo: path.resolve(archivo), aplicar, credenciales });
  console.log(`${aplicar ? 'Aplicado' : 'Simulación (ROLLBACK)'}`, resumen);
}

if (require.main === module) main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
}).finally(() => pool.end());

module.exports = { franjas, planificar, ejecutar };
