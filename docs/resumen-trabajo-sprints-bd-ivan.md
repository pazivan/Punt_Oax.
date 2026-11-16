# Informe Técnico de Arquitectura de Datos, Infraestructura Docker y Servicios API
**Proyecto:** PuntOax • Plataforma Digital de Salud Sexual y Reproductiva en Oaxaca  
**Área:** Base de Datos, Modelo Relacional e Infraestructura  
**Responsable:** Iván (Especialista en Base de Datos y Modelo Relacional)  
**Coordinación de Proyecto:** Miguel  
**Equipo Técnico Colaborador:** Kelly (API REST de Citas y Filtros), Citlalli (Ficha Institucional y Módulo de Mis Citas), Yareli (Vistas de Agendamiento y Directorio)  

---

## 1. Infraestructura Base y Entorno de Ejecución en Docker

### 1.1. Objetivo y Alcance
Establecer un entorno de desarrollo y despliegue homogéneo, aislado y reproducible mediante contenedores, asegurando persistencia de datos, extensiones geoespaciales y canales de red internos seguros entre la capa de presentación, la lógica de negocio y el motor de almacenamiento.

### 1.2. Implementación en Base de Datos e Infraestructura
* **Orquestación con Docker Compose (`docker-compose.yml`):**
  1. **Servicio de Base de Datos (`puntoax_sprint4_db`):** Motor PostgreSQL 15 con la extensión oficial PostGIS 3.3 (`postgis/postgis:15-3.3`). Permite el almacenamiento de geometrías y cálculo de distancias geoespaciales para la geolocalización de centros de salud en el estado de Oaxaca.
  2. **Servicio Backend (`puntoax_sprint4_backend`):** Entorno de ejecución Node.js versión 22 con framework Express en el puerto 3000, aislado en la red interna del proyecto.
  3. **Servicio Frontend (`puntoax_sprint4_frontend`):** Aplicación cliente desarrollada en React con compilación optimizada en Vite, servida mediante Nginx en el puerto 8080.
* **Persistencia y Volúmenes de Datos:**
  * `sprint4_pgdata`: Almacenamiento persistente del clúster de PostgreSQL, garantizando la conservación de transacciones entre reinicios del host.
  * `puntoax_documentos`: Volumen privado fuera del alcance web directo para el resguardo de expedientes y documentación probatoria de clínicas.
* **Mecanismo de Migraciones Transaccionales (`backend/scripts/migrador.js`):**
  * Control de versiones de esquema con scripts emparejados (`.up.sql` y `.down.sql`).
  * Ejecución determinista, trazable y reversible de cada cambio estructural.

### 1.3. Punto de Comprobación en la Interfaz
* Acceso a la interfaz web local: `http://localhost:8080`
* Acceso a la API REST de servicios: `http://localhost:3000`

---

## 2. Sprint 3: Modelo Relacional Base (PuntOax v1.3) y Catálogo Semilla

### 2.1. Objetivo y Alcance
Diseñar la estructura relacional fundacional para gestionar cuentas de usuario, autenticación por roles, catálogo de clínicas con geoposicionamiento, servicios médicos ofertados, franjas horarias y agendamiento de turnos.

### 2.2. Implementación en Base de Datos
* **Migración `001_create_schema_puntoax_v1_3`:**
  * **`usuarios`:** Almacenamiento de identidades con discriminación de roles (`usuario`, `clinica`, `administrador`), credenciales cifradas con algoritmo bcrypt y campos de contacto.
  * **`clinicas`:** Puntos de atención geográfica modelados con el tipo PostGIS `geography(Point, 4326)`.
  * **`servicios`:** Catálogo normalizado de atención médica.
  * **`clinicas_servicios`:** Entidad asociativa (M:N) que relaciona clínicas con servicios, vinculando requisitos específicos, costos y necesidad de cita.
  * **`horarios_atencion`:** Franjas de operación semanal por clínica (días 0 a 6, horas de apertura y cierre).
  * **`espacios_disponibles`:** Segmentación de turnos de 60 minutos generados por servicio.
  * **`citas`:** Reservas con restricción de integridad para evitar colisiones.
  * **`solicitudes_clinicas`:** Registro de postulaciones institucionales para control de acceso.
* **Migración `002_seed_initial_data`:** Datos iniciales de municipios oaxaqueños y catálogo semilla de servicios.

### 2.3. Integración con Endpoints API
* `POST /api/auth/registro`: Registro de usuarios pacientes en la tabla `usuarios`.
* `POST /api/auth/login`: Autenticación y expedición de tokens JSON Web Token (JWT).
* `GET /api/perfil`: Validación del token JWT y retorno de la sesión activa.

