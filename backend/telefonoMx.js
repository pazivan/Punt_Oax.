const { parsePhoneNumberFromString } = require("libphonenumber-js/max");
const { crearValidadorTelefono, MENSAJE_TELEFONO } = require("../frontend/src/utils/telefonoMx.mjs");

module.exports = { ...crearValidadorTelefono(parsePhoneNumberFromString), MENSAJE_TELEFONO };
