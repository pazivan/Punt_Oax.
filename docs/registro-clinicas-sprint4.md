# Registro de cuentas de clínica — Sprint 4

Fecha: 27 de octubre de 2026. Rama de integración: `miguel/registro-clinicas-sprint4`, creada desde `main` (`816c78e`). Este documento describe la integración del registro institucional sin publicar clínicas ni adelantar el Sprint 7.

## Alcance y decisión funcional

Se separan dos procesos:

- **Proceso A (Sprint 4):** la clínica crea su **cuenta de acceso** con nombre, correo y contraseña. La cuenta puede iniciar sesión, pero la clínica queda en `estado_publicacion = 'borrador'` y no aparece en el catálogo público.
- **Proceso B (Sprint 7):** desde su cuenta, la clínica completará dirección, ubicación, servicios, horarios, contacto y documentación, y enviará una solicitud de revisión. Solo un administrador podrá aprobar su publicación.

En este sprint **no** se crean filas en `solicitudes_clinicas`, no se completa información institucional inventada y no se modifica `estado_publicacion` desde el cliente.

## Reutilización del trabajo del equipo

| Integrante | Aportación encontrada | Qué se aprovechó | Adaptación necesaria | Qué quedó intacto |
| --- | --- | --- | --- | --- |
| **Iván** | Modelo PostgreSQL/PostGIS v1.3, tabla `clinicas` con UUID, `correo_acceso`, `password_hash`, `estado_publicacion` y restricciones. | Tabla y columnas existentes; restricciones de estado, hash y cuenta institucional. | Ninguna migración nueva. Se usa `estado_publicacion = 'borrador'` explícitamente. | Esquema, migraciones 001/002/003 y guía del modelo. |
| **Kelly** | Registro de usuarios, validación de correo/contraseña, normalización, bcrypt, 409 por duplicado y respuesta sin hash. | `hashearPassword`, patrón de validación, normalización `LOWER(TRIM(...))`, manejo del código PostgreSQL `23505` y respuestas 400/409/500. | El mismo patrón se aplicó al alta de clínicas, sin duplicar el endpoint de usuarios. | `POST /api/auth/registro-usuario` y su contrato. |
| **Jonathan** | Login de usuario, clínica y administrador; JWT; perfil Bearer; middleware de rol. | `POST /api/auth/login-clinica`, `generarToken`, `autenticarToken`, `requerirRol` y `GET /api/auth/perfil`. | Ninguna al login: la cuenta creada usa el login institucional existente. | Los tres logins y la protección de `/api/admin/panel-prueba`. |
| **Yareli** | Pantalla y formulario de registro de clínicas del PR #49, con nombre, correo, contraseña y confirmación; estilos de `Auth.css`. | Merge normal de `origin/yareli-registro-clinica` (`2a417af`) hacia la rama de integración, conservando su diseño, toggle usuario/clínica y campos. | Se sustituyó el mensaje temporal de “registro no disponible” por la llamada real a la API; se añadieron estados de carga/error, validación previa, mensaje de éxito y `maxLength`. Se corrigió el texto “PUNTOOAX” por “PUNTOAX”. | Estructura visual, clases CSS, panel izquierdo, toggle, campos y botones de su formulario. |
| **Citlalli** | `Validaciones.js` con `validarEmail`, `validarPassword` y `validarRequerido`; una `RutaPrivada` basada en `localStorage` y un login/registro simulados con `setTimeout`. | Se adaptaron las tres ideas de validación reutilizable a `frontend/src/utils/validaciones.js`, con límites alineados al backend y al esquema. | Se descartaron los tokens de ejemplo, `localStorage`, `setTimeout`, alertas y la pantalla alternativa. La autenticación real de `main` tiene prioridad. | `RutaPrivada.jsx` de `main`, basada en perfil JWT verificado; no se reemplazó por la versión simulada. |
| **Miguel** | Integración API/React, sesión, manejo de errores, despliegue aislado y pruebas. | Endpoint, conexión del formulario, validaciones compartidas, pruebas y documentación. | — | Historial y autoría de los commits del equipo. |

