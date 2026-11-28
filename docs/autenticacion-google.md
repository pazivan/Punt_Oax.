# Autenticación de pacientes con Google

## Estado y arquitectura revisada

Implementación en `boton-google`, nombre confirmado por el solicitante, desde
`origin/main` actualizado: `3680d559e4f6832c8f75655ab98ea9b80ec291bd`.
No se fusionó, publicó ni desplegó. El directorio de trabajo original conserva
sus archivos locales sin seguimiento.

- React/Vite: `Login.jsx`, `Register.jsx`, API centralizada en `src/api/auth.js`;
  `App.jsx` mantiene la sesión y el destino por rol.
- Express/CommonJS: autenticación tradicional en `backend/servidor.js`;
  bcrypt y JWT en `backend/auth.js`.
- PostgreSQL/PostGIS: pacientes en `usuarios`, clínicas y administradores en
  tablas distintas. El rol de paciente es `usuario`, no `paciente`.
- El esquema 001 **ya contiene** `google_sub` único, `password_hash` nullable,
  índice único de correo normalizado y la restricción «contraseña o Google».
  El login tradicional ya rechaza hashes nulos sin llamar a bcrypt. Se conservan
  esas validaciones y se prueban, sin reescribir módulos innecesariamente.
- Los JWT propios incluyen `id`, `correo`, `rol`, `version_sesion`, `jti`.
  `sesiones_activas` controla revocación, inactividad y duración absoluta.
  Google utiliza exactamente `crearSesionActiva`, no una segunda sesión paralela.

## Flujo y seguridad

Se utiliza **Google Identity Services**, botón oficial renderizado con
`google.accounts.id.renderButton`, popup y callback JavaScript de ID token.
No hay OAuth authorization code, refresh token, access token de Google ni
client secret en esta integración. No se usa One Tap automático.

1. `POST /api/auth/google/desafio`: exige JSON, `X-Puntoax-Google: 1` y un
   `Origin` de la lista exacta. Emite `desafio`, `csrf`, `nonce` aleatorios
   de 256 bits y una cookie de navegador `HttpOnly`, `SameSite=Strict`,
   `Secure` en producción, restringida a `/api/auth/google`.
2. El backend guarda **solo hashes** de esos secretos en `desafios_google`,
   con vencimiento de cinco minutos. No guarda el ID token.
3. GIS recibe el `nonce`. El callback envía la credencial al
   `POST /api/auth/google`, con el desafío y CSRF, desde el mismo origen.
4. El desafío se consume mediante `DELETE ... RETURNING` atómico antes de
   verificar la credencial: un error también exige reiniciar. Funciona entre
   workers y no depende de memoria del proceso.
5. `google-auth-library.verifyIdToken` verifica firma con las claves rotatorias
   de Google, audiencia, emisor y tiempos. Se comprueba además expiración estricta,
   `email_verified === true`, correo, sujeto y coincidencia del nonce.
6. Se busca primero por `sub` (identidad estable). No se cambia el correo local
   ni el perfil durante un login posterior, aunque Google cambie sus datos.
7. Un paciente nuevo se crea verificado, sin contraseña local y siempre con rol
   `usuario`. No se inventan teléfono ni otros datos: el perfil y la cita pueden
   solicitar los campos faltantes como en el flujo existente.
8. Si el correo ya tiene una cuenta local, **no se vincula automáticamente**.
   Responde 409 `GOOGLE_VINCULACION_REQUERIDA` y un comprobante aleatorio.
   La interfaz pide la contraseña original y consentimiento explícito.
9. `POST /api/auth/google/vincular` consume ese comprobante una sola vez, exige
   el mismo navegador/CSRF, verifica bcrypt contra la cuenta original y revisa
   correo, versión de sesión, estado activo y correo local verificado.
   La prueba vence a los cinco minutos o al vencer el ID token, lo que ocurra antes.
   Se actualiza **el mismo UUID**, conservando hash, perfil, sesiones y citas.
10. Las escrituras de usuario/vinculación/sesión son transaccionales. Los índices
    únicos de correo normalizado y `google_sub` resuelven carreras; ante conflicto
    se informa y se reinicia, sin crear otra cuenta.