### 2.4. Punto de Comprobación en la Interfaz
* Pantalla de acceso: `http://localhost:8080/login`
* Pantalla de creación de cuenta: `http://localhost:8080/registro`

---

## 3. Sprint 4: Registro Progresivo y Ficha Institucional Unificada

### 3.1. Objetivo y Alcance
Optimizar el flujo de incorporación de usuarios reduciendo la fricción inicial (registro progresivo) y desacoplar el alta de cuentas institucionales del llenado exhaustivo de la ficha clínica, permitiendo el guardado de borradores y la carga de documentación probatoria.

### 3.2. Implementación en Base de Datos
* **Migración `003_usuarios_nombre_opcional`:**
  * Modificación de la restricción de obligatoriedad en el campo `nombre` de la tabla `usuarios`, permitiendo altas preliminares con únicamente correo y contraseña.
* **Migración `004_base_clinicas_unificada`:**
  * **Campos Operativos:** Incorporación en `clinicas` de `tipo_institucion` (Pública, Privada, ONG, Otra), `municipio`, `direccion`, `telefono`, `horario_texto`, `region`, `nivel_atencion`, `ubicacion_maps_url` y el identificador de auditoría `id_origen`.
  * **Estandarización Canónica de Servicios:** Normalización estricta de las áreas médicas a dos registros fundamentales: **Detección de ITS** e **Interrupción Legal del Embarazo (ILE)**.
  * **Entidad `clinicas_documentos`:** Registro de metadatos de archivos comprobatorios (MIME, tamaño en bytes, hash criptográfico SHA-256), vinculados a la ruta del volumen privado.
  * **Separación de Estados:** Control independiente de `estado_publicacion` (`borrador`, `pendiente`, `aprobada`) para visibilidad ciudadana frente a `verificacion_datos` (`pendiente`, `verificado`, `inconsistente`) para control interno.
* **Migración `005_postulacion_clinica_snapshot`:**
  * Incorporación de la columna `datos_ficha JSONB` en `solicitudes_clinicas`, preservando una copia inmutable de los datos de la clínica al momento de solicitar revisión administrativa, junto con el índice único `uq_solicitudes_clinicas_pendiente`.

### 3.3. Integración con Endpoints API
* `POST /api/auth/registro-clinica`: Alta básica de cuenta institucional con estado predeterminado en `borrador`.
* `GET /api/clinicas/mi-ficha` y `PUT /api/clinicas/mi-ficha`: Consulta y actualización segmentada de datos generales, ubicación, servicios y horarios.
* `POST /api/clinicas/mi-ficha/documentos`: Carga de documentos de acreditación legal.
* `POST /api/clinicas/mi-ficha/postulacion`: Cierre y congelamiento de ficha para postulación administrativa.

### 3.4. Punto de Comprobación en la Interfaz
* Pantalla de registro institucional: `http://localhost:8080/registro` (selector de clínica).
* Panel de administración de ficha clínica: `http://localhost:8080/mi-clinica`.
* Ficha pública de centro de salud: `http://localhost:8080/centro/:id`.

---

## 4. Sprint 5: Importador Masivo del Catálogo Filtración y Catálogo Público

### 4.1. Objetivo y Alcance
Procesar, normalizar e insertar en base de datos las sedes recopiladas en la hoja oficial de campo (*Filtración*), estructuradas en las pestañas `ITS`, `Aborto` y `Ambos`, deduplicando registros y exponiendo el catálogo al público sin requerir inicio de sesión.

### 4.2. Implementación en Base de Datos y Scripts
* **Script Automatizado de Importación (`backend/scripts/importar-filtracion.js`):**
  * Parser modular de archivos CSV con soporte de comillas, saltos de línea internos y eliminación de marca BOM UTF-8.
  * **Algoritmo de Deduplicación:** Detección de coincidencias por `id_origen` o por tupla `(nombre, municipio)`. En centros mixtos, se genera una única fila en `clinicas` y se asignan ambos servicios en `clinicas_servicios`, consolidando franjas horarias y enlaces web.
  * **Inferencia de Atributos Faltantes:** Detección de denominación de unidad a partir de la dirección o notas oficiales (ej. `IMEDI`, `CEBIVE`, `Casa de Salud`, `Punto Fijo de Detección`).
  * **Extracción de Coordenadas Geográficas:** Obtención de latitud y longitud directamente desde parámetros de enlaces de Google Maps (`query=lat,lng` o `@lat,lng`).
  * **Modo Simulación Transaccional:** Ejecución segura con sentencia `ROLLBACK` por defecto, requiriendo el parámetro `--apply` para confirmar cambios en base de datos.
* **Dataset Consolidado Oficial (`backend/data/filtracion.csv`):** 58 registros normalizados y depurados.

