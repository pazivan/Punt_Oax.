import test from 'node:test'
import assert from 'node:assert/strict'
import { guardarPerfilLocal, leerPerfilLocal } from '../src/utils/perfilLocal.js'

test('el autocompletado local separa cuentas y recupera los datos guardados', () => {
  const datos = new Map()
  const almacenamiento = {
    getItem: clave => datos.get(clave) ?? null,
    setItem: (clave, valor) => datos.set(clave, valor),
  }
  guardarPerfilLocal('usuario-1', { nombre: 'María', apellidos: 'López', telefono: '9511234567' }, almacenamiento)
  assert.deepEqual(leerPerfilLocal('usuario-1', almacenamiento), {
    nombre: 'María', apellidos: 'López', telefono: '9511234567',
  })
  assert.deepEqual(leerPerfilLocal('usuario-2', almacenamiento), { nombre: '', apellidos: '', telefono: '' })
  assert.throws(() => guardarPerfilLocal('', { nombre: 'X' }, almacenamiento))
})
