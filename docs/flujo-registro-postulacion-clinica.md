# Flujo de registro y postulación de clínicas

Fecha: 3 de noviembre de 2026.
Rama de trabajo: `miguel/flujo-registro-postulacion-clinica`.
Base: `main` (`d3322a9`) sincronizada con `origin/main` antes de empezar.

Este documento reemplaza, para el registro de clínicas, la descripción de
«un solo formulario» de `docs/alcance-sprint4-sprint5.md`. El alta institucional
ya no captura servicios, horarios ni documentos.

## Tres procesos separados

| Proceso | Pantalla | Qué ocurre | Qué NO ocurre |
| --- | --- | --- | --- |
| 1. Crear cuenta | `/registro` (pestaña «Soy clínica») | Se guardan nombre, correo de acceso y contraseña. Se crea la fila en `clinicas` con `estado_publicacion = 'borrador'`. | No se piden datos institucionales, servicios, horarios ni documentos. No se crea una solicitud. |
| 2. Completar ficha | `/mi-clinica` | La clínica autenticada consulta y guarda su ficha por secciones. Puede guardar borradores incompletos y subir documentos privados. | No se publica la clínica. No se aprueba nada. No se puede editar la ficha de otra clínica. |
| 3. Enviar postulación | `/mi-clinica` | Se validan los datos obligatorios y se crea una fila en `solicitudes_clinicas` con estado `pendiente` y una instantánea de la ficha. | No se aprueba ni se publica automáticamente. La clínica no aparece en mapa/directorio. |

Después de postular, `/mi-clinica` muestra únicamente:

> «Tu postulación fue enviada correctamente y está pendiente de revisión».

La ficha queda bloqueada para edición mientras la solicitud esté pendiente. El
panel administrativo, la aprobación, el rechazo y las notificaciones quedan para
el siguiente sprint.

## Registro de clínica (tres campos)

`POST /api/auth/registro-clinica` ahora recibe JSON:

```json
{
  "nombre": "Clínica Comunitaria San Jacinto",
  "correo": "contacto@ejemplo.com",
  "password": "ContrasenaSegura123"
}
```

Reglas:

- Nombre obligatorio, máximo 255 caracteres.
- Correo normalizado con `trim().toLowerCase()`, formato válido y máximo 255.
- Contraseña de 8 a 72 bytes UTF-8; se guarda con bcrypt (coste 10).
- El estado `borrador` y el rol `clinica` se fijan en el servidor.
- Cualquier campo adicional (`tipo_institucion`, `servicios`, `estado_publicacion`,
  `rol`, etc.) se ignora. El registro no captura la ficha completa.
- Correo duplicado devuelve `409`.
- La respuesta `201` incluye `mensaje` y `clinica`; no incluye token ni hash.
- El registro independiente de usuarios (`POST /api/auth/registro-usuario`) no cambió.

La interfaz conserva la validación de contraseña y añade un botón para mostrarla
u ocultarla. La confirmación de contraseña se eliminó solo del registro de
clínica; el registro de usuarios comunes la conserva.

## Inicio de sesión y redirección

- `POST /api/auth/login-clinica` sigue emitiendo el JWT con rol `clinica`.
- Tras el login, el frontend navega a `/mi-clinica` cuando la cuenta es de clínica.
- `/mi-clinica` consulta siempre `GET /api/clinicas/mi-ficha`; el estado del
  navegador no es la fuente de verdad.
- Si la ficha no está postulada, se muestra «Completa los datos de tu clínica».
- Si la solicitud está pendiente, se muestra el estado de revisión.
- Usuarios y administradores conservan su comportamiento actual (`/cuenta`, `/admin`).

## Endpoints

Todos los endpoints de ficha exigen `Authorization: Bearer <token>` y rol
`clinica`. El identificador de la clínica se toma **siempre** del JWT; no se
acepta un `id_clinica` enviado por el cliente para modificar otra ficha.