### 4.3. Integración con Endpoints API
* `GET /api/clinicas` (Público, sin token JWT): Retorno de sedes aprobadas con soporte de filtros concurrentes:
  * Parámetro `?nombre=...`: Búsqueda por coincidencia de texto.
  * Parámetro `?municipio=...`: Búsqueda por delimitación municipal.
  * Parámetro `?servicios=its`, `?servicios=ile` o `?servicios=ambos`.
* `GET /api/clinicas/:id` (Público, sin token JWT): Detalle individual de la sede médica.

### 4.4. Punto de Comprobación en la Interfaz
* Directorio ciudadano con mapa interactivo Leaflet: `http://localhost:8080/`
* Vista completa del mapa de centros: `http://localhost:8080/mapa`
* Barra de filtros reactivos por municipio y servicios de atención.

---

## 5. Sprint 6: Modelo Relacional de Citas, Horarios y Máquina de Estados

### 5.1. Objetivo y Alcance
Formalizar en base de datos el ecosistema completo de citas médicas, vinculando al paciente solicitante con la sede clínica responsable, el servicio específico requerido y la disponibilidad horaria, asegurando la atomicidad de la reserva y la gestión rigurosa de estados.

### 5.2. Implementación en Base de Datos
* **Estructura Relacional Normalizada:**
  * Relación Cita a Usuario: `citas.id_usuario` referencia directamente a `usuarios(id_usuario)`.
  * Relación Cita a Clínica y Servicio: `citas.id_espacio` referencia a `espacios_disponibles(id_espacio)`, el cual se asocia con `clinicas_servicios(id_clinica_servicio)` para garantizar la pertenencia exacta de sede y área médica.
  * Validación Horaria: Los turnos en `espacios_disponibles` respetan los días de la semana y los rangos de apertura/cierre configurados en `horarios_atencion`.
* **Definición Formal de los Cuatro Estados (`chk_citas_estado`):**
  1. **`confirmada`:** Estado inicial al agendar la reserva. Ocupa el turno asignado.
  2. **`cancelada`:** Baja de la cita efectuada antes del turno por el paciente o por la clínica (`fecha_hora_inicio > NOW()`).
  3. **`completada`:** Atención médica efectuada satisfactoriamente en clínica (`fecha_hora_inicio <= NOW()`).
  4. **`no_asistio`:** Inasistencia registrada del paciente tras la hora programada (`fecha_hora_inicio <= NOW()`).
* **Regla de Integridad de Turno Único:**
  * Implementación del índice único condicional:
    ```sql
    CREATE UNIQUE INDEX uq_citas_espacio_activa
        ON citas (id_espacio)
        WHERE estado <> 'cancelada';
    ```
  * Efecto: Impide técnicamente la doble reserva simultánea de un mismo horario. En caso de cancelación, el índice ignora el registro inactivo, liberando el turno en tiempo real para otro solicitante sin pérdida del registro histórico.
* **Migración `006_relaciones_citas_modelo`:**
  * Creación de índices de alto rendimiento (`idx_citas_usuario_estado`, `idx_espacios_clinica_servicio_inicio`, `idx_citas_fecha_reserva`).
  * Creación de la **vista canónica `v_citas_detalladas`**, que centraliza en una única consulta los datos del paciente, la clínica, el servicio y la franja horaria coincidente.

### 5.3. Integración con Endpoints API (Kelly y Citlalli)
* `GET /api/clinicas/:id/espacios-disponibles`: Turnos libres futuros donde `estado <> 'cancelada'`.
* `POST /api/citas`: Bloqueo transaccional de turno (`FOR UPDATE`) y creación de cita confirmada.
* `GET /api/citas`: Historial de citas del usuario autenticado.
* `PATCH /api/citas/:id/cancelar`: Transición a estado `cancelada` y liberación de espacio.
* `PATCH /api/citas/:id/estado`: Actualización a `completada` o `no_asistio` por parte del personal clínico.
* `GET /api/clinicas/mi-clinica/citas`: Agenda operativa para la administración de pacientes en sede.

### 5.4. Punto de Comprobación en la Interfaz
* Flujo de agendamiento de cita: `http://localhost:8080/agendar-cita` o desde el detalle del centro.
* Módulo del paciente: `http://localhost:8080/cuenta` (pestaña de Mis Citas).
* Módulo institucional de la clínica: `http://localhost:8080/mi-clinica/citas`.

---

## 6. Resultados de Pruebas y Validación Técnica

Todas las suites de prueba fueron ejecutadas directamente sobre el entorno de desarrollo y validación, obteniendo un 100% de éxito en todas las afirmaciones técnicas.

### 6.1. Resumen de Pruebas Automatizadas

