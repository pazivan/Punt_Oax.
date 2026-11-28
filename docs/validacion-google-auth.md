# Evidencias de Google Auth — 28 de noviembre de 2026

## Alcance y resultado

Los resultados automatizados de este informe corresponden a la implementación
del commit `9698d52` (antes `a3ce67d`, renombrado sin cambios de código).
La preparación posterior del cliente OAuth real y sus
pruebas manuales se registran por separado en
[Google real local](prueba-google-real-local.md): SDK real comprobado, pero
registro, login, cancelación y vinculación reales todavía **pendientes**.

Rama `boton-google`, basada en `origin/main` `3680d55`.
Validación realizada localmente, antes de publicar la rama/PR, sin CI remota,
merge ni acceso al VPS. La publicación posterior no aprueba las pruebas reales
pendientes ni autoriza un despliegue.
Node 22.23.1, Chrome del sistema y PostgreSQL 15/PostGIS 3.3 en contenedores
exclusivos de ensayo. No se usaron usuarios ni credenciales privadas de Google.

**Las pruebas nuevas pasan. La validación completa no está totalmente verde:**
hay un fallo de navegador reproducido contra el frontend intacto de `main`
y otro en una prueba histórica que el propio proyecto excluye de su puerta
vigente. No se eliminaron pruebas ni se modificaron módulos ajenos para ocultarlos.

| Comprobación | Resultado |
| --- | --- |
| Backend `npm run test:local` (incluye nuevas unitarias Google) | 91/91 |
| Integración backend existente: correo, auth tradicional, API, municipios y auditoría | 16/16 |
| `npm run test:google:integration` | 8/8 |
| Integración catálogo ILE en DB 55483 | 1/1 |
| Backend `npm test`, con entorno de la BD sintética | Conexión y smoke correctos |
| Frontend `npm test` | 43/43 |
| Frontend `npm run test:google:browser` | 8/8 |
| Frontend `npm run test:qa:browser` | 13/14; fallo heredado descrito abajo |
| Script histórico `backend/tests/mapa-ile.e2e.cjs` | Falla por esperar catálogo sin JWT |
| ESLint frontend | Correcto |
| ESLint backend Google/pruebas + sintaxis servidor | Correcto |
| Vite build sin ID y con ID público de ensayo | Correctos |
| Docker build backend y frontend con build arg Google | Correctos |
| `docker compose --env-file .env.example config --quiet` | Correcto |
| `git diff --check` | Correcto |
| `npm audit --omit=dev`, backend | 0 vulnerabilidades |

Vite advierte sobre el tamaño del bundle (>500 kB), como ya ocurre sin Google;
no se hizo una refactorización de módulos ajenos para silenciarlo.
Las pruebas históricas de auditoría también emiten una advertencia de pg sobre
consultas concurrentes en el mismo cliente; no impide su aprobación.
Backend no tenía lint configurado: se añade ESLint acotado a Google y sus pruebas,
sin afirmar que se haya limpiado o auditado con ESLint todo el código histórico.

## Cobertura nueva ejecutada

- Firma RSA realmente verificada mediante la biblioteca oficial; rechazo de
  firma ajena, texto inválido, audiencia/emisor incorrectos, expiración, emisión
  futura, correo no verificado, sujeto/nonce inválidos.
- Origen exacto, JSON, cabecera requerida, límite de solicitudes, cookie segura,
  CSRF, nonce de otro intento y desafío vencido/consumido.
- Dos intercambios simultáneos de la misma credencial: solo uno tiene éxito.
- Altas concurrentes: correo y sujeto únicos en PostgreSQL.
- Alta solo Google: contraseña nula; login tradicional responde 401, no se rompe.
  Registro tradicional con ese correo responde 409.
- Identidad ya vinculada: mismo UUID y correo local aunque cambie el correo
  enviado por Google.
- Vinculación: bcrypt original y consentimiento; rechazo sin consentimiento,
  contraseña errónea, navegador ajeno, prueba vencida/reutilizada, correo o versión
  de sesión cambiados, cuenta no verificada/desactivada.
- Se conservan hash y perfil originales; sesiones previas siguen el comportamiento
  existente. El logout revoca también los JWT Google mediante la política actual.
