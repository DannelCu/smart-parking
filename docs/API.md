# Documentación de la API

Referencia completa de todos los endpoints de la Smart Parking API: rutas, roles requeridos, formato de petición y respuesta, y errores posibles.

- **URL base (desarrollo):** `http://localhost:3000`
- **Autenticación:** todos los endpoints requieren un token JWT en la cabecera `Authorization: Bearer <token>`, **excepto** los marcados como públicos (`POST /auth/register`, `POST /auth/login` y `GET /`).
- **Formato:** todas las peticiones y respuestas usan JSON (`Content-Type: application/json`).

## Resumen de Endpoints

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| `GET` | `/` | Público | Health check básico (devuelve "Hello World!") |
| `POST` | `/auth/register` | Público | Registro de un cliente nuevo |
| `POST` | `/auth/login` | Público | Autenticación, devuelve el token JWT |
| `GET` | `/users/profile` | Autenticado | Datos del usuario autenticado |
| `PATCH` | `/users/change-password` | Autenticado | Cambiar la propia contraseña |
| `GET` | `/users` | admin | Listar todos los usuarios |
| `POST` | `/users` | admin | Crear un usuario (con cualquier rol) |
| `GET` | `/users/:id` | admin | Obtener un usuario por id |
| `PUT` | `/users/:id` | admin | Actualizar datos de un usuario |
| `PATCH` | `/users/:id/role` | admin | Cambiar el rol de un usuario |
| `PATCH` | `/users/:id/password` | admin | Resetear la contraseña de un usuario |
| `DELETE` | `/users/:id` | admin | Eliminar un usuario |
| `POST` | `/parking-spots` | admin | Crear una plaza |
| `GET` | `/parking-spots` | admin, empleado | Listar todas las plazas |
| `GET` | `/parking-spots/:id` | admin, empleado | Obtener una plaza por id |
| `PUT` | `/parking-spots/:id` | admin | Actualizar una plaza |
| `DELETE` | `/parking-spots/:id` | admin | Eliminar una plaza |
| `POST` | `/reservations` | cliente | Crear una reserva propia |
| `POST` | `/reservations/admin` | admin | Crear una reserva en nombre de un cliente |
| `GET` | `/reservations/my` | cliente | Listar las reservas propias |
| `GET` | `/reservations/occupancy` | admin, empleado | Consultar la ocupación del parking |
| `GET` | `/reservations` | admin, empleado | Listar todas las reservas |
| `GET` | `/reservations/:id` | Autenticado (dueño o staff) | Obtener una reserva por id |
| `PATCH` | `/reservations/:id/cancel` | Autenticado (dueño o admin) | Cancelar una reserva |
| `PATCH` | `/reservations/:id/enter` | admin, empleado | Registrar entrada física |
| `PATCH` | `/reservations/:id/exit` | admin, empleado | Registrar salida física |
| `GET` | `/audit-log` | admin | Consultar el log de auditoría (con filtros) |
| `POST` | `/ai/ask` | admin | Consulta en lenguaje natural sobre el parking (IA) |

---

## Autenticación

### POST /auth/register

Registra un usuario nuevo. **Siempre asigna el rol `cliente`**, sin importar lo que se envíe; los roles `admin` y `empleado` solo pueden crearse mediante `POST /users` (admin) o el script de seed.

**Acceso:** público.

**Request body:**

```json
{
  "name": "Juan Pérez",
  "email": "juan@example.com",
  "password": "123456",
  "phone": "+34600000000"
}
```

| Campo | Tipo | Requerido | Reglas |
|---|---|---|---|
| `name` | string | Sí | — |
| `email` | string | Sí | Formato email válido, único |
| `password` | string | Sí | Mínimo 6 caracteres |
| `phone` | string | No | — |

**Respuesta `201`:**

```json
{
  "id": "a1b2c3d4-...",
  "name": "Juan Pérez",
  "email": "juan@example.com",
  "phone": "+34600000000",
  "role": "cliente",
  "createdAt": "2026-06-21T10:00:00.000Z"
}
```

**Errores:** `409` si el email ya existe, `400` si la validación falla.

### POST /auth/login

Autentica un usuario y devuelve el token JWT.

**Acceso:** público.

**Request body:**

```json
{
  "email": "juan@example.com",
  "password": "123456"
}
```

