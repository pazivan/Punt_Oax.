# Contrato de la API de centros cercanos

**Sprint 8 · 4.8.1 · Issue #94 (Kelly)** — 16 al 22 de noviembre de 2026



Este documento define **qué recibe** y **qué responde** la API para que el
backend y el frontend puedan trabajar en paralelo. Si algo cambia, se actualiza
aquí primero y se avisa en el grupo.

---

## 1. Ruta

```
GET /api/clinicas/cercanas
```

- **Pública**, igual que `GET /api/clinicas`: no requiere sesión.
- Se registra **antes** de `GET /api/clinicas/:id` en `servidor.js`, para que
  Express no confunda `cercanas` con un identificador.

## 2. Parámetros (query string)

| Parámetro | Obligatorio | Tipo | Valores permitidos | Predeterminado |
|---|---|---|---|---|
| `lat` | sí | número decimal | -90 a 90 | — |
| `lng` | sí | número decimal | -180 a 180 | — |
| `radio_km` | no | número decimal | 0.5 a 100 | `10` |
| `limite` | no | entero | 1 a 50 | `10` |
| `servicios` | no | texto | `its`, `ile` o `its,ile` (igual que en `GET /api/clinicas`) | todos |

Reglas de validación:

- `lat` y `lng` deben ser números finitos. Se aceptan con punto decimal
  (`17.0654`); **no** se aceptan comas decimales, texto ni valores vacíos.
- Cada parámetro se envía **una sola vez** (si llega repetido, es error 400).
- `limite` debe ser entero (`10`, no `10.5`).
- Parámetros desconocidos se ignoran.

Ejemplo:

```
GET /api/clinicas/cercanas?lat=17.0654&lng=-96.7236&radio_km=10&limite=5&servicios=its
```

## 3. Qué centros entran en el resultado

1. Solo clínicas con `estado_publicacion = 'aprobada'` (las mismas del mapa).
2. Solo centros con **ubicación confirmada**: `ubicacion_geo` no nula,
   `situacion_ubicacion = 'fija'` y `verificacion_datos = 'verificado'`.
   Un centro con ubicación aproximada daría una distancia engañosa, y en estos
   servicios eso puede hacer que una persona llegue a un lugar equivocado.
3. Que estén dentro de `radio_km` desde el punto enviado.
4. Si se envía `servicios`, que ofrezcan al menos uno de esos servicios activo.
5. Ordenados por **distancia ascendente**; si empatan, por nombre.
6. Como máximo `limite` centros.

La distancia es la **distancia en línea recta** sobre la Tierra (PostGIS
`ST_Distance` con `geography`), no la distancia por calle. En la interfaz debe
decir «a X km en línea recta» o «aprox.».

## 4. Respuesta exitosa (200) con centros

```json
{
  "origen": { "lat": 17.0654, "lng": -96.7236 },
  "radio_km": 10,
  "total": 2,
  "centros": [
    {
      "id_clinica": "f1dc98fd-85ae-4893-956f-d0e76f655e3b",
      "nombre": "Hospital General Dr. Aurelio Valdivieso",
      "municipio": "Oaxaca de Juárez",
      "direccion": "Calzada Porfirio Díaz s/n, Reforma",
      "latitud": 17.0792,
      "longitud": -96.7212,
      "distancia_km": 1.56,
      "categorias": ["its"],
      "servicios": ["Consulta de Salud Sexual y Reproductiva", "Prueba Rápida de VIH y Sífilis"],
      "telefono": "9515151200",
      "horario": "Lunes a viernes de 8:00 a 15:00"
    },
    {
      "id_clinica": "…",
      "nombre": "Centro de Salud Urbano No. 1",
      "municipio": "Oaxaca de Juárez",
      "direccion": "…",
      "latitud": 17.0601,
      "longitud": -96.7253,
      "distancia_km": 0.62,
      "categorias": ["its"],
      "servicios": ["…"],
      "telefono": null,
      "horario": null
    }
  ]
}
```

Notas de formato:

