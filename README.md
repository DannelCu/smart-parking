# Smart Parking API

API RESTful para la gestión de un parking, construida con NestJS y TypeScript. Permite reservar plazas de aparcamiento, controlar la entrada y salida de vehículos, consultar la ocupación en tiempo real, y mantener un registro de auditoría de todas las acciones críticas del sistema.

Desarrollada como ejercicio técnico para proceso de entrevista.

## Stack Tecnológico

- **Backend:** Node.js v24 + NestJS + TypeScript
- **Base de datos principal:** PostgreSQL (entidades de negocio: usuarios, plazas, reservas)
- **Base de datos de auditoría:** MongoDB (registro de actividad)
- **ORM:** TypeORM (PostgreSQL) + Mongoose (MongoDB)
- **Autenticación:** JWT (JSON Web Tokens)
- **Validación:** class-validator / class-transformer
- **Testing:** Jest + Supertest (pruebas e2e)
- **IA:** API de Anthropic (Claude) para consultas en lenguaje natural
- **Contenedores:** Docker Compose

## Estructura del repositorio

```
smart-parking/
├── README.md               # Este archivo
├── docker-compose.yml      # Definición de los contenedores de base de datos
├── docs/                   # Documentación técnica y colección de Postman
└── parking-api/            # Aplicación NestJS
    └── src/
        ├── auth/           # Autenticación JWT, login, registro
        ├── users/          # Gestión de usuarios y roles
        ├── parking-spots/  # CRUD de plazas de aparcamiento
        ├── reservations/   # Lógica de negocio de reservas (el núcleo del sistema)
        ├── audit-log/      # Registro de auditoría en MongoDB
        ├── scripts/        # Utilidades de línea de comandos (seed de admin y datos de demo)
        └── common/         # Guards, decoradores e interceptores compartidos
```

Para el detalle completo de las decisiones de diseño y arquitectura, consulta **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**.

Para la documentación completa de la API, consulta **[docs/API.md](./docs/API.md)**.

## Requisitos previos

