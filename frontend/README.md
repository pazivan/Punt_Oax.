# PuntOax · Frontend

## Tipografías

La interfaz usa Nimbus Sans, los destacados usan Liberation Serif y los
códigos usan una fuente monoespaciada.

Las fuentes originales sin modificar se incluyen en `public/fonts/`: Nimbus Sans
(URW Software / (URW)++ Design & Development, AGPL-3 con excepción de fuente)
y Liberation Serif (Google Corporation / Red Hat, Inc., SIL OFL-1.1).
Los avisos de copyright, la excepción y el texto completo de las licencias
acompañan los archivos en `public/fonts/licenses/`.

## Ejecutar en desarrollo

Desde `frontend/`:

```bash
npm ci
npm run dev
```

Abrir la dirección que muestra Vite (normalmente `http://localhost:5173`). El mapa y el directorio requieren iniciar sesión. Debe estar activa una API en `http://localhost:3000`: Vite reenvía allí las peticiones a `/api` mediante `vite.config.js`. En el despliegue con Nginx, `nginx.conf` reenvía `/api/` al servicio `backend:3000`.

La API integrada debe ofrecer:

| Operación | Ruta | Solicitud/respuesta esperada |
| --- | --- | --- |
| Registro de usuario | `POST /api/auth/registro-usuario` | `{ correo, password }`; exige verificar el correo antes del acceso. |
| Registro de clínica | `POST /api/auth/registro-clinica` | `{ nombre, correo, password }`; crea una cuenta en borrador que debe verificar su correo. |
| Acceso de usuario | `POST /api/auth/login-usuario` | `{ correo, password }` → `{ token, usuario }`. |
| Acceso de clínica | `POST /api/auth/login-clinica` | `{ correo, password }` → `{ token, clinica }`. |
| Perfil | `GET /api/auth/perfil` | `Authorization: Bearer <token>` → datos de perfil. |
| Directorio | `GET /api/clinicas` | Lista de clínicas aprobadas con sesión válida. |

Las rutas protegidas verifican sesión y rol en frontend y backend. `src/api/auth.js` concentra la sesión compartida entre pestañas y el cierre de sesión.

## Comprobaciones

```bash
npm run lint
npm run test
npm run build
```

Las pruebas unitarias no crean cuentas en producción. Para instalación, permisos y pruebas con una base aislada consulta el [manual vigente](../docs/entrega-local-auditada.md).
