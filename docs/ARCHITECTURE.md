# Arquitectura y Decisiones de Diseño

Este documento explica cómo está construido el sistema y, sobre todo, **por qué** se tomó cada decisión técnica relevante. El objetivo no es repetir lo que el código ya dice, sino dar el contexto que no se ve a simple vista: los problemas que se anticiparon, las alternativas que se descartaron, y los casos de borde que se cubrieron.

## Visión general

La aplicación sigue la arquitectura modular de NestJS. Cada dominio del problema vive en su propio módulo autocontenido (`auth`, `users`, `parking-spots`, `reservations`, `audit-log`), y los elementos transversales (guards, decoradores, interceptores) viven en `common`.

La relación entre módulos es la siguiente:

- **`auth`** depende de **`users`** para validar credenciales y para resolver el usuario a partir del token. No tiene su propia tabla: delega toda la persistencia de usuarios en el módulo `users`.
- **`reservations`** es el núcleo del sistema y el único módulo con lógica de negocio compleja. Depende de **`parking-spots`** (para resolver disponibilidad y validar tipos de plaza) y de **`users`** (para validar que el destinatario de una reserva creada por admin es realmente un cliente).
- **`audit-log`** es deliberadamente **pasivo y desacoplado**: no es invocado directamente por la lógica de negocio, sino enganchado mediante un interceptor sobre los endpoints de reservas. Esto significa que `reservations` no sabe que el audit-log existe, lo cual mantiene la lógica de negocio limpia de responsabilidades de registro.

### Dos bases de datos, a propósito

El requisito del ejercicio pedía PostgreSQL (o MySQL) para las entidades de negocio y MongoDB para los logs. Esta separación no es arbitraria y se respetó porque tiene sentido real:

- **PostgreSQL (vía TypeORM)** guarda las entidades transaccionales: usuarios, plazas y reservas. Son datos con relaciones claras, restricciones de integridad (claves foráneas, unicidad), y que se consultan y actualizan constantemente. Una base de datos relacional es la herramienta correcta.
- **MongoDB (vía Mongoose)** guarda los logs de auditoría. Un log es un documento inmutable de estructura flexible que se escribe una vez y se lee ocasionalmente con filtros variados. No necesita joins ni transacciones; necesita escritura rápida y esquema flexible. Una base de datos documental encaja mejor.

La consecuencia de diseño más importante de esta separación es que **los logs de auditoría guardan snapshots, no referencias** (ver sección de Auditoría). Como las dos bases no comparten claves foráneas, un log no puede "apuntar" a una reserva de Postgres; tiene que guardar una copia de los datos relevantes en el momento del evento.

## Autenticación y Autorización

### JWT con Passport

La autenticación usa JWT mediante `passport-jwt`. El flujo es estándar: el usuario hace login, recibe un `access_token` firmado, y lo envía en cada petición como `Authorization: Bearer <token>`.

La `JwtStrategy` no se limita a verificar la firma del token: en su método `validate()` vuelve a buscar el usuario en la base de datos a partir del `sub` (el id) del payload. Esto es una decisión deliberada. Significa que si un usuario es eliminado o modificado después de emitir su token, la validación lo detecta en la siguiente petición en lugar de confiar ciegamente en datos potencialmente obsoletos incrustados en el token. El coste es una consulta extra por petición; el beneficio es que el estado del usuario siempre es fresco.

### Guards globales y el patrón "seguro por defecto"

Los dos guards (`JwtAuthGuard` y `RolesGuard`) están registrados como **guards globales** en `app.module.ts` vía `APP_GUARD`. Esta es la decisión de seguridad más importante del diseño de auth: **todos los endpoints requieren autenticación por defecto**. No hay forma de olvidarse de proteger un endpoint nuevo, porque la protección es la regla, no la excepción.

