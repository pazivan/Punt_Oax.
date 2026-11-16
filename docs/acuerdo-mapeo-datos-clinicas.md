# Acuerdo Técnico: Mapeo y Estandarización de Clínicas, Servicios y Horarios

**Fecha:** 2 de noviembre de 2026  
**Responsable:** Iván (Modelo de Datos)  
**Destinatarios:** Kelly (API y Filtros), Citlalli (Ficha y Registro), Desarrollador/a del Importador, Miguel (Coordinación e Integración)  
**Rama de trabajo:** `ivan/mapeo-datos-clinicas`  
**Base:** `origin/main` actualizado (`1940c25`)

---

## 1. Propósito y Alcance

Este documento establece el **acuerdo formal de integración, estandarización y mapeo** entre:
1. La fuente de datos oficial ([Google Sheets *Filtración*](https://docs.google.com/spreadsheets/d/1cVc7mSo7Xi8dNWG7lI7DNeUuS4G12Dq1dfMB1oPfaAU/edit), pestañas `ITS`, `Aborto` y `Ambos`).
2. Las pantallas oficiales de Figma:
   * **Directorio con Mapa:** *"Encuentra un centro de atención"*.
   * **Ficha del Centro:** *"Detalle del Centro"*.
   * **Formulario de Registro/Edición de Clínica:** *"Cuéntanos sobre tu clínica • Datos del centro"*.
3. El modelo relacional de **PuntOax v1.3** en PostgreSQL + PostGIS.

### Principios Fundamentales
1. **Respeto al Esquema Existente:** No se recrea el esquema ni se aplican propuestas antiguas u obsoletas (`public.puntos`, esquemas previos de Supabase). Se mantiene la estructura normalizada de `clinicas`, `servicios`, `clinicas_servicios` y `horarios_atencion`.
2. **Estandarización de Servicios (Regla de Negocio Crítica):**
   * El sistema PuntOax maneja únicamente **dos servicios canónicos de salud sexual y reproductiva**:
     1. **`Detección de ITS`** (Categoría: `ITS`)
     2. **`Interrupción Legal del Embarazo (ILE)`** (Categoría: `ILE` / `Aborto`)
   * **Todo centro en PuntOax ofrece uno, el otro, o ambos:**
     * Centro de detección: vinculado a `Detección de ITS`.
     * Centro de aborto: vinculado a `Interrupción Legal del Embarazo (ILE)`.
     * Centro mixto (pestaña `Ambos` o sedes con doble atención): vinculado a **ambos servicios** mediante dos registros en la tabla intermedia `clinicas_servicios`.
3. **La Clínica como Entidad Central (`nombre` como referencia principal):**
   * La sede se identifica con su `nombre` público (ej. *Centro de Atención PuntOax*, *Hospital General Dr. Aurelio Valdivieso*, *Fundación MSI Marie Stopes*), el cual se relaciona directamente con:
     * **`id_clinica` (UUID)**: Clave primaria limpia del sistema.
     * **`id_origen`**: Código de auditoría de la hoja (ej. `'coesdia 1'`, `'imss 2'`, `'36'`). Nunca se utiliza `N.º de origen` como clave.
     * **`municipio`** y **`region`**: Ubicación administrativa y zona (ej. *Oaxaca y zona metropolitana*, *Istmo*, *Costa*).
     * **`direccion`**: Domicilio físico completo.
     * **`horario_texto`**: Horario de atención legible (ej. *Lunes a viernes, 09:00-17:00 h*).
     * **`telefono`**: Teléfono de contacto institucional.
     * **`servicios`**: Uno o ambos servicios canónicos vinculados a través de `clinicas_servicios`.
4. **Sedes Únicas (Sin Duplicación):** Si una sede ofrece ambos servicios, se crea **una sola fila en `clinicas`** y **dos filas en `clinicas_servicios`**.
5. **Cero Invención de Datos:** Datos faltantes se conservan como `NULL` o se registran en `datos_por_confirmar`.
6. **Separación de Aprobación de Publicación vs. Verificación de Datos:**
   * `estado_publicacion` (`'borrador'`, `'pendiente'`, `'aprobada'`, `'rechazada'`, `'suspendida'`): Visibilidad en el directorio público.
   * `verificacion_datos` (`'pendiente'`, `'por_confirmar'`, `'parcial'`, `'verificado'`, `'inconsistente'`): Calidad y confirmación de datos de campo.

---

## 2. Estandarización del Catálogo Canónico de Servicios

En la migración `004`, la tabla `servicios` garantiza la existencia de los dos servicios canónicos:

```sql
INSERT INTO servicios (nombre, descripcion, categoria, activo)
VALUES 
    (
        'Detección de ITS',
        'Detección oportuna confidencial y gratuita mediante pruebas rápidas de VIH, Sífilis y Hepatitis C, entrega de insumos preventivos y orientación.',
        'ITS',
        TRUE
    ),
    (
        'Interrupción Legal del Embarazo (ILE)',
        'Atención médica, orientación y acompañamiento seguro, legal y confidencial para la interrupción del embarazo conforme al marco legal de Oaxaca.',
        'ILE',
        TRUE
    )
ON CONFLICT (nombre) DO UPDATE SET 
    categoria = EXCLUDED.categoria,
    activo = TRUE;
```

---

## 3. Matriz de Mapeo y Priorización de la Interfaz

### 3.1. Alcance Activo y Simplificado de la Interfaz (Decisión de Alcance)

Para mantener la interfaz clara, rápida y sin sobrecarga innecesaria, se acordó priorizar estrictamente el siguiente núcleo de campos:

#### A. Campos Activos y Obligatorios en Pantalla:
1. **`nombre`**: Nombre público del centro.
2. **`id`**: `id_clinica` (UUID interno del sistema) y `id_origen` (auditoría de origen).
3. **`municipio`**: Municipio operativo.
4. **`direccion`**: Dirección física completa.
5. **`horario`**: Horario de atención (`horario_texto` y franjas estructuradas).
6. **`telefono`**: Teléfono institucional a 10 dígitos.
7. **`servicios`**: Estandarizado estrictamente a **Detección de ITS**, **ILE**, o **ambos**.
8. **`tipo_institucion`**: Selector estándar (`publica`, `privada`, `ong`, `otra`).

#### B. Campos Secundarios / Opcionales (No requeridos en la interfaz actual / obsoletos para esta versión):
* **`costo_texto` y `requisitos`**: No se exigirán en la pantalla de datos; permanecen como opcionales en BD.
* **`ubicacion_maps_url` / `ubicacion_geo`**: No se forzarán en la vista si la clínica no cuenta con link de Maps.
* **`links_relacionados` y notas de confirmación**: Manejadas internamente en backend sin ensuciar el formulario.
* **`estado_publicacion`**: Se maneja por defecto en `'borrador'` internamente en el backend sin requerir controles adicionales en el cliente.

### 3.2. Tabla de Correspondencia Técnica

| Campo en Pantalla | Columna en Hoja (*Filtración*) | Tabla y Columna PostgreSQL | Prioridad / Estado |
| :--- | :--- | :--- | :--- |
| **Nombre público del centro \*** | `Unidad de Salud` (o nombre en `Dirección`) | `clinicas.nombre` | **Activo prioritario** |
| **Tipo de institución** | `Nivel de Atención` | `clinicas.tipo_institucion` | **Activo** |
| **Municipio \*** | `Municipio` | `clinicas.municipio` | **Activo prioritario** |
| **Región** | *(Inferido por municipio)* | `clinicas.region` | Complementario |
| **Dirección completa \*** | `Dirección` | `clinicas.direccion` y `codigo_postal` | **Activo prioritario** |
| **Servicios \*** | `Servicios` (Pestaña `ITS`, `Aborto` o `Ambos`) | `clinicas_servicios` $\rightarrow$ `servicios` | **Activo prioritario (ITS / ILE / Ambos)** |
| **Horario de atención \*** | `Horario` | `clinicas.horario_texto` y `horarios_atencion` | **Activo prioritario** |
| **Teléfono de contacto \*** | `Teléfono` | `clinicas.telefono` | **Activo prioritario** |
| **Id de referencia de origen** | `Id` (ej. `'coesdia 1'`, `'imss 2'`) | `clinicas.id_origen` y `clinicas_servicios.id_origen` | Auditoría interna (no clave) |
| **Costo y requisitos** | `Requisitos` | `clinicas_servicios.costo_texto` / `requisitos` | Opcional / en pausa en interfaz |
| **Ubicación Google Maps** | `Ubicacion maps` | `clinicas.ubicacion_maps_url` / `ubicacion_geo` | Opcional / no exigido en formulario |
| **Situación de la sede** | Columna `Dirección` / notas | `clinicas.situacion_ubicacion` | Soporte backend (`'fija'`, `'itinerante'`, etc.) |
| **Verificación de datos** | Auditoría de campos | `clinicas.verificacion_datos` | Soporte backend (`'verificado'`, etc.) |

---

## 4. Clasificación de Situación de Ubicación y Verificación de Datos

### 4.1. `situacion_ubicacion` (`'fija' | 'pendiente' | 'itinerante' | 'reubicacion'`)
* **`'fija'`**: Sedes con domicilio físico permanente (hospitales, clínicas comunitarias, consultorios municipales).
* **`'itinerante'`**: Unidades móviles o rutas periódicas (ej. jornada de Central de Abasto, rutas DIF).
* **`'reubicacion'`**: Sedes en proceso de cambio de domicilio (ej. AHF Oaxaca).
* **`'pendiente'`**: Sedes cuya ubicación física o domicilio permanente aún no está corroborado.

### 4.2. `verificacion_datos` (`'pendiente' | 'por_confirmar' | 'parcial' | 'verificado' | 'inconsistente'`)
* Controla la certeza técnica de los datos de campo, independiente de `estado_publicacion`.

---

## 5. Regla de Integridad para Horarios 24h y Cruces de Medianoche

En `horarios_atencion`, la migración `004` implementa:
```sql
CONSTRAINT chk_horarios_intervalo CHECK (
    (es_24_horas = TRUE AND cruza_medianoche = FALSE) OR
    (es_24_horas = FALSE AND cruza_medianoche = FALSE AND hora_apertura < hora_cierre) OR
    (es_24_horas = FALSE AND cruza_medianoche = TRUE AND hora_apertura > hora_cierre)
)
```

Soporta casos reales como *"Lunes a domingo las 24 horas"* (`es_24_horas = TRUE`) y *"Sábado 20:00 a 09:00 Domingo"* (`cruza_medianoche = TRUE`).

---

## 6. Coordinación con el Equipo (Kelly, Citlalli, Importador, Miguel)

1. **Kelly (`origin/kelly/filtros-clinicas`):**
   * El filtro `?servicios=ITS` filtrará `s.categoria = 'ITS'` o `s.nombre = 'Detección de ITS'`.
   * El filtro `?servicios=Aborto` o `?servicios=ILE` filtrará `s.categoria = 'ILE'` o `s.nombre = 'Interrupción Legal del Embarazo (ILE)'`.
   * Clínicas con ambos servicios responderán a cualquiera de los dos filtros automáticamente y sin duplicarse.
2. **Citlalli (`origin/citlalli/sprint5-ficha-centros` y pantalla de alta de clínica):**
   * El formulario se enfoca en los campos activos esenciales: `nombre`, `tipo_institucion`, `municipio`, `direccion`, `horario`, `telefono` y los dos checkboxes de `servicios` (`[ ] Detección de ITS`, `[ ] Interrupción Legal del Embarazo (ILE)`).
3. **Miguel (Integración):**
   * Esta rama no introduce conflictos de merge con `origin/main`.
