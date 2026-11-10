# Nota Técnica: Validación de Horarios y Permisos de Citas (RBAC)

**Sprint:** Sprint 6  
**Tarea / Issue:** `[Sprint 6 · Jonathan] Validar horarios y permisos de citas [#57]`  
**Responsable:** Jonathan (Autenticación, Permisos y Validación de Horarios)  
**Rama de trabajo:** `jonathan/sprint6-validar-horarios-permisos`  
**Coordinación y Apoyo:**  
- **Iván (`#55`):** Modelo de datos de citas, franjas operativas en `horarios_atencion`, matriz de estados y regla del índice único parcial `uq_citas_espacio_activa`.  
- **Kelly (`#56`):** Rutas y controladores de la API de citas (`backend/citas.js`).  

---

## 1. Objetivo de la Tarea

Asegurar que el sistema impida de forma estricta que se soliciten citas en horarios ocupados o fuera de los días y horas hábiles de la clínica, y garantizar mediante control de acceso basado en roles (RBAC) que cada actor (paciente, clínica institucional o administrador) opere exclusivamente en el ámbito que le corresponde, sin filtración de datos ni suplantación de identidad (prevención de IDOR).

---

## 2. Reglas de Validación Implementadas

### A. Validación de Horarios Ocupados y Disponibilidad (`validarDisponibilidadHorario` y `validarEnHorarioAtencion`)
1. **Prevención de Horarios Ocupados:**
   - Se valida en base de datos bajo transacción con bloqueo `FOR UPDATE` que el turno no cuente con una cita activa (`estado <> 'cancelada'`). Si ya está ocupado, devuelve `409 Conflict: "El horario seleccionado ya fue reservado."`.
   - Se respalda por el índice único parcial de PostgreSQL `uq_citas_espacio_activa` para evitar condiciones de carrera concurrentes.
2. **Prevención de Colisión Horaria del Paciente:**
   - Un usuario no puede tener dos citas confirmadas a la misma hora (`ci.id_usuario = $1 AND ci.estado = 'confirmada' AND ed.fecha_hora_inicio = $2`), respondiendo `409 Conflict: "Ya tienes otra cita a esa misma hora."`.
3. **Validación contra las Franjas de Atención de la Clínica (`horarios_atencion`):**
   - Se valida que la fecha y hora solicitada concuerde con los días de la semana (`dia_semana` 0 a 6) y el rango horario (`hora_apertura` y `hora_cierre`, incluyendo turnos 24 horas y cruces de medianoche) definidos por la clínica. Si está fuera de horario, devuelve `409 Conflict`.
4. **Validación de Temporalidad Futura:**
   - No se permite solicitar turnos cuya hora de inicio sea igual o anterior al momento actual (`fecha_hora_inicio <= NOW()`).

---

### B. Control de Permisos por Rol (RBAC) y Seguridad (`validarPermisoRol` y `validarPertenenciaCita`)

| Rol | Rutas Autorizadas | Restricciones Estrictas |
| :--- | :--- | :--- |
| **`usuario` (Paciente)** | `POST /api/citas`<br>`GET /api/citas`<br>`GET /api/citas/:id`<br>`PATCH /api/citas/:id/cancelar` | - Su identidad se extrae **únicamente** del token JWT (`req.usuario.id`). Se ignora cualquier `id_usuario` enviado en el cuerpo o query.<br>- No puede ver ni cancelar citas de otros pacientes (`404 Not Found` para evitar enumeración).<br>- No puede acceder a la agenda clínica (`/api/clinicas/mi-citas`) ni cambiar estados a `completada` o `no_asistio` (`403 Forbidden`). |
| **`clinica` (Sede)** | `GET /api/clinicas/mi-citas`<br>`PATCH /api/citas/:id/estado` | - Solo puede ver y modificar citas pertenecientes a sus propios servicios (`cs.id_clinica = req.usuario.id`).<br>- No puede consultar ni modificar citas de otra clínica (`404 Not Found`).<br>- No puede agendar citas actuando como paciente (`403 Forbidden`). |
| **`administrador`** | Auditoría y administración central | No agenda citas directas de paciente ni suplanta identidades. |
| **Público / Anónimo** | Ninguna de las rutas privadas | Retorna `401 Unauthorized` al no presentar cabecera `Authorization: Bearer <token>`. |

---

### C. Matriz de Transición de Estados (`validarTransicionEstadoCita`)

Siguiendo el acuerdo técnico de Iván (`#55`):
* **Solo una cita en estado `'confirmada'` puede cambiar de estado.** Si la cita ya está `cancelada`, `completada` o `no_asistio`, se rechaza con `409 Conflict`.
* **Cancelación:**
  * Permitida tanto a `usuario` como a `clinica`.
  * **Regla estricta:** Solo permitida si la cita es **futura** (`fecha_hora_inicio > NOW()`). No se pueden cancelar citas pasadas.
  * Al cancelar, se libera automáticamente el espacio para nuevos agendamientos.
* **Completada o No Asistió:**
  * Exclusivo para rol `clinica`.
  * **Regla estricta:** Solo permitida si la cita ya **inició o pasó** (`fecha_hora_inicio <= NOW()`). Una clínica no puede marcar completada una cita que aún no ha ocurrido.

---

## 3. Archivos del Módulo

* **`backend/validacionesCitas.js` (Nuevo):** Módulo desacoplado y reutilizable con las funciones puras de validación de horarios, pertenencia, permisos RBAC y transiciones de estado.
* **`backend/citas.js` (Actualizado):** Conexión con `validacionesCitas.js`, validación de franjas de `horarios_atencion` de la clínica y transiciones estandarizadas.
* **`backend/tests/validar-horarios-permisos.test.cjs` (Nuevo):** Suite completa con 6 pruebas unitarias específicas de control de acceso, prevención de sobre-reserva y pertenencia.

---

## 4. Resultados de Pruebas

Se ejecutaron todas las suites de pruebas automatizadas:
* **Pruebas de Jonathan (`backend/tests/validar-horarios-permisos.test.cjs`):** 6 de 6 pasadas (100%).
* **Pruebas de Kelly (`backend/tests/citas.test.cjs`):** 4 de 4 pasadas (100%).
* **Pruebas de Iván (`backend/tests/citas-modelo.test.cjs`):** 5 de 5 pasadas (100%).
* **Pruebas de Frontend (`frontend/tests/*.test.mjs`):** 16 de 16 pasadas (100%).