Para los endpoints que sí deben ser públicos (`POST /auth/register` y `POST /auth/login`), se usa el decorador `@Public()`. El `JwtAuthGuard` lee esa metadata con el `Reflector` y, si está presente, deja pasar la petición sin exigir token. Es decir: el sistema es cerrado por defecto y se abre explícitamente caso por caso, que es el sentido correcto del control de acceso.

### Autorización por roles

El `RolesGuard` se combina con el decorador `@Roles(...)`. Cuando un endpoint declara `@Roles(UserRole.ADMIN)`, el guard compara el rol del usuario autenticado contra los roles permitidos. Si el endpoint no declara `@Roles(...)`, el guard lo deja pasar (la autenticación ya la garantizó el `JwtAuthGuard`); esto permite tener endpoints que requieren estar logueado pero no un rol específico, como `GET /users/profile`.

El orden de registro importa: `JwtAuthGuard` va primero (resuelve *quién* eres) y `RolesGuard` después (decide *qué* puedes hacer). El segundo depende de que el primero haya poblado `request.user`.

## Usuarios

### Exclusión del password de las respuestas

La entidad `User` marca el campo `password` con `@Exclude()` de `class-transformer`. Combinado con el interceptor de serialización global, esto garantiza que el hash de la contraseña **nunca** se filtra en una respuesta de la API, ni siquiera por accidente al devolver el objeto usuario completo. Es protección a nivel de entidad, no a nivel de cada endpoint, lo cual de nuevo sigue el principio de "seguro por defecto".

### DTOs separados por operación

En lugar de un único DTO genérico de usuario, cada operación tiene su propio DTO con exactamente los campos y validaciones que necesita:

- `CreateUserDto` — para crear (nombre, email, password, phone opcional, role opcional).
- `UpdateUserDto` — para actualizar datos de perfil; **no incluye password ni role**, porque esos cambios tienen sus propios endpoints dedicados.
- `ChangePasswordDto` — exige la contraseña actual además de la nueva (para cuando el propio usuario cambia su clave).
- `ResetPasswordDto` — solo la nueva contraseña (para cuando un admin la resetea sin conocer la anterior).
- `ChangeRoleDto` — solo el rol.

Esta separación no es burocracia: refleja que **cambiar la contraseña, resetearla como admin, cambiar el rol y editar el perfil son operaciones con reglas de autorización y validación distintas**. Mezclarlas en un solo DTO permitiría, por ejemplo, que alguien se auto-asignara el rol admin en una petición de actualización de perfil. Separarlas cierra esa puerta por diseño.

### Hash de contraseñas

Las contraseñas se hashean con `bcrypt` (10 rondas) antes de persistirse, tanto al crear como al cambiar o resetear. El texto plano nunca toca la base de datos.

## Plazas de Parking

Las plazas (`ParkingSpot`) son una entidad sencilla: un código único, un tipo de vehículo (`auto` o `ciclo`), y un flag `isActive`.

El flag `isActive` permite **desactivar una plaza sin borrarla**. Una plaza en mantenimiento, por ejemplo, no debe aceptar nuevas reservas, pero borrarla rompería la integridad referencial de las reservas históricas que la usaron. El borrado lógico vía `isActive` resuelve esto: las consultas de disponibilidad filtran por `isActive = true`, pero los datos históricos se conservan.

El tipo de plaza (`VehicleType`) es la pieza que conecta plazas con reservas: una reserva para un vehículo tipo `auto` solo puede asignarse a una plaza tipo `auto`. Esta validación se aplica en el servicio de reservas, no en el de plazas, porque es una regla de la reserva, no de la plaza en sí.

## Reservas — el núcleo del sistema

Este es el módulo donde vive prácticamente toda la complejidad del ejercicio. Merece la explicación más detallada.

### Fechas de reserva vs. fechas reales

La entidad `Reservation` distingue entre dos pares de fechas, y entender esta distinción es clave para entender todo el módulo:

- **`startDate` / `endDate`** — las fechas *planificadas* de la reserva. Es la ventana de tiempo que el cliente reservó. Son obligatorias y se fijan al crear.
- **`actualEntryDate` / `actualExitDate`** — las fechas *reales* de entrada y salida física del vehículo. Empiezan en `null` y se rellenan cuando un empleado registra la entrada (`enter()`) y la salida (`exit()`).

Esta separación modela la realidad: una cosa es lo que reservaste (de 10:00 a 18:00) y otra cuándo realmente entraste y saliste. El sistema necesita ambas para distinguir entre una plaza *reservada* y una plaza *físicamente ocupada*, que es lo que hace robusta la lógica de disponibilidad y de ocupación.

### Estado de la reserva: explícito y derivado

La reserva tiene un campo `status` con dos valores explícitos: `activa` y `cancelada`. Pero el estado *completo* de una reserva es en realidad derivado, combinando `status` con las fechas reales:

- **Activa, sin entrada** → reservada pero el vehículo aún no ha llegado.
- **Activa, con entrada y sin salida** → el vehículo está físicamente dentro.
- **Activa, con entrada y salida** → la reserva se cumplió y finalizó.
- **Cancelada** → anulada antes de usarse.

No se creó un enum gigante con todos los estados combinados porque eso duplicaría información: el estado "está dentro" ya está implícito en "tiene `actualEntryDate` pero no `actualExitDate`". Derivar el estado de las fechas evita inconsistencias (no puede haber una reserva marcada como "dentro" que no tenga fecha de entrada, porque el "dentro" *es* tener fecha de entrada).

### Disponibilidad: el corazón de la verificación

Una plaza está disponible para un rango `[startDate, endDate]` si no existe ninguna **reserva activa, no finalizada, cuyo rango se solape** con el solicitado. La condición de solapamiento es el clásico:

```
reserva.startDate < nuevo.endDate  AND  reserva.endDate > nuevo.startDate
```

Esta fórmula cubre todos los casos de solapamiento (la nueva empieza dentro de una existente, termina dentro, la contiene, o está contenida) en una sola condición, evitando enumerar casos a mano.

Hay dos caminos de verificación según cómo se cree la reserva:

- **Sin plaza especificada:** el sistema busca automáticamente la primera plaza disponible del tipo correcto (`findAvailableSpotsByType`), usando un QueryBuilder con una subconsulta que excluye las plazas con reservas solapadas. Si no hay ninguna, devuelve un error claro indicando que no hay plazas de ese tipo en ese rango.
- **Con plaza especificada:** el sistema valida que la plaza existe, que es del tipo correcto para el vehículo, que está activa, y que está libre en el rango. Si está ocupada, el mensaje de error es *contextual*: si existen otras plazas del mismo tipo, lo menciona ("hay otras plazas que podrían estar disponibles"), guiando al cliente hacia la solución en lugar de solo rechazarlo.

### Asignación automática de plaza

Cuando el cliente no especifica plaza, la asignación automática toma la **primera plaza disponible ordenada por código** (`ORDER BY code ASC`). El orden determinista hace que el comportamiento sea predecible y testeable: dado el mismo estado de la base de datos, siempre se asigna la misma plaza. No se eligió aleatoriedad precisamente para que las pruebas e2e puedan afirmar resultados concretos.

### Creación por cliente vs. por admin

Hay dos endpoints de creación con una diferencia sutil pero importante:

- `POST /reservations` (cliente) — el cliente crea su propia reserva. Se valida que `startDate` no sea anterior al momento actual: un cliente no puede reservar en el pasado.
- `POST /reservations/admin` (admin) — el admin crea una reserva *en nombre de un cliente*. Aquí se **omite la validación de fecha pasada** (`skipPastDateValidation = true`), porque un administrador puede necesitar registrar reservas retroactivas (por ejemplo, para reflejar en el sistema algo que ocurrió fuera de línea, o para poblar datos de prueba realistas). Además, valida que el usuario destino tenga rol `cliente`: no tiene sentido crear una reserva a nombre de un empleado o un admin.