| Método y ruta | Función |
| --- | --- |
| `GET /api/clinicas/mi-ficha` | Consulta la ficha propia, servicios activos, horarios, documentos (solo metadatos), última solicitud y faltantes. |
| `PUT /api/clinicas/mi-ficha` | Guarda o actualiza un borrador parcial. Distingue campos inválidos (`400` + `campos`) de campos faltantes (no bloquean el borrador). |
| `POST /api/clinicas/mi-ficha/documentos` | Sube de 1 a 5 archivos PDF/PNG/JPG de hasta 5 MB cada uno, con validación de firma real. |
| `DELETE /api/clinicas/mi-ficha/documentos/:id` | Elimina un documento propio y su archivo privado. |
| `POST /api/clinicas/mi-ficha/postulacion` | Valida la ficha completa, crea la solicitud `pendiente` con `datos_ficha` y cambia la clínica a `pendiente`. |
| `GET /api/clinicas/mi-postulacion` | Consulta la última solicitud de la clínica autenticada. |
| `GET /api/clinicas` y `GET /api/clinicas/:id` | Sin cambios: solo devuelven clínicas `aprobada`. |

Respuesta resumida de `GET /api/clinicas/mi-ficha`:

```json
{
  "clinica": {
    "id_clinica": "UUID",
    "nombre": "Clínica Comunitaria San Jacinto",
    "correo_acceso": "contacto@ejemplo.com",
    "estado_publicacion": "borrador",
    "estado_ficha": "incompleta",
    "puede_editar": true,
    "puede_postular": false
  },
  "faltantes": ["Tipo de institución", "Al menos un documento de respaldo"],
  "servicios": [],
  "horarios": [],
  "documentos": [],
  "postulacion": null
}
```

## Reglas de guardado y postulación

### Borrador

- Se puede guardar con secciones incompletas.
- Solo se rechaza información inválida: correo de contacto mal formado, teléfono
  con caracteres no permitidos, código postal distinto de 5 dígitos, URL inválida,
  horario con apertura posterior al cierre o franjas solapadas.
- Los servicios se guardan contra el catálogo existente (`Detección de ITS` e
  `Interrupción Legal del Embarazo (ILE)`); no se crean servicios desde el cliente.
- Los horarios regulares se reemplazan por los enviados. No se inventan turnos
  nocturnos ni de 24 horas.
- Un `PUT` sin campos o con campos vacíos no borra la ficha ni duplica la clínica.

### Documentos

- Se reutiliza la carpeta privada `DOCUMENTS_PRIVATE_DIR` (fuera del frontend).
- El archivo se guarda con nombre UUID, modo `0600`; la carpeta debe ser `0700`.
- Se valida MIME, firma real del archivo, tamaño y nombre.
- Máximo 5 documentos por clínica, 5 MB cada uno.
- Si falla la transacción, los archivos escritos se eliminan.
- La API no expone descarga pública ni rutas de archivo.

### Postulación

Campos obligatorios:

- Nombre, tipo de institución, descripción, teléfono, correo de contacto,
  municipio y dirección.
- Al menos un área de atención con descripción específica.
- Al menos una franja horaria válida y sin solapamientos.
- Al menos un documento de respaldo privado.

Al postular:

1. Se bloquea la fila de la clínica con `SELECT ... FOR UPDATE`.
2. Se rechaza si ya existe una solicitud `pendiente` (`409`).
3. Se guarda una instantánea en `solicitudes_clinicas.datos_ficha` (JSONB).
4. Se inserta la solicitud con estado `pendiente`.
5. Se actualiza `clinicas.estado_publicacion = 'pendiente'`.
6. No se cambia a `aprobada` y no se crea ningún marcador público.

La doble postulación se evita con la transacción y con el índice único parcial
`uq_solicitudes_clinicas_pendiente`.

## Base de datos

### Migración 005

`db/migrations/005_postulacion_clinica_snapshot.up.sql`:

- Agrega `solicitudes_clinicas.datos_ficha JSONB`.
- Agrega el índice único parcial `uq_solicitudes_clinicas_pendiente` sobre
  `(id_clinica) WHERE estado = 'pendiente'`.

