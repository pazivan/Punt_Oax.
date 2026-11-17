import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cerrarSesion, consultarPerfil, guardarSesion, iniciarSesion,
  iniciarSesionClinica, leerSesion, registrarClinica, registrarUsuario,
  verificarCorreo, reenviarVerificacion, solicitarRecuperacion, restablecerPassword, revocarSesion,
} from '../src/api/auth.js'

const almacen = new Map()
const compartido = new Map()
globalThis.sessionStorage = {
  getItem: (clave) => almacen.get(clave) ?? null,
  setItem: (clave, valor) => almacen.set(clave, valor),
  removeItem: (clave) => almacen.delete(clave),
}
globalThis.localStorage = {
  getItem: (clave) => compartido.get(clave) ?? null,
  setItem: (clave, valor) => compartido.set(clave, valor),
  removeItem: (clave) => compartido.delete(clave),
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
  const llamadas = simular(201, { usuario: { correo: 'a@ejemplo.com' }, requiere_verificacion: true })
  await registrarUsuario('a@ejemplo.com', 'contraseña')
  assert.equal(llamadas[0].ruta, '/api/auth/registro-usuario')
  assert.equal(llamadas[0].opciones.method, 'POST')
  assert.deepEqual(JSON.parse(llamadas[0].opciones.body), { correo: 'a@ejemplo.com', password: 'contraseña' })
})

test('verificación y recuperación usan rutas públicas sin guardar sesiones ni exponer secretos en URL', async () => {
  for (const [fn, ruta, args, cuerpo] of [
    [verificarCorreo, 'verificar-correo', ['clinica', 'c@ejemplo.com', '123456'], { rol: 'clinica', correo: 'c@ejemplo.com', codigo: '123456' }],
    [reenviarVerificacion, 'reenviar-verificacion', ['usuario', 'u@ejemplo.com'], { rol: 'usuario', correo: 'u@ejemplo.com' }],
    [solicitarRecuperacion, 'solicitar-recuperacion', ['administrador', 'a@ejemplo.com'], { rol: 'administrador', correo: 'a@ejemplo.com' }],
    [restablecerPassword, 'restablecer-password', ['usuario', 'u@ejemplo.com', 'token', 'Nueva-Clave8!'],
      { rol: 'usuario', correo: 'u@ejemplo.com', token: 'token', password: 'Nueva-Clave8!' }],
  ]) {
    const llamadas = simular(200, { mensaje: 'OK' })
    await fn(...args)
    assert.equal(llamadas[0].ruta, `/api/auth/${ruta}`)
    assert.deepEqual(JSON.parse(llamadas[0].opciones.body), cuerpo)
  }
  simular(403, { error: 'Verifica tu correo.', requiere_verificacion: true })
  await assert.rejects(iniciarSesion('u@ejemplo.com', 'Clave'), (err) => err.requiere_verificacion === true)
})

test('registro de clínica envía solo los datos básicos y conserva estado borrador', async () => {
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
  const datos = {
    nombre: 'Clínica Comunitaria San Jacinto',
    correo: 'contacto@ejemplo.com',
    password: 'ContrasenaSegura123',
  }
  const respuesta = await registrarClinica(datos)
  assert.equal(llamadas[0].ruta, '/api/auth/registro-clinica')
  assert.equal(llamadas[0].opciones.method, 'POST')
  assert.equal(llamadas[0].opciones.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(llamadas[0].opciones.body), datos)
  assert.equal(respuesta.clinica.rol, 'clinica')
  assert.equal(respuesta.clinica.estado_publicacion, 'borrador')
  assert.equal(leerSesion(), null, 'el registro no inicia sesión automáticamente')

  simular(409, { error: 'El correo ya se encuentra registrado.' })
  await assert.rejects(
    registrarClinica({ ...datos, correo: 'otro@ejemplo.com' }),
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
  assert.equal(almacen.has('puntoax-sesion'), false, 'el JWT ya no queda aislado en la pestaña')
  assert.equal(JSON.parse(compartido.get('puntoax-sesion')).token, 'jwt-c')
})

test('la sesión existente se migra una vez; cerrar sesión no resucita copias antiguas', () => {
  cerrarSesion()
  compartido.delete('puntoax-sesion-compartida')
  almacen.set('puntoax-sesion', JSON.stringify({ token: 'jwt-antiguo', cuenta: {}, tipo: 'usuario' }))
  assert.equal(leerSesion().token, 'jwt-antiguo')
  assert.equal(almacen.has('puntoax-sesion'), false)
  almacen.set('puntoax-sesion', JSON.stringify({ token: 'jwt-antiguo', cuenta: {}, tipo: 'usuario' }))
  cerrarSesion()
  assert.equal(leerSesion(), null)
  assert.equal(almacen.has('puntoax-sesion'), false)
})

test('logout revoca el token en el backend y mantiene el cierre local aun si falla la red', async () => {
  guardarSesion({ token: 'jwt-u', usuario: {} }, 'usuario')
  let llamadas = simular(200, { mensaje: 'Sesión cerrada.' })
  assert.equal(await revocarSesion(), true)
  assert.equal(llamadas[0].ruta, '/api/auth/cerrar-sesion')
  assert.equal(llamadas[0].opciones.headers.Authorization, 'Bearer jwt-u')
  cerrarSesion()
  assert.equal(leerSesion(), null)
  guardarSesion({ token: 'jwt-c', clinica: {} }, 'clinica')
  globalThis.fetch = async () => { throw new Error('sin red') }
  assert.equal(await revocarSesion(), false)
  cerrarSesion()
  assert.equal(leerSesion(), null)
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