El método `create()` del servicio recibe esa bandera `skipPastDateValidation` como parámetro, en lugar de duplicar toda la lógica de creación. La validación de "no en el pasado" es la *única* diferencia entre los dos flujos, así que parametrizarla es más limpio que tener dos métodos casi idénticos.

### enter() — los casos de borde

El método `enter()` (registrar entrada física de un vehículo) es el que más casos de borde tiene, porque es donde el mundo físico choca con el modelo de datos. Estos son los siete que cubre, en orden:

1. **La reserva no existe** → `404 Not Found`. (Cubierto por `findOne`.)
2. **La reserva está cancelada** → `400`. No se puede dar entrada a algo que se anuló.
3. **La reserva ya tiene entrada registrada** → `400`. No se puede entrar dos veces; `actualEntryDate` ya no es `null`.
4. **La plaza está físicamente ocupada por otro vehículo** → `400`. Existe otra reserva en la misma plaza que ya entró (`actualEntryDate` no nulo) y aún no ha salido (`actualExitDate` nulo). No importa lo que digan las fechas planificadas: hay un coche ahí *ahora mismo*.
5. **Hay otra reserva solapada que aún no ha entrado (cliente llegando antes de tiempo)** → `400`. Existe otra reserva activa para esa plaza, sin entrada todavía, cuyo rango planificado se solapa con el horario y que sigue vigente respecto al momento actual. El mensaje lo explica: alguien tiene esa plaza reservada para esta franja y podría llegar.
6. **Todo correcto** → se registra `actualEntryDate = now` y se guarda.
7. *(Implícito en la combinación de los anteriores)* el método distingue cuidadosamente entre ocupación *física* (caso 4, basada en fechas reales) y conflicto de *reserva* (caso 5, basado en fechas planificadas). Esta distinción es justamente lo que hace que el sistema funcione cuando la realidad no coincide con lo planificado.

La razón de tanto cuidado en `enter()` es que es el punto donde dos verdades pueden divergir: lo que estaba planificado y lo que está pasando físicamente. El sistema da prioridad a la realidad física (un coche presente bloquea la entrada de otro) pero también respeta las reservas planificadas para no dejar entrar a alguien en la franja de otro.

### exit() y cancel()

- **`exit()`** es más simple: valida que la reserva no esté cancelada y que no tenga ya salida registrada, y entonces fija `actualExitDate = now`. Registrar la salida es lo que "libera" la plaza físicamente.
- **`cancel()`** valida permisos (solo el dueño de la reserva o un admin pueden cancelar), que la reserva no haya finalizado ya (no se cancela algo que ya ocurrió) y que no esté ya cancelada. La verificación de permisos vive aquí en el servicio además de en el controlador, porque es una regla de negocio, no solo de routing.

### getOccupancy() — dos métricas distintas

El endpoint de ocupación (caso de uso del empleado) no devuelve un solo número, porque "ocupación" tiene dos significados distintos que un operador del parking necesita diferenciar:

- **`occupiedSpots` (ocupación física real):** plazas con un vehículo dentro *ahora mismo* — reservas activas con entrada registrada y sin salida. Es cuántos coches hay físicamente en el parking.
- **`pendingCheckIn` (reservas vigentes sin check-in):** reservas activas cuyo rango planificado incluye el momento actual pero que aún no han registrado entrada. Es cuántos clientes *deberían* estar llegando o por llegar en su franja.

Ambas métricas se desglosan **por tipo de vehículo** (`auto` y `ciclo`), junto con el total de plazas y las disponibles de cada tipo, e incluyen las reservas concretas detrás de cada número para que el empleado pueda ver el detalle, no solo el agregado.

La distinción importa operativamente: una plaza con `pendingCheckIn` no está libre (está reservada) pero tampoco está físicamente ocupada. Reportar solo un número escondería esa diferencia y daría una imagen falsa del estado del parking.

