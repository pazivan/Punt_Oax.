# Alcance local: Sprint 4 (alta) y Sprint 5 (catálogo)

## Sprint 4: alta de cuenta institucional

**Un solo formulario y una sola ficha de clínica.** Los datos capturados al
registrarse son los mismos que debe revisar el administrador cuando exista el
botón «Enviar solicitud». `borrador` solo indica estado de la ficha, no una
versión reducida del formulario. Hoy no hay endpoint para enviar solicitudes;
por tanto, el flujo completo de aprobación **aún no está terminado**.

`POST /api/auth/registro-clinica` guarda una cuenta y los datos de su sede
en `clinicas`, **siempre en estado `borrador`**. Exige IDs del catálogo
activo a `clinicas_servicios` y franjas normales a `horarios_atencion` en la
misma transacción (al menos uno de cada). No crea una solicitud de aprobación ni marcadores. La contraseña se guarda como hash; el correo de acceso
no se publica automáticamente como correo de contacto.

| Dato de alta | Formulario/API | Esquema actual v1.3 | Acuerdo de Iván / migración 004 |
| --- | --- | --- | --- |
| Nombre, correo de acceso, contraseña | Sí | `clinicas.nombre`, `correo_acceso`, `password_hash` | Se conservan |
| Tipo, municipio, dirección, teléfono | Sí | `tipo_institucion`, `municipio`, `direccion`, `telefono` | Coinciden con la matriz de mapeo |
| Código postal, descripción | Opcionales | `codigo_postal`, `descripcion` | El CP se puede extraer del Excel; no se hace en este formulario |
| Servicios | Al menos un ID activo vía `GET /api/servicios`; guardado transaccional | `servicios`, `clinicas_servicios` | Falta acordar catálogo canónico y edición; no se crean servicios desde el formulario |
| Requisitos, costo, cita | No | `clinicas_servicios` tiene `requisitos`, `costo`, `requiere_cita` | El valor predeterminado de `requiere_cita` es `TRUE`: revisar antes de publicar; `costo_texto` y `detalle_servicio` dependen de 004 |
| Días y horario regular | Al menos una franja, apertura anterior al cierre, sin solapamientos | `horarios_atencion` | 24 h y cruces de medianoche requieren revisar 004; `horario_texto` tampoco existe aún |
| Documentos de respaldo | No hay subida de archivos | `clinicas.documentos_rutas TEXT[]` solo guarda cadenas | Falta almacenamiento privado, API multipart, metadatos, control de acceso y revisión |
| Región, nivel de atención, enlace a Maps, estado de verificación | No | No existen en v1.3 | Dependen de 004; la región debe verificarse, no inferirse ciegamente |
| Coordenadas | No | `clinicas.ubicacion_geo` existe | Falta geocodificación/validación; una dirección o URL no equivale a coordenadas verificadas |
| Id de la hoja, fuente, enlaces | No | No existen en v1.3 | `id_origen`, `fuente_origen`, `links_relacionados` dependen de 004; corresponden al importador, no al alta manual |

**Revisión de la propuesta 004 de Iván antes de aplicarla:** el predeterminado
`situacion_ubicacion='fija'` no debe asignarse a sedes no verificadas; el DOWN
restaura la restricción antigua de horarios y puede fallar si ya existen turnos
nocturnos. El catálogo 002 contiene más servicios que los dos nuevos canónicos;
004 no migra las relaciones anteriores ni hace único `id_origen`. Su UPSERT
modifica servicios existentes si coinciden por nombre. Probar UP y DOWN en una
**base aislada** y acordar el mapeo antes de aplicar nada a datos del equipo.

Para documentos recomendamos una tabla `clinicas_documentos` (clínica, tipo,
clave de almacenamiento privado, MIME, tamaño, hash, fecha y estado de revisión),
con subida autenticada limitada a la propia clínica, validación de tipo/tamaño,
antimalware, descarga autorizada y limpieza de archivos huérfanos. No poner
rutas públicas o archivos binarios en `documentos_rutas` ni aceptar URLs enviadas
por el cliente como prueba. Definir además el endpoint autenticado de edición,
la revisión administrativa y el significado de días sin horario. No se aplicó
la migración ni se insertaron datos.

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
**Hoy aún no existe la ficha completa con documentos**, por lo que registrar
una clínica no equivale a poder postularla; no se debe anunciar como flujo
terminado ni añadir un botón de postulación hasta contar con la subida privada.