1. **Modelo de Citas y Máquina de Estados (`backend/tests/citas-modelo.test.cjs`):**
   * Pruebas ejecutadas: 5
   * Pruebas aprobadas: 5 (0 fallas)
   * Tiempo de ejecución: 124 ms
   * Cobertura: Integridad de migración 006 (up/down), acuerdo técnico, reglas de transición por rol, simulación de liberación de turno mediante `uq_citas_espacio_activa` y proyección completa de la vista `v_citas_detalladas`.

2. **Integridad de Migraciones del Esquema (`backend/tests/migraciones.test.cjs`):**
   * Pruebas ejecutadas: 3
   * Pruebas aprobadas: 3 (0 fallas)
   * Tiempo de ejecución: 64 ms
   * Cobertura: Verificación de correspondencia bidireccional (`.up.sql` y `.down.sql`) desde la migración 001 hasta la 006, coherencia de restricciones e índices relacionales.

3. **Importador Masivo de Filtración (`backend/tests/importador-filtracion.test.cjs`):**
   * Pruebas ejecutadas: 9
   * Pruebas aprobadas: 9 (0 fallas)
   * Tiempo de ejecución: 132 ms
   * Cobertura: Parseo de CSV con comillas y caracteres especiales, clasificación canónica ITS/ILE, conservación de `id_origen`, deducción de nombres, extracción de coordenadas geoespaciales, deduplicación de registros duplicados, filtrado de verificación, análisis del archivo `filtracion.csv` y simulación transaccional con rollback.

4. **Validaciones de Componentes Frontend (`frontend/tests/*.test.mjs`):**
   * Pruebas ejecutadas: 13
   * Pruebas aprobadas: 13 (0 fallas)
   * Tiempo de ejecución: 91 ms
   * Cobertura: Flujos de autenticación, restricciones de tres campos en registro, filtros de búsqueda, geoposicionamiento en mapa y normalización de clínicas.

### 6.2. Validación en Entorno de Base de Datos Real (Docker PostgreSQL)
* **Ejecución del Importador en Base de Datos Viva:**
  * Comando: `docker compose exec backend node scripts/importar-filtracion.js --archivo data/filtracion.csv --apply`
  * Filas procesadas: 58
  * Sedes únicas consolidadas: 58
  * Servicios asociados en `clinicas_servicios`: 62
  * Franjas horarias registradas: 172
  * Filas omitidas: 0
* **Consumo API en Vivo (`GET /api/clinicas`):**
  * Total de sedes servidas en tiempo real: 60 centros de atención activos con soporte PostGIS y filtros funcionales.

---

## 7. Matriz General de Sprints, Endpoints y Vistas

| Etapa / Sprint | Implementación en Base de Datos y Arquitectura | Endpoints Vinculados | Ruta y Elemento Visual en la Interfaz |
| :--- | :--- | :--- | :--- |
| **Inicio & Docker** | Contenedores Docker (PostGIS 15, Node 22, Nginx, React), volúmenes de persistencia y migrador transaccional. | Comunicación interna de red (3000 / 8080). | Pantalla inicial en `http://localhost:8080`. |
| **Sprint 3** | Migraciones 001 y 002: Esquema v1.3 (`usuarios`, `clinicas`, `servicios`, PostGIS, turnos) y catálogo semilla. | `POST /api/auth/registro`<br>`POST /api/auth/login`<br>`GET /api/perfil` | Vistas `/login` y `/registro` de pacientes. |
| **Sprint 4** | Migraciones 003, 004 y 005: Registro progresivo, atributos operativos de sede, áreas canónicas ITS/ILE, snapshot JSONB. | `POST /api/auth/registro-clinica`<br>`GET/PUT /api/clinicas/mi-ficha`<br>`POST /api/clinicas/mi-ficha/documentos`<br>`POST /api/clinicas/mi-ficha/postulacion` | Vista `/registro` (clínica), panel institucional `/mi-clinica` y ficha `/centro/:id`. |
| **Sprint 5** | Importador masivo de Filtración, algoritmo de deduplicación, extracción de coordenadas y catálogo público. | `GET /api/clinicas` (público, con filtros por nombre, municipio y área médica)<br>`GET /api/clinicas/:id` | Directorio principal en `/` y mapa completo interactivo en `/mapa`. |
| **Sprint 6** | Migración 006: Relación citas-usuarios-clínicas-horarios, 4 estados formales e índice condicional de turno único. | `GET /api/clinicas/:id/espacios-disponibles`<br>`POST /api/citas`<br>`GET /api/citas`<br>`PATCH /api/citas/:id/cancelar`<br>`PATCH /api/citas/:id/estado`<br>`GET /api/clinicas/mi-clinica/citas` | Flujo de agendamiento `/agendar-cita`, sección Mis Citas del usuario y agenda `/mi-clinica/citas`. |
