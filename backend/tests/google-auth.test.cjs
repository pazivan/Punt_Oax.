const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const express = require('express');
const { registrarRutasGoogle } = require('../googleAuth');
const { firmar, verificar, clientId } = require('./google-fixture.cjs');

test('biblioteca oficial: valida firma RSA, audiencia, emisor, expiración, identidad y correo verificado', async () => {
  const datos = await verificar(firmar());
  assert.equal(datos.sub, '109876543210987654321');
  assert.equal(datos.email, 'google@puntoax.online');
  const otraClave = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const ahora = Math.floor(Date.now() / 1000);
  const invalidos = [
    'basura', firmar({}, otraClave), firmar({ aud: 'otro-cliente' }),
    firmar({ iss: 'https://atacante.example' }), firmar({ exp: ahora - 1 }),
    firmar({ email_verified: false }), firmar({ email_verified: 'true' }),
    firmar({ sub: '' }), firmar({ sub: 'x'.repeat(256) }), firmar({ email: 'sin-correo' }),
    firmar({ nonce: '' }), firmar({ iat: ahora + 600 }),
  ];
  for (const token of invalidos) {
    await assert.rejects(verificar(token), (error) => error.status === 401 && error.codigo === 'GOOGLE_TOKEN_INVALIDO');
  }
});

test('rutas públicas: Google deshabilitado, origen, tipo de contenido y límite de intentos', async () => {
  const app = express();
  app.use(express.json());
  let consultas = 0;
  registrarRutasGoogle(app, {
    pool: { query: async () => { consultas++; throw new Error('No debe consultar BD'); } },
    env: { GOOGLE_CLIENT_ID: '' },
  });
  const appProtegida = express();
  appProtegida.use(express.json());
  registrarRutasGoogle(appProtegida, {
    env: { GOOGLE_CLIENT_ID: clientId }, limiteIp: async () => false,
  });
  const servidor = app.listen(0, '127.0.0.1');
  const protegido = appProtegida.listen(0, '127.0.0.1');
  await Promise.all([servidor, protegido].map((s) => new Promise((r) => s.once('listening', r))));
  try {
    const pedir = (s, headers) => fetch(`http://127.0.0.1:${s.address().port}/api/auth/google/desafio`, {
      method: 'POST', headers, body: '{}',
    });
    assert.equal((await pedir(servidor, {})).status, 503);
    for (const headers of [
      {}, { Origin: 'https://atacante.example', 'Content-Type': 'application/json', 'X-Puntoax-Google': '1' },
      { Origin: 'http://localhost:5173', 'Content-Type': 'text/plain', 'X-Puntoax-Google': '1' },
      { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
    ]) assert.equal((await pedir(protegido, headers)).status, 403);
    assert.equal((await pedir(protegido, {
      Origin: 'http://localhost:5173', 'Content-Type': 'application/json', 'X-Puntoax-Google': '1',
    })).status, 429);
    assert.equal(consultas, 0);
  } finally {
    await Promise.all([servidor, protegido].map((s) => new Promise((r) => s.close(r))));
  }
});