Todos los endpoints Google reutilizan el limitador persistente por IP de correo:
20 solicitudes por hora para el tipo `google` (el flujo consume varias solicitudes).
No se registran contraseñas, credenciales de Google ni respuestas privadas del
proveedor. Las respuestas llevan `Cache-Control: no-store`.

Las identidades de clínica/administración **no se autentican con Google**.
El correo de una cuenta privilegiada bloquea el alta/vinculación automática
del flujo de pacientes. Un paciente ya vinculado sigue recibiendo únicamente
un JWT `usuario`, nunca permisos de otras tablas, aunque coincidan correos.
Ningún rol indicado por el navegador ni por los datos de Google se acepta.

La cancelación explícita mientras se espera Google o antes de confirmar la
vinculación no altera la cuenta ni guarda sesión. Los callbacks tardíos se
ignoran. Si se cierra el popup, GIS no garantiza un callback de cancelación:
se ofrece «Cancelar acceso con Google» y una salida por timeout de dos minutos.
Una vez enviado el intercambio/vinculación se muestra carga hasta su resolución.
Las peticiones del intercambio tienen un plazo cliente de veinte segundos.
El cliente oficial backend reutiliza su caché de certificados y limita el tiempo
de cada petición de certificados a ocho segundos.

## Base de datos: migración incremental 015

Archivos `db/migrations/015_google_auth.up.sql` y `.down.sql`:

- Asegura la columna `google_sub` si faltara y contraseña nullable.
- Añade un índice único defensivo de identidad, sin cambiar el índice original.
- Crea `desafios_google` y su índice de vencimiento, con FK al paciente para
  comprobantes de vinculación. No contiene tokens Google ni contraseñas.
- No recrea tablas existentes ni elimina registros, citas o relaciones.
- No impone formato nuevo a identidades históricas: el seed antiguo contiene
  un identificador demo no numérico que también debe conservarse.
- El rollback retira únicamente los artefactos nuevos; mantiene `google_sub`,
  su unicidad original y la posibilidad de contraseña nula del esquema 001.
  Así no deja sin identidad a las cuentas creadas con Google.

Aplicar primero en una base de ensayo con las variables de conexión revisadas:

```sh
cd backend
npm ci
npm run migrate:status
npm run migrate
```

**No usar `migrate:reset`, no borrar volúmenes y no aplicar esto a producción
sin respaldo verificado y autorización.** El migrador puede aplicar otras
migraciones pendientes: revisar el estado antes de ejecutarlo.

## Configuración exacta en Google Cloud Console

Se recomienda separar clientes/proyectos de desarrollo y producción.
No hacen falta APIs de Gmail, Drive, Calendar ni otros servicios.