La rama de Yareli se incorporó con `git merge --no-ff`, sin squash ni rebase. Su commit original sigue en el grafo. La rama de Citlalli **no se fusionó**; solo se adaptaron sus validaciones.

## Backend

### Endpoint

`POST /api/auth/registro-clinica`

Petición:

```json
{
  "nombre": "Clínica Comunitaria San Jacinto",
  "correo": "contacto@ejemplo.com",
  "password": "ContrasenaSegura123"
}
```

Respuesta exitosa (`201`):

```json
{
  "mensaje": "Cuenta de clínica creada correctamente.",
  "clinica": {
    "id": "UUID",
    "nombre": "Clínica Comunitaria San Jacinto",
    "correo": "contacto@ejemplo.com",
    "rol": "clinica",
    "estado_publicacion": "borrador"
  }
}
```

No se emite JWT en el registro. El flujo acordado es crear la cuenta y después iniciar sesión con `POST /api/auth/login-clinica`. Esto evita abrir una sesión automática para una institución aún no verificada. El registro de usuarios conserva su comportamiento actual (emite token), que no se modifica.

### Validaciones y seguridad

| Regla | Comportamiento |
| --- | --- |
| Nombre obligatorio | `400` si falta, no es texto o contiene solo espacios. |
| Longitud del nombre | Máximo 255 caracteres, igual que `VARCHAR(255)`. |
| Correo obligatorio | `400` si falta o no es texto. |
| Formato de correo | `400` si no cumple `^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$`. |
| Longitud del correo | Máximo 255 caracteres. |
| Normalización | `trim().toLowerCase()` antes de consultar/insertar. |
| Contraseña | Mínimo 8 caracteres. |
| Límite de bcrypt | Máximo 72 bytes UTF-8; se rechaza con `400` en lugar de truncar silenciosamente. |
| Hash | `hashearPassword` existente (bcrypt, coste 10). Nunca se guarda texto plano. |
| Duplicados | `409` por el índice único de `correo_acceso`; se captura `23505`. |
| SQL | Consultas parametrizadas. |
| Respuesta | Nunca incluye `password` ni `password_hash`. |
| Estado | Se fija en el servidor como `'borrador'`; el cliente no puede enviarlo. |
| Rol | Se fija en el servidor como `'clinica'`; un `rol` enviado por el cliente se ignora. |
| Errores internos | `500` genérico; el detalle solo se registra en el servidor. |

### Unicidad de correos

La unicidad se aplica **por tabla/rol**, como ya ocurría en el modelo:

- `clinicas.correo_acceso` tiene restricción única y un índice único sobre `LOWER(TRIM(correo_acceso))`.
- `usuarios.correo` y `administradores.correo` tienen sus propias restricciones.
- No existe una restricción global que impida que el mismo correo se use como usuario y como clínica.

No se cambió ese comportamiento. Si el equipo decide una unicidad global, requiere una migración y una decisión de producto; no se implementó silenciosamente.

### Publicación y catálogo

`GET /api/clinicas` ya filtraba `WHERE estado_publicacion = 'aprobada'`. La prueba de integración confirma que una clínica recién registrada en `borrador` no aparece, mientras que una aprobada sí. La aprobación y publicación quedan para el Sprint 7.

## Frontend

- `frontend/src/api/auth.js`: nueva función `registrarClinica(nombre, correo, password)` que consume `POST /api/auth/registro-clinica`.
- `frontend/src/components/Auth/Register.jsx`: conserva el formulario de Yareli y ahora:
  - valida nombre, correo, contraseña y confirmación antes de enviar;
  - normaliza el correo y recorta el nombre;
  - evita solicitudes duplicadas con la referencia `enviando`;
  - muestra estados de carga y errores;
  - al terminar, navega al login con el mensaje: “Tu cuenta de clínica fue creada correctamente. Ya puedes iniciar sesión. La información de tu institución todavía no está publicada y deberá verificarse posteriormente.”;
  - no guarda contraseñas en `localStorage` ni `sessionStorage`.
