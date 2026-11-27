# Colección Bruno de PuntOax

Abre esta carpeta en Bruno compatible con OpenCollection YAML y selecciona **local**.

- Empieza por **Salud** y **Catalogo → municipios**. El resto del catálogo requiere sesión.
- Configura correos y contraseñas con variables secretas de Bruno o un entorno privado ignorado por Git (`*.private.yml`). No guardes credenciales en `local.yml`.
- Para peticiones POST/PUT/PATCH/DELETE, activa conscientemente `permitirEscrituras=true` en una base de pruebas. Por defecto están bloqueadas, incluidos login y envíos de correo.
- Registro → verificar correo → login. Usa `rolCorreo`, `correoCuenta` y `codigoVerificacion` para el código recibido. Los login conservan los tokens solo en memoria; `tokenSesion` corresponde al último rol autenticado.
- `municipioClave` es la clave INEGI de cinco caracteres. `telefono` acepta 10 dígitos o +52. Configura `fechaAgenda` con una fecha futura permitida: no hay fechas fijas que caduquen.
- Selecciona explícitamente `idSolicitud`, `idUsuario` e `idClinica` antes de aprobar, desactivar u ocultar registros. No ejecutes la colección completa contra producción.
- **Validaciones** espera errores 400/401/403 para municipios inventados/ambiguos, teléfonos incorrectos y permisos. Requiere sesiones válidas de paciente y clínica para los casos autenticados.
- Las respuestas de citas pueden incluir teléfonos: no publiques reportes ni capturas con datos reales.
