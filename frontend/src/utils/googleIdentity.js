let carga

export function cargarGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  if (carga) return carga
  carga = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.lang = 'es'
    const plazo = setTimeout(() => terminar(new Error('Google tardó demasiado en responder. Inténtalo de nuevo.')), 12000)
    function terminar(error) {
      clearTimeout(plazo)
      script.onload = null
      script.onerror = null
      if (error) { script.remove(); carga = undefined; reject(error) }
      else resolve(window.google.accounts.id)
    }
    script.onload = () => terminar(window.google?.accounts?.id ? null : new Error('No se pudo cargar el acceso con Google.'))
    script.onerror = () => terminar(new Error('No se pudo cargar Google. Revisa tu conexión o usa tu correo y contraseña.'))
    document.head.appendChild(script)
  })
  return carga
}
