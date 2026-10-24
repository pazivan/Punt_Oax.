# Integración local Sprint 4

Esta rama reúne el frontend de Miguel/Yareli, el registro de Kelly, el esquema de Iván, el login JWT de Jonathan y adapta las rutas protegidas iniciales de Citlalli. No incluye registro de clínicas ni paneles funcionales por rol. El directorio `/` permanece público.

## Requisitos

- Una base PostgreSQL/PostGIS con el esquema v1.3. **No ejecutar las pruebas de integración contra datos reales**: crean usuarios y clínicas de prueba.
- `JWT_SECRET` aleatorio de al menos 32 caracteres. No usar el texto de `.env.example` como clave real. Docker Compose requiere la variable en el entorno; nunca subirla a Git.
- En desarrollo, instalar dependencias con `npm ci` en `backend/` y `frontend/`. Configurar `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` para la API y ejecutar `npm start` en `backend/` y `npm run dev` en `frontend/`. Vite reenvía `/api` a `localhost:3000`.
- Con Docker Compose, definir `JWT_SECRET` y `SPRINT4_DB_PASSWORD` distintos y aleatorios en un `.env` local no versionado (ver `.env.example`). Esta configuración usa un volumen nuevo `sprint4_pgdata`, un contenedor propio y los puertos locales 55441 (BD), 3000 (API) y 8080 (web): **no reutiliza ni borra el volumen de Sprint 3**. Ejecutar `docker compose up -d db`, `docker compose build backend` y `docker compose run --rm backend npm run migrate` antes de iniciar el resto. La imagen del backend incluye las migraciones. Si se trabaja con una base v1.3 existente, respaldarla y evaluar sus restricciones antes de migrarla.

## Migraciones y seguridad

- **Base nueva:** Docker Compose ejecuta solo la migración 001 para crear tablas con `usuarios.nombre` opcional y registra esa versión. **No montar `db/init.sql` en un entorno real:** ese archivo original incluye usuarios y contraseñas demo conocidas. La migración 003 también se puede aplicar después para bases existentes.
- **Base v1.3 anterior con `usuarios.nombre NOT NULL`:** la migración `003_usuarios_nombre_opcional.up.sql` elimina esa restricción sin borrar datos. Su reversión solo funciona si no existen usuarios sin nombre; no se inventan nombres para revertirla.
- **Base creada con el esquema de Sprint 3:** tiene una tabla `clinicas` distinta (ID entero frente a UUID y otras columnas incompatibles). **No reutilizar su volumen ni ejecutar 001 directamente**: falta diseñar y validar una migración conservando las clínicas existentes si esos datos son necesarios. El cambio de `init.sql` no modifica un volumen ya inicializado. Si solo contiene clínicas de prueba descartables, se puede usar el volumen nuevo aislado y mantener la base antigua respaldada. No borrar el volumen anterior sin confirmación.
- La migración 002 incluye cuentas demo con claves publicadas. `npm run migrate` **la omite por defecto**; solo en una base desechable se permite `ALLOW_DEMO_SEEDS=1 npm run migrate`. Si un volumen anterior se inicializó con `db/init.sql`, ya tiene esas cuentas: bloquear acceso a ellas o cambiar sus credenciales antes de exponerlo. No usar esas cuentas en producción. Revisar el contenido antes de migrar cualquier base compartida.

## Verificación

Con una API y una base **aisladas** funcionando, ejecutar en `backend/`:

```bash
PUNTOAX_TEST_DB=1 npm run test:integration
```

La prueba rechaza ejecutarse si `PGDATABASE` no comienza con `puntoax_s4_test` y cubre: registro sin nombre persistido, errores 400/409, login usuario y clínica, perfil Bearer, token inválido y ruta exclusiva de administrador. Para las pruebas unitarias del cliente: `cd frontend && npm run lint && npm run test && npm run build`. En el navegador probar `/`, `/registro`, `/login`, `/cuenta` y `/admin` (redirige o deniega el acceso sin rol autorizado). La API debe imponer permisos incluso si alguien evita el frontend.

### Resultados locales de preparación

- Frontend: `npm run lint`, `npm run test` (5/5) y `npm run build`: correctos.
- Backend: `npm run test:integration` (1/1, varios casos reales), comprobación sintáctica y `npm audit --omit=dev --audit-level=high`: correctos. Docker Compose valida y la imagen backend se construye con las migraciones incluidas.
- En bases de prueba: migraciones 001 y 003 desde cero sin datos demo; migración 003 sobre una base v1.3 con `nombre NOT NULL` cambia la columna a nullable. La inicialización con los archivos montados por Compose deja tablas creadas y **cero cuentas demo**.
- Chrome + API + PostgreSQL aislados: registro real sin nombre, login, perfil, logout, denegación de `/admin` para usuario y entrada para administrador: correctos. El registro de clínica muestra explícitamente que no está disponible.
- En una copia **aislada** del esquema Sprint 3, la migración 001 falla con `column "correo_acceso" does not exist`. No ejecutar migraciones sobre el volumen anterior. El volumen nuevo de Sprint 4 evita ese conflicto, pero un despliegue sobre una instalación ya existente requiere una decisión explícita sobre los datos antiguos.
- Se revisó el volumen local de Sprint 3: contenía solo tres clínicas de prueba. Se generó un respaldo privado con `pg_dump -Fc`, se comprobó con `pg_restore -l` y se restauró en otra base aislada (tres clínicas); el volumen original permanece activo e intacto.
- La nueva instalación de Compose usa `punt_oax-sprint4-integracion_sprint4_pgdata` y arranca sin clínicas, usuarios ni administradores demo. La web en `http://127.0.0.1:8080` reenvía `/api` al backend; se probó registro, login y perfil a través de Nginx con una cuenta temporal eliminada al terminar. Para detener solo la instalación nueva, usar `docker compose stop` desde esta rama (sin `down -v`, que sí borraría su volumen).
