let carga

const TIEMPO_MAXIMO_CARGA_MS = 30000
const ERROR_CARGA = 'No se pudo cargar Google. Revisa tu conexión y si el navegador bloquea el acceso a Google, o usa tu correo y contraseña.'

function obtenerGoogleIdentity() {
  const id = window.google?.accounts?.id
  return typeof id?.initialize === 'function' && typeof id?.renderButton === 'function' ? id : null
}

export function cargarGoogleIdentity() {
  const disponible = obtenerGoogleIdentity()
  if (disponible) return Promise.resolve(disponible)
  if (carga) return carga
  carga = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.lang = 'es'
    let terminado = false
    const plazo = setTimeout(() => terminar(new Error(ERROR_CARGA)), TIEMPO_MAXIMO_CARGA_MS)
    function terminar(error) {
      if (terminado) return
      terminado = true
      clearTimeout(plazo)
      script.onload = null
      script.onerror = null
      if (error) { script.remove(); carga = undefined; reject(error) }
      else resolve(obtenerGoogleIdentity())
    }
    script.onload = () => terminar(obtenerGoogleIdentity() ? null : new Error(ERROR_CARGA))
    script.onerror = () => terminar(new Error(ERROR_CARGA))
    document.head.appendChild(script)
  })
  return carga
}