## Auditoría (Logs en MongoDB)

### Snapshots completos, no referencias

Cada entrada del log de auditoría guarda un **snapshot completo** del estado relevante en el momento del evento: los datos de la reserva, de la plaza, del usuario que ejecutó la acción (`performedBy`) y del dueño de la reserva (`reservationOwner`).

La razón es doble. Primero, técnica: como Postgres y Mongo no comparten claves foráneas, guardar solo IDs obligaría a hacer consultas cruzadas entre bases (y los datos podrían haber cambiado o desaparecido). Segundo, y más importante, conceptual: **un log de auditoría debe ser un registro histórico inmutable de lo que era verdad en ese instante**. Si un usuario cambia su email mañana, el log de una acción de hoy debe seguir mostrando el email que tenía hoy. Guardar referencias rompería esto; guardar snapshots lo garantiza. Un audit log que cambia retroactivamente cuando cambian los datos referenciados no sirve como auditoría.

### El interceptor

El registro se hace mediante `ReservationAuditInterceptor`, aplicado con `@UseInterceptors(...)` sobre los endpoints de reservas que representan acciones críticas (crear, cancelar, entrar, salir). El interceptor deduce la acción a partir de la URL (`/cancel`, `/enter`, `/exit`, o creación por defecto) y construye el snapshot a partir de la reserva devuelta por el endpoint.

La ventaja de usar un interceptor en lugar de llamar al servicio de auditoría desde cada método de negocio es el **desacoplamiento**: la lógica de reservas no tiene ni idea de que existe la auditoría. Se puede añadir, quitar o modificar el registro sin tocar una sola línea de la lógica de negocio. Es justo el tipo de responsabilidad transversal para la que existen los interceptores en NestJS.

### Logging "best-effort"

El interceptor guarda el log de forma **best-effort**: si la escritura en MongoDB falla, el error se captura y se registra en consola, pero **no se propaga al cliente**. La operación de negocio (crear la reserva, registrar la entrada) ya se completó con éxito y no debe revertirse ni fallar solo porque la auditoría tuvo un problema.

Esta es una decisión de diseño con un trade-off explícito: se prioriza la **disponibilidad de la operación de negocio** sobre la **garantía de completitud del log**. Para un sistema de parking es la elección correcta: es peor impedir que un cliente entre a su plaza porque el log falló, que tener un hueco ocasional en la auditoría. En un sistema donde la auditoría fuera legalmente obligatoria (banca, salud), el trade-off podría invertirse y convendría una escritura transaccional o una cola de reintentos. Se documenta aquí para dejar claro que es una elección consciente, no un descuido.

### @SkipSerialize()

El controlador de auditoría usa el decorador `@SkipSerialize()`. El interceptor de serialización global está pensado para entidades de TypeORM (aplica `@Exclude()`, transforma tipos, etc.), pero los documentos de Mongoose no son esas entidades y pasarlos por ese interceptor causaría transformaciones incorrectas o pérdida de campos. `@SkipSerialize()` le dice al `ConditionalSerializerInterceptor` que deje pasar las respuestas de este controlador sin tocarlas. Es la pieza que permite que un interceptor global conviva con un endpoint que no debe ser serializado de la forma estándar.

### Filtros de consulta

El endpoint `GET /audit-log` (solo admin) soporta filtrado por acción, rango de fechas, y por los IDs de reserva, plaza, dueño y ejecutor, además de paginación. Esto cubre el caso de uso del enunciado (un admin consultando el historial) con la flexibilidad suficiente para responder preguntas reales: "¿qué hizo este empleado?", "¿qué pasó con esta plaza?", "¿qué ocurrió entre estas fechas?".

## Paginación y escalabilidad de los listados

Una decisión que conviene hacer explícita: **de los endpoints que devuelven listados (`GET .../`), solo el de auditoría (`GET /audit-log`) está paginado**. Los demás listados (`GET /users`, `GET /reservations`, `GET /reservations/my`, `GET /parking-spots`) devuelven todos los registros de una vez.