- Los nombres de campo son **los mismos que ya devuelve `GET /api/clinicas`**
  (`id_clinica`, `nombre`, `municipio`, `direccion`, `latitud`, `longitud`,
  `categorias`, `servicios`, `telefono`, `horario`), para que el frontend pueda
  reutilizar sus tarjetas. El único campo nuevo es `distancia_km`.
- `distancia_km` es un **número** con 2 decimales (no texto). El frontend decide
  cómo mostrarlo, por ejemplo «1.6 km» o «620 m» si es menor a 1 km.
- `telefono` y `horario` pueden venir en `null` cuando el catálogo los marca
  como pendientes de confirmar (misma regla que la ficha pública).
- `total` es la cantidad de centros en `centros` (después de aplicar `limite`).
- `origen` y `radio_km` regresan lo que se usó para la búsqueda, ya validado.

## 5. Respuesta sin resultados (200)

No es un error: la búsqueda fue válida, solo que no hay centros en ese radio.

```json
{
  "origen": { "lat": 16.1234, "lng": -95.1234 },
  "radio_km": 10,
  "total": 0,
  "centros": [],
  "mensaje": "No encontramos centros con ubicación confirmada a menos de 10 km. Prueba con un radio mayor o consulta el mapa completo."
}
```

El frontend debe mostrar el `mensaje` y un botón para ampliar el radio
(por ejemplo a 25 o 50 km) o volver al mapa completo.

## 6. Errores de validación (400)

Mismo formato que el resto de la API: `error` general y `campos` con el detalle
de cada parámetro, para mostrarlo junto al control correspondiente.

```json
{
  "error": "Revisa los datos de ubicación enviados.",
  "campos": {
    "lat": "La latitud debe ser un número entre -90 y 90.",
    "radio_km": "El radio debe estar entre 0.5 y 100 km."
  }
}
```

| Caso | Campo | Mensaje |
|---|---|---|
| Falta `lat` o `lng` | `lat` / `lng` | «Envía la latitud y la longitud de tu ubicación.» |
| `lat` fuera de -90…90 o no numérica | `lat` | «La latitud debe ser un número entre -90 y 90.» |
| `lng` fuera de -180…180 o no numérica | `lng` | «La longitud debe ser un número entre -180 y 180.» |
| `radio_km` fuera de 0.5…100 | `radio_km` | «El radio debe estar entre 0.5 y 100 km.» |
| `limite` no entero o fuera de 1…50 | `limite` | «El límite debe ser un número entero entre 1 y 50.» |
| `servicios` con valores distintos de its/ile | `servicios` | «Los servicios permitidos son its e ile.» |
| Parámetro repetido | el parámetro | «Envía este parámetro una sola vez.» |

## 7. Otros códigos

| Código | Cuándo | Cuerpo |
|---|---|---|
| 500 | Falla de base de datos | `{ "error": "No se pudieron consultar los centros cercanos." }` (sin detalles internos) |

## 8. Privacidad de la ubicación

La ubicación de una persona que busca estos servicios es un dato sensible.

- El backend **no guarda** las coordenadas recibidas en la base de datos.
- El backend **no las escribe en los logs** (ni en `console.error`).
- El frontend solo pide la ubicación cuando la persona presiona
  «Usar mi ubicación», y si la niega, el mapa sigue funcionando normal.
- Se recomienda redondear las coordenadas a 4 decimales (~11 m) antes de
  enviarlas; es suficiente para calcular distancias.

## 9. Ejemplos para probar (PowerShell)

```powershell
# Centros cercanos al zócalo de Oaxaca
Invoke-RestMethod "http://localhost:3000/api/clinicas/cercanas?lat=17.0606&lng=-96.7253&radio_km=10"

# Solo ILE, radio de 50 km, máximo 5
Invoke-RestMethod "http://localhost:3000/api/clinicas/cercanas?lat=17.0606&lng=-96.7253&radio_km=50&limite=5&servicios=ile"

# Error esperado (400): latitud fuera de rango
try { Invoke-RestMethod "http://localhost:3000/api/clinicas/cercanas?lat=200&lng=-96.72" } catch { $_.ErrorDetails.Message }
```



