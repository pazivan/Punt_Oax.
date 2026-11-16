import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  contarDigitosTelefono,
  normalizarCorreo,
  validarEmail,
  validarNombreClinica,
  validarPassword,
  validarRequerido,
  validarTelefono,
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

test('valida nombre y campos requeridos', () => {
  assert.equal(validarRequerido('  Clínica  '), true)
  assert.equal(validarRequerido('   '), false)
  assert.equal(validarRequerido(null), false)
  assert.equal(validarNombreClinica('Clínica San Jacinto'), true)
  assert.equal(validarNombreClinica('   '), false)
  assert.equal(validarNombreClinica('a'.repeat(256)), false)
})

test('exige mayúscula, número y símbolo en contraseñas nuevas', () => {
  assert.equal(validarPassword('Abcdef1!'), true)
  assert.equal(validarPassword('Ábcdef1!'), true, 'acepta mayúsculas acentuadas')
  assert.equal(validarPassword('Clave-segura9'), true)

  assert.equal(validarPassword('12345678'), false, 'sin mayúscula ni símbolo')
  assert.equal(validarPassword('Abcdefgh!'), false, 'sin número')
  assert.equal(validarPassword('Abcdefg1'), false, 'sin símbolo')
  assert.equal(validarPassword('abcdef1!'), false, 'sin mayúscula')
  assert.equal(validarPassword('Ab1!'), false, 'menos de 8 caracteres')
  assert.equal(validarPassword(null), false)
  assert.equal(validarPassword(12345678), false)
})

test('mantiene el límite de 72 bytes de bcrypt', () => {
  assert.equal(validarPassword(`${'Aa1!'.padEnd(71, 'b')}c`), true, '72 bytes')
  assert.equal(validarPassword(`${'Aa1!'.padEnd(72, 'b')}c`), false, '73 bytes')
  assert.equal(validarPassword(`${'Aa1!'.padEnd(38, 'ñ')}ñ`), false, 'los acentos ocupan más de un byte')
})

test('valida teléfonos con al menos 10 dígitos', () => {
  assert.equal(contarDigitosTelefono('+52 (951) 000-0000'), 12)
  assert.equal(contarDigitosTelefono(null), 0)

  for (const valido of ['951 000 0000', '9510000000', '+52 (951) 000-0000', '951.000.0000']) {
    assert.equal(validarTelefono(valido), true, `debería aceptar ${valido}`)
  }
  for (const invalido of ['951 000', '123456789', 'abc1234567', '951-000-0000 ext 1']) {
    assert.equal(validarTelefono(invalido), false, `debería rechazar ${invalido}`)
  }
  assert.equal(validarTelefono(''), true, 'opcional y vacío')
  assert.equal(validarTelefono('', { requerido: true }), false)
  assert.equal(validarTelefono(null, { requerido: true }), false)
  assert.equal(validarTelefono('1'.repeat(21)), false, 'máximo 20 caracteres')
})
