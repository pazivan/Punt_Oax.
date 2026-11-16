# Carga de fichas ITS con coordenadas

`backend/data/its-coordenadas.csv` contiene 26 fichas de la hoja ITS de
`Filtracion.xlsx` con latitud y longitud explícitas. No incluye las hojas
Aborto/Ambos ni filas sin coordenadas. Para regenerarlo desde el Excel:

```bash
python3 backend/scripts/preparar-its-coordenadas.py /ruta/Filtracion.xlsx backend/data/its-coordenadas.csv
```

En el entorno con la base de datos migrada (incluida la migración 004), y
desde el directorio `backend` del contenedor:

```bash
node scripts/importar-filtracion.js --archivo data/its-coordenadas.csv --solo-its-coordenadas
node scripts/importar-filtracion.js --archivo data/its-coordenadas.csv --solo-its-coordenadas --apply
```

El primer comando simula con rollback. Revisar `ambiguos` y `omitidos` antes
de aplicar. El segundo confirma la carga y es repetible: identifica las sedes
por `id_origen` o nombre y municipio. No ejecutarlo con el CSV general.

Este modo publica fichas aprobadas con servicio ITS y coordenadas para
`GET /api/clinicas?servicios=ITS` y `GET /api/clinicas/:id`.
Conserva el horario **solo como texto informativo** cuando lo aporta la fuente;
no crea franjas en `horarios_atencion`, espacios de agenda ni citas, y marca el
servicio como `requiere_cita = false`. La unidad móvil figura como itinerante:
su coordenada es de la ubicación documentada, no una sede fija confirmada.
Los campos ausentes quedan vacíos, sin completar información por suposición.

## Cuentas y cupos ITS (activación posterior)

`node scripts/habilitar-citas-its.js` simula, sin cambios, la creación de
cuentas y de cupos de una hora para las 26 sedes. Para activar:

```bash
node scripts/habilitar-citas-its.js --apply --credenciales /ruta/privada/credenciales-its.txt
```

El TXT contiene una contraseña temporal **distinta** para cada sede y debe
quedar fuera del repositorio (permisos 0600). Los correos `@demo.puntoax.invalid`
son alias de acceso al panel, no buzones reales: **no recibirán notificaciones**.
La aplicación de citas ya existente permite a cada sede gestionar sus reservas
desde el panel y a los usuarios consultar/reservar los cupos publicados.

El script toma los horarios del CSV, crea franjas de atención y publica cupos
de una hora durante los próximos 14 días (excepto festivos). Es repetible:
sin `--credenciales` solo repone cupos faltantes, no modifica las contraseñas ni
las citas existentes. Para mantener un horizonte de reservas, programar su
ejecución diaria; no suponer que el horario del Excel garantiza personal
disponible en la sede.
