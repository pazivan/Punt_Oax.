# Operación y recuperación — procedimiento pendiente de autorización productiva

Este documento no acredita una copia productiva ni autoriza operaciones en el VPS.

## Inventario de solo lectura

Un operador autorizado debe registrar versión/digest de API y frontend, versiones
de migraciones, proxy efectivo, volúmenes de BD/documentos, salud, reinicios,
recursos y logs redactados. Nunca incluir tokens, contraseñas ni datos personales.
Comparar la versión desplegada con el candidato revisado antes de autorizar cambios.

`/health` y `/api/health` prueban vida del proceso (JSON); `/api/ready` comprueba
BD con tiempo limitado y devuelve 503 si no está disponible. Un 200 HTML de la
SPA no es salud. El Compose local incorpora healthchecks, dependencias saludables
y restart para los tres servicios; no se afirma que el VPS use ese Compose.

## Copia y ensayo, solo después de autorización

1. Identificar copia privada fechada de PostgreSQL y documentos del mismo corte,
   permisos, cifrado, retención, responsable y objetivos RPO/RTO.
2. Verificar integridad del archivo de BD y hashes de documentos. Comparar cada
   `clave_almacenamiento` con el archivo correspondiente; registrar faltantes
   sin publicar nombres de archivos originales.
3. Restaurar exclusivamente en BD/contenedores nuevos y red aislada; correo mock
   y sin tráfico externo. Nunca restaurar sobre producción para «probar».
4. Comprobar migraciones, recuentos, login sintético, ficha/documento, reserva y
   cancelación. Documentar tiempo real y correspondencia metadatos/archivos.
5. Ensayar caída y recuperación de API/BD aisladas y verificar readiness.
6. Para rollback futuro conservar imagen/digest y configuración previos.
   Retroceder aplicación solo si es compatible con el esquema; cualquier
   restauración/migración de datos requiere plan y autorización separados.

## Antes de publicar

Respaldos recuperables, revisión de diferencias locales, puerta completa, decisión
de duración de citas, cuentas de demo controladas y limitaciones externas explícitas.
No ejecutar `compose down -v`, limpieza ni reinicios en producción bajo esta auditoría.
N01–N04 y recuperación productiva permanecen pendientes hasta obtener evidencia.
