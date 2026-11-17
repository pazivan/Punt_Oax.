# Crear o restablecer un administrador

## Por qué `/admin` responde «Credenciales inválidas»

El inicio de sesión de administración consulta la tabla `administradores`. Esa
tabla solo tiene filas si se aplicó la semilla `002_seed_initial_data.up.sql` o
si alguien creó la cuenta después.

La semilla 002 incluye contraseñas públicas, por lo que el migrador **la omite
por defecto** (solo corre con `ALLOW_DEMO_SEEDS=1`). Por eso una instalación
nueva —incluido Docker Compose, que solo monta la migración 001— se queda sin
ningún administrador y el login devuelve `401`.

Las credenciales publicadas en `docs/MODELO_DATOS_Y_AUTENTICACION.md`
(`admin@puntoax.oaxaca.gob.mx` / `AdminPuntOax2026!`) solo funcionan si esa
semilla se aplicó. No deben usarse en producción.

## Script `admin:crear`

`backend/scripts/crear-admin.js` crea la cuenta con bcrypt o, con
`--actualizar`, restablece la contraseña de una cuenta existente. Usa las mismas
variables `PG*` / `DB_*` que el backend.

```bash
# Desde backend/ con la configuración de la base
npm run admin:crear -- --correo=admin@midominio.mx --password='ClaveLargaYUnica123!' \
  --nombre='Administrador Central'

# Restablecer la contraseña si el correo ya existe
npm run admin:crear -- --correo=admin@midominio.mx --password='NuevaClave456!' --actualizar
```

También acepta `ADMIN_CORREO`, `ADMIN_PASSWORD` y `ADMIN_NOMBRE` como variables
de entorno.

### Con Docker Compose

El script ya está dentro de la imagen del backend:

```bash
docker compose exec backend node scripts/crear-admin.js \
  --correo=admin@midominio.mx --password='ClaveLargaYUnica123!' --actualizar
```

Si la base está en otro contenedor y el backend no corre, se puede ejecutar un
contenedor temporal con la misma red y variables `PG*` del servicio `backend`.

### En un servidor sin Docker

```bash
cd backend
PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=puntoax_bd PGUSER=postgres \
PGPASSWORD='...' node scripts/crear-admin.js \
  --correo=admin@midominio.mx --password='ClaveLargaYUnica123!' --actualizar
```

## Alternativa solo para bases desechables

```bash
ALLOW_DEMO_SEEDS=1 npm run migrate
```

Esto aplica la semilla completa (usuarios, clínicas y administrador demo) con
las contraseñas publicadas en el repositorio. No lo ejecutes sobre una base
compartida o de producción.

## Comprobación

El servidor imprime un aviso al arrancar si la tabla `administradores` está
vacía. También puedes probar el login directamente:

```bash
curl -i -X POST https://tu-dominio/api/auth/login-admin \
  -H 'Content-Type: application/json' \
  --data '{"correo":"admin@midominio.mx","password":"ClaveLargaYUnica123!"}'
```

Un `200` devuelve el token y el objeto `admin`; un `401` significa que el correo
no existe o la contraseña no coincide.
