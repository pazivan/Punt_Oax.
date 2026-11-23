# Revisión de Coordenadas PostGIS y Criterio de Cercanía

**Sprint 8 · Base de Datos / PostGIS (Iván)**
**Coordinación:** Kelly (API de centros cercanos — `docs/contrato-api-cercania.md`)

---

## 1. Tabla y Campo Utilizados

* **Tabla:** `clinicas`
* **Columna geoespacial:** `ubicacion_geo GEOGRAPHY(Point, 4326)`
* **Índice espacial:** `idx_clinicas_ubicacion_geo` (`GiST`)
* **Convención de almacenamiento en PostGIS:**
  * PostGIS espera los puntos en orden **`(longitud, latitud)`**, es decir `(X, Y)`:
    ```sql
    ST_SetSRID(ST_MakePoint(longitud, latitud), 4326)::geography
    ```
  * Para extraer las coordenadas hacia la API:
    * `ST_Y(ubicacion_geo::geometry)` devuelve la **latitud**.
    * `ST_X(ubicacion_geo::geometry)` devuelve la **longitud**.
  * El tipo `geography(Point, 4326)` calcula distancias geodésicas reales sobre la superficie terrestre en **metros** (`ST_Distance` y `ST_DWithin`).

---

## 2. Criterio para Incluir Centros y Omitir Ubicaciones Faltantes o Dudosas

Para que una sede aparezca en la consulta de cercanía debe cumplir simultáneamente las cuatro condiciones siguientes:

1. `estado_publicacion = 'aprobada'` (solo centros autorizados para el catálogo público).
2. `ubicacion_geo IS NOT NULL` (omisión automática de centros sin coordenadas registradas).
3. `situacion_ubicacion = 'fija'` (se excluyen sedes con situación `'itinerante'`, `'pendiente'` o `'reubicacion'` porque no garantizan una ubicación física permanente).
4. `verificacion_datos = 'verificado'` (se excluyen sedes con estado `'pendiente'`, `'por_confirmar'`, `'parcial'` o `'inconsistente'`, evitando mostrar distancias engañosas hacia ubicaciones no validadas).

### Qué ocurre con centros sin coordenadas
* No producen errores en PostGIS porque `ubicacion_geo IS NOT NULL` los descarta antes de evaluar `ST_DWithin` y `ST_Distance`.
* Siguen disponibles en el directorio general (`GET /api/clinicas`), pero quedan fuera de `GET /api/clinicas/cercanas`.

---

## 3. Casos Detectados en los Catálogos del Proyecto

Al auditar los conjuntos de datos oficiales en `backend/data/`:

1. **`backend/data/its-coordenadas.csv` (Sedes ITS):**
   * **26 centros** con coordenadas válidas dentro del rango geográfico de Oaxaca (latitud `15.5` a `18.8`, longitud `-98.7` a `-93.8`), todos con `situacion_ubicacion = 'fija'` y `verificacion_datos = 'verificado'`.
2. **`backend/data/aborto-coordenadas.csv` (Sedes ILE):**
   * **17 centros** con coordenadas válidas dentro de Oaxaca, todos con `situacion_ubicacion = 'fija'` y `verificacion_datos = 'verificado'`.
3. **`backend/data/filtracion.csv` (Base inicial consolidada):**
   * **58 filas** que en la hoja original no incluían columnas numéricas de `latitud` y `longitud` (solo enlace corto `maps.app.goo.gl` o texto descriptivo).
   * Cualquier registro importado únicamente desde esa hoja sin georreferenciación posterior permanece con `ubicacion_geo IS NULL` o `verificacion_datos <> 'verificado'`, por lo que el filtro de la consulta lo excluye automáticamente hasta contar con coordenadas fijas verificadas.
4. **Control de valores dudosos:**
   * Se consideran dudosos los puntos fuera de la envolvente territorial de Oaxaca (`lat < 15.5` o `lat > 18.8`, `lng < -98.7` o `lng > -93.8`) o con signos/ejes invertidos (`latitud < 0` o `longitud > 0`).

---

## 4. Punto de Prueba de Referencia (para reutilizar en la API)

* **Ubicación:** Oaxaca de Juárez — Zona Centro
* **Coordenadas:** `lat = 17.0654`, `lng = -96.7236`
* **Radio de prueba:** `10 km` (`10000 m`)

### Primeros resultados esperados en orden ascendente de distancia

| Orden | Centro | Categoría | Coordenadas | Distancia aprox. |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Unidad de Control Sanitario | `its` | `17.0633, -96.7179` | `0.65 km` |
| 2 | Hospital General de Zona - UMAA No. 1 ("Dr. Demetrio Mayoral Pardo") | `ile` | `17.0721, -96.7213` | `0.79 km` |
| 3 | Salud Digna — Oaxaca Centro | `its` | `17.0583, -96.7259` | `0.83 km` |
| 4 | Punto de Detección Permanente COESIDA — IMEDI Oaxaca | `its` | `17.0652, -96.7145` | `0.97 km` |
| 5 | Centro de Salud Urbano Colonia Estrella | `ile` | `17.0740, -96.7261` | `0.99 km` |
| 6 | Centro de Salud Urbano No. 1 «Dr. Manuel Martínez Soto» | `ile` | `17.0578, -96.7292` | `1.03 km` |

---

## 5. Cómo Probar la Consulta y Evidencia de Ejecución

1. **Pruebas unitarias automatizadas (sin requerir conexión activa a PostgreSQL):**
   ```powershell
   node --test backend/tests/cercania-postgis.test.cjs
   ```
   * Valida la parametrización (`$1` a `$5`), orden `(longitud, latitud)` en `ST_MakePoint($2, $1)`, filtros de ubicación confirmada, validación de rangos y ordenamiento de resultados.
   * Resultado verificado: **4 de 4** pruebas aprobadas.

2. **Prueba directa contra PostgreSQL / PostGIS en Docker:**
   ```javascript
   const { consultarCentrosCercanos, PUNTO_REFERENCIA_OAXACA } = require('./backend/cercaniaPostgis');
   const filas = await consultarCentrosCercanos(pool, PUNTO_REFERENCIA_OAXACA);
   console.table(filas.map(({ nombre, distancia_km, latitud, longitud }) => ({ nombre, distancia_km, latitud, longitud })));
   ```
   * Los centros sin coordenadas (`ubicacion_geo IS NULL`), no aprobados o con `situacion_ubicacion <> 'fija'` / `verificacion_datos <> 'verificado'` quedan excluidos en el `WHERE`, por lo que nunca aparecen con distancias nulas o erróneas.
