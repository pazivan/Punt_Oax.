# PuntOax — Sprint 5 · Fichas completas desde mapa

> **Nota de integración local:** esta guía describe la entrega original de Citlalli.
> En `integracion/sprint5-local`, `/` y `/centro/:id` usan este mapa y ficha;
> `/directorio` conserva el directorio público anterior y `/cuenta`, `/mapa` e
> `/informacion-util` conservan las vistas de Yareli. `GET /api/clinicas` también
> incluye los filtros opcionales `nombre`, `municipio` y `servicios` de Kelly.
> No se sustituyó el `App.jsx` completo de esta entrega ni se alteró la BD.

Esta entrega se basa en el ZIP `Punt_Oax(1).zip` recibido el 2 de noviembre de 2026. No incluye ni modifica la carpeta `.git`, archivos `.env`, contraseñas, ni dependencias `node_modules`.

## Qué contiene

- **Mapa real de OpenStreetMap + Leaflet**, alimentado por `GET /api/clinicas`. Los marcadores usan las coordenadas que ya almacena PostGIS.
- **Tarjeta del marcador** con nombre, municipio, dirección, horario registrado y botones «Ver ficha completa» y «Cómo llegar».
- **Ficha completa como modal** sobre el mismo mapa, alimentada por el nuevo `GET /api/clinicas/:id` (solo centros aprobados).
- **Varios servicios separados por sede**, cada uno con requisitos, costo y si requiere cita.
- **Carga, error + reintento, ID no encontrado y campos pendientes**, sin valores inventados.
- **Búsqueda y filtros provisionales** por texto, municipio y servicio, sincronizados entre mapa y lista. Se guardan en los parámetros URL al abrir/cerrar ficha.
- **Diseño adaptable** a escritorio/móvil, enlace «Compartir» y «Cómo llegar» usando Google Maps.

## Archivos de esta entrega

```
backend/servidor.js                         MODIFICADO: 2 endpoints
frontend/src/App.jsx                       MODIFICADO: enruta / y /centro/:id al mismo mapa
frontend/src/components/DirectorioMapa.jsx NUEVO: mapa + listado + filtros
frontend/src/components/DirectorioMapa.css NUEVO: estilos
frontend/src/components/FichaCentroMapa.jsx NUEVO: resumen y ficha modal
frontend/src/utils/centros.js              NUEVO: formato, filtros y coordenadas
frontend/tests/fichas-mapa.test.mjs        NUEVO: pruebas unitarias
```

El antiguo `DetalleCentro.jsx` sigue en tu proyecto pero ya no se usa en la nueva navegación. Se dejó para evitar borrar trabajo anterior.

## Instalación en Windows

**Opción recomendada:** usa `PuntOax_Sprint5_SoloCambios.zip` y copia las rutas indicadas sobre la versión actual `Punt_Oax`, conservando el resto de tus archivos.

No reemplaces `.env`, `docker-compose.yml`, carpetas `.git` ni código ajeno. Crea una copia de seguridad o usa una rama nueva antes de copiar.

### Probar con Docker Compose (con `.env` configurado)

En la carpeta raíz:

```powershell
docker compose up -d --build
```

Abre `http://127.0.0.1:8080/` (la API se sirve desde `/api` por nginx). Revisa `http://127.0.0.1:3000/api/clinicas` para confirmar que la API responde.

**IMPORTANTE:** el mapa y los marcadores solo muestran centros `aprobada` almacenados en tu BD. Si aparece vacío, comprueba que hay datos aprobados y coordenadas registradas; no son marcadores de demostración. Los mosaicos de OpenStreetMap requieren conexión a Internet.

### Probar con frontend local y backend ya iniciado

```powershell
cd frontend
npm ci
npm run dev
```

Abre la URL que muestre Vite. `vite.config.js` ya redirige `/api` a `localhost:3000`.

### Ejecutar pruebas de lógica

```powershell
cd frontend
npm test
```

## Pruebas manuales de aceptación

1. Abre `/`. Debes ver mapa de Oaxaca, centro(s) aprobados y tarjetas del directorio.
2. Haz clic en un marcador. Debe aparecer la tarjeta resumida del centro correcto.
3. Haz clic en «Ver ficha completa». Debe abrirse el modal **encima** del mapa, mostrando el nombre y los servicios separados (no un centro fijo simulado).
4. Cierra con X o Escape. Debes regresar al mapa con la búsqueda y filtros sin cambios.
5. Busca por nombre, filtra municipio/servicio, abre una ficha desde el listado y ciérrala. El filtro debe mantenerse.
6. Copia el enlace `/centro/<UUID>` de una ficha, pégalo en una nueva pestaña: debe abrirse directamente.
7. Abre `/centro/no-existe`. Debe mostrar «Centro no encontrado», sin bloquear el mapa.
8. Desconecta temporalmente el backend, carga una ficha y pulsa «Reintentar» cuando vuelva la conexión.
9. Prueba en modo móvil (herramientas de desarrollador del navegador): lista, filtros, mapa y modal deben ser utilizables.
10. Confirma que `/login`, `/registro`, `/cuenta` y `/admin` siguen disponibles.

La captura «Central de Abastos» sirve de **referencia visual**, pero ese centro solo aparecerá si existe en la base de datos actual. No se insertaron registros inventados.

## Alcance y límites

- Se reutilizan `leaflet` y `react-leaflet`, **ya presentes** en `frontend/package.json`, sin agregar paquetes.
- `GET /api/clinicas/:id` y los filtros deben revisarse con la base PostgreSQL del equipo. No se aplicó ninguna migración ni se modificó el esquema de la BD.
- Las pruebas `npm test` existentes y nuevas pasan (11/11), y se validó la sintaxis JSX. **No se verificó una compilación completa de Vite ni una prueba de navegador/BD** en el entorno de preparación debido a la instalación de dependencias bloqueada por red/tiempo.
- Si alguien de tu equipo integra un mapa diferente después, conecta `FichaCentroMapa` reutilizando el endpoint en lugar de mantener dos implementaciones.
- Para subir cambios a Git, conviene hacerlo primero en tu rama `citlalli/sprint5-ficha-centros` y revisar `git diff` antes de hacer commit.

Commit sugerido: `feat: integrar mapa y fichas completas de centros`.