Fuentes oficiales consultadas (noviembre de 2026):
- [COFEPRIS: avisos para establecimientos de servicios de salud](https://www.gob.mx/cofepris/acciones-y-programas/aviso-de-funcionamiento-responsable-sanitario-y-otros-para-establecimientos-que-ofrecen-servicios-de-salud).
- [COFEPRIS: licencias sanitarias de servicios de salud](https://www.gob.mx/cofepris/acciones-y-programas/licencias-sanitarias-de-servicios-de-salud): distingue, entre otros, los establecimientos con actos quirúrgicos u obstétricos.
- [Oaxaca: creación de Coepriso](https://www.oaxaca.gob.mx/comunicacion/fortalecen-vigilancia-sanitaria-en-oaxaca-con-creacion-de-coepriso): autoridad local de regulación sanitaria. Confirmar con ella los trámites según giro; no confundir un aviso de *productos y servicios* con uno de *servicios de salud*.

## Sprint 5: directorio público

`GET /api/clinicas` y `GET /api/clinicas/:id` solo consultan sedes con
`estado_publicacion = 'aprobada'`. `/` usa OpenStreetMap y muestra únicamente
marcadores con coordenadas válidas; `/centro/:id` consulta la ficha y los
servicios activos. `/mapa` conserva el buscador y los filtros de Yareli, ahora
con mapa Leaflet real. No recurre automáticamente a `clinicasDemo.js`.

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

**Ya integrado localmente:** alta de clínica con cuenta, servicios activos y
horarios regulares en una transacción (borrador); login por rol; endpoints de
catálogo aprobados y filtros de Kelly; inicio y vistas de Yareli; mapa y ficha
conectados a API de Citlalli; análisis del mapeo y propuesta 004 de Iván **sin
aplicar la migración**. Los ejemplos aprobados sirven solo para pruebas.

### Implementación pendiente

| Responsable sugerido | Sprint | Tarea | Resultado esperado |
| --- | --- | --- | --- |
| Iván + backend | 4 | Definir almacenamiento privado de documentos, metadatos y reglas por tipo de actividad con la autoridad; diseñar migración sin duplicar `clinicas` | Misma ficha de registro con documentos persistidos y acceso controlado; ninguna ruta pública ni documento universal inventado |
| Iván | 5 | Revisar 004 y equivalencias con servicios existentes, ubicación y rollback en entorno aislado; no aplicarla a datos compartidos sin acuerdo | Propuesta de esquema y catálogo compatible con v1.3, sin afectar datos de prueba o del equipo |
| Kelly + frontend | 4 | Integrar subida privada al mismo registro cuando exista backend seguro; acordar tratamiento de fallos parciales | Alta íntegra o rechazo controlado, sin botón de subida aparente |
| Kelly + Yareli | 5 | Ajustar filtros y listados con el catálogo canónico y estados vacíos/errores | Solo aprobadas en búsquedas y listados; errores distinguibles de cero resultados |
| Citlalli | 5 | Revisar ficha y mapa contra contrato API real; conservar adaptación móvil | Sin información inventada ni filtración de documentos; acceso directo `/centro/:id` funcional |
| Equipo de producto | 7 | Perfil privado, botón «Postularme», revisión administrativa y política de cambios | Administrador revisa la **misma ficha y documentos** del alta; solo aprobación publica en mapa |

### Pruebas pendientes (no sustituibles por compilación o tests locales)

| Responsable sugerido | Sprint | Prueba | Resultado esperado |
| --- | --- | --- | --- |
| Kelly + Iván | 4 | API y transacción en BD PostgreSQL/PostGIS **aislada** con catálogo activo, IDs inválidos, error intermedio y duplicados | Persisten clínica, servicios y horarios juntos o no persiste ninguno; `borrador` sin solicitud y no visible en catálogo |
| Iván | 5 | UP/DOWN de 004 solo en BD aislada, incluidos horarios nocturnos y datos existentes | No hay pérdida silenciosa ni rollback imposible; decisión documentada antes de migrar |
| Yareli | 4–5 | Registro/login y estados de error en navegador, teclado y móvil | Flujo usable con al menos un servicio y un día; mensaje claro si catálogo vacío o API caída |
| Citlalli + Kelly | 5 | Mapa, filtros y ficha en navegador con API y BD aisladas; enlaces directos y red interrumpida | Marcadores solo para sedes aprobadas con coordenadas; sin fallback demo ni datos privados |
| Coordinación | 5 | Revisar origen de ejemplos aprobados en entorno de prueba | Ejemplos identificados como tales antes de exponer un catálogo real |

No ejecutar `backend/npm test`, migrador ni `test:integration` apuntando a la
BD configurada del equipo: esas tareas pueden consultar o modificar datos.
La prueba de integración requiere base y API locales **aisladas** configuradas
explícitamente; hasta ejecutarla no se considera verificada la persistencia.