- [Node.js](https://nodejs.org/) v18 o superior (desarrollado y probado con v24.16.0)
- [Docker](https://www.docker.com/products/docker-desktop/) y Docker Compose
- npm

## Instalación y ejecución

### 1. Clonar el repositorio

```bash
git clone https://github.com/DannelCu/smart-parking.git
cd smart-parking
```

### 2. Configurar las variables de entorno

Crea un archivo `.env` en la **raíz del proyecto** (usado por Docker Compose):

```env
DB_USER=parking_user
DB_PASSWORD=parking_pass
DB_NAME=parking_db
DB_PORT=5434
DB_TEST_NAME=parking_test_db
DB_TEST_PORT=5435
MONGO_PORT=27017
```

Crea un archivo `.env` dentro de **`parking-api/`** (usado por la aplicación NestJS):

```env
# PostgreSQL
DB_HOST=127.0.0.1
DB_PORT=5434
DB_USER=parking_user
DB_PASSWORD=parking_pass
DB_NAME=parking_db

# MongoDB
MONGO_URI=mongodb://localhost:27017/parking_logs

# JWT
JWT_SECRET=supersecreto123
JWT_EXPIRES_IN=1d

# Admin inicial (usado por el script de seed, ver sección "Crear el usuario administrador")
ADMIN_NAME="Admin Principal"
ADMIN_EMAIL=admin@parking.com
ADMIN_PASSWORD=cambiar_esta_password

# Anthropic / Claude (funcionalidad de IA, ver docs/AISOLUTION.md)
ANTHROPIC_API_KEY=sk-ant-...tu-clave...
AI_MODEL_EXTRACT=claude-haiku-4-5
AI_MODEL_SUMMARIZE=claude-haiku-4-5
```

> **Sobre la clave de Anthropic:** la funcionalidad de IA (`POST /ai/ask`) requiere una clave de la API de Anthropic, que se obtiene en [console.anthropic.com](https://console.anthropic.com). Es independiente de cualquier suscripción a Claude y se factura por uso; con el modelo Haiku el coste de las consultas es mínimo. Si no se configura `ANTHROPIC_API_KEY`, la aplicación no arrancará (falla de forma temprana y explícita). El resto de la API funciona con normalidad.

Crea un archivo `.env.test` dentro de **`parking-api/`** (usado exclusivamente por los tests e2e, apunta a una base de datos separada):

```env
# PostgreSQL (base de datos de pruebas)
DB_HOST=127.0.0.1
DB_PORT=5435
DB_USER=parking_user
DB_PASSWORD=parking_pass
DB_NAME=parking_test_db

# MongoDB
MONGO_URI=mongodb://localhost:27017/parking_test_logs

# JWT
JWT_SECRET=supersecreto123
JWT_EXPIRES_IN=1d
```

> **Nota sobre los puertos:** las bases de datos de los contenedores se exponen en `5434` y `5435` en lugar del puerto estándar de PostgreSQL (`5432`) a propósito. Si tienes una instalación local de PostgreSQL en tu máquina (fuera de Docker), esta probablemente ya esté usando el `5432`, lo que genera conflictos de puerto difíciles de diagnosticar al intentar levantar el contenedor. Se recomienda evitar los puertos por defecto de servicios que suelen instalarse localmente al definir contenedores de desarrollo.

### 3. Levantar las bases de datos con Docker Compose

Desde la raíz del proyecto:

```bash
docker-compose up -d
```

Esto levanta tres contenedores:
- `parking_postgres` — PostgreSQL para desarrollo (puerto `5434`)
- `parking_postgres_test` — PostgreSQL para tests e2e, aislado del de desarrollo (puerto `5435`)
- `parking_mongo` — MongoDB para los logs de auditoría (puerto `27017`)

Verifica que los tres estén corriendo:

```bash
docker ps
```

### 4. Instalar dependencias

```bash
cd parking-api
npm install
```

### 5. Ejecutar la aplicación

Desde dentro de `parking-api/`:

```bash
npm run start:dev
```

La API queda disponible en `http://localhost:3000`.

Al iniciar, TypeORM sincroniza automáticamente el esquema de PostgreSQL (modo `synchronize`, ver nota técnica más abajo).

### 6. Crear el usuario administrador

El sistema no permite crear usuarios `admin` a través de la API pública (el registro siempre asigna el rol `cliente` por defecto, y solo un administrador existente puede crear otros administradores). Para crear el primer admin, se incluye un script de seed que lee las credenciales directamente del `.env`. Desde dentro de `parking-api/`:

```bash
npm run seed:admin
```

Este comando es idempotente: si el email definido en `ADMIN_EMAIL` ya existe, el script lo informa por consola y no realiza ninguna acción, en vez de fallar o crear un duplicado. Con ese usuario ya puedes autenticarte (`POST /auth/login`) y, desde ahí, crear el resto de usuarios (`empleado`, otros `admin`, o `cliente`) a través de la API.

### 7. (Opcional) Poblar la base de datos con datos de demostración

Para facilitar la revisión del ejercicio, se incluye un segundo script de seed que genera un conjunto de datos de demostración completo y representativo del ciclo de vida del sistema. Desde dentro de `parking-api/`:

```bash
npm run seed:demo
```

Requisitos previos para este comando:
- Las bases de datos deben estar corriendo (`docker-compose up -d`).
- El usuario admin debe existir previamente (`npm run seed:admin`).
- **No** es necesario tener la aplicación corriendo (`start:dev`) en paralelo: el script levanta su propia instancia de la aplicación en un puerto efímero, siembra los datos a través de los endpoints HTTP reales, y la cierra al terminar. Esto garantiza que los datos generados pasan por exactamente las mismas validaciones y la misma lógica de negocio que cualquier petición de un cliente real, en lugar de insertarse directamente en la base de datos saltándose las reglas.

El script genera:
- 1 empleado y 2 clientes.
- 4 plazas (2 de tipo `auto`, 2 de tipo `ciclo`).
- 4 reservas que ejercitan el flujo completo: una reserva futura activa, una reserva cancelada por su dueño, y dos reservas con entrada/salida registradas por el empleado.
- Como resultado, 8 entradas en el log de auditoría de MongoDB (creaciones, cancelación, entradas y salidas).

> **Nota de seguridad — divulgación honesta.** Este script de demostración define credenciales de prueba (emails y contraseñas) en texto claro dentro del propio código fuente, y la sección de `.env` de este README incluye valores de ejemplo igualmente en texto claro. **Soy consciente de que esto es una mala práctica de seguridad en cualquier contexto real:** las credenciales nunca deberían estar hardcodeadas ni versionadas, y los secretos deberían inyectarse mediante un gestor de secretos (AWS Secrets Manager, HashiCorp Vault, variables de entorno del runtime de despliegue, etc.) y nunca commitearse al repositorio. Esta decisión es **deliberada y limitada exclusivamente al propósito de este ejercicio:** su único objetivo es que quien revise el proyecto pueda levantar un entorno con datos realistas en un solo comando, sin tener que crear manualmente usuarios, plazas y reservas para poder probar los endpoints. En un entorno real, este script no existiría en esta forma, las credenciales de demo no estarían en el código, y el `.env` estaría listado en `.gitignore` versionando únicamente un `.env.example` sin valores sensibles.

## Testing

El proyecto cuenta con pruebas end-to-end (e2e) que cubren los tres casos de uso principales del ejercicio (reservar una plaza, consultar la ocupación, actualizar un usuario) además de todo el flujo de autenticación, autorización por roles, y el ciclo de vida completo de una reserva (creación, entrada, salida, cancelación).

Las pruebas usan una base de datos PostgreSQL **completamente separada** de la de desarrollo (`parking_test_db`, contenedor `parking_postgres_test`), por lo que no afectan ni dependen de los datos de desarrollo.

Para ejecutar la suite completa, desde dentro de `parking-api/`:

```bash
npm run test:e2e
```

> Las pruebas e2e corren de forma secuencial (`--runInBand`), ya que comparten estado en la misma base de datos de pruebas entre los distintos archivos de test.

## Nota técnica: sincronización de esquema vs. migraciones

Esta aplicación usa `synchronize: true` en la configuración de TypeORM, lo que hace que el esquema de PostgreSQL se actualice automáticamente al arrancar la app, en base a las entidades definidas en el código. Esta es una decisión deliberada para agilizar el desarrollo de este ejercicio, **no la práctica recomendada para un entorno de producción real**.

En producción, lo correcto es reemplazar `synchronize: true` por un sistema de **migraciones versionadas** de TypeORM. En concreto:

- **Generación de migraciones:** cada cambio en las entidades se traduce a un archivo de migración explícito mediante `typeorm migration:generate`, en lugar de aplicarse automáticamente al arrancar. TypeORM compara el estado actual de las entidades contra el esquema existente y produce el SQL necesario.
- **Versionado en Git:** cada migración es un archivo con timestamp, revisable en code review y con historial completo del esquema. Cualquier persona del equipo puede ver exactamente qué cambió, cuándo y por qué.
- **Reversibilidad:** cada migración incluye su método `up()` (aplicar) y `down()` (revertir), lo que permite hacer rollback de un cambio de esquema de forma controlada si algo sale mal en un despliegue.
- **Aplicación controlada:** las migraciones se ejecutan explícitamente en el momento del despliegue con `npm run typeorm migration:run`, como un paso deliberado del pipeline, en vez de automáticamente en cada arranque de la aplicación.
- **Seguridad de datos:** `synchronize: true` puede provocar **pérdida silenciosa de datos** (por ejemplo, al renombrar una columna, que TypeORM puede interpretar como "borrar la vieja, crear la nueva"). Las migraciones evitan esto al darte control total sobre el SQL que se ejecuta.
- **Entornos multi-instancia:** en un despliegue con varias instancias de la app corriendo simultáneamente, tener cada una intentando sincronizar el esquema al arrancar es una receta para condiciones de carrera. Las migraciones se ejecutan una sola vez, de forma centralizada.

En resumen: `synchronize: true` es excelente para iterar rápido en local, y por eso se usa aquí; las migraciones versionadas son obligatorias en cuanto el proyecto toca un entorno con datos que importan.

## Funcionalidad de IA: consultas en lenguaje natural

La API incluye un endpoint, `POST /ai/ask` (solo administradores), que permite consultar el estado y la actividad del parking escribiendo preguntas en lenguaje natural, en vez de construir filtros manualmente. Integra la API de Anthropic (Claude).

Ejemplos de preguntas que entiende:
- "¿el auto de Juan está en el parqueo ahora?"
- "¿cuántas plazas libres quedan?"
- "¿cuántos vehículos entraron ayer?"
- "¿qué clientes reservan más?"
- "¿quiénes no se presentaron a sus reservas?"

El diseño se apoya en un principio simple: **Claude interpreta la pregunta y la traduce a una operación estructurada de un catálogo cerrado; el backend la valida y la ejecuta usando la lógica de negocio existente.** Claude nunca accede directamente a la base de datos ni genera consultas. El detalle completo del diseño, las capabilities soportadas, las defensas contra inyección de prompts y alucinaciones, y la posible evolución futura están en **[docs/AISOLUTION.md](./docs/AISOLUTION.md)**.

Ejemplo de uso:

```bash
curl -X POST http://localhost:3000/ai/ask \
  -H "Authorization: Bearer <token_de_admin>" \
  -H "Content-Type: application/json" \
  -d '{"question": "¿cuántos autos hay en el parqueo ahora?"}'
```

## Documentación adicional

- **[Arquitectura y decisiones de diseño](./docs/ARCHITECTURE.md)** — explicación detallada de cómo está construido el sistema y por qué se tomó cada decisión técnica relevante
- **[Documentación de la API](./docs/API.md)** — referencia completa de todos los endpoints, roles requeridos, y ejemplos de uso
- **[Solución de IA](./docs/AISOLUTION.md)** — diseño de la funcionalidad de consultas en lenguaje natural con Claude: capabilities, flujo, defensas de seguridad y evolución futura
- **[Colección de Postman](./docs/smart-parking.postman_collection.json)** — colección lista para importar con todos los endpoints organizados por módulo

## Roles del sistema

| Rol | Descripción |
|---|---|
| `admin` | Acceso completo: gestión de usuarios, plazas, reservas de cualquier cliente, y logs de auditoría |
| `empleado` | Gestión operativa: consulta de ocupación, registro de entrada/salida de vehículos |
| `cliente` | Gestión de sus propias reservas: crear, consultar, cancelar |

El registro público (`POST /auth/register`) siempre asigna el rol `cliente` por defecto. Los roles `admin` y `empleado` solo pueden asignarse por un administrador ya existente, o mediante el script de seed inicial (ver sección "Crear el usuario administrador").