- `frontend/src/components/Auth/Login.jsx`: reutiliza las validaciones compartidas y normaliza el correo; conserva el login de usuario y de clínica.
- `frontend/src/utils/validaciones.js`: adaptación de las validaciones de Citlalli, con límites coherentes con el backend.
- `frontend/src/RutaPrivada.jsx`: se mantiene la versión real de `main`; no se incorporó la simulación de Citlalli.

## Pruebas ejecutadas

### Frontend

```bash
cd frontend
npm run lint
npm run test
npm run build
```

Resultados reales:

- `lint`: correcto (exit 0).
- `test`: 8/8 pruebas aprobadas (6 de autenticación y 2 de validaciones).
- `build`: correcto; `vite v8.3.4`, 31 módulos, `dist` generado.

### Backend y PostgreSQL/PostGIS

Se usó un contenedor temporal `postgis/postgis:15-3.3` con `--tmpfs /var/lib/postgresql/data` (sin volumen nombrado), base `puntoax_s4_test_registro`, puerto local 55444 y API aislada en 3102. Se aplicaron las migraciones 001 y 003; la 002 se omitió por defecto.

```bash
PUNTOAX_TEST_DB=1 PGHOST=127.0.0.1 PGPORT=55444 \
  PGDATABASE=puntoax_s4_test_registro PGUSER=postgres \
  PGPASSWORD=<clave_temporal> PUNTOAX_TEST_API_PORT=3102 \
  npm run test:integration
```

Resultado real: **1/1 prueba aprobada**. La prueba cubre:

1. Registro exitoso con nombre, correo y contraseña.
2. Nombre vacío o solo espacios.
3. Correo inválido.
4. Contraseña menor de ocho caracteres y mayor de 72 bytes.
5. Correo duplicado, incluso con mayúsculas/espacios.
6. Normalización de correo.
7. Hash bcrypt verificado con `bcrypt.compare` (longitud 60, prefijo `$2b$`).
8. Respuesta sin contraseña ni hash y sin token.
9. Estado inicial `borrador`.
10. Cero filas en `solicitudes_clinicas`.
11. Login con la cuenta recién creada.
12. Rechazo de contraseña incorrecta (`401`).
13. JWT con rol `clinica` en `/api/auth/perfil`.
14. Perfil autenticado con el `id_clinica` correcto.
15. Denegación de `/api/admin/panel-prueba` (`403`).
16. La clínica en `borrador` no aparece en `GET /api/clinicas`; una aprobada sí.
17. Intento de inyectar `rol: administrador` y `estado_publicacion: aprobada`: se ignora y queda `clinica`/`borrador`.

Evidencia en la base temporal antes de retirarla:

```text
Clínica Comunitaria San Jacinto | ...@ejemplo.com | borrador | hash_len 60 | $2b$
Clínica con rol inyectado       | ...@ejemplo.com | borrador | hash_len 60 | $2b$
Clínica aprobada de prueba      | (sin cuenta)    | aprobada |            |
solicitudes_clinicas: 0
```

El contenedor temporal se retiró al terminar. No se usaron ni modificaron los volúmenes existentes de Sprint 3/Sprint 4.

## Pendientes y límites

- No se hizo prueba E2E en navegador real; la verificación del formulario es por compilación, pruebas unitarias de la capa API y prueba de integración del backend. Falta una revisión visual/manual de `/registro` y `/login`.
- El login de clínica no devuelve `estado_publicacion` en la sesión; hoy la cuenta puede iniciar sesión, pero la interfaz no muestra todavía el estado `borrador` en “Mi cuenta”. No impide el Sprint 4.
- La publicación, la solicitud administrativa y la edición de la ficha institucional pertenecen al Sprint 7 y no se implementaron.
- No se hizo `push`, PR ni merge a `main`.
- La unicidad global de correos entre roles sigue sin implementarse; el comportamiento actual es por tabla.
