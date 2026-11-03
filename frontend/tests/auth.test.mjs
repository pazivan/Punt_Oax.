import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cerrarSesion, consultarPerfil, guardarSesion, iniciarSesion,
  iniciarSesionClinica, leerSesion, registrarClinica, registrarUsuario,
} from '../src/api/auth.js'

const almacen = new Map()
globalThis.sessionStorage = {
  getItem: (clave) => almacen.get(clave) ?? null,
  setItem: (clave, valor) => almacen.set(clave, valor),
  removeItem: (clave) => almacen.delete(clave),
}

function simular(estado, cuerpo, { sinJson = false } = {}) {
  const llamadas = []
  globalThis.fetch = async (ruta, opciones) => {
    llamadas.push({ ruta, opciones })
    return { status: estado, ok: estado < 400, json: async () => {
      if (sinJson) throw new SyntaxError('Respuesta no JSON')
      return cuerpo
    } }
  }
  return llamadas
}

test('registro solo envía correo y password, nunca nombre ni confirmación', async () => {
  const llamadas = simular(201, { usuario: { correo: 'a@ejemplo.com' }, token: 'jwt' })
  await registrarUsuario('a@ejemplo.com', 'contraseña')
  assert.equal(llamadas[0].ruta, '/api/auth/registro-usuario')
  assert.equal(llamadas[0].opciones.method, 'POST')
  assert.deepEqual(JSON.parse(llamadas[0].opciones.body), { correo: 'a@ejemplo.com', password: 'contraseña' })
})

test('registro de clínica envía nombre, correo y contraseña al endpoint institucional', async () => {
  const llamadas = simular(201, {
    mensaje: 'Cuenta de clínica creada correctamente.',
    clinica: {
      id: 'uuid-clinica',
      nombre: 'Clínica Comunitaria San Jacinto',
      correo: 'contacto@ejemplo.com',
      rol: 'clinica',
      estado_publicacion: 'borrador',
    },
  })
  const respuesta = await registrarClinica(
    'Clínica Comunitaria San Jacinto',
    'contacto@ejemplo.com',
    'ContrasenaSegura123',
  )
  assert.equal(llamadas[0].ruta, '/api/auth/registro-clinica')
  assert.equal(llamadas[0].opciones.method, 'POST')
  assert.deepEqual(JSON.parse(llamadas[0].opciones.body), {
    nombre: 'Clínica Comunitaria San Jacinto',
    correo: 'contacto@ejemplo.com',
    password: 'ContrasenaSegura123',
  })
  assert.equal(respuesta.clinica.rol, 'clinica')
  assert.equal(respuesta.clinica.estado_publicacion, 'borrador')
  assert.equal(leerSesion(), null, 'el registro no inicia sesión automáticamente')

  simular(409, { error: 'El correo ya se encuentra registrado.' })
  await assert.rejects(
    registrarClinica('Otra clínica', 'contacto@ejemplo.com', 'ContrasenaSegura123'),
    /ya se encuentra registrado/,
  )
})

test('login usuario y clínica usan sus rutas y estructuras de respuesta', async () => {
  let llamadas = simular(200, { token: 'jwt-u', usuario: { correo: 'u@ejemplo.com' } })
  const usuario = guardarSesion(await iniciarSesion('u@ejemplo.com', 'contraseña'), 'usuario')
  assert.equal(llamadas[0].ruta, '/api/auth/login-usuario')
  assert.deepEqual(JSON.parse(llamadas[0].opciones.body), { correo: 'u@ejemplo.com', password: 'contraseña' })
  assert.equal(usuario.cuenta.correo, 'u@ejemplo.com')
  llamadas = simular(200, { token: 'jwt-c', clinica: { correo: 'c@ejemplo.com' } })
  const clinica = guardarSesion(await iniciarSesionClinica('c@ejemplo.com', 'contraseña'), 'clinica')
  assert.equal(llamadas[0].ruta, '/api/auth/login-clinica')
  assert.equal(clinica.cuenta.correo, 'c@ejemplo.com')
  assert.equal(leerSesion().token, 'jwt-c')
})

test('perfil usa Bearer; 401/403 limpian sesión y cerrar sesión la elimina', async () => {
  guardarSesion({ token: 'jwt-u', usuario: { correo: 'u@ejemplo.com' } }, 'usuario')
  let llamadas = simular(200, { usuarioAutenticado: { rol: 'usuario' } })
  assert.equal((await consultarPerfil()).usuarioAutenticado.rol, 'usuario')
  assert.equal(llamadas[0].ruta, '/api/auth/perfil')
  assert.equal(llamadas[0].opciones.headers.Authorization, 'Bearer jwt-u')
  for (const estado of [401, 403]) {
    guardarSesion({ token: 'jwt-u', usuario: {} }, 'usuario')
    llamadas = simular(estado, { error: 'Token inválido o expirado.' })
    await assert.rejects(consultarPerfil(), /Token inválido/)
    assert.equal(leerSesion(), null)
  }
  guardarSesion({ token: 'jwt-c', clinica: {} }, 'clinica')
  cerrarSesion()
  assert.equal(leerSesion(), null)
})

test('errores HTTP legibles, con JSON, sin JSON y conexión fallida', async () => {
  for (const [estado, mensaje] of [[400, /Revisa los datos/], [401, /contraseña incorrectos/],
    [403, /Acceso denegado/], [409, /correo ya está registrado/]]) {
    simular(estado, null, { sinJson: true })
    await assert.rejects(iniciarSesion('a@ejemplo.com', 'contraseña'), mensaje)
  }
  simular(409, { error: 'El correo ya se encuentra registrado.' })
  await assert.rejects(registrarUsuario('a@ejemplo.com', 'contraseña'), /El correo ya se encuentra registrado/)
  simular(400, { error: 'Correo y contraseña son obligatorios.' })
  await assert.rejects(registrarUsuario('', ''), /Correo y contraseña son obligatorios/)
  simular(200, null, { sinJson: true })
  await assert.rejects(registrarUsuario('a@ejemplo.com', 'contraseña'), /respuesta no válida/)
  globalThis.fetch = async () => { throw new Error('fallo de red') }
  await assert.rejects(iniciarSesion('a@ejemplo.com', 'contraseña'), /No se pudo conectar/)
  guardarSesion({ token: 'jwt', usuario: {} }, 'usuario')
  await assert.rejects(consultarPerfil(), /No se pudo conectar/)
  assert.ok(leerSesion(), 'un error de red no invalida el token')
  cerrarSesion()
})

test('una respuesta incompleta no guarda una sesión', () => {
  assert.throws(() => guardarSesion({ token: 'jwt' }, 'clinica'), /no es válida/)
  assert.throws(() => guardarSesion({ usuario: {} }, 'usuario'), /no es válida/)
  assert.equal(leerSesion(), null)
})
