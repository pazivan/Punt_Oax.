# Verificación de correo con Brevo (diseño pendiente de implementar)

## 1. Qué está implementado hoy

- El registro (usuario y clínica) valida el **formato** del correo y, además,
  comprueba que el **dominio exista** consultando sus registros MX y, si no hay
  MX, su registro A.
- Dominios reservados (`example.com`, `.test`, `.invalid`, `.localhost`) se
  rechazan sin consultar el DNS.
- Si el DNS no responde (sin red, timeout, `SERVFAIL`), el registro **no se
  bloquea**: se registra el aviso en el log y se deja pasar.
- Se puede desactivar con `PUNTOAX_VERIFICAR_DOMINIO_CORREO=0`.

Esto evita correos con dominios inventados, pero **no confirma que la persona
sea dueña del buzón**. Para eso hace falta enviar un correo con un enlace de
confirmación, que es lo que describe este documento.

## 2. Flujo propuesto con Brevo

```
Registro  ->  crear cuenta (correo_verificado = false)
          ->  generar token y enviar correo (API de Brevo)
          ->  pantalla "Revisa tu correo"
Usuario   ->  abre el enlace del correo
          ->  GET /api/auth/verificar-correo/:token
          ->  correo_verificado = true
          ->  pantalla "Correo confirmado" e inicio de sesión
```

Mientras `correo_verificado = false` se permite iniciar sesión, pero se muestra
un aviso persistente con un botón **Reenviar correo**. Bloquear el acceso por
completo es una decisión de producto (ver sección 8).

## 3. Cambios de base de datos

Migración nueva (`008_verificacion_correo`), sin tocar datos existentes:

```sql
ALTER TABLE usuarios
  ADD COLUMN correo_verificado boolean NOT NULL DEFAULT false,
  ADD COLUMN verificacion_token_hash text,
  ADD COLUMN verificacion_expira_en timestamptz,
  ADD COLUMN verificacion_enviada_en timestamptz;

ALTER TABLE clinicas
  ADD COLUMN correo_verificado boolean NOT NULL DEFAULT false,
  ADD COLUMN verificacion_token_hash text,
  ADD COLUMN verificacion_expira_en timestamptz,
  ADD COLUMN verificacion_enviada_en timestamptz;

-- Las cuentas que ya existen se consideran verificadas para no molestar
-- a quienes ya usan la plataforma.
UPDATE usuarios SET correo_verificado = true;
UPDATE clinicas SET correo_verificado = true;
```

## 4. API

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/auth/verificar-correo/enviar` | Reenvía el correo de confirmación al usuario autenticado. Límite: 1 cada 10 minutos. |
| `GET` | `/api/auth/verificar-correo/:token` | Valida el token, marca la cuenta y redirige a la vista de éxito. |
| `GET` | `/api/auth/perfil` | Incluye `correo_verificado` para que la interfaz muestre el aviso. |

Detalles de seguridad:

- Token aleatorio de 32 bytes (`crypto.randomBytes(32).toString('base64url')`).
- En la base solo se guarda el hash SHA-256 del token.
- Expira a las 24 horas y se invalida al usarse.
- El token se envía en el enlace, nunca en la URL de la API desde JavaScript.
- El registro responde igual exista o no el correo, para no filtrar cuentas.

## 5. Envío con Brevo

Variable de entorno:

```env
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=no-reply@puntoax.online
BREVO_SENDER_NAME=PuntOax
APP_URL=https://puntoax.online
```

`backend/correo.js` (nuevo) expone `enviarCorreoVerificacion({ correo, nombre, token })`
y llama a:

```
POST https://api.brevo.com/v3/smtp/email
api-key: $BREVO_API_KEY
{
  "sender": { "name": "$BREVO_SENDER_NAME", "email": "$BREVO_SENDER_EMAIL" },
  "to": [{ "email": "persona@dominio.com", "name": "Mariana" }],
  "subject": "Confirma tu correo en PuntOax",
  "htmlContent": "<p>Hola Mariana:</p><p>Confirma tu correo para activar tu cuenta:</p><p><a href=\"{{APP_URL}}/verificar-correo/{{token}}\">Confirmar mi correo</a></p><p>El enlace vence en 24 horas. Si no creaste esta cuenta, ignora este mensaje.</p>"
}
```

Recomendaciones:

- Usar un subdominio dedicado (`no-reply@puntoax.online`) y configurar SPF,
  DKIM y DMARC en el DNS del dominio.
- Si Brevo falla, el registro **no** debe fallar: se guarda la cuenta como no
  verificada y se permite reenviar después.
- Registrar el `messageId` de Brevo en el log para rastrear entregas.

## 6. Vistas (React)

1. **Aviso posterior al registro** (`/registro/revisa-tu-correo`)
   - Ícono de sobre, correo al que se envió, botón "Reenviar correo",
     texto "¿No lo ves? Revisa spam o promociones".
2. **Confirmación** (`/verificar-correo/:token`)
   - Estados: cargando, éxito, token vencido, token inválido.
   - En éxito: botón "Iniciar sesión".
   - En vencido: botón "Enviar un correo nuevo".
3. **Aviso dentro de la sesión**
   - Franja superior en el panel de usuario/clínica mientras
     `correo_verificado === false`, con enlace para reenviar.

Todos los textos en español y con los estilos existentes de `Auth.css`.

## 7. Pruebas

- Backend unitario: token válido, expirado, usado y desconocido (con reloj y
  repositorio simulados).
- Backend integración: registro crea cuenta sin verificar; verificación cambia
  el estado; reenvío respeta el límite de 10 minutos.
- Frontend: la vista de confirmación muestra cada estado; el aviso desaparece
  cuando `correo_verificado` es verdadero.
- Nunca llamar a Brevo en pruebas: inyectar un cliente falso.

## 8. Decisiones pendientes

- ¿Se bloquea el inicio de sesión hasta verificar el correo o solo se avisa?
  (Recomendado: avisar, para no dejar fuera a quien tenga problemas de entrega).
- ¿Qué dominio y remitente se usarán? Debe existir y tener SPF/DKIM.
- ¿Se aplica también a las cuentas de clínica desde el primer día?
  (Recomendado: sí, es donde más importa el contacto real).

## 9. Cómo probar hoy

Con la verificación por dominio activa:

```bash
curl -s -X POST http://localhost:3000/api/auth/registro-usuario \
  -H 'Content-Type: application/json' \
  -d '{"correo":"persona@dominio-que-no-existe.mx","password":"Clave-segura9"}'
# 400: "El dominio del correo no existe..."
```

Sin salida a Internet o en pruebas automatizadas:

```bash
PUNTOAX_VERIFICAR_DOMINIO_CORREO=0 npm start
```
