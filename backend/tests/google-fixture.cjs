// Simula únicamente el servidor de certificados, no la verificación criptográfica.
const { generateKeyPairSync, randomBytes } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { verificarCredencial } = require('../googleAuth');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const clientId = 'puntoax-test.apps.googleusercontent.com';
const cliente = new OAuth2Client();
cliente.getFederatedSignonCertsAsync = async () => ({
  certs: { prueba: publicKey.export({ type: 'spki', format: 'pem' }) }, format: 'PEM',
});
function firmar(datos = {}, clave = privateKey) {
  const ahora = Math.floor(Date.now() / 1000);
  return jwt.sign({
    iss: 'https://accounts.google.com', aud: clientId, sub: '109876543210987654321',
    email: 'google@puntoax.online', email_verified: true,
    nonce: randomBytes(32).toString('hex'), iat: ahora, exp: ahora + 300, ...datos,
  }, clave, { algorithm: 'RS256', keyid: 'prueba' });
}
module.exports = {
  firmar, clientId, verificar: (token, audiencia = clientId) => verificarCredencial(token, audiencia, cliente),
};
