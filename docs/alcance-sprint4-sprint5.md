# Alcance local: Sprint 4 (alta) y Sprint 5 (catálogo)

## Actualización: tres procesos separados

El registro institucional dejó de ser un formulario único. Ahora existen tres
procesos independientes:

1. **Crear cuenta** (`/registro`): solo nombre de la clínica, correo de acceso y
   contraseña. `POST /api/auth/registro-clinica` guarda la identidad en
   `clinicas` con `estado_publicacion = 'borrador'`; no exige servicios,
   horarios, documentos ni información complementaria.
2. **Completar la ficha** (`/mi-clinica`): la clínica autenticada consulta y
   guarda su propia ficha por secciones. Puede guardar borradores incompletos,
   subir documentos privados y recuperar su avance desde PostgreSQL.
3. **Enviar postulación**: valida la ficha completa, registra una solicitud
   `pendiente` en `solicitudes_clinicas` con una instantánea de los datos y deja
   la clínica en `estado_publicacion = 'pendiente'`. **Postular no aprueba ni
   publica**: solo `aprobada` aparece en mapa y directorio.

El detalle de rutas, endpoints, estados, migración 005, pruebas y pendientes está
en [`docs/flujo-registro-postulacion-clinica.md`](./flujo-registro-postulacion-clinica.md).

La descripción histórica de Sprint 4 que sigue se conserva como referencia del
modelo de datos. El contrato anterior de `POST /api/auth/registro-clinica`
(multipart con ficha completa y documentos) fue sustituido por un JSON de tres
campos; la cuenta y la ficha ya no se crean en la misma petición. La ficha se
captura después mediante los endpoints autenticados de `/api/clinicas/mi-ficha`.

| Dato de alta | Formulario/API | Esquema v1.3 + 004 unificada (pendiente en BD habitual) | Alcance |
| --- | --- | --- | --- |
| Nombre, correo de acceso, contraseña | Sí | `clinicas.nombre`, `correo_acceso`, `password_hash` | Se conservan |
| Tipo, municipio, dirección, teléfono | Sí | `tipo_institucion`, `municipio`, `direccion`, `telefono` | Coinciden con la matriz de mapeo |
| Código postal, descripción | Opcionales | `codigo_postal`, `descripcion` | El CP se puede extraer del Excel; no se hace en este formulario |
| Servicios | Elegir ITS y/o ILE, con descripción específica obligatoria por área; guardado transaccional | `servicios` (áreas compartidas) y `clinicas_servicios.detalle_servicio` (004) | Se usan los nombres canónicos de Iván; no se crean categorías arbitrarias |
| Requisitos, costo, cita | No | `clinicas_servicios` tiene `requisitos`, `costo`, `requiere_cita`; 004 añade `costo_texto` | `requiere_cita` predetermina `TRUE`: revisar antes de publicar |
| Días y horario regular | Al menos una franja, apertura anterior al cierre, sin solapamientos | `horarios_atencion`; 004 permite 24 h, cruces de medianoche y `texto_horario` | El formulario de alta solo captura franjas diurnas regulares |
| Documentos de respaldo | Al menos un respaldo PDF/PNG/JPG, máximo cinco de 5 MB, en la misma petición multipart | `clinicas_documentos` (004); los bytes van al volumen Docker privado | No se expone descarga pública. La revisión y descarga autorizada son Sprint 7 |
| Región, nivel de atención, enlace a Maps, estado de verificación | No | 004 añade `region`, `nivel_atencion`, `ubicacion_maps_url`, `situacion_ubicacion`, `verificacion_datos`, `datos_por_confirmar` | La ubicación inicia `pendiente` y la verificación `por_confirmar`; no se infiere la región |
| Coordenadas | No | `clinicas.ubicacion_geo` existe | Falta geocodificación/validación; una dirección o URL no equivale a coordenadas verificadas |
| Id de la hoja, fuente, enlaces | No | 004 añade `clinicas.id_origen`, `fuente_origen`, `links_relacionados` y `clinicas_servicios.id_origen` | Para el importador, no para el alta manual; `id_origen` no es único |

**Una sola migración `db/migrations/004_base_clinicas_unificada.{up,down}.sql`.**
Reúne la ficha de Sprint 4 con los campos de mapeo de Iván sin repetir
`detalle_servicio`. Inserta los nombres canónicos «Detección de ITS» e
«Interrupción Legal del Embarazo (ILE)» sin modificar servicios preexistentes.
No cambia relaciones anteriores ni impone unicidad a `id_origen`; la
equivalencia del catálogo semilla 002 se debe revisar antes de importar datos.
La reversión **se niega** si hay documentos, textos particulares, costos,
procedencia, datos de verificación o horarios especiales que se perderían.
Con filas anteriores y horarios especiales se probó UP y rechazo de DOWN en
PostGIS temporal; con filas anteriores regulares se probó UP/DOWN. La 004
**no se aplicó a la BD habitual**; el formulario de vista previa no puede
completar el alta allí todavía.