`db/migrations/005_postulacion_clinica_snapshot.down.sql`:

- Se niega a revertir si existe alguna solicitud con `datos_ficha`, para no
  perder la evidencia de revisión.
- Si no hay datos, elimina el índice y la columna.

La migración 004 **no se reescribió**. Requiere que 004 ya esté aplicada porque
la ficha usa `detalle_servicio`, `ubicacion_maps_url` y `clinicas_documentos`.
El registro de cuenta funciona con el esquema 001, pero la ficha completa
requiere 004 y 005.

### Estados

- `clinicas.estado_publicacion`: `borrador` → `pendiente` al postular. Solo
  `aprobada` aparece en mapa/directorio.
- `solicitudes_clinicas.estado`: `pendiente` en este sprint. `aprobada` y
  `rechazada` quedan para la revisión administrativa.
- `clinica.estado_ficha` (calculado en la API): `incompleta`, `completa`,
  `pendiente_revision`, `aprobada` o `rechazada`.

## Frontend

Archivos principales:

- `frontend/src/components/Auth/Register.jsx`: registro de clínica con tres campos,
  sin confirmación y con mostrar/ocultar contraseña.
- `frontend/src/components/Clinica/FichaClinica.jsx`: pantalla privada
  «Completa los datos de tu clínica».
- `frontend/src/components/Clinica/FichaClinica.css`: estilos responsive con el
  mismo lenguaje visual de PuntOax.
- `frontend/src/api/auth.js`: cliente de los endpoints de ficha, documentos y
  postulación.
- `frontend/src/App.jsx`: ruta `/mi-clinica`, redirección de clínica después del
  login y conservación de `/cuenta`, `/admin`, mapa, directorio y usuarios.

La pantalla se organiza en cinco secciones: información general, ubicación,
servicios, horarios y documentación. Incluye:

- Precarga desde PostgreSQL.
- Botón secundario «Guardar borrador».
- Resumen lateral de faltantes.
- Confirmación antes de postular.
- Estado de postulación pendiente.
- Diseño adaptable a móvil, tableta y escritorio.

## Pruebas ejecutadas

### Frontend

```bash
cd frontend
npm run lint
npm test
npm run build
```

Resultados reales:

- `lint`: correcto (exit 0).
- `test`: 15/15 pruebas aprobadas.
- `build`: correcto; Vite generó `dist`.

### Backend en base aislada

Se usó un contenedor temporal `postgis/postgis:15-3.3` con `--tmpfs
/var/lib/postgresql/data`, base `puntoax_flujo_test_run`, puerto local 55445 y
API aislada en 3105. Se aplicaron 001, 003, 004 y 005; la 002 se omitió.

```bash
PUNTOAX_TEST_DB=1 PGHOST=127.0.0.1 PGPORT=55445 \
  PGDATABASE=puntoax_flujo_test_run PGUSER=postgres \
  PGPASSWORD=<clave_temporal> PUNTOAX_TEST_API_PORT=3105 \
  DOCUMENTS_PRIVATE_DIR=/tmp/opencode/puntoax_flujo_docs \
  npm run test:integration
```

Resultado real: **1/1 prueba aprobada**. Cubre registro de clínica con tres
campos, correo duplicado, contraseña inválida, login, ficha vacía, borrador
incompleto, recuperación tras nuevo login, postulación incompleta, servicios,
horarios, documentos válidos e inválidos, postulación, doble postulación,
bloqueo de edición pendiente, aislamiento entre clínicas, no publicación,
usuarios comunes y administradores.

También se verificó que `migrate:down` de 005 **se niega** a revertir cuando ya
hay `datos_ficha`, y deja la migración aplicada.

### Navegador real (Chrome headless)

Se ejecutó un smoke test con Chrome 154 headless controlado por CDP contra Vite
en `127.0.0.1:5173`, la API en `3000` y otra base temporal aislada
(`puntoax_flujo_test_browser`, puerto 55445). Resultados reales:

