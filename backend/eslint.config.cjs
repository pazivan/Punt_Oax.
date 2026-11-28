const js = require('@eslint/js');
const globals = require('globals');

module.exports = [{
  // Introducir lint sin cambiar módulos históricos ajenos a autenticación.
  files: ['googleAuth.js', 'tests/google-*.cjs', 'eslint.config.cjs'],
  ...js.configs.recommended,
  languageOptions: { sourceType: 'commonjs', globals: { ...globals.node, ...globals.es2025 } },
}];
