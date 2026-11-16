# Correo transaccional (etapas 1 y 2)

Esta rama implementa exclusivamente verificación de correo y recuperación de contraseña. No envía notificaciones de citas ni recordatorios. Las cuentas anteriores a la migración `009` quedan marcadas como verificadas; los registros nuevos requieren código antes de iniciar sesión. Si el proveedor no está configurado, los registros nuevos fallan de forma explícita sin crear la cuenta. Una cuenta no verificada puede introducir su código en `/verificar-correo` o solicitar un reenvío.

Al verificar por primera vez, se envía una bienvenida distinta a usuarios y clínicas con HTML y texto. La verificación se confirma antes de intentar la bienvenida: un fallo del proveedor no bloquea la cuenta y repetir el código no reenvía el mensaje. La pantalla muestra el correo parcialmente oculto, no permite editarlo durante la verificación y ofrece volver a registrar la cuenta con una dirección corregida; esta acción exige introducir otra vez la contraseña y crea una cuenta nueva, dejando la anterior pendiente sin verificar.

## Configuración, solo en el backend

Tras autorización **separada** para desplegar, aplicar migración `009` y configurar en un secreto de entorno no versionado:

- `BREVO_API_KEY`: clave restringida a envío transaccional; no compartirla por chat ni escribirla en archivos del repositorio.
- `BREVO_SENDER_EMAIL=notificaciones@puntoax.online` (remitente ya verificado).
- `BREVO_SENDER_NAME=PuntOax`
- `APP_URL=https://puntoax.online` (origen HTTPS público para enlaces).
- `JWT_SECRET`: secreto existente, mínimo 32 caracteres; **no cambiarlo durante el despliegue**, porque firma los JWT existentes y los desafíos. Si se rota, se invalidarán sesiones y códigos.

`docker-compose.yml` pasa estas variables únicamente al backend. No se requieren cambios DNS adicionales si DKIM y DMARC ya están correctos en Brevo/Porkbun. No poner la clave en Vite, el frontend, pruebas, commits ni logs.

## Envío de prueba (requiere autorización)

1. En un entorno de prueba aislado y **con clave restringida propia**, aplicar `009` y establecer las variables anteriores en el entorno del backend. No usar `PUNTOAX_MAIL_PROVIDER=mock` fuera de tests.
2. Crear una cuenta de prueba con buzón controlado mediante la pantalla `/registro`; comprobar la recepción de un código de seis dígitos, introducirlo en `/verificar-correo` y entrar. Luego solicitar recuperación en `/recuperar`, abrir el enlace recibido y cambiar contraseña.
3. Comprobar que el código/enlace vence a los 10 minutos, que no llega correo a direcciones demo y que el acceso anterior queda revocado tras recuperación.

Las respuestas de recuperación no distinguen correos existentes. El límite es de cinco intentos por desafío, un reenvío por minuto, tres envíos por cuenta y hora, y límites adicionales por IP. Los desafíos solo se conservan como HMAC en la base de datos. El simulador solo puede activarse contra una base local de pruebas identificada explícitamente; nunca envía correo.