Los documentos se guardan mediante nombres UUID bajo `DOCUMENTS_PRIVATE_DIR`
(en Compose, un volumen fuera de la carpeta del frontend). La API valida límite
y firma de PDF/PNG/JPG, restringe permisos de carpeta/archivo y elimina los
archivos escritos si falla la transacción. La tabla almacena nombre, MIME,
tamaño y SHA-256, no rutas públicas ni binarios. **No hay antivirus ni descarga
autorizada todavía**: no usar estos archivos para mostrarlos públicamente;
planear inspección antimalware, respaldos, política de retención y limpieza de
huérfanos por fallos del proceso antes del despliegue real. El registro crea
cuenta y documentos a la vez; no es una carga autenticada posterior. Definir
el endpoint de edición y la revisión administrativa en Sprint 7.

### Documentos: propuesta para el mismo registro y futura solicitud

No existe una lista única aplicable a todos los establecimientos. La opción
prudente para PuntOax sería solicitar **tipo de establecimiento/actividad** y,
según éste, adjuntar para revisión privada: (1) acuse de aviso de funcionamiento
o licencia sanitaria correspondiente, **según la actividad y el trámite que le
aplique**; (2) acreditación del responsable sanitario cuando corresponda; (3)
acreditación de la representación de la entidad para quien registra la ficha,
según sea pública o privada. No son requisitos automáticos para todo centro:
la autoridad competente y el equipo deben confirmar la matriz por tipo de
servicio antes de hacer obligatoria una carga de documentos. Evitar solicitar
INE u otros datos personales de forma indiscriminada.

La ficha registrada y su solicitud deben usar **los mismos campos y archivos**:
la solicitud referencia a la clínica y a una versión/snapshot de esos datos,
no pide un segundo formulario. Para que la revisión sea fiable, bloquear la
edición o crear versiones mientras esté pendiente y volver a revisión si se
cambian datos aprobados. Documentos y datos privados nunca deben servirse en
`GET /api/clinicas` ni `GET /api/clinicas/:id`.
El registro con archivos y la 004 unificada se probaron en BD aislada; faltan
la prueba completa en navegador y una decisión autorizada de respaldo/aplicación
en la BD habitual. Registrar una clínica **no equivale a postularla**: no
añadir botón de postulación hasta Sprint 7.

