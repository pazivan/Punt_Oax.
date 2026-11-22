export function ocultarCorreo(correo) {
  if (typeof correo !== 'string' || !correo.includes('@')) return 'Correo no indicado'
  const [usuario, dominio] = correo.split('@')
  return `${usuario.slice(0, Math.min(4, usuario.length))}***@${dominio}`
}

export function insertarDigitos(actuales, indice, entrada) {
  const limpios = String(entrada).replace(/\D/g, '')
  const inicio = limpios.length === 6 ? 0 : indice
  const digitos = limpios.slice(0, 6 - inicio)
  const siguientes = [...actuales]
  for (let i = 0; i < digitos.length; i++) siguientes[inicio + i] = digitos[i]
  return { digitos: siguientes, siguiente: Math.min(inicio + digitos.length, 5) }
}
