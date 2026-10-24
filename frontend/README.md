# PuntOax · Frontend

## Ejecutar en desarrollo

Desde `frontend/`:

```bash
npm ci
npm run dev
```

Abrir la dirección que muestra Vite (normalmente `http://localhost:5173`). La consulta pública del directorio no exige iniciar sesión. Para obtener datos reales o usar los formularios, debe estar activa una API en `http://localhost:3000`: Vite reenvía allí las peticiones a `/api` mediante `vite.config.js`. En el despliegue con Nginx, `nginx.conf` reenvía `/api/` al servicio `backend:3000`. La URL de la API no se configura en el formulario.

La API integrada debe ofrecer:

| Operación | Ruta | Solicitud/respuesta esperada |
| --- | --- | --- |
| Registro de usuario | `POST /api/auth/registro-usuario` | `{ correo, password }` (mínimo 8 caracteres); respuesta JSON de éxito. No se envía nombre. |
| Acceso de usuario | `POST /api/auth/login-usuario` | `{ correo, password }` → `{ token, usuario }`. |
| Acceso de clínica | `POST /api/auth/login-clinica` | `{ correo, password }` → `{ token, clinica }`. |
| Perfil | `GET /api/auth/perfil` | `Authorization: Bearer <token>` → datos de perfil. |
| Directorio público | `GET /api/clinicas` | Lista de clínicas sin autenticación. |

El registro de clínicas **no está disponible**: no existe un endpoint para ello. La aplicación no aplica autorización de rutas por rol. Para este prototipo, `src/api/auth.js` concentra la persistencia en `sessionStorage` (solo en esta pestaña, se elimina al cerrar sesión o si `/api/auth/perfil` rechaza el token con 401/403). El equipo debe acordar la estrategia definitiva de sesión antes de desplegarla.

## Comprobaciones

```bash
npm run lint
npm run test
npm run build
```

`npm run test` simula las respuestas de la API: prueba las rutas, el cuerpo de las solicitudes, los formatos de login, errores y la sesión. **No crea cuentas ni prueba la base de datos real**. Para completar la integración, ejecutar conjuntamente los cambios de registro de Kelly, autenticación de Jonathan y el esquema/migración de Iván, comprobar que la base de datos activa admite `usuarios.nombre` nulo, y probar en el navegador registro correcto, correo repetido, credenciales erróneas, login, perfil, token rechazado y cierre de sesión. Una base ya creada con `nombre NOT NULL` necesita una migración que elimine esa restricción: editar solo el SQL de inicialización no altera una tabla existente.
