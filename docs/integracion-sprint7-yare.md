# Integración selectiva de PR #84 sobre main

Se incorporaron el panel de clínica publicada, la vista de perfil del paciente,
la campana y el recordatorio de citas. No se reemplazaron `App.jsx`, autenticación,
registro de clínicas, gestión de citas ni administración por las versiones antiguas
del PR #84: `main` contiene cambios posteriores de correo, sesiones compartidas,
revocación, cupos y revisión de postulaciones.

## Rutas y permisos

- `/cuenta` → `/mi-perfil` (solo paciente); edición local de nombre, apellidos y
  teléfono, separada por ID de usuario, con autocompletado al abrir `/agendar-cita`.
  El botón **Salir** conserva la revocación de sesión de `main`.
- Campana en `/cuenta` y `/mi-perfil`; recordatorio en `/cuenta`.
  Obtienen citas de `GET /api/citas` mediante el JWT del paciente; únicamente
  citas confirmadas futuras aparecen como próximas. La campana vuelve a consultar
  al abrirse. No hay notificaciones push ni proceso de envío automático.
- `/mi-clinica` → `/panel-clinica` solo si la sede está aprobada, y desde el
  encabezado se puede llegar a `/mi-clinica/citas` y `/mi-clinica/agenda`.
  El panel lee `mi-ficha` y `mi-citas`; para datos publicados usa
  `PATCH /api/clinicas/mi-ficha/datos-publicados`. El servidor determina la
  clínica desde el JWT y valida los campos modificables.
- `/admin` y `/admin/solicitudes/:id` conservan `RutaPrivada` con rol
  administrador; listado, detalle, documentos, aprobación/rechazo y visibilidad
  permanecen en las rutas existentes `GET/PATCH /api/admin/*`, protegidas en
  `backend/adminClinicas.js`. No se cambió su implementación.

## Nota histórica — sustituida por el manual vigente

El apartado siguiente describe ese sprint, no la entrega actual. Hoy existen
`GET /api/auth/perfil`, `PATCH /api/auth/perfil` y cambio autenticado de contraseña;
la reserva persiste contacto en servidor. Ver [manual vigente](entrega-local-auditada.md).

Nombre, apellidos y teléfono del perfil **solo se guardan en localStorage**:
no se sincronizan entre dispositivos y el servidor no los registra al reservar,
porque `POST /api/citas` solo recibe el identificador del cupo. Para persistirlos
hay que agregar columnas (o entidad de perfil) en `usuarios`, una migración,
`GET/PATCH` autenticados que tomen el ID del JWT y validen los datos, y consultar
esos valores al iniciar sesión y al completar una reserva. No se incorporó el
supuesto cambio de contraseña del PR #84: llamaba a un endpoint inexistente y
mostraba éxito incluso si la solicitud fallaba; requeriría un endpoint real con
verificación de contraseña actual, hashing y revocación de sesiones.

## Comprobación manual antes de fusionar

Probar con cuentas reales de paciente, clínica aprobada, clínica pendiente y
administrador: guardar y recargar perfil, agendar/cancelar citas y reabrir campana,
editar contacto y servicios publicados, administrar agenda, revisar y resolver
postulaciones. Confirmar el aspecto en móvil y que ninguna modificación del panel
afecta datos de otra clínica. Estas verificaciones requieren una base de pruebas;
no se han ejecutado contra el VPS.