**Respuesta `200`:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "a1b2c3d4-...",
    "name": "Juan Pérez",
    "email": "juan@example.com",
    "role": "cliente"
  }
}
```

El `access_token` debe enviarse en las peticiones siguientes como `Authorization: Bearer <access_token>`.

**Errores:** `401` (`Credenciales inválidas`) si el email no existe o la contraseña no coincide. Por seguridad, el mensaje es el mismo en ambos casos para no revelar si un email está registrado.

---

## Usuarios

### GET /users/profile

Devuelve los datos del usuario autenticado (a partir del token). No requiere rol específico, solo estar autenticado.

**Respuesta `200`:** objeto `User` (sin el campo `password`, que se excluye siempre).

### PATCH /users/change-password

Permite al usuario autenticado cambiar su propia contraseña. Exige la contraseña actual como verificación.

**Request body:**

```json
{
  "currentPassword": "123456",
  "newPassword": "nuevaPassword789"
}
```

**Respuesta `200`:** sin cuerpo.

**Errores:** `401` (`Contraseña actual incorrecta`) si `currentPassword` no coincide.

### GET /users

Lista todos los usuarios. **Solo admin.**

**Respuesta `200`:** array de objetos `User` (sin password).

### POST /users

Crea un usuario con cualquier rol. **Solo admin.** Es la vía para crear `empleado` u otros `admin`.

**Request body:**

```json
{
  "name": "Ana Empleada",
  "email": "ana@parking.com",
  "password": "123456",
  "phone": "+34611111111",
  "role": "empleado"
}
```

| Campo | Tipo | Requerido | Reglas |
|---|---|---|---|
| `name` | string | Sí | — |
| `email` | string | Sí | Email válido, único |
| `password` | string | Sí | Mínimo 6 caracteres |
| `phone` | string | No | — |
| `role` | enum | No | `admin`, `empleado` o `cliente` |

**Respuesta `201`:** objeto `User` creado (sin password).

**Errores:** `409` si el email ya existe.

### GET /users/:id

Obtiene un usuario por su id. **Solo admin.**

**Respuesta `200`:** objeto `User`. **Errores:** `404` si no existe.

### PUT /users/:id

Actualiza los datos de perfil de un usuario (nombre, email, teléfono). **Solo admin.** Corresponde al caso de uso 3 del ejercicio. **No** permite cambiar contraseña ni rol (esos tienen endpoints dedicados).

**Request body** (todos los campos opcionales):

```json
{
  "name": "Juan Pérez Actualizado",
  "email": "juan.nuevo@example.com",
  "phone": "+34622222222"
}
```

**Respuesta `200`:** objeto `User` actualizado. **Errores:** `404` si no existe.

### PATCH /users/:id/role

Cambia el rol de un usuario. **Solo admin.**

**Request body:**

```json
{ "role": "empleado" }
```

**Respuesta `200`:** objeto `User` con el rol actualizado.

### PATCH /users/:id/password

Resetea la contraseña de un usuario sin necesidad de conocer la anterior. **Solo admin.**

**Request body:**

```json
{ "newPassword": "passwordReseteada123" }
```

**Respuesta `200`:** sin cuerpo.

### DELETE /users/:id

Elimina un usuario. **Solo admin.**

**Respuesta `200`:** sin cuerpo. **Errores:** `404` si no existe.

---

## Plazas de Parking

### POST /parking-spots

Crea una plaza. **Solo admin.**

**Request body:**

```json
{
  "code": "A-01",
  "type": "auto"
}
```

| Campo | Tipo | Requerido | Reglas |
|---|---|---|---|
| `code` | string | Sí | Mínimo 2 caracteres, único |
| `type` | enum | Sí | `auto` o `ciclo` |

**Respuesta `201`:**

```json
{
  "id": "f1e2d3...",
  "code": "A-01",
  "type": "auto",
  "isActive": true,
  "createdAt": "2026-06-21T10:00:00.000Z",
  "updatedAt": "2026-06-21T10:00:00.000Z"
}
```

**Errores:** `409` si ya existe una plaza con ese código.

### GET /parking-spots

Lista todas las plazas. **admin y empleado.**

### GET /parking-spots/:id

Obtiene una plaza por id. **admin y empleado.** `404` si no existe.

### PUT /parking-spots/:id

Actualiza una plaza. **Solo admin.** Permite cambiar `code`, `type` y `isActive` (desactivar una plaza sin borrarla).

**Request body** (campos opcionales):

```json
{
  "code": "A-02",
  "type": "ciclo",
  "isActive": false
}
```

**Errores:** `409` si el nuevo código ya está en uso por otra plaza, `404` si la plaza no existe.

### DELETE /parking-spots/:id

Elimina una plaza. **Solo admin.** `404` si no existe.

---

## Reservas

### POST /reservations

Crea una reserva a nombre del cliente autenticado. **Solo cliente.** Corresponde al caso de uso 1 del ejercicio.

Si se omite `parkingSpotId`, el sistema asigna automáticamente la primera plaza disponible del tipo solicitado. Si se especifica, valida que esa plaza concreta sea del tipo correcto, esté activa y esté libre en el rango.

**Request body:**

```json
{
  "parkingSpotId": "f1e2d3...",
  "vehiclePlate": "ABC123",
  "vehicleType": "auto",
  "startDate": "2026-06-30T10:00:00.000Z",
  "endDate": "2026-06-30T18:00:00.000Z"
}
```

| Campo | Tipo | Requerido | Reglas |
|---|---|---|---|
| `parkingSpotId` | string (UUID) | No | Si se omite, asignación automática |
| `vehiclePlate` | string | Sí | — |
| `vehicleType` | enum | Sí | `auto` o `ciclo` |
| `startDate` | string (ISO 8601) | Sí | No puede ser anterior al momento actual |
| `endDate` | string (ISO 8601) | Sí | Debe ser posterior a `startDate` |

**Respuesta `201`:** objeto `Reservation` completo, con la plaza y el usuario asociados.

**Errores posibles (`400`):**
- `La fecha de inicio no puede ser anterior al momento actual`
- `La fecha de inicio debe ser anterior a la fecha de fin`
- `La plaza {code} es para tipo "{tipo}", no "{tipo}"` — el tipo de la plaza no coincide con el del vehículo.
- `La plaza {code} no está activa`
- `La plaza {code} no está disponible en ese rango.` (añade una pista sobre plazas alternativas si las hay)
- `No hay plazas disponibles para vehículos tipo "{tipo}" en el rango solicitado` — en asignación automática sin plazas libres.

### POST /reservations/admin

Crea una reserva en nombre de un cliente. **Solo admin.** A diferencia del endpoint anterior, **permite fechas en el pasado** (para registrar reservas retroactivas). Valida que el usuario destino tenga rol `cliente`.

**Request body:** igual que `POST /reservations` más el campo `userId`:

```json
{
  "userId": "a1b2c3d4-...",
  "parkingSpotId": "f1e2d3...",
  "vehiclePlate": "ABC123",
  "vehicleType": "auto",
  "startDate": "2026-06-18T09:00:00.000Z",
  "endDate": "2026-06-18T18:00:00.000Z"
}
```

**Errores adicionales (`400`):** `El usuario {email} no tiene rol "cliente", no se le pueden crear reservas`. `404` si el usuario no existe.

### GET /reservations/my

Lista las reservas del cliente autenticado, ordenadas de la más reciente a la más antigua. **Solo cliente.**

### GET /reservations/occupancy

Devuelve la ocupación actual del parking, desglosada por tipo de vehículo. **admin y empleado.** Corresponde al caso de uso 2 del ejercicio.

**Respuesta `200`:**

```json
{
  "byType": {
    "auto": {
      "totalSpots": 10,
      "occupiedSpots": 3,
      "availableSpots": 7,
      "pendingCheckIn": 1,
      "occupiedReservations": [ /* ... */ ],
      "pendingCheckInReservations": [ /* ... */ ]
    },
    "ciclo": {
      "totalSpots": 5,
      "occupiedSpots": 1,
      "availableSpots": 4,
      "pendingCheckIn": 0,
      "occupiedReservations": [ /* ... */ ],
      "pendingCheckInReservations": [ /* ... */ ]
    }
  }
}
```

Significado de cada métrica (ver ARCHITECTURE.md para el detalle):
- `occupiedSpots` — vehículos físicamente dentro ahora mismo (con entrada y sin salida).
- `pendingCheckIn` — reservas vigentes en este momento que aún no han registrado entrada.
- `availableSpots` — plazas activas del tipo menos las ocupadas físicamente.

### GET /reservations

Lista todas las reservas del sistema, con plaza y usuario, ordenadas de la más reciente a la más antigua. **admin y empleado.**

### GET /reservations/:id

Obtiene una reserva por id. **Acceso:** el dueño de la reserva, o cualquier admin/empleado. Un cliente que no sea el dueño recibe `403`.

**Errores:** `404` si no existe, `403` (`No tienes permiso para ver esta reserva`).

### PATCH /reservations/:id/cancel

Cancela una reserva. **Acceso:** el dueño de la reserva o un admin.

**Respuesta `200`:** la reserva con `status: "cancelada"`.

**Errores:**
- `403` (`No tienes permiso para cancelar esta reserva`) — no es el dueño ni admin.
- `400` (`No se puede cancelar una reserva que ya finalizó`) — la reserva ya tiene salida registrada.
- `400` (`La reserva ya está cancelada`).

### PATCH /reservations/:id/enter

Registra la entrada física de un vehículo. **admin y empleado.** Es el método con más validaciones del sistema (ver los casos de borde en ARCHITECTURE.md).

**Respuesta `200`:** la reserva con `actualEntryDate` fijado.

**Errores (`400`), en orden de verificación:**
- `404` — la reserva no existe.
- `No se puede dar entrada a una reserva cancelada`.
- `Esta reserva ya tiene entrada registrada`.
- `No se puede dar entrada: la plaza {id} está físicamente ocupada por otro vehículo (reserva {id})` — hay otro coche dentro de esa plaza ahora mismo.
- `No se puede dar entrada: hay otra reserva ({id}) que aún no ha entrado pero se solapa con este horario. El cliente está llegando antes de tiempo.` — conflicto con otra reserva planificada para esa franja.

### PATCH /reservations/:id/exit

Registra la salida física de un vehículo. **admin y empleado.** Libera la plaza.

**Respuesta `200`:** la reserva con `actualExitDate` fijado.

**Errores (`400`):**
- `No se puede dar salida a una reserva cancelada`.
- `Esta reserva ya tiene salida registrada`.

---

## Auditoría

### GET /audit-log

Consulta el log de auditoría almacenado en MongoDB. **Solo admin.** Corresponde al caso de uso 4 del ejercicio. Soporta filtrado y paginación; **es el único endpoint de listado paginado** (ver la nota sobre paginación en ARCHITECTURE.md).

**Query parameters (todos opcionales):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `action` | enum | Filtra por acción: `CREATED`, `CANCELLED`, `ENTERED`, `EXITED` |
| `startDate` | string (ISO) | Eventos a partir de esta fecha (inclusive) |
| `endDate` | string (ISO) | Eventos hasta esta fecha (inclusive) |
| `reservationId` | string (UUID) | Eventos de una reserva concreta |
| `parkingSpotId` | string (UUID) | Eventos de una plaza concreta |
| `reservationOwnerId` | string (UUID) | Eventos de reservas de un cliente concreto |
| `performedById` | string (UUID) | Eventos ejecutados por un usuario concreto |
| `page` | number | Página (por defecto `1`, mínimo `1`) |
| `limit` | number | Registros por página (por defecto `20`, máximo `100`) |

**Ejemplo:** `GET /audit-log?action=ENTERED&page=1&limit=10`

**Respuesta `200`:**

```json
{
  "data": [
    {
      "action": "ENTERED",
      "timestamp": "2026-06-21T11:30:00.000Z",
      "reservation": {
        "id": "...",
        "vehiclePlate": "ABC123",
        "vehicleType": "auto",
        "startDate": "...",
        "endDate": "...",
        "actualEntryDate": "...",
        "actualExitDate": null,
        "status": "activa"
      },
      "parkingSpot": { "id": "...", "code": "A-01", "type": "auto" },
      "performedBy": { "id": "...", "name": "Ana Empleada", "email": "ana@parking.com", "role": "empleado" },
      "reservationOwner": { "id": "...", "name": "Juan Pérez", "email": "juan@example.com" }
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 10
}
```

Cada entrada es un **snapshot completo e inmutable** del estado en el momento del evento (ver ARCHITECTURE.md para el razonamiento). Los resultados se ordenan del más reciente al más antiguo.

---

## IA — Consultas en lenguaje natural

### POST /ai/ask

Recibe una pregunta en lenguaje natural sobre el estado o la actividad del parking y devuelve una respuesta redactada, junto con los datos que la respaldan. **Solo admin.** Integra la API de Anthropic (Claude). El diseño completo está documentado en [AISOLUTION.md](./AISOLUTION.md).

**Request body:**

```json
{
  "question": "¿el auto de Juan está en el parqueo ahora?"
}
```

| Campo | Tipo | Requerido | Reglas |
|---|---|---|---|
| `question` | string | Sí | No vacío, máximo 500 caracteres |

**Respuesta `201`:**

```json
{
  "answer": "Sí, el vehículo de Juan Pérez (placa ABC123) está en el parking, en la plaza A-01. Entró hoy a las 14:30.",
  "capability": "presence_lookup",
  "intent": "CURRENT_STATE",
  "resultType": "presence_by_owner",
  "data": { "owner": { "name": "Juan Pérez" }, "reservations": [ /* ... */ ] }
}
```

| Campo | Descripción |
|---|---|
| `answer` | Respuesta en lenguaje natural redactada por Claude a partir de los datos reales |
| `capability` | La capability seleccionada (o `null` si la pregunta no es soportada) |
| `intent` | `CURRENT_STATE`, `HISTORY` o `UNSUPPORTED` |
| `resultType` | Etiqueta del resultado concreto obtenido (ver tabla más abajo) |
| `data` | Datos crudos que respaldan la respuesta, para transparencia y verificación |

Los campos `capability`, `intent`, `resultType` y `data` se incluyen como **transparencia**: permiten auditar cómo se interpretó la pregunta y verificar la respuesta contra los datos reales, sin depender únicamente del texto.

**Capabilities soportadas:**

| Capability | Fuente | Responde a |
|---|---|---|
| `presence_lookup` | PostgreSQL | ¿Está un vehículo dentro ahora? (por dueño, placa o plaza) |
| `occupancy_summary` | PostgreSQL | Ocupación general actual |
| `active_reservations` | PostgreSQL | Reservas vigentes |
| `audit_query` | MongoDB | Historial de eventos con filtros |
| `business_insights` | Mongo / Postgres | Analítica: top clientes, no-shows, plazas más usadas, tasa de cancelación |
| `entity_history` | MongoDB | Historial completo de una entidad concreta |

**Valores posibles de `resultType`:**

| resultType | Significado |
|---|---|
| `presence_by_owner` / `presence_by_plate` / `presence_by_spot` | Resultado de presencia según el criterio de búsqueda |
| `occupancy_summary` | Resumen de ocupación |
| `active_reservations` | Listado de reservas vigentes |
| `audit_query` | Resultado del histórico filtrado |
| `insight_top_customers` / `insight_no_shows` / `insight_busiest_spots` / `insight_cancellation_rate` | Resultados de analítica |
| `entity_history` | Historial de la entidad consultada |
| `disambiguation` | Hay varias coincidencias; la respuesta pide aclarar cuál |
| `owner_not_found` / `spot_not_found` | No se encontró la entidad mencionada |
| `unsupported` | La pregunta queda fuera del alcance del sistema |

**Ejemplos de preguntas:**
- "¿cuántas plazas libres de tipo auto quedan?" → `occupancy_summary`
- "¿cuántos vehículos entraron ayer?" → `audit_query`
- "¿quiénes no se presentaron a sus reservas este mes?" → `business_insights` (no_shows)
- "¿qué tiempo hace hoy?" → `unsupported`

**Errores:** `400` si la pregunta está vacía o supera 500 caracteres. `401`/`403` si no es un admin autenticado. `422` (o `500`) si la clasificación de la IA no devuelve un resultado procesable.

---

## Códigos de error comunes

| Código | Significado en esta API |
|---|---|
| `200 OK` | Petición correcta (operaciones de lectura, actualización y acciones sobre reservas) |
| `201 Created` | Recurso creado correctamente (registro, creación de usuarios, plazas, reservas) |
| `400 Bad Request` | Validación de datos fallida, o regla de negocio violada (fechas inválidas, plaza no disponible, reserva ya cancelada, etc.) |
| `401 Unauthorized` | Falta el token, el token es inválido/expirado, o credenciales incorrectas en login |
| `403 Forbidden` | Autenticado pero sin permiso: el rol no autoriza la acción, o se intenta acceder a un recurso ajeno |
| `404 Not Found` | El recurso solicitado (usuario, plaza, reserva) no existe |
| `409 Conflict` | Violación de unicidad: email ya registrado, o código de plaza duplicado |

Los errores siguen el formato estándar de NestJS:

```json
{
  "statusCode": 400,
  "message": "La fecha de inicio debe ser anterior a la fecha de fin",
  "error": "Bad Request"
}
```

En errores de validación de DTO, `message` puede ser un array con todos los problemas detectados:

```json
{
  "statusCode": 400,
  "message": ["email must be an email", "password must be longer than or equal to 6 characters"],
  "error": "Bad Request"
}
```
