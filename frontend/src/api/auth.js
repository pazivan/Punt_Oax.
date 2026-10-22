async function enviarAuth(ruta, datos) {
  let respuesta

  try {
    respuesta = await fetch(ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor.')
  }

  const contenido = await respuesta.json().catch(() => ({}))

  if (!respuesta.ok) {
    throw new Error(contenido.error || `Error del servidor (${respuesta.status}).`)
  }

  return contenido
}

export function registrarUsuario(datos) {
  return enviarAuth('/api/auth/registro-usuario', datos)
}

export function iniciarSesion(correo, password) {
  return enviarAuth('/api/auth/login-usuario', { correo, password })
}
