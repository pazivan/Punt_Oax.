import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  normalizarCorreo,
  validarEmail,
  validarNombreClinica,
  validarPassword,
  validarRequerido,
} from '../src/utils/validaciones.js'

test('normaliza el correo y rechaza formatos inválidos', () => {
  assert.equal(normalizarCorreo('  Contacto@Ejemplo.COM  '), 'contacto@ejemplo.com')
  assert.equal(normalizarCorreo(null), '')
  assert.equal(validarEmail('contacto@ejemplo.com'), true)
  assert.equal(validarEmail('  CONTACTO@EJEMPLO.COM  '), true)
  for (const invalido of ['', 'sin-arroba', 'a@b', 'a@.com', 'a@b..com', 'a b@ejemplo.com', 42]) {
    assert.equal(validarEmail(invalido), false, `debería rechazar ${String(invalido)}`)
  }
})

test('valida nombre, campos requeridos y contraseña con los límites del backend', () => {
  assert.equal(validarRequerido('  Clínica  '), true)
  assert.equal(validarRequerido('   '), false)
  assert.equal(validarRequerido(null), false)
  assert.equal(validarNombreClinica('Clínica San Jacinto'), true)
  assert.equal(validarNombreClinica('   '), false)
  assert.equal(validarNombreClinica('a'.repeat(256)), false)
  assert.equal(validarPassword('12345678'), true)
  assert.equal(validarPassword('1234567'), false)
  assert.equal(validarPassword('a'.repeat(72)), true)
  assert.equal(validarPassword('a'.repeat(73)), false)
  assert.equal(validarPassword('ñ'.repeat(37)), false, '72 bytes, no 72 caracteres')
  assert.equal(validarPassword(null), false)
})
