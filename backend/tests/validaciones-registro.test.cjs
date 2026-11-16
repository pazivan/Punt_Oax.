const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  MENSAJE_DOMINIO,
  contarDigitosTelefono,
  validarPassword,
  validarTelefono,
  verificarDominioCorreo,
} = require('../validacionesRegistro');

test('la política de contraseña exige mayúscula, número y símbolo', () => {
  assert.equal(validarPassword('Clave-segura9'), null);
  assert.equal(validarPassword('Ábcdef1!'), null);

  assert.match(validarPassword('12345678'), /mayúscula/);
  assert.match(validarPassword('Abcdefgh!'), /número/);
  assert.match(validarPassword('Abcdefg1'), /símbolo/);
  assert.match(validarPassword('abcdef1!'), /mayúscula/);
  assert.match(validarPassword('Ab1!'), /8 caracteres/);
  assert.match(validarPassword(null), /8 caracteres/);
  assert.match(validarPassword(`${'Aa1!'.padEnd(72, 'b')}c`), /72 caracteres/);
});

test('el teléfono requiere al menos 10 dígitos', () => {
  assert.equal(contarDigitosTelefono('+52 (951) 000-0000'), 12);
  assert.equal(validarTelefono('951 000 0000'), null);
  assert.equal(validarTelefono(''), null);
  assert.match(validarTelefono('', { requerido: true }), /10 dígitos/);
  assert.match(validarTelefono('951 000'), /10 dígitos/);
  assert.match(validarTelefono('abc1234567'), /10 dígitos/);
  assert.match(validarTelefono('1'.repeat(21)), /20 caracteres/);
  assert.match(validarTelefono(1234567890), /10 dígitos/);
});

test('acepta dominios con MX o registro A', async () => {
  const resolver = {
    resolveMx: async () => [{ exchange: 'mx.ejemplo.mx', priority: 10 }],
    resolve4: async () => ['192.0.2.1'],
  };
  assert.deepEqual(await verificarDominioCorreo('persona@ejemplo.mx', { resolver }), { ok: true });
});

test('usa el registro A cuando el dominio no publica MX', async () => {
  const resolver = {
    resolveMx: async () => { throw Object.assign(new Error('sin MX'), { code: 'ENODATA' }); },
    resolve4: async () => ['192.0.2.1'],
  };
  assert.deepEqual(await verificarDominioCorreo('persona@ejemplo.mx', { resolver }), { ok: true });
});

test('rechaza dominios inexistentes y reservados', async () => {
  const resolver = {
    resolveMx: async () => { throw Object.assign(new Error('no existe'), { code: 'ENOTFOUND' }); },
    resolve4: async () => { throw Object.assign(new Error('no existe'), { code: 'ENOTFOUND' }); },
  };
  assert.deepEqual(
    await verificarDominioCorreo('persona@dominio-inexistente.mx', { resolver }),
    { ok: false, error: MENSAJE_DOMINIO }
  );
  assert.deepEqual(await verificarDominioCorreo('persona@jajaja.com', { resolver }), {
    ok: false,
    error: MENSAJE_DOMINIO,
  });
  for (const correo of ['persona@example.com', 'persona@algo.test', 'persona@localhost']) {
    const resultado = await verificarDominioCorreo(correo, { resolver });
    assert.equal(resultado.ok, false, `debería rechazar ${correo}`);
  }
});

test('no bloquea el registro si el DNS no responde', async () => {
  const resolver = {
    resolveMx: async () => { throw Object.assign(new Error('sin red'), { code: 'EAI_AGAIN' }); },
    resolve4: async () => { throw Object.assign(new Error('sin red'), { code: 'EAI_AGAIN' }); },
  };
  assert.deepEqual(
    await verificarDominioCorreo('persona@ejemplo.mx', { resolver }),
    { ok: true, indeterminado: true }
  );
});

test('no espera indefinidamente si el DNS se queda colgado', async () => {
  const resolver = {
    resolveMx: () => new Promise(() => {}),
    resolve4: () => new Promise(() => {}),
  };
  assert.deepEqual(
    await verificarDominioCorreo('persona@ejemplo.mx', { resolver, tiempoMaximoMs: 20 }),
    { ok: true, indeterminado: true }
  );
});

test('permite desactivar la verificación con PUNTOAX_VERIFICAR_DOMINIO_CORREO=0', async () => {
  const anterior = process.env.PUNTOAX_VERIFICAR_DOMINIO_CORREO;
  process.env.PUNTOAX_VERIFICAR_DOMINIO_CORREO = '0';
  try {
    const resolver = {
      resolveMx: async () => { throw new Error('no debería consultarse'); },
      resolve4: async () => { throw new Error('no debería consultarse'); },
    };
    assert.deepEqual(
      await verificarDominioCorreo('persona@dominio-inexistente.mx', { resolver }),
      { ok: true, omitida: true }
    );
  } finally {
    if (anterior === undefined) delete process.env.PUNTOAX_VERIFICAR_DOMINIO_CORREO;
    else process.env.PUNTOAX_VERIFICAR_DOMINIO_CORREO = anterior;
  }
});
