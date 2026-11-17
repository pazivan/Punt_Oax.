// Datos de autocompletado de este navegador; no sustituyen al perfil del servidor.
export function clavePerfilLocal(id) {
  return `puntoax-perfil-datos:${String(id)}`
}

export function leerPerfilLocal(id, almacenamiento = globalThis.localStorage) {
  if (!id) return { nombre: '', apellidos: '', telefono: '' }
  try {
    const datos = JSON.parse(almacenamiento.getItem(clavePerfilLocal(id)))
    return {
      nombre: typeof datos?.nombre === 'string' ? datos.nombre : '',
      apellidos: typeof datos?.apellidos === 'string' ? datos.apellidos : '',
      telefono: typeof datos?.telefono === 'string' ? datos.telefono : '',
    }
  } catch {
    return { nombre: '', apellidos: '', telefono: '' }
  }
}

export function guardarPerfilLocal(id, datos, almacenamiento = globalThis.localStorage) {
  if (!id) throw new Error('No se pudo identificar la cuenta.')
  almacenamiento.setItem(clavePerfilLocal(id), JSON.stringify(datos))
}