Esto es deliberado para el alcance de este ejercicio, pero **no es lo que haría en producción**. En un sistema real, todos los endpoints de listado deberían estar paginados, sin excepción. La razón es de escalabilidad: un `findAll()` sin límite funciona perfecto con 10 reservas, pero con 100.000 carga toda la tabla en memoria, satura la respuesta, y degrada la base de datos. Es uno de esos problemas que no se ven en desarrollo y aparecen de golpe en producción cuando los datos crecen.

Se paginó **solo** el log de auditoría porque es el listado que, por naturaleza, crece sin parar: cada acción del sistema genera una entrada nueva y nunca se borran. Es el caso donde la ausencia de paginación se notaría primero y más, así que era el candidato obvio para implementarla dentro del tiempo del ejercicio y, de paso, dejar demostrado el patrón (filtros + `page`/`limit` + `total`).

En producción, la paginación de `audit-log` se replicaría tal cual en `users`, `reservations` y `parking-spots`: los mismos parámetros `page`/`limit` validados por DTO, la misma respuesta con `{ data, total, page, limit }`, y para conjuntos muy grandes incluso se valoraría paginación basada en cursor en lugar de offset (que se vuelve lento en páginas profundas). El patrón ya está construido y probado en `audit-log`; extenderlo al resto sería trabajo mecánico, no de diseño.

## Testing

### Estrategia e2e

Las pruebas son **end-to-end**, no unitarias, y esta es una decisión deliberada para este ejercicio. Las e2e ejercitan el sistema completo a través de peticiones HTTP reales: pasan por los guards, los pipes de validación, los interceptores, la lógica de negocio y la base de datos real. Para un ejercicio cuyo valor está en la lógica de negocio y la integración entre piezas (auth + roles + reservas + auditoría), las e2e dan mucha más confianza por unidad de esfuerzo que mockear cada servicio por separado. Verifican que el sistema *funciona*, no solo que cada pieza aislada hace lo que cree que hace.

Cubren los tres casos de uso obligatorios (reservar, consultar ocupación, actualizar usuario) más el flujo completo de autenticación, la autorización por roles, y el ciclo de vida entero de una reserva.

### Base de datos de pruebas separada

Los tests corren contra una base de datos PostgreSQL completamente aislada (`parking_test_db`, en el contenedor `parking_postgres_test`, puerto `5435`), configurada vía `.env.test`. Nunca tocan los datos de desarrollo. Cada suite limpia las tablas relevantes en su `beforeAll`/`afterAll`, dejando el entorno en un estado conocido. Este aislamiento es lo que permite correr los tests una y otra vez sin que se contaminen entre ejecuciones ni con datos manuales de desarrollo.

### Ejecución secuencial (--runInBand)

Las pruebas corren en serie, no en paralelo. Como varias suites comparten la misma base de datos de pruebas, ejecutarlas en paralelo provocaría que se pisaran los datos unas a otras (una suite borrando tablas mientras otra las lee). `--runInBand` fuerza la ejecución secuencial, garantizando que cada suite tiene la base de datos para sí sola mientras corre. Es el trade-off correcto: se sacrifica algo de velocidad a cambio de determinismo, que en una suite de tests vale mucho más.

### Fechas dinámicas

Los tests construyen sus fechas de forma **relativa al momento de ejecución** (helpers como `futureDate(daysFromNow, hour)`), nunca con fechas fijas hardcodeadas. La razón es crítica: la lógica de reservas valida que no se reserve en el pasado. Una fecha fija como `2025-01-15` funcionaría hoy pero **empezaría a fallar a partir de esa fecha**, convirtiendo la suite en una bomba de tiempo. Calcular las fechas como "dentro de N días desde ahora" hace que los tests sean correctos sin importar cuándo se ejecuten. Es la diferencia entre una suite que envejece bien y una que se rompe sola con el calendario.