Fuentes oficiales consultadas (noviembre de 2026):
- [COFEPRIS: avisos para establecimientos de servicios de salud](https://www.gob.mx/cofepris/acciones-y-programas/aviso-de-funcionamiento-responsable-sanitario-y-otros-para-establecimientos-que-ofrecen-servicios-de-salud).
- [COFEPRIS: licencias sanitarias de servicios de salud](https://www.gob.mx/cofepris/acciones-y-programas/licencias-sanitarias-de-servicios-de-salud): distingue, entre otros, los establecimientos con actos quirúrgicos u obstétricos.
- [Oaxaca: creación de Coepriso](https://www.oaxaca.gob.mx/comunicacion/fortalecen-vigilancia-sanitaria-en-oaxaca-con-creacion-de-coepriso): autoridad local de regulación sanitaria. Confirmar con ella los trámites según giro; no confundir un aviso de *productos y servicios* con uno de *servicios de salud*.

## Sprint 5: directorio para sesiones verificadas

`GET /api/clinicas` y `GET /api/clinicas/:id` exigen JWT y solo consultan sedes
con `estado_publicacion = 'aprobada'`. Sin sesión `/` y `/conocenos` muestran
información del proyecto, no el mapa. Con sesión verificada `/` usa
OpenStreetMap y muestra únicamente marcadores con coordenadas válidas;
`/centro/:id` consulta la ficha y los servicios activos. `/mapa` conserva el
buscador y los filtros de Yareli, ahora con mapa Leaflet real. `/directorio`
también exige sesión. No recurre automáticamente a `clinicasDemo.js`.

El frontend distingue respuesta vacía de error de conexión. **Una respuesta
vacía no demuestra que la BD carezca de datos reales si la API no responde.**
En la revisión local, la consulta de solo lectura a la BD configurada
(`127.0.0.1:55441`) devolvió `ECONNREFUSED`; no se verificó ningún registro.
La aportación posterior de Citlalli elimina de `docker-compose.yml` la
publicación de ese puerto al host. La API dentro de Compose sigue conectando
por `db:5432`; para inspecciones desde el host se requiere un acceso local
explícito y autorizado, no asumir que `55441` sigue abierto. Esto no cambia
el volumen ni ejecuta migraciones sobre los datos existentes.
Por decisión del equipo, las clínicas aprobadas usadas ahora son **ejemplos de
prueba**, no se afirman como sedes reales verificadas. La migración 002 contiene
ejemplos marcados `aprobada` y está deshabilitada
por defecto (`ALLOW_DEMO_SEEDS=1` la habilita). El esquema vigente no guarda
procedencia real/demo por fila: si alguien ya sembró 002, la API **no puede
distinguir automáticamente** esos ejemplos de registros reales aprobados.
Antes de publicar, auditar la BD y añadir una marca/procedencia verificable o
retirar los ejemplos con un procedimiento autorizado; no asumir que todas las
filas `aprobada` son reales.

El trabajo de Jonathan visible en las referencias locales corresponde a JWT;
`EspacioMapa` era un contrato reservado para su mapa, no una implementación
OpenStreetMap conectada. El mapa Leaflet conectado proviene de la integración
local del trabajo de Citlalli. Su versión remota más reciente contiene una
ficha visual con datos simulados: no debe sustituir la ficha conectada a la API.

## Entrega al equipo: pendientes separados por tipo

Al integrar este código en `main`, cada integrante puede partir de esa rama
para su siguiente trabajo. **Esto no ejecuta migraciones ni activa el alta
completa en la BD habitual.** Para coordinar lo que falta:

- **Iván:** revisar las equivalencias del catálogo y la importación con la
  única 004; acordar con el equipo cuándo actualizar la BD habitual y conservar
  una copia previa de sus datos. No ejecutar la migración por cuenta propia.
- **Kelly y Yareli:** probar en navegador el registro de clínica con servicios,
  horarios y documentos contra una BD aislada; revisar móvil, teclado y errores.
- **Citlalli y Kelly:** comprobar mapa, filtros y ficha con sesión y datos
  aprobados en entorno aislado, sin documentos ni clínicas borrador expuestos.
- **Coordinación:** identificar los ejemplos del catálogo antes de publicar
  datos reales y definir revisión, seguridad y conservación de documentos.
  Perfil privado, postulación y administración quedan para Sprint 7.

**Ya integrado localmente:** alta de clínica con cuenta, servicios activos,
horarios regulares y respaldo privado en una transacción (borrador), probados
contra la 004 unificada en BD aislada; login por rol; endpoints de
catálogo aprobados y filtros de Kelly; inicio y vistas de Yareli; mapa y ficha
conectados a API de Citlalli; campos de la propuesta 004 de Iván incorporados
**sin aplicar la migración a la BD habitual**. Los ejemplos aprobados sirven solo para pruebas.

### Implementación pendiente

| Responsable sugerido | Sprint | Tarea | Resultado esperado |
| --- | --- | --- | --- |
| Coordinación + backend | 4 | Acordar respaldo y aplicación de la 004 unificada antes del despliegue; definir política de documentos por actividad y antimalware | Archivos privados y criterios revisables, sin documento legal universal inventado |
| Iván | 5 | Revisar equivalencias de servicios existentes y procedencia al importar; no tocar datos compartidos sin acuerdo | Mapeo compatible con v1.3 sin reemplazar relaciones existentes |
| Kelly + frontend | 4 | Probar en navegador la subida privada del registro contra API y BD aisladas, incluidos tamaños y tipos incorrectos | Alta íntegra o rechazo controlado; no aparecen documentos en rutas públicas |
| Kelly + Yareli | 5 | Ajustar filtros y listados con el catálogo canónico y estados vacíos/errores | Solo aprobadas en búsquedas y listados; errores distinguibles de cero resultados |
| Citlalli | 5 | Revisar ficha y mapa contra contrato API real; conservar adaptación móvil | Sin información inventada ni filtración de documentos; acceso directo `/centro/:id` funcional |
| Equipo de producto | 7 | Perfil privado, botón «Postularme», revisión administrativa y política de cambios | Administrador revisa la **misma ficha y documentos** del alta; solo aprobación publica en mapa |

### Pruebas pendientes (no sustituibles por compilación o tests locales)

| Responsable sugerido | Sprint | Prueba | Resultado esperado |
| --- | --- | --- | --- |
| Kelly + Iván | 4 | Repetir en navegador el alta contra API y BD **aisladas**, incluidos archivos inválidos y fallos de red | Persisten clínica, servicios, horarios y documentos juntos o no persiste ninguno; `borrador` sin solicitud |
| Iván | 5 | Revisar importación de datos y equivalencias de catálogo con la 004 ya probada en BD aislada | No hay pérdida silenciosa ni etiquetas duplicadas; decidir tratamiento de importaciones |
| Yareli | 4–5 | Registro/login y estados de error en navegador, teclado y móvil | Flujo usable con al menos un servicio y un día; mensaje claro si catálogo vacío o API caída |
| Citlalli + Kelly | 5 | Mapa, filtros y ficha en navegador con API y BD aisladas; enlaces directos y red interrumpida | Marcadores solo para sedes aprobadas con coordenadas; sin fallback demo ni datos privados |
| Coordinación | 5 | Revisar origen de ejemplos aprobados en entorno de prueba | Ejemplos identificados como tales antes de exponer un catálogo real |

No ejecutar `backend/npm test`, migrador ni `test:integration` apuntando a la
BD configurada del equipo: esas tareas pueden consultar o modificar datos.
La prueba de integración requiere base y API locales **aisladas** configuradas
explícitamente; sus resultados no validan la BD habitual ni sustituyen pruebas de navegador.
