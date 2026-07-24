# Dashboard de Control Operativo WhatsApp

API REST + dashboard web para monitoreo en tiempo real de campañas de mensajería masiva por WhatsApp. Construido sobre Node.js 22 y PostgreSQL, con enfoque en rendimiento, seguridad y mantenibilidad.

![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pg_driver-4169E1?logo=postgresql&logoColor=white)
![Zod](https://img.shields.io/badge/Validation-Zod-3E67B1)
![Docker](https://img.shields.io/badge/Deploy-Docker%20%2B%20Nixpacks-2496ED?logo=docker&logoColor=white)

---

## ¿Qué hace?

Expone una API que agrega y presenta métricas operativas de envíos de WhatsApp: tasas de entrega, tendencias temporales, análisis de fallos y rendimiento por cuenta y país. El frontend estático es servido directamente desde el mismo proceso Express.

---

## Arquitectura

Patrón en capas **Controller → Service → Repository** con responsabilidades estrictamente separadas.

```
Cliente Web
    │
    ▼ HTTP
Express Server
    │
    ├── Middleware stack (Helmet · CORS · Rate limit · Zod validation)
    │
    ├── Controllers    →  reciben la request, delegan, responden
    ├── Services       →  lógica de negocio, caché en memoria
    └── Repositories   →  queries SQL parametrizadas contra PostgreSQL
```

Las consultas de agregación pesada (`/summary`) se ejecutan en **paralelo** con `Promise.all`:

```js
const [kpis, countries, processes, integrityIssues] = await Promise.all([
  repo.getGlobalKpis(from, to),
  repo.getByCountry(from, to),
  repo.getByProcess(from, to),
  repo.getIntegrityIssues(from, to),
]);
```

---

## Stack

| Área | Tecnología | Motivo |
|---|---|---|
| Runtime | Node.js 22 | LTS activo, soporte nativo de `--watch` |
| Framework | Express 4 | Maduro, ecosistema probado |
| Base de datos | PostgreSQL + `pg` | Queries parametrizadas, pool de conexiones |
| Validación | Zod | Schemas tipados, parsing seguro de query params |
| Seguridad | Helmet + express-rate-limit | Cabeceras HTTP + protección contra abuso |
| Caché | node-cache | TTL configurable, sin dependencia externa |
| Logging | Pino | Logging estructurado JSON en producción |
| Deploy | Docker + Nixpacks + Easypanel | CI/CD automático desde GitHub |

---

## API Reference

Base path: `/api` · Rate limit: **60 req/min por IP**

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/summary` | KPIs globales + semáforo de salud por país y proceso |
| `GET` | `/api/trend` | Evolución temporal de envíos (filtrable por país) |
| `GET` | `/api/detail` | Detalle paginado de envíos individuales |
| `GET` | `/api/not-delivered` | Envíos fallidos con filtros |
| `GET` | `/api/not-delivered/reasons` | Catálogo de motivos de fallo |
| `GET` | `/api/accounts` | Listado de cuentas activas |
| `GET` | `/api/account/:name` | Métricas por cuenta en rango de fechas |
| `GET` | `/health` | Health check del servicio |

### Validación de parámetros

Todos los endpoints validan con Zod antes de tocar la base de datos. Un parámetro inválido retorna `400` con detalle del error:

```json
{
  "error": "Parámetros inválidos",
  "details": [
    { "field": "from", "message": "\"from\" no puede ser mayor que \"to\"" }
  ]
}
```

Reglas del rango de fechas:
- `from` y `to` requeridos, formato `YYYY-MM-DD`
- `from` ≤ `to`
- Rango máximo: **120 días**

Paginación en `/detail` y `/not-delivered`: `limit` (máx. 200) + `offset`.

---

## Semáforo de salud

`/api/summary` calcula el estado de cada país y proceso según su tasa de entrega:

| Tasa de entrega | Estado |
|---|---|
| > 93% | 🟢 Verde |
| 85% – 93% | 🟡 Ámbar |
| < 85% | 🔴 Rojo |

---

## Seguridad

- **Sin SQL injection** — todas las queries usan placeholders parametrizados (`$1`, `$2`, ...)
- **Helmet** — cabeceras de seguridad HTTP en cada respuesta
- **Rate limiting** — 60 peticiones/minuto por IP antes de llegar a cualquier controller
- **Validación estricta de entorno** — el proceso no arranca si falta alguna variable requerida
- **Graceful shutdown** — captura `SIGTERM`/`SIGINT`, cierra HTTP y el pool de Postgres antes de salir

---

## Estructura del proyecto

```
├── public/
│   └── dashboard_control_whatsapp.html   # Frontend estático
├── server/
│   ├── index.js                          # Entrypoint + graceful shutdown
│   └── src/
│       ├── app.js                        # Express app, middlewares y rutas
│       ├── config/
│       │   ├── env.js                    # Validación de entorno con Zod
│       │   ├── db.js                     # Pool de conexiones PostgreSQL
│       │   └── cache.js                  # Caché en memoria (node-cache)
│       ├── routes/
│       │   └── api.router.js             # Definición de rutas
│       ├── controllers/                  # Reciben request, delegan a services
│       ├── services/                     # Lógica de negocio + caché
│       ├── repositories/                 # Queries SQL
│       ├── middlewares/
│       │   ├── validate.middleware.js    # Validador Zod genérico
│       │   ├── rateLimiter.middleware.js # Rate limit por IP
│       │   └── error.middleware.js       # Error handler centralizado
│       ├── schemas/
│       │   └── query.schema.js           # Schemas Zod reutilizables
│       └── utils/
│           └── logger.js                 # Pino (JSON / pretty según entorno)
├── .env.example
└── package.json
```

---

## Desarrollo local

```bash
# Instalar dependencias
npm install

# Configurar entorno
cp .env.example .env

# Arrancar con recarga automática
npm run dev
```

Disponible en `http://localhost:3000`. El servidor recarga automáticamente al guardar cambios gracias a `node --watch`.

---

## Variables de entorno

```env
PORT=3000
NODE_ENV=production

PG_HOST=
PG_PORT=5432
PG_DB=
PG_USER=
PG_PASSWORD=
PG_SSL=false

CACHE_TTL_SECONDS=60
```

El esquema se valida con Zod al arrancar. Si falta algún campo, el proceso termina con un mensaje descriptivo del error.

---

## Deploy

El proyecto se despliega automáticamente en **Easypanel** vía webhook de GitHub. Nixpacks detecta el runtime de Node y genera el Dockerfile sin configuración adicional.

```
git push origin master  →  GitHub webhook  →  Easypanel build  →  contenedor activo
```
