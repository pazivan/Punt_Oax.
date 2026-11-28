# Google real: preparación y comprobación manual local

## Estado actual

Continuación de `boton-google`, con implementación en `9698d52` (antes
`a3ce67d`; su mensaje se simplificó por indicación del responsable, sin cambiar
el código). Posteriormente se solicitó publicar la rama y abrir un PR.
Se prepara como borrador, sin autorizar merge ni intervención del VPS.

**Preparación local comprobada. Autenticación real todavía NO aprobada.**
La selección de cuenta, el consentimiento y la introducción de contraseñas
corresponden al responsable de la prueba, en su navegador, nunca en el chat.

### Configuración de Google comunicada por el responsable

- Proyecto independiente: `puntoax`.
- Aplicación: PuntOax; cliente web: PuntOax Web.
- Público externo, estado Prueba, con un usuario de prueba autorizado.
- Identidad básica: `openid`, `email`, `profile`.
- Orígenes autorizados: `https://puntoax.online`, `http://localhost`,
  `http://localhost:5173`; sin URI de redirección.

No se accedió a la consola de Google para cambiar esta configuración.
No se necesita Client Secret para este flujo.

## Configuración aplicada, privada y fuera de Git

- `backend/.env`: `GOOGLE_CLIENT_ID` con el ID público proporcionado.
- `frontend/.env.local`: `VITE_GOOGLE_CLIENT_ID` con **el mismo valor**.
- Nombre correcto del permiso de origen: **`GOOGLE_ALLOWED_ORIGINS`**.
- Valor local aplicado: **`http://localhost:5173`**.
  Es una lista separada por comas si se admiten varios orígenes, sin rutas,
  comodines ni barra final, con esquema y puerto exactos.
- No se habilitó `http://127.0.0.1:5173`: es otro origen y no figura en la
  configuración de Google comunicada. Abrir siempre **localhost**.
- Backend en desarrollo, puerto 3120, con secreto JWT aleatorio local.
- Los archivos locales están ignorados por Git y tienen permisos 0600.
  No se guardó ningún Client Secret, ID token ni contraseña de Google.

### Entorno de base de datos

Se inició únicamente el contenedor local `puntoax-google-regresion`, expuesto
en `127.0.0.1:55474`, y se crearon dos bases de ensayo independientes:

| Base | Uso |
| --- | --- |
| `puntoax_s4_test_google_real_alta` | Registro nuevo y login Google; actualmente activa |
| `puntoax_s4_test_google_real_vinculacion` | Cuenta tradicional existente y vinculación; preparada, aún no activa |

En ambas se aplicó el esquema incremental hasta **015**, sin cargar el seed
demo 002. La 015 está registrada en `schema_migrations`. No se borró ni copió
ninguna cuenta anterior. Estado inicial observado: cero usuarios e identidades
Google en ambas bases.

La segunda base permite reutilizar la misma cuenta Google para probar una
vinculación desde cero **sin borrar el registro ni la identidad de la primera**.
No cambiar de base ni limpiar cuentas mientras una prueba esté en curso.

El correo transaccional es **local simulado**, para no enviar correos externos
durante el registro tradicional. `PUNTOAX_TEST_DB=1` protege ese simulador;
**no sustituye ni omite ninguna validación de Google**. El SDK y la validación
Google del servidor son reales.

## Aplicación levantada

- Registro: **http://localhost:5173/registro**
- Login: **http://localhost:5173/login**
- Backend local: `http://127.0.0.1:3120`.
- El frontend reconstruido se sirve con Vite Preview, exclusivamente para ensayo;
  `/api` se conecta al backend por el proxy del mismo origen.

Comandos para volver a levantarla, después de iniciar el contenedor local:

```sh
# Terminal 1, desde backend/
npm start

# Terminal 2, desde frontend/
npm run build
PUNTOAX_API_PROXY=http://127.0.0.1:3120 npm run preview -- --host localhost --port 5173 --strictPort
```

No ejecutar otra aplicación en 5173: un puerto alternativo no está autorizado
automáticamente en Google.

## Comprobaciones realizadas y sus límites

| Comprobación | Resultado observado |
| --- | --- |
| Coincidencia de IDs frontend/backend | Correcta, sin mostrar secretos |
| Migración 015 en ambas bases | Aplicada |
| Build con variable Vite real y lint frontend | Correctos; advertencia habitual de tamaño de bundle |
| `/login` y `/api/ready` a través del proxy | HTTP 200 |
| `/api/auth/google/desafio`, con origen localhost correcto | HTTP 200 |
| Origen `http://127.0.0.1:5173`, no permitido | HTTP 403 |
| Descarga real `https://accounts.google.com/gsi/client` | HTTP 200, sin interceptar ni simular |
| Iframe y botón oficial de Google | Visibles, con el Client ID configurado |
| Selección de cuenta y consentimiento | **Pendientes del usuario** |
| Registro con token realmente emitido por Google | **Pendiente, no aprobado** |
| Login de identidad ya vinculada | **Pendiente, no aprobado** |
| Cancelación manual del popup/flujo real | **Pendiente, no aprobado** |
| Vinculación con contraseña original | **Pendiente, no aprobada** |

