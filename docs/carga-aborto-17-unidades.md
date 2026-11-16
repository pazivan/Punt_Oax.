# Aborto: 17 unidades, revisión local

Rama: `feat/catalogo-ile-17-unidades`, creada desde `origin/main` en
`2d6aae8` (incluye la integración Sprint 7 y las validaciones del #81).
Worktree de esta revisión: `/tmp/opencode/puntoax-ile-17`.

## Fuente y alcance

Captura del **16 de noviembre de 2026**, exclusivamente filas **2–18**:

- [Filtracion / Aborto](https://docs.google.com/spreadsheets/d/1cVc7mSo7Xi8dNWG7lI7DNeUuS4G12Dq1dfMB1oPfaAU/edit?gid=1498636790).
- [Auditoría de ubicaciones](https://docs.google.com/spreadsheets/d/1cVc7mSo7Xi8dNWG7lI7DNeUuS4G12Dq1dfMB1oPfaAU/edit?gid=1498636791).
- Snapshots originales completos: `backend/data/aborto-fuentes/{aborto,auditoria}.csv`.
- CSV preparado: `backend/data/aborto-coordenadas.csv`.

SHA-256 de los snapshots:

```text
54d9f09b17b8408077ed87352b7d7919e8a0ad6383820f8c3fc9349361255224  aborto.csv
c402426b85055e68a399b85a83ce52b0c5eeeb56e07eccc63886cd8d73920e87  auditoria.csv
```

Regeneración reproducible desde los snapshots, sin conexión:

```bash
python3 backend/scripts/preparar-aborto.py
```

Para descargar versiones nuevas y volver a preparar (revisar después el diff):

```bash
python3 backend/scripts/preparar-aborto.py --actualizar-fuentes
```

El script valida los encabezados **P=Latitud, Q=Longitud**, la correspondencia
fila/ID/nombre/CLUES con la auditoría y la unicidad de las 17 CLUES. Convierte
coma decimal a punto; no obtiene coordenadas del enlace de Maps ni geocodifica.
PostGIS almacena `ST_SetSRID(ST_MakePoint(longitud, latitud), 4326)::geography`.
Leaflet ya utiliza `[latitud, longitud]` mediante `utils/centros.js`.

## Identidad, conservación y publicación

La migración **008** añade `clinicas.clues` (única, nullable) y
`revision_catalogo` (trazabilidad interna y campos no publicables).
El identificador de las rutas sigue siendo el UUID de la clínica.

El modo `--catalogo-ile` del importador existente:

1. Busca CLUES en la columna nueva y en fuentes previas; compara también
   ID de origen (incluida la variante decimal `34.0`), nombre, municipio y domicilio.
2. Exige domicilio coincidente para combinar. No fusiona por proximidad o por
   nombre aislado. Una discrepancia o varias candidatas se reportan con fila
   y motivo y se continúa con las otras unidades.
3. Conserva UUID, ID previo, cuenta, horarios existentes (también texto),
   relaciones, cupos y citas. Solo añade la relación canónica ILE si falta;
   una relación existente no se recrea ni se modifica.
4. Conserva fuentes y enlaces anteriores, añade los de la hoja, actualiza el
   domicilio auditado y el punto numérico, y publica la ficha como aprobada.
5. No crea horarios estructurados, cuentas institucionales ni cupos.
   Los horarios confirmados de sedes nuevas son texto informativo.

Para una unidad nueva sin ID de hoja se usa **CLUES como clave estable**;
`id_origen` queda NULL. Así se integra `OCIST000112` sin inventar un ID.
Si existiese previamente, se reutilizaría su UUID tras comprobar CLUES y domicilio.
El origen de esta hoja queda también registrado en `revision_catalogo.id_origen_hoja`.

Las omisiones se aplican en las dos respuestas públicas:
`GET /api/clinicas` y `GET /api/clinicas/:id`. Así un teléfono u horario antiguo
no vuelve a aparecer cuando está pendiente. Los horarios internos siguen en la
BD. Las notas internas no se exponen, pues pueden contener valores descartados.
Se conservan íntegras en los snapshots y en `datos_por_confirmar`.
La dirección pública se prepara sin CP o numeración pendientes; el domicilio
original permanece en `revision_catalogo.direccion_identidad` para cotejar identidad.

Se toma un teléfono **completo de la unidad**, no las primeras 20 letras de
una celda con varios teléfonos; los demás quedan en el snapshot. Si hay dos
correos se usa el primero. No se importa ITS desde la fila 16: la auditoría
solo acredita ILE. Un servicio ITS ya relacionado se conserva.

## Inventario y pendientes de campo

Las 17 filas están integradas, con marcador y ficha. Estas observaciones
documentales no bloquean la ubicación; **no se ha verificado físicamente el acceso**.

| Fila | Unidad / CLUES | Tratamiento o revisión pendiente |
|---|---|---|
| 2 | Clínica de la Mujer / OCIMB006650 | CP omitido hasta confirmación. |
| 3 | Aurelio Valdivieso / OCIMB000881 | CP omitido; se conserva domicilio No. 400. |
| 4 | Hospital de Pinotepa / OCIMB004912 | Sin pendiente en auditoría. |
| 5 | Hospital de Sola de Vega / OCIMB009445 | CP omitido. |
| 6 | CESSA San Jacinto Amilpas / OCIMB007362 | Punto de P/Q, no el punto divergente de CLUES. |
| 7 | Hospital de Tapanatepec / OCIMB003500 | Sin pendiente en auditoría. |
| 8 | Centro de Salud Volcanes / OCIMB000922 | Sin pendiente en auditoría. |
| 9 | Centro de Salud Colonia Estrella / OCIMB007420 | Acceso 102/108 pendiente; no se publica ninguna de esas numeraciones. |
| 10 | CSU No. 1 / OCIMB000934 | Numeración 418/605 pendiente; se omite el número exterior. |
| 11 | CESSA Tlalixtac / OCIMB009013 | Teléfono omitido. |
| 12 | Hospital de Tuxtepec / OCIMB009660 | Sede nueva San Rosendo; teléfono omitido. |
| 13 | Vicente Guerrero / OCIMB006814 | Marcador conservado; **revisión visual del acceso de Maps pendiente**. Sin teléfono, correo ni horario públicos. |
| 14 | Hospital de Huajuapan / OCIMB000490 | Horario omitido hasta verificación. |
| 15 | CEPAVI / OCIMB006971 | CP y número exterior omitidos conservadoramente por discrepancias en CLUES. |
| 16 | HGZ-UMAA No. 1 / OCIMS000136 | Solo se incorpora ILE; ITS previo no se elimina. |
| 17 | ISSSTE Salina Cruz / OCIST000136 | **Frontera 600**. Pendiente acceso específico al módulo SAS; no se usa Frontera 25. |
| 18 | Hospital Regional Presidente Benito Juárez / OCIST000112 | ID de hoja vacío, CLUES estable. |

Para 17–18, las fuentes públicas incluyen los directorios SAS correspondientes;
los artículos de ataque cerebrovascular y cáncer de mama no se presentan como
evidencia del servicio. Sus textos originales permanecen en los snapshots.

## Arrancar esta revisión local

Requisitos: Node 22, Python 3, Docker/PostGIS. En este worktree ya están instaladas
las dependencias y preparado `backend/.env` (ignorado por Git). El contenedor
`puntoax_ile17_db` y los servicios se dejan activos para revisar:

- Aplicación: **http://127.0.0.1:33084**
- API: `http://127.0.0.1:33083`
- PostgreSQL: `127.0.0.1:55483`, base `puntoax_s4_test_ile17`.
- El mapa usa la sesión normal: registrar/iniciar sesión en `/registro` o
  `/login`, entrar en «Mapa de centros» y elegir «Aborto Seguro (ILE)».

Si se detuvieron, iniciar la base y abrir dos terminales:

```bash
docker start puntoax_ile17_db
cd /tmp/opencode/puntoax-ile-17/backend
npm start
```

```bash
cd /tmp/opencode/puntoax-ile-17/frontend
PUNTOAX_API_PROXY=http://127.0.0.1:33083 npm run dev -- --host 127.0.0.1 --port 33084 --strictPort
```

### Repetir importación

Desde `backend`, con `.env` local:

```bash
npm run migrate
npm run import:ile
npm run import:ile -- --apply
npm run import:ile -- --apply
```

El comando sin `--apply` simula con rollback. Revisar `ambiguos` y `omitidos`;
el informe incluye fila, CLUES, UUID y criterio de coincidencia.
Usar **este CSV preparado**, no `filtracion.csv` general ni el snapshot sin limpiar.

### Reproducir desde una base vacía

En otra copia local, crear el contenedor si aún no existe:

```bash
docker run --name puntoax_ile17_db \
  -e POSTGRES_PASSWORD=ile17-local -e POSTGRES_DB=puntoax_s4_test_ile17 \
  -p 127.0.0.1:55483:5432 -d postgis/postgis:15-3.3
```

Crear `backend/.env` con estos valores **solo de prueba local**:

```dotenv
PGHOST=127.0.0.1
PGPORT=55483
PGUSER=postgres
PGPASSWORD=ile17-local
PGDATABASE=puntoax_s4_test_ile17
PORT=33083
JWT_SECRET=ile17-solo-local-no-produccion-clave-de-prueba
PUNTOAX_TEST_DB=1
PUNTOAX_TEST_API_PORT=33083
DOCUMENTS_PRIVATE_DIR=/tmp/opencode/puntoax-ile17-documentos
```

Luego, desde `backend`:

```bash
npm ci
npm run migrate
node scripts/importar-filtracion.js --archivo data/its-coordenadas.csv --solo-its-coordenadas --apply
npm run import:ile -- --apply
npm run import:ile -- --apply
npm start
```

En `frontend`, ejecutar `npm ci` y el comando de Vite de arriba.
No habilitar `ALLOW_DEMO_SEEDS`: la preview se basa en las 26 fichas ITS del
catálogo y estas 17 ILE, no en los domicilios ficticios del seed 002.

## Pruebas y resultados

Desde `backend`, con la API y frontend locales activos:

```bash
node --env-file=.env --test tests/*.test.cjs
node --env-file=.env --test tests/catalogo-ile.integracion.cjs
npm install --prefix /tmp/opencode/puntoax-browser-tools playwright-core
node --env-file=.env tests/mapa-ile.e2e.cjs
```

El E2E usa Chrome de `/usr/bin/google-chrome` (cambiable con `CHROME_BIN`).
`PUNTOAX_BROWSER_TOOLS` permite cambiar el directorio de Playwright.
No simula respuestas: registra un usuario temporal, inicia sesión, comprueba
las dos API, filtra ILE, pulsa cada marcador, abre cada ficha y comprueba Maps.
El usuario temporal se elimina al terminar. Captura:
`/tmp/opencode/puntoax-ile17-mapa.png`.

Desde `frontend`:

```bash
npm test
npm run lint
npm run build
```

Resultados de esta revisión:

- **52 pruebas backend** (51 de la suite ordinaria y una adicional PostGIS),
  incluida integración de autenticación: pasan. La prueba PostGIS crea y
  elimina una BD efímera; prueba rollback,
  15 altas + 2 reutilizaciones (ID decimal y CLUES), segunda carga sin duplicados,
  conservación de cuenta/ITS/horario/cupo/cita y conflicto que omite solo una fila.
- **21 pruebas frontend**, lint y build: pasan.
- **E2E real: 17/17 marcadores → ficha**, filtro ILE↔ITS y coordenadas exactas.
- Preview: **17 UUID, 17 CLUES y 17 relaciones ILE**; segunda carga sin clínicas
  ni relaciones adicionales. 26 fichas ITS de referencia siguen disponibles.
- Carga inicial ILE: 17 nuevas; segunda: 0 nuevas, 17 reutilizadas, 0 ambiguas.
- No hay bloqueo de filas en la integración local. Persisten los pendientes
  documentales del inventario. El build mantiene el aviso previo de bundle >500 kB.

Todo queda en commits locales. La fusión y el despliegue se revisan después;
la migración 008 deberá preceder al arranque de esta versión de la API.
