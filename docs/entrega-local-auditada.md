# Manual vigente de comprobación local

## Acceso y flujo institucional

La portada y la información general son públicas. El mapa, directorio, búsqueda,
cercanía y fichas de establecimientos requieren registro, verificación de correo
e inicio de sesión. No se debe quitar esa autenticación para adaptar una prueba antigua.

Flujo de incorporación: la clínica crea su cuenta, verifica el correo e inicia
sesión; completa datos institucionales, servicios, horarios y ubicación confirmada;
adjunta documentos y guarda el borrador; revisa y envía la postulación; administración
aprueba o rechaza con observaciones. Solo una aprobación publica la ficha.
No existe alta administrativa operativa ni sistema de invitaciones. El enlace
histórico `/admin/clinicas/nueva` redirige al listado.

En un borrador, guardar, recargar y guardar otra vez debe conservar ITS/ILE y sus
detalles. Una clínica aprobada solicita revisión para sus cambios institucionales;
rechazar una actualización de ubicación no retira su aprobación previa.

## Paciente y agenda

Iniciar sesión, abrir mapa, buscar centro, revisar ficha y requisitos del servicio,
seleccionar un cupo, completar datos y confirmar. Consultar y cancelar desde
«Mis citas». La cancelación libera el cupo.

Cada cita ocupa una hora, conforme al modelo y al aprovisionador ITS existentes.
No se permiten intervalos superpuestos del paciente, ni cupos solapados del mismo
servicio. Servicios distintos mantienen capacidad independiente para pacientes
distintos. Los turnos nocturnos incluyen la madrugada del día siguiente y toda la
hora debe caber antes del cierre. Confirmar esta regla con producto antes de desplegar
si se desea atención de duración variable; no se introdujo un nuevo modelo de duración.

Los requisitos ausentes no se inventan. Los datos del catálogo pueden estar
incompletos: publicación/revisión documental no equivale a confirmación operativa.
No usar sedes itinerantes como sedes fijas confirmadas.

## Privacidad, notificaciones y sesiones

El centro y la administración autorizada acceden a los datos necesarios para
gestionar las citas. La ubicación GPS es opcional. No se garantiza privacidad
absoluta ni se certifica cumplimiento jurídico; falta revisión especializada del
aviso integral, retención y tratamiento por proveedores externos.

La campana del paciente muestra recordatorios dentro de la aplicación; la de
clínica muestra resoluciones de solicitudes. No equivale a correo o push de citas
nuevas. El chatbot es opcional: ante fallo hay una salida al mapa y un plazo de
45 segundos, sin prometer disponibilidad del proveedor.

Política actual de contraseña: el cambio autenticado conserva las otras sesiones
ya emitidas; recuperación de contraseña revoca tokens previos; logout revoca la
sesión correspondiente. Se mantiene este comportamiento probado, sin presentar
el cambio como cierre global de sesiones. Cualquier revocación selectiva adicional
requiere decisión y pruebas de renovación; H25 no se presenta como endurecimiento implementado.

## Instalación y puerta local

Requiere Node compatible con Vite/React del lockfile, npm, PostGIS y Chrome.
Instalar con `npm ci` por directorio y configurar variables privadas según
`backend/.env.example`. Nunca copiar secretos a documentación.
Usar exclusivamente BD sintética local `puntoax_s4_test*`, puertos aislados y
`PUNTOAX_TEST_DB=1`. Aplicar migraciones solo a esa BD; el seed demo 002 no
se carga por defecto. Ejecutar API con `PORT` aislado y Vite en 5177 con
`PUNTOAX_API_PROXY` apuntando a esa API.

El simulador de correo requiere `PUNTOAX_MAIL_PROVIDER=mock` y
`PUNTOAX_MOCK_MAIL_FILE` privado, además de las guardas de BD local.
`DOCUMENTS_PRIVATE_DIR` debe ser absoluto, privado (0700) y fuera del frontend.
Para integración histórica se admite `/tmp/opencode/*` o `/tmp/puntoax-qa-*`.

Puerta local, sin Git ni despliegue:

1. Backend: `npm run test:local` (QA, sesiones/cercanía y regresiones unitarias).
2. Con BD/API aisladas: `npm run test:qa:integration` y
   `npm run test:auditoria:integration` (esta última exige puerto DB 55474).
3. Frontend: `npm test`, `npm run lint`, `npm run build`.
4. Con Vite/API/BD: `npm run test:qa:browser`; configurar `PUNTOAX_TEST_API_PORT`.
5. Construir backend con contexto raíz y frontend con contexto `frontend/`;
   probar proxy: PDF 1,2 MB,
   límite por archivo 5 MB, formulario máximo cinco documentos, JSON mal formado,
   `/health`, `/api/health`, `/api/ready` y caída de API/BD **de ensayo**.
6. Revisar teclado, modal compartido, mapa, panel e información a 320/390/768/1440 px.

`backend npm test` es solo un smoke de BD, no sustituye esta puerta.
`backend/tests/mapa-ile.e2e.cjs` es una prueba histórica fuera del gate actual:
su entorno fijo y expectativa sin autenticación ya no describen el contrato vigente.
Las pruebas locales preexistentes no se borran ni se incorporan automáticamente.
Una puerta local verde no prueba CI, protección de ramas ni estado de GitHub.

## Cuentas sintéticas ITS

No verificar masivamente cuentas reales ni aliases históricos. Para demostración
usar el registro oficial y el correo simulado en aislamiento, o una cuenta de
ensayo controlada con verificación explícita. Los aliases `.invalid` del
aprovisionador no son buzones reales ni sustituyen una cuenta institucional:
su activación productiva queda pendiente de un mecanismo acordado.