- JWT de paciente no permite panel administrativo. Correos de clínica/admin
  no crean cuentas Google; cuentas suspendidas no se reactivan.
- Edición del perfil, lectura de citas reales asociadas al paciente y acceso
  posterior mediante JWT existente. La suite de navegador existente además
  ejecuta reserva/cancelación completa.
- Migración real up/down/up: preserva cuentas y sujetos demo antiguos, hashes,
  clínicas, cupos y citas; se verifica unicidad y que una cuenta necesita una
  identidad. El rollback no borra las identidades recién creadas.
- Navegador 320/390/1280 px: registro/login, roles sin Google, cancelación, callback
  tardío, consentimiento, payload de vinculación, carga, error de SDK y fallo
  al guardar sesión. No persiste el ID token Google.
- Google deshabilitado: no descarga SDK ni solicita desafíos; conserva formularios.

## Fallos preexistentes, sin ocultar ni corregir fuera de alcance

### 1. Prueba vigente de navegación del paciente

`frontend/e2e/qa.spec.mjs:119`:

```text
getByRole('navigation', { name: 'Accesos rápidos' })
  .getByRole('link', { name: 'Mis citas' })
Expected: visible
element(s) not found
```

La pantalla actual muestra el recordatorio y las secciones principales, pero no
esa navegación. Se repitió **el mismo test sin modificar** contra una copia
intacta del frontend de `origin/main` `3680d55`, servida en otro puerto y
usando la misma API/BD de ensayo: reproduce exactamente el fallo.
No es una regresión de Google. Queda pendiente acordar si se actualiza la prueba
al diseño vigente o se restaura ese componente, en una tarea separada.

### 2. Script histórico ILE

`backend/tests/mapa-ile.e2e.cjs:32` espera 200 en
`GET /api/clinicas?servicios=ILE` **sin JWT**, y obtiene 401.
Se ejecutó con su puerto/API/BD aislados específicos, no contra producción.
El encabezado del propio script y `docs/entrega-local-auditada.md` ya lo
clasifican como histórico y fuera de la puerta vigente. No se retiró autenticación
para hacerlo pasar.

Durante la preparación se corrigió el entorno documental de ensayo a modo 0700
y se pasaron las variables de correo mock requeridas. Esos fallos de preparación
no se presentan como defectos de producto; la última ejecución vigente queda
en 13 aprobadas y únicamente el fallo de navegación anterior.

## Evidencias locales

Directorio persistente de resultados **fuera del repositorio**:
`/home/angixs/Documentos/puntoax/PuntOax-google-evidencias/`.
Un reinicio eliminó los artefactos iniciales de `/tmp/puntoax-qa-google/`;
se conservaron los resultados observados y se regeneraron los registros finales
y las capturas en almacenamiento persistente.
No confundir capturas con una certificación del flujo externo real de Google.

| Evidencia | Ruta relativa a ese directorio |
| --- | --- |
| Backend local, incluidas unitarias Google | `backend-local-entrega.log` |
| Integración amplia | `integracion-final.log` |
| Últimas ocho integraciones Google/migración | Incluidas en `integracion-final.log` (24 pruebas totales) |
| Últimas ocho pruebas de interfaz Google | `google-browser-entrega.log` |
| Última suite vigente de navegador | `browser-regresion-entrega.log` |
| Reproducción contra frontend main | `browser-main-baseline.log` |
| Contexto del fallo main | `main-baseline-browser/` |
| Script histórico | `historica-mapa-ile.log` |
| Docker backend / frontend | `build-backend-final.log`, `build-frontend-final.log` |
| UI Google escritorio/móvil | `capturas/login-google-{320,390,1280}.png`, `capturas/registro-google-{320,390,1280}.png` |
| Otras capturas de regresión | `capturas-regresion/` |

Las capturas Google usan el **doble del SDK externo** de Playwright: prueban
disposición, controles y navegación, no la apariencia final del iframe oficial.
La apariencia del botón y la interacción real del popup deben capturarse
de nuevo cuando se configure un cliente OAuth válido.
No versionar archivos de correos simulados, dumps de sesiones, cookies ni HAR.

### Reproducción del entorno