- `/registro` en la pestaña «Soy clínica» mostró exactamente tres campos
  (`nombre`, `correo`, `contraseña`), sin confirmación de contraseña ni
  desplazamiento horizontal a 1440 px.
- El registro creó la cuenta y el login redirigió a `/mi-clinica`.
- La ficha se cargó desde la API con las cinco secciones y nueve pendientes
  iniciales.
- «Guardar borrador» con datos incompletos respondió correctamente y, tras
  recargar, teléfono y descripción se recuperaron desde PostgreSQL.
- `/cuenta` redirigió a `/mi-clinica` para el rol clínica.
- Se completaron servicios, horario y un PNG privado; la ficha pasó a «lista
  para postular» sin pendientes.
- La vista a 390 px no presentó desbordamiento horizontal.
- La confirmación mostró el resumen y, al enviar, apareció el estado
  «POSTULACIÓN ENVIADA / Pendiente de revisión», que se mantuvo tras recargar.
- La base quedó con `estado_publicacion = 'pendiente'`, una sola solicitud
  `pendiente` con `datos_ficha`, y el directorio autenticado no incluyó la
  clínica. El archivo privado quedó con permisos `0600` en una carpeta `0700`.
- No se registraron errores de consola durante el recorrido.

### Limitaciones de las pruebas

- El smoke test de navegador es una verificación manual automatizada con CDP, no
  una suite E2E versionada ni ejecutada en CI.
- No existe todavía prueba automatizada de componentes React.
- La revisión administrativa y la descarga autorizada de documentos no se probaron
  porque no forman parte de este sprint.

## Cómo probarlo localmente

1. Crear una base temporal aislada (no usar la BD habitual):

```bash
docker run -d --rm --name puntoax_flujo_test_db \
  -e POSTGRES_PASSWORD=clave_temporal_flujo \
  -e POSTGRES_DB=puntoax_flujo_test_run \
  -p 127.0.0.1:55445:5432 \
  --tmpfs /var/lib/postgresql/data \
  postgis/postgis:15-3.3
```

2. Aplicar migraciones en esa base:

```bash
cd backend
PGHOST=127.0.0.1 PGPORT=55445 PGDATABASE=puntoax_flujo_test_run \
PGUSER=postgres PGPASSWORD=clave_temporal_flujo npm run migrate
```

3. Iniciar la API apuntando a la base aislada:

```bash
PGHOST=127.0.0.1 PGPORT=55445 PGDATABASE=puntoax_flujo_test_run \
PGUSER=postgres PGPASSWORD=clave_temporal_flujo \
JWT_SECRET=<secreto_de_al_menos_32_caracteres> \
DOCUMENTS_PRIVATE_DIR=/tmp/opencode/puntoax_flujo_docs \
PORT=3000 node servidor.js
```

4. Iniciar el frontend:

```bash
cd frontend
npm run dev
```

5. Recorrido manual:

- `/registro` → pestaña «Soy clínica» → nombre, correo y contraseña.
- Iniciar sesión como clínica → `/mi-clinica`.
- Guardar un borrador incompleto, cerrar sesión y volver a entrar.
- Completar servicios, horarios y documentos.
- Enviar postulación y confirmar que aparece el estado pendiente.
- Verificar que la clínica no aparece en `/mapa` ni `/directorio`.
- Verificar que el registro y login de usuarios comunes siguen funcionando.

## Pendientes para el siguiente sprint

- Panel administrativo para revisar la misma ficha y los mismos documentos.
- Aprobación, rechazo y observaciones con transición de estados.
- Notificaciones a la clínica.
- Perfil público definitivo y directorio con datos aprobados.
- Descarga autorizada de documentos, antivirus, retención y limpieza de huérfanos.
- Versionado o snapshot formal de cambios posteriores a una aprobación.
- Edición autorizada de fichas aprobadas y reenvío a revisión.
- Pruebas E2E de navegador en móvil y escritorio.
- Revisión de accesibilidad (teclado, foco del modal y lectores de pantalla).
