import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cerrarSesion,
  consultarPerfil,
  guardarSesion,
  iniciarSesion,
  iniciarSesionClinica,
  leerSesion,
  registrarClinica,
  registrarUsuario,
} from '../src/api/auth.js'

const almacen = new Map()
globalThis.sessionStorage = {
  getItem: (clave) => almacen.get(clave) ?? null,
  setItem: (clave, valor) => almacen.set(clave, valor),
  removeItem: (clave) => almacen.delete(clave),
  clear: () => almacen.clear(),
}

function simular(estado, cuerpo) {
  const llamadas = []
  globalThis.fetch = async (ruta, opciones) => {
    llamadas.push({ ruta, opciones })
    return {
      ok: estado >= 200 && estado < 300,
      status: estado,
      json: async () => cuerpo,
    }
  }
  return llamadas
}

test.beforeEach(() => {
  sessionStorage.clear()
})

test('registro solo envía correo y password, nunca nombre ni confirmación', async () => {
  const llamadas = simular(201, { token: 'jwt-u', usuario: { correo: 'a@b.com' } })
  const respuesta = await registrarUsuario('a@b.com', 'secreto123')
  assert.equal(llamadas[0].ruta, '/api/auth/registro-usuario')
  assert.equal(llamadas[0].opciones.method, 'POST')
  assert.deepEqual(JSON.parse(llamadas[0].opciones.body), { correo: 'a@b.com', password: 'secreto123' })
  assert.equal(respuesta.token, 'jwt-u')
  assert.equal(leerSesion(), null, 'el registro no inicia sesión automáticamente')
})

test('registro de clínica envía datos básicos y conserva estado borrador', async () => {
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
  assert.deepEqual(JSON.parse(llamadas[0].opciones.body), datos)
  assert.equal(respuesta.clinica.rol, 'clinica')
  assert.equal(respuesta.clinica.estado_publicacion, 'borrador')
  assert.equal(leerSesion(), null, 'el registro no inicia sesión automáticamente')

  simular(409, { error: 'El correo ya se encuentra registrado.' })
  await assert.rejects(
    registrarClinica({ ...datos, nombre: 'Otra clínica' }),
    /ya se encuentra registrado/,
  )
})

test('login usuario y clínica usan sus rutas y estructuras de respuesta', async () => {
  let llamadas = simular(200, { token: 'jwt-u', usuario: { correo: 'u@ejemplo.com' } })
  const usuario = guardarSesion(await iniciarSesion('u@ejemplo.com', 'contraseña'), 'usuario')
  assert.equal(llamadas[0].ruta, '/api/auth/login-usuario')
  assert.equal(usuario.tipo, 'usuario')
  assert.equal(usuario.cuenta.correo, 'u@ejemplo.com')

  llamadas = simular(200, { token: 'jwt-c', clinica: { correo: 'c@ejemplo.com', nombre: 'Clínica' } })
  const clinica = guardarSesion(await iniciarSesionClinica('c@ejemplo.com', 'contraseña'), 'clinica')
  assert.equal(llamadas[0].ruta, '/api/auth/login-clinica')
  assert.equal(clinica.tipo, 'clinica')
  assert.equal(clinica.cuenta.correo, 'c@ejemplo.com')
})

test('perfil usa Bearer; 401/403 limpian sesión y cerrar sesión la elimina', async () => {
  guardarSesion({ token: 'jwt-valido', usuario: { correo: 'u@ejemplo.com' } }, 'usuario')
  const llamadas = simular(200, { usuarioAutenticado: { correo: 'u@ejemplo.com' } })
  const perfil = await consultarPerfil()
  assert.equal(llamadas[0].opciones.headers.Authorization, 'Bearer jwt-valido')
  assert.equal(perfil.usuarioAutenticado.correo, 'u@ejemplo.com')

  simular(401, { error: 'Token expirado' })
  await assert.rejects(consultarPerfil(), /Token expirado/)
  assert.equal(leerSesion(), null, 'un 401 debe limpiar la sesión')

  guardarSesion({ token: 'jwt-c', clinica: { correo: 'c@ejemplo.com' } }, 'clinica')
  cerrarSesion()
  assert.equal(leerSesion(), null)
})

test('errores HTTP legibles, con JSON, sin JSON y conexión fallida', async () => {
  simular(400, { error: 'Formato inválido' })
  await assert.rejects(iniciarSesion('a', 'b'), /Formato inválido/)

  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => { throw new Error('no json') },
  })
  await assert.rejects(iniciarSesion('a', 'b'), /500/)

  globalThis.fetch = async () => { throw new Error('network down') }
  await assert.rejects(iniciarSesion('a', 'b'), /No se pudo conectar/)
})

test('una respuesta incompleta no guarda una sesión', () => {
  assert.throws(() => guardarSesion(null, 'usuario'), /no es válida/)
  assert.throws(() => guardarSesion({ token: 'solo-token' }, 'usuario'), /no es válida/)
  assert.throws(() => guardarSesion({ token: 'jwt', usuario: null }, 'usuario'), /no es válida/)
})
