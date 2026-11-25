/**
 * Validaciones compartidas del registro y del contacto de las cuentas.
 *
 * Se aplican al crear cuentas nuevas (usuario y clínica) y a los campos de
 * contacto que se editan después. El inicio de sesión NO cambia: las cuentas
 * que ya existen siguen entrando con la contraseña que registraron.
 *
 * Reglas:
 *  - Contraseña: mínimo 8 caracteres, máximo 72 bytes (límite de bcrypt),
 *    al menos una mayúscula, un número y un símbolo.
 *  - Teléfono: numeración mexicana de 10 dígitos, prefijo +52 opcional.
 *  - Correo: además del formato, se comprueba que el dominio exista (MX o A).
 *    Si el DNS no responde se deja pasar: un fallo de red no debe impedir el
 *    registro. Se puede desactivar con PUNTOAX_VERIFICAR_DOMINIO_CORREO=0.
 */

const dns = require("node:dns/promises");
const telefonoMx = require("./telefonoMx");

const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72;
const TELEFONO_MIN_DIGITOS = 10;
const REGEX_MAYUSCULA = /[A-ZÁÉÍÓÚÜÑ]/;
const REGEX_SIMBOLO = /[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ\s]/;
const REGEX_CORREO = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

const MENSAJE_PASSWORD =
  "La contraseña debe tener al menos 8 caracteres, una mayúscula, un número y un símbolo.";
const MENSAJE_PASSWORD_LARGA = "La contraseña no puede superar los 72 caracteres.";
const { MENSAJE_TELEFONO, normalizarTelefono } = telefonoMx;
const MENSAJE_DOMINIO =
  "El dominio del correo no existe. Usa un correo real donde puedas recibir avisos.";

// Dominios reservados por las normas (RFC 2606 / RFC 6761) y ejemplos típicos.
// No hace falta consultarlos: nunca podrán recibir correo real.
const DOMINIOS_RESERVADOS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "localhost",
]);
const TLD_RESERVADOS = /\.(invalid|test|example|localhost)$/i;

function verificarDominioActivo() {
  const valor = String(process.env.PUNTOAX_VERIFICAR_DOMINIO_CORREO ?? "1").trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(valor);
}

/**
 * Devuelve null si la contraseña cumple la política, o el mensaje de error.
 */
function validarPassword(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) {
    return MENSAJE_PASSWORD;
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    return MENSAJE_PASSWORD_LARGA;
  }
  if (!REGEX_MAYUSCULA.test(password) ||
      !/\d/.test(password) ||
      !REGEX_SIMBOLO.test(password)) {
    return MENSAJE_PASSWORD;
  }
  return null;
}

function contarDigitosTelefono(valor) {
  return typeof valor === "string" ? (valor.match(/\d/g) || []).length : 0;
}

/**
 * Devuelve null si el teléfono es válido (o si es opcional y viene vacío),
 * o el mensaje de error.
 */
function validarTelefono(valor, { requerido = false } = {}) {
  return telefonoMx.validarTelefono(valor, { requerido }) ? null : MENSAJE_TELEFONO;
}

function dominioDeCorreo(correo) {
  if (typeof correo !== "string") return "";
  const limpio = correo.trim().toLowerCase();
  const arroba = limpio.lastIndexOf("@");
  return arroba === -1 ? "" : limpio.slice(arroba + 1);
}

async function consultarDominio(dominio, resolver) {
  try {
    const mx = await resolver.resolveMx(dominio);
    return { existe: Array.isArray(mx) && mx.length > 0 };
  } catch (error) {
    if (error?.code === "ENOTFOUND") return { existe: false };
    if (error?.code !== "ENODATA") {
      return { indeterminado: true, code: error?.code };
    }
    // El dominio existe pero no publica MX: se usa el registro A como respaldo.
    try {
      const a = await resolver.resolve4(dominio);
      return { existe: Array.isArray(a) && a.length > 0 };
    } catch (errorA) {
      if (errorA?.code === "ENOTFOUND" || errorA?.code === "ENODATA") {
        return { existe: false };
      }
      return { indeterminado: true, code: errorA?.code };
    }
  }
}

const TIEMPO_MAXIMO_DNS_MS = 3000;

function conTiempoLimite(promesa, ms = TIEMPO_MAXIMO_DNS_MS) {
  let temporizador;
  const limite = new Promise((resolver) => {
    temporizador = setTimeout(
      () => resolver({ indeterminado: true, code: "ETIMEOUT" }),
      ms
    );
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
}

/**
 * Comprueba que el dominio del correo pueda recibir mensajes.
 *
 * @returns {Promise<{ok: boolean, omitida?: boolean, indeterminado?: boolean, error?: string}>}
 */
async function verificarDominioCorreo(correo, {
  resolver = dns,
  tiempoMaximoMs = TIEMPO_MAXIMO_DNS_MS,
} = {}) {
  if (!verificarDominioActivo()) return { ok: true, omitida: true };

  const dominio = dominioDeCorreo(correo);
  if (!dominio || !REGEX_CORREO.test(`a@${dominio}`)) {
    return { ok: false, error: "El formato del correo electrónico no es válido." };
  }
  if (DOMINIOS_RESERVADOS.has(dominio) || TLD_RESERVADOS.test(dominio)) {
    return { ok: false, error: MENSAJE_DOMINIO };
  }

  const resultado = await conTiempoLimite(consultarDominio(dominio, resolver), tiempoMaximoMs);
  if (resultado.indeterminado) {
    // Sin respuesta del DNS: no se bloquea el registro.
    console.warn(
      `No se pudo verificar el dominio "${dominio}" (${resultado.code || "sin código"}); se permite el registro.`
    );
    return { ok: true, indeterminado: true };
  }
  if (!resultado.existe) return { ok: false, error: MENSAJE_DOMINIO };
  return { ok: true };
}

module.exports = {
  PASSWORD_MIN,
  PASSWORD_MAX_BYTES,
  TELEFONO_MIN_DIGITOS,
  MENSAJE_PASSWORD,
  MENSAJE_TELEFONO,
  MENSAJE_DOMINIO,
  REGEX_CORREO,
  validarPassword,
  contarDigitosTelefono,
  validarTelefono,
  normalizarTelefono,
  dominioDeCorreo,
  verificarDominioCorreo,
};