La inspección del botón se realizó en un navegador nuevo sin cuenta personal.
No se pulsó para seleccionar cuenta ni se aceptó consentimiento.
Que se renderice el botón **no demuestra** que Google haya autenticado a nadie.

Las ocho pruebas Playwright anteriores de `google-auth.spec.mjs` /
`google-disabled.spec.mjs` utilizan un **doble del SDK/API**. Las pruebas
criptográficas automatizadas usan claves efímeras propias con la biblioteca
oficial. Ninguna de esas aprobaciones se reclasifica como login con Google real.

Evidencias privadas fuera del repositorio:
`/home/angixs/Documentos/puntoax/PuntOax-google-evidencias/real/`:

- `preparacion-http.json`: salud y protección de origen.
- `preparacion-sdk.json`: SDK y botón reales, autenticación pendiente.
- `estado-inicial.json`: migraciones y conteos iniciales, sin datos personales.
- `login-sdk-real-escritorio.png`: captura sin sesión ni cuenta personal.
- `backend-alta.log`, `frontend-preview.log`: arranque local.

No registrar tokens, cookies, HAR, contraseñas, correo personal ni identificadores
Google en documentación o evidencias públicas.

## Guía acompañada: ejecución pendiente

### 1. Cancelación, antes de crear cuenta

1. Abrir `http://localhost:5173/registro` como **Soy usuario**.
2. Pulsar «Registrarse con Google» y cerrar la ventana sin continuar.
3. Si PuntOax sigue esperando, pulsar «Cancelar acceso con Google».
4. Confirmar el mensaje de cancelación y que el formulario tradicional se puede usar.
5. Avisar al agente para verificar que siguen existiendo cero usuarios y sesiones.

GIS no garantiza callback al cerrar su popup; el botón de cancelación de PuntOax
y el timeout de dos minutos permiten recuperar el formulario.

### 2. Registro nuevo y login posterior

1. Reintentar Google y seleccionar personalmente la cuenta de prueba autorizada.
2. Aceptar personalmente el consentimiento si Google lo solicita.
3. Confirmar que PuntOax abre la sesión de paciente y permite consultar el perfil.
4. Avisar al agente: comprobará una única cuenta, contraseña local nula,
   correo verificado, sesión propia y rol `usuario`, sin exponer sus secretos.
5. Cerrar sesión desde PuntOax; abrir `/login` e iniciar nuevamente con Google.
6. Comprobar que es la misma cuenta y no aumenta el número de usuarios.

### 3. Vinculación de cuenta original, en la segunda base

**El agente cambiará de base solo cuando el responsable confirme que terminó
la fase anterior y cerró sesión.** Se conserva íntegra la primera base.

1. Iniciar la API contra `puntoax_s4_test_google_real_vinculacion`, manteniendo
   puerto, origen y cliente; el frontend no necesita cambiar de origen.
2. Registrar por el formulario tradicional el mismo correo de la cuenta Google
   de prueba. Elegir e introducir la contraseña **solo en la interfaz**.
3. Completar la verificación del correo local simulado; el agente ayudará a
   localizar el código de ese envío sin incorporarlo a Git.
4. Iniciar el flujo Google. Debe pedir la contraseña original, **no** entrar
   automáticamente ni crear otro paciente.
5. Cancelar primero: comprobar que la cuenta sigue sin vincular.
6. Reintentar; si se prueba una contraseña incorrecta, comprobar rechazo.
   Cada prueba consumida requiere volver a comenzar Google.
7. Reintentar con contraseña correcta y consentimiento explícito de vinculación.
8. Comprobar el mismo UUID y perfil, hash local conservado, una sola cuenta y
   acceso tanto mediante contraseña como mediante Google.

No se borrarán usuarios, desvincularán identidades ni restablecerán contraseñas
para fabricar una aprobación.

## Registro de resultados manuales

Actualizar esta sección únicamente después de observar el resultado y contrastar
la base/sesión correspondiente. No basta con ver el botón o abrir el popup.

| Escenario | Estado |
| --- | --- |
| Cancelación real | Pendiente |
| Alta Google real | Pendiente |
| Login Google real | Pendiente |
| Cancelar vinculación / contraseña incorrecta | Pendiente |
| Vinculación real correcta y acceso tradicional conservado | Pendiente |