1. Entrar a [Google Auth Platform](https://console.cloud.google.com/auth/overview),
   crear o seleccionar el proyecto de PuntOax.
2. En **Branding / Desarrollo de la marca**, indicar:
   - nombre **PuntOax**;
   - correo real y supervisado de asistencia y contactos del desarrollador;
   - dominio autorizado **`puntoax.online`** (sin protocolo);
   - página principal **`https://puntoax.online/conocenos`**;
   - URL pública real del aviso de privacidad, y términos si corresponde.
     El proyecto revisado no define una ruta dedicada `/privacidad`: publicar y
     revisar el aviso antes de configurar esa URL, no usar una ruta inexistente.
   - logo institucional, si se desea. Completar la verificación de dominio/marca
     que solicite Google; no se presupone aprobada.
3. En **Audience / Público**, elegir **External / Externo** para pacientes.
   Durante desarrollo mantener **Testing / Pruebas** y agregar las cuentas
   controladas a **Test users / Usuarios de prueba**.
4. En **Data Access / Acceso a los datos**, limitarse a los permisos básicos:
   **`openid`**, **`email`**, **`profile`**. GIS usa identidad básica;
   este código no solicita permisos adicionales. No agregar scopes sensibles.
5. En **Clients / Clientes → Create client / Crear cliente**, elegir
   **Web application / Aplicación web**, no Android, iOS ni cuenta de servicio.
6. En **Authorized JavaScript origins / Orígenes JavaScript autorizados**:

   | Entorno | Orígenes exactos |
   | --- | --- |
   | Desarrollo Vite | `http://localhost`, `http://localhost:5173`, `http://127.0.0.1`, `http://127.0.0.1:5173` |
   | Docker local, solo si se usa | `http://localhost:8080`, `http://127.0.0.1:8080` |
   | Producción | **`https://puntoax.online`** |

   Google recomienda registrar localhost con y sin puerto. Los orígenes no
   llevan rutas, comodines ni barra final. Agregar cualquier puerto alternativo
   que realmente se utilice también en `GOOGLE_ALLOWED_ORIGINS`.
   No agregar `www.puntoax.online` salvo que se sirva realmente allí;
   si se habilita, debe registrarse como un origen HTTPS distinto en ambos lados.
7. **Authorized redirect URIs / URIs de redirección:** dejar vacío.
   Este flujo es popup/callback; `/api/auth/google` no es una URL de redirección.
8. Guardar y copiar **Client ID**, de forma `…apps.googleusercontent.com`.
   Usar el mismo ID público en frontend y backend del entorno correspondiente.
   **No copiar el client secret ni JSON privados al repositorio o al frontend.**
9. Probar primero con usuarios de prueba. Para producción revisar marca,
   dominio, privacidad y requisitos que muestre Google, y publicar el público
   de la aplicación cuando corresponda. Los cambios pueden tardar en propagarse.

Referencia oficial consultada:
[configurar cliente GIS, consentimiento, CSP y COOP](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

## Variables y ejecución local

Copiar `backend/.env.example` a `backend/.env` y `frontend/.env.example`
a `frontend/.env.local`, sin versionar archivos con valores reales.

Backend local, además de PostgreSQL y `JWT_SECRET`:

```dotenv
GOOGLE_CLIENT_ID=ID_PUBLICO_DEL_CLIENTE_WEB.apps.googleusercontent.com
GOOGLE_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Frontend, en **`frontend/.env.local`**:

```dotenv
VITE_GOOGLE_CLIENT_ID=ID_PUBLICO_DEL_CLIENTE_WEB.apps.googleusercontent.com
```

En dos terminales, ejecutar `npm start` desde `backend/` y `npm run dev`
desde `frontend/`, y abrir `http://localhost:5173`.
El proxy Vite mantiene `/api` en el mismo origen; si cambia la API local,
configurar `PUNTOAX_API_PROXY=http://127.0.0.1:PUERTO`.

Las variables de Vite se incorporan **durante la compilación**. El `.env` raíz
sirve a Compose, no es automáticamente el `.env` del frontend Vite.
Reiniciar Vite después de cambiar variables; en producción **reconstruir**
el frontend, no basta con reiniciar nginx ni poner variables en el contenedor.

En Compose, `.env` raíz:

```dotenv
GOOGLE_CLIENT_ID=ID_PUBLICO_DEL_CLIENTE_WEB.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID=ID_PUBLICO_DEL_CLIENTE_WEB.apps.googleusercontent.com
GOOGLE_ALLOWED_ORIGINS=https://puntoax.online
APP_URL=https://puntoax.online
```

Compose pasa el primer ID al backend y el segundo como `build.args` al
Dockerfile frontend. Se mantiene el proxy mismo origen en nginx.
Si hay CSP externa, autorizar los recursos GIS indicados por Google. Si el
proxy aplica COOP restrictivo, revisar `same-origin-allow-popups` para el flujo
popup sin FedCM. Estos ajustes se verifican en ensayo, no se ha cambiado el VPS.

**Desactivar:** dejar vacíos `GOOGLE_CLIENT_ID` y `VITE_GOOGLE_CLIENT_ID`.
El frontend no muestra botones ni descarga el SDK; el endpoint devuelve 503
controlado. El registro, verificación, recuperación y login con contraseña
siguen disponibles. Para una cuenta solo Google, la recuperación de contraseña
existente puede establecer una contraseña local; «cambiar contraseña» sigue
requiriendo una contraseña actual. No se inventa una contraseña por el usuario.

## Pruebas y evidencias

Consultar [el informe de validación](validacion-google-auth.md) para resultados,
fallo preexistente y rutas de evidencia local.

Sin credenciales Google:

```sh
cd backend
npm ci
npm run test:local
npm run test:google
npm run lint
```

Con BD y API **sintéticas locales** y las guardas de
`docs/entrega-local-auditada.md`, ejecutar:

```sh
npm run test:qa:integration
npm run test:auditoria:integration
npm run test:google:integration
```

Las suites de auditoría exigen DB 55474; la de catálogo ILE exige 55483.
`PUNTOAX_TEST_API_PORT` debe apuntar a una API aislada que use la misma BD,
`JWT_SECRET`, proveedor mock y carpeta documental privada 0700.
Las pruebas Google firman tokens RSA y usan la biblioteca oficial real;
solo se sustituye la descarga de certificados, nunca la validación.
**No existe modo de saltarse Google mediante variables de entorno del servidor.**

```sh
cd frontend
npm ci
npm test
npm run lint
npm run build
npm run test:google:browser
# Con API/BD/Vite aislados en 5177 y variables de QA:
npm run test:qa:browser
```

El navegador automatizado Google usa un doble GIS/API para verificar el contrato
de interfaz, no una cuenta personal. Arranca Vite en 5188/5189 y requiere Chrome.
La prueba real con Google es un requisito pendiente antes de integrar/desplegar:

- usuario nuevo → perfil → reservar/consultar/cancelar una cita;
- volver a entrar con la misma identidad → mismo ID e historial;
- correo de cuenta local → cancelar (sin cambios), contraseña errónea (sin
  vincular), reiniciar, contraseña válida + consentimiento (mismo ID/citas);
- intentar otra identidad para un correo ya vinculado y repetir credenciales;
- cerrar popup, cancelar desde PuntOax, bloqueo de popup/red y móviles reales;
- clínica/admin no muestran botón ni obtienen sesión privilegiada con Google;
- registro, verificación, recuperación y acceso tradicionales;
- repetir en el dominio de ensayo con HTTPS y políticas reales del proxy.

Para documentar: diagrama de secuencia de los tres endpoints, decisión de no
vincular por coincidencia de correo, diccionario de `google_sub`/desafíos,
capturas escritorio/móvil y matriz de escenarios con fecha/versión.
Capturar solo cuentas sintéticas: no publicar tokens, cookies, correos reales,
contraseñas, HAR ni capturas de tablas de sesiones sin sanitizar.

## Integración y despliegue: pendientes, NO ejecutados

1. Resolver o acordar el tratamiento del fallo de navegador heredado del informe.
   No se debe declarar la puerta completa verde mientras siga fallando.
2. Configurar OAuth y completar las pruebas reales anteriores, incluida revisión
   del aviso de privacidad y políticas del proxy.
3. Revisar los cambios de `boton-google` y las migraciones frente al `main`
   vigente; resolver conflictos y repetir pruebas. No incluir otros archivos
   locales de la rama original.
4. Solo con autorización, publicar la rama/PR, revisar CI y aprobar la integración.
   No hay push, PR, CI remota ni merge automático en esta entrega.
5. Antes de intervenir el VPS: respaldo restaurable de BD y documentos,
   inventario de migraciones pendientes e imágenes anteriores para rollback.
6. Configurar las variables privadas **en el servidor**, revisar los IDs públicos
   coincidentes y el origen `https://puntoax.online`; validar Compose.
7. En ventana autorizada: construir imágenes, ejecutar migraciones incrementales
   con la configuración de producción, recrear servicios y verificar
   `/api/ready`, login tradicional, Google, perfil, citas y permisos.
   Ejemplos, a adaptar y ejecutar solo en esa ventana:

   ```sh
   docker compose config --quiet
   docker compose build backend frontend
   docker compose run --rm backend npm run migrate:status
   docker compose run --rm backend npm run migrate
   docker compose up -d backend frontend
   ```

8. Ante fallo, desactivar Google y reconstruir frontend; conservar datos de
   identidad. Si se revierte código anterior, mantener la estructura histórica
   de usuarios y prever recuperación de acceso de cuentas solo Google.
   No borrar columnas de identidad ni usar rollback destructivo.