Se usaron tres contenedores desechables locales:
`puntoax-google-test` (DB 55478, exploración inicial),
`puntoax-google-regresion` (DB 55474, validación vigente) y
`puntoax-google-ile` (DB 55483, integración histórica ILE).
La API vigente de ensayo se sirvió en 3119 y Vite en 5177.
Los nombres de bases empiezan por `puntoax_s4_test`; no usar bases compartidas.
Las variables completas requeridas son:

```dotenv
PUNTOAX_TEST_DB=1
PGHOST=127.0.0.1
PGPORT=55474
PGDATABASE=puntoax_s4_test_google_regresion
PGUSER=postgres
PGPASSWORD=CONTRASENA_EXCLUSIVA_DEL_CONTENEDOR_DE_ENSAYO
JWT_SECRET=SECRETO_SINTETICO_LARGO_COMPARTIDO_POR_API_Y_PRUEBAS
PUNTOAX_TEST_API_PORT=3119
PUNTOAX_MAIL_PROVIDER=mock
PUNTOAX_MOCK_MAIL_FILE=/tmp/puntoax-qa-google/correos-regresion.jsonl
DOCUMENTS_PRIVATE_DIR=/tmp/puntoax-qa-google/documentos
PUNTOAX_VERIFICAR_DOMINIO_CORREO=0
```

Aplicar migraciones a esa base; iniciar la API con `PORT=3119` y Vite con
`PUNTOAX_API_PROXY=http://127.0.0.1:3119` en puerto 5177. Crear el directorio
documental privado con permisos 0700. Ejecutar las suites listadas en el manual
Google, sin ejecutar en paralelo suites que alteren límites globales de correo.
Para ILE cambiar a su base/puerto 55483. La prueba histórica además fija API 33084
y DB `puntoax_s4_test_ile17`.

## Inventario de archivos de esta implementación

### Backend

- `backend/googleAuth.js`: verificación, desafíos, acceso y vinculación.
- `backend/servidor.js`: registro de las nuevas rutas, sin alterar handlers
  tradicionales ni otros módulos.
- `backend/package.json`, `backend/package-lock.json`: biblioteca oficial,
  scripts de prueba y ESLint.
- `backend/eslint.config.cjs`: lint de los archivos nuevos de backend.
- `backend/.env.example`: ID público y orígenes locales.
- `backend/tests/google-auth.test.cjs`: criptografía y protección HTTP.
- `backend/tests/google-fixture.cjs`: claves efímeras generadas al ejecutar.
- `backend/tests/google-auth.integracion.cjs`: API/BD y compatibilidad.
- `backend/tests/google-migracion.integracion.cjs`: persistencia y rollback.

### Frontend

- `frontend/src/components/Auth/GoogleAuth.jsx`: SDK, botón y vinculación.
- `frontend/src/utils/googleIdentity.js`: carga única del SDK y errores.
- `frontend/src/components/Auth/Login.jsx`, `Register.jsx`: integración sin
  eliminar los formularios existentes.
- `frontend/src/api/auth.js`: intercambio Google y metadatos de errores.
- `frontend/src/App.jsx`: entrada de sesión Google desde registro.
- `frontend/src/styles/Auth.css`: estilos encapsulados y formularios bloqueables.
- `frontend/.env.example`, `frontend/Dockerfile`: variable pública de compilación.
- `frontend/package.json`, `frontend/playwright.google.config.mjs`: suite browser.
- `frontend/tests/google-auth.test.mjs`: contrato de API y errores.
- `frontend/e2e/google-auth.spec.mjs`, `google-disabled.spec.mjs`: interfaz con
  Google configurado y sin configurar.

### Migraciones, operación y documentación

- `db/migrations/015_google_auth.up.sql`
- `db/migrations/015_google_auth.down.sql`
- `.env.example`
- `docker-compose.yml`
- `README.md`
- `docs/autenticacion-google.md`
- `docs/validacion-google-auth.md`

## Pendientes para aprobar la entrega

- Cliente OAuth real de desarrollo y producción, privacidad/marca/dominio.
- Validación real de Google en escritorio y móviles, con políticas del proxy.
- Tratamiento del fallo vigente de navegación y mantenimiento del script histórico.
- Revisión de rama, PR/CI y aprobación antes de main; respaldo y ventana autorizada
  antes de cualquier despliegue. Instrucciones en `docs/autenticacion-google.md`.
