# Corrección de carga lenta del botón Google

## Incidencia

El responsable reportó «Google tardó demasiado» **antes de que apareciera el
botón** en el sitio desplegado. Se distinguió este caso de una demora después
de seleccionar cuenta o del intercambio de credenciales con el backend.

La comprobación del VPS encontró servicios saludables. El SDK oficial y el
botón eran accesibles desde el navegador de comprobación. Eso no determina
la latencia ni los bloqueos del navegador/red del responsable.

El cargador anterior cancelaba la descarga a los 12 segundos y retiraba el
script. Se reprodujo el defecto con una descarga retenida durante 13 segundos:
la prueba falló antes del cambio porque aparecía el error en lugar de esperar
y permitir mostrar el botón al finalizar la descarga.

## Cambio acotado al frontend

- Plazo finito de descarga del SDK: 30 segundos.
- Aviso informativo después de seis segundos, manteniendo el formulario
  tradicional disponible.
- Verificación de que `initialize` y `renderButton` existen antes de considerar
  listo el SDK.
- El desafío se solicita **después** de tener el SDK, sin consumir solicitudes
  ni tiempo de validez mientras se descarga Google.
- Cancelación durante la preparación: una descarga que termine después no
  inicia el flujo ni solicita desafíos.
- Reintento de fallo de red sin recargar; descarga compartida sin duplicar scripts.
- No cambia la validación de tokens, nonce, CSRF, JWT, roles ni vínculos.
- No cambia backend, esquema, cuentas, citas, contraseñas ni sesiones.

El SDK sigue descargándose exclusivamente desde Google. No se copia ni
se sustituye por un SDK alojado por PuntOax.

## Validación

- Regresión de 13 segundos: falla con el código anterior y pasa con la corrección.
- Unitarias frontend: **47/47**.
- Navegador Google con doble del SDK/API: **11/11**, incluidos carga lenta,
  cancelación de carga, recuperación sin recargar, login/vinculación existentes
  y móviles.
- Lint y build frontend: correctos; persiste la advertencia habitual del tamaño
  del bundle.
- La primera ejecución de navegador simultánea al build tuvo una espera visual
  fallida en escritorio (10/11). Ese caso se repitió tres veces (3/3) y la suite
  completa terminó 11/11 sin relajar la aserción.

Comandos:

```sh
cd frontend
npm test
npm run lint
npm run build
npm run test:google:browser
```

Las simulaciones de demora son pruebas del comportamiento de la interfaz,
no autenticaciones de cuentas reales. La selección de cuenta y consentimiento
siguen correspondiendo al responsable. Ver el botón no aprueba registro,
login ni vinculación reales.

Si Google sigue sin descargar después del plazo, se informa de un posible
problema de conexión o bloqueo del recurso externo y se conserva la alternativa
de correo/contraseña. El cambio no puede garantizar acceso a Google en una red
que lo bloquee. No se relajan políticas de seguridad para evitar ese bloqueo.

## Publicación

El responsable autorizó publicar el PR, fusionarlo tras las comprobaciones
y actualizar **solo el frontend** del VPS. Debe conservarse una imagen anterior
para rollback; no requiere migraciones ni reiniciar backend o base de datos.
