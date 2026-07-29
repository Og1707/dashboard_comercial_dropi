# Documentación Oficial de la API REST
## Dashboard de Control Operativo WhatsApp — Dropi

---

## 📋 Índice
1. [Visión General de la Arquitectura](#visión-general-de-la-arquitectura)
2. [Topología del Grafo de Código (Graphify Insights)](#topología-del-grafo-de-código-graphify-insights)
3. [Políticas de Seguridad y Operación](#políticas-de-seguridad-y-operación)
4. [Semáforo de Salud Operativa](#semáforo-de-salud-operativa)
5. [Especificación de Endpoints](#especificación-de-endpoints)
   - [GET /health](#1-health-check)
   - [GET /api/summary](#2-resumen-operativo-summary)
   - [GET /api/trend](#3-tendencia-temporal-trend)
   - [GET /api/detail](#4-detalle-de-envíos-detail)
   - [GET /api/not-delivered](#5-envíos-no-entregados-not-delivered)
   - [GET /api/not-delivered/export](#6-exportación-csv-de-no-entregados)
   - [GET /api/not-delivered/reasons](#7-catálogo-de-motivos-de-fallo)
   - [GET /api/accounts](#8-listado-de-cuentas-activas)
   - [GET /api/account/:name](#9-métricas-por-cuenta)
6. [Esquema Estándar de Errores](#esquema-estándar-de-errores)
7. [Variables de Entorno y Configuración](#variables-de-entorno-y-configuración)

---

## 🏗️ Visión General de la Arquitectura

La API del Dashboard de Control Operativo WhatsApp está estructurada siguiendo el patrón arquitectónico en capas **Controller → Service → Repository**, diseñado para garantizar una estricta separación de responsabilidades, alta mantenibilidad y rendimiento óptimo en la agregación de datos analíticos.

```
                    ┌─────────────────────────┐
                    │    Cliente Web / SPA    │
                    └────────────┬────────────┘
                                 │ HTTP / REST
                                 ▼
                    ┌─────────────────────────┐
                    │    Express App Core     │
                    │  (Helmet, Rate Limiter) │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   Validación de Zod     │
                    │  (validate.middleware)  │
                    └────────────┬────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                    ▼
   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
   │   Controllers   │  │   Controllers   │  │   Controllers   │
   │  (Req / Res)    │  │  (Req / Res)    │  │  (Req / Res)    │
   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
            │                    │                    │
            ▼                    ▼                    ▼
   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
   │    Services     │  │    Services     │  │    Services     │
   │(Business/Cache) │  │(Business/Cache) │  │(Business/Cache) │
   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
            │                    │                    │
            ▼                    ▼                    ▼
   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
   │  Repositories   │  │  Repositories   │  │  Repositories   │
   │  (Queries SQL)  │  │  (Queries SQL)  │  │  (Queries SQL)  │
   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
            └────────────────────┼────────────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │  PostgreSQL Pool (pg)   │
                    └─────────────────────────┘
```

---

## 📊 Topología del Grafo de Código (Graphify Insights)

A partir del análisis de grafos y comunidades del proyecto (`graphify-out`), el sistema se divide en **módulos altamente cohesivos**:

* **Servidor y Middlewares:** `app.js`, `rateLimiter.middleware.js`, `error.middleware.js` gestionan el ciclo de vida HTTP y la protección del servicio.
* **Dominio por Características (Feature Modules):**
  * **Summary (`summary.*`):** Ejecuta agregaciones SQL concurrentes mediante `Promise.all` para calcular KPIs globales, métricas por país/proceso y problemas de integridad. Utiliza memoria caché (`node-cache`) de 60 segundos.
  * **Trend (`trend.*`):** Construye la serie temporal continua rellenando días faltantes en el rango seleccionado.
  * **Accounts (`account.*`):** Gestiona la lista de cuentas operativas, volumen de mensajes y cálculo de salud individual.
  * **Detail (`detail.*`):** Proporciona la lista paginada de envíos con búsqueda y filtrado dinámico.
  * **Not Delivered (`notDelivered.*`):** Mapea motivos de fallo y envíos no entregados.
* **Componentes de Alto Grado ("God Nodes"):**
  * `testConnection()`: Verificación activa de conectividad con PostgreSQL en el inicio.
  * `semaColor()`: Regla centralizada que determina la salud operativa (Verde/Ámbar/Rojo).
  * `getSummary()`: Orquestador principal de analítica multidimensional.
  * `Pool`: Pool de conexiones reutilizable administrado por el driver `pg`.

---

## 🛡️ Políticas de Seguridad y Operación

1. **Protección contra Inyección SQL:** Todas las consultas en la capa de repositorios utilizan sentencias preparadas y parametrizadas (`$1`, `$2`, ...).
2. **Control de Tasa (Rate Limiting):** Límite global de **60 peticiones por minuto por IP** administrado por `express-rate-limit`.
3. **Encabezados de Seguridad:** `helmet` activo en todas las rutas.
4. **Validación Estricta de Parámetros:** Toda petición a endpoints parametrizados pasa obligatoriamente por esquemas de validación con **Zod** antes de acceder a la base de datos.
   * **Rango de fechas (`from`, `to`):** Formato `YYYY-MM-DD` obligatorio.
   * **Regla de orden:** `from` <= `to`.
   * **Rango máximo:** `120 días`.
   * **Paginación (`limit`, `offset`):** `limit` máximo de `200` registros.

---

## 🟢 Semáforo de Salud Operativa

El cálculo de salud por país, proceso y cuenta se rige por la **tasa de entrega**:

$$\text{Tasa de Entrega (\%)} = \left( \frac{\text{Envíos Entregados}}{\text{Total Envíos}} \right) \times 100$$

| Tasa de Entrega | Código Semáforo | Estado Operativo |
|---|---|---|
| **> 93%** | `GREEN` / 🟢 | **Óptimo** |
| **85% – 93%** | `AMBER` / 🟡 | **Atención requerida** |
| **< 85%** | `RED` / 🔴 | **Crítico** |

---

## 🔌 Especificación de Endpoints

### Base URL: `/api`

---

### 1. Health Check
Verifica la disponibilidad del servidor API.

* **Ruta:** `GET /health`
* **Rate Limit:** Exento / Público
* **Respuesta Exitosa (200 OK):**
```json
{
  "status": "ok"
}
```

---

### 2. Resumen Operativo (Summary)
Retorna KPIs globales, consolidado por país y proceso con sus respectivos semáforos de salud, además de alertas de integridad de datos.

* **Ruta:** `GET /api/summary`
* **Query Parameters:**
  | Parámetro | Tipo | Requerido | Descripción |
  |---|---|---|---|
  | `from` | String | **Sí** | Fecha inicio (`YYYY-MM-DD`) |
  | `to` | String | **Sí** | Fecha fin (`YYYY-MM-DD`) |

* **Ejemplo de Petición:**
  `GET /api/summary?from=2026-07-01&to=2026-07-27`

* **Respuesta Exitosa (200 OK):**
```json
{
  "kpis": {
    "processed": 150000,
    "delivered": 141000,
    "failed": 9000,
    "rate": 94.0,
    "cost": 1250.80,
    "sema": "green",
    "integrityIssues": 0
  },
  "countries": [
    {
      "code": "CO",
      "name": "Colombia",
      "processed": 80000,
      "delivered": 76000,
      "failed": 4000,
      "rate": 95.0,
      "cost": 680.40,
      "sema": "green"
    }
  ],
  "processes": [
    {
      "name": "Confirmación de Órdenes",
      "templateCategory": "utility",
      "processed": 50000,
      "delivered": 44000,
      "failed": 6000,
      "rate": 88.0,
      "cost": 420.00,
      "sema": "amber",
      "validation": false
    }
  ],
  "heatmap": [
    {
      "country_name": "Colombia",
      "country_code": "CO",
      "process_name": "Confirmación de Órdenes",
      "processed": 25000
    }
  ]
}
```

---

### 3. Tendencia Temporal (Trend)
Construye la serie de tiempo diaria de envíos, entregas y fallos en el rango indicado.

* **Ruta:** `GET /api/trend`
* **Query Parameters:**
  | Parámetro | Tipo | Requerido | Descripción |
  |---|---|---|---|
  | `from` | String | **Sí** | Fecha inicio (`YYYY-MM-DD`) |
  | `to` | String | **Sí** | Fecha fin (`YYYY-MM-DD`) |
  | `country` | String | No | Filtrar por país específico |
  | `subcuenta` | String | No | Filtrar por subcuenta de envío |

* **Respuesta Exitosa (200 OK):**
```json
{
  "days": ["Jul 1", "Jul 2", "Jul 3"],
  "series": {
    "Confirmación de Órdenes": [1200, 1350, 980],
    "Despacho de Órdenes":     [800,  820,  760]
  }
}
```

---

### 4. Detalle de Envíos (Detail)
Consulta paginada con búsqueda y filtros sobre el registro operativo subcuenta × proceso. Incluye el campo `unreported` que representa la diferencia entre órdenes procesadas y mensajes con reporte (entregados + fallidos), permitiendo identificar gaps de instrumentación.

* **Ruta:** `GET /api/detail`
* **Query Parameters:**
  | Parámetro | Tipo | Requerido | Por Defecto | Descripción |
  |---|---|---|---|---|
  | `from` | String | **Sí** | - | Fecha inicio (`YYYY-MM-DD`) |
  | `to` | String | **Sí** | - | Fecha fin (`YYYY-MM-DD`) |
  | `country` | String | No | - | Filtro por nombre de país |
  | `process` | String | No | - | Filtro por nombre de proceso |
  | `search` | String | No | - | Búsqueda parcial por nombre de subcuenta |
  | `limit` | Number | No | `50` | Máximo 200 registros por página |
  | `offset` | Number | No | `0` | Desplazamiento para paginación |

* **Respuesta Exitosa (200 OK):**
```json
{
  "total": 1250,
  "limit": 50,
  "offset": 0,
  "rows": [
    {
      "code": "CO",
      "country": "Colombia",
      "account": "Dropi Logística",
      "process": "Logística (Garantías) - Proveedores",
      "processed": 149,
      "delivered": 145,
      "failed": 2,
      "unreported": 2,
      "rate": 97.3,
      "cost": 1.21
    }
  ]
}
```

> **Coherencia de datos:** `processed = delivered + failed + unreported`
>
> `unreported` = órdenes sin ningún mensaje registrado en `fact_mensajes_ghl`. Un valor > 0 indica un gap de instrumentación (la orden existe pero GHL no envió el webhook de resultado).

---

### 5. Envíos No Entregados (Not Delivered)
Obtiene el listado detallado de mensajes no entregados filtrable por motivo de fallo.

* **Ruta:** `GET /api/not-delivered`
* **Query Parameters:**
  | Parámetro | Tipo | Requerido | Por Defecto | Descripción |
  |---|---|---|---|---|
  | `from` | String | **Sí** | - | Fecha inicio (`YYYY-MM-DD`) |
  | `to` | String | **Sí** | - | Fecha fin (`YYYY-MM-DD`) |
  | `country` | String | No | - | Filtro por país |
  | `reason` | String | No | - | Motivo específico de fallo |
  | `limit` | Number | No | `50` | Máximo 200 registros |
  | `offset` | Number | No | `0` | Desplazamiento |

* **Respuesta Exitosa (200 OK):**
```json
{
  "total": 320,
  "limit": 50,
  "offset": 0,
  "rows": [
    {
      "telefono": "+573119876543",
      "contact_id": "ct_abc123",
      "country": "Colombia",
      "process": "Confirmación de Órdenes",
      "template": "confirmacion_pedido_v2",
      "workflow_id": "wf_0041",
      "date": "2026-07-27T10:15:22.000Z"
    }
  ]
}
```

---

### 6. Catálogo de Motivos de Fallo
Retorna la lista de razones de fallo registradas con su conteo para construir filtros y gráficos de distribución.

* **Ruta:** `GET /api/not-delivered/reasons`
* **Query Parameters:** Ninguno
* **Respuesta Exitosa (200 OK):**
```json
[
  { "reason": "Número no registrado en WhatsApp" },
  { "reason": "Teléfono apagado / sin señal" },
  { "reason": "Bloqueado por el usuario" }
]
```
```

---

### 7. Listado de Cuentas Activas
Retorna la lista de cuentas operativas registradas en la plataforma.

* **Ruta:** `GET /api/accounts`
* **Query Parameters:** Ninguno
* **Respuesta Exitosa (200 OK):**
```json
{
  "accounts": [
    { "name": "Dropi Logística" },
    { "name": "Seguimiento - Dropi Proveedores" }
  ]
}
```

---

### 8. Métricas por Cuenta
Obtiene el resumen operativo y desglose por proceso de una cuenta específica.

* **Ruta:** `GET /api/account/:name`
* **Path Parameters:**
  | Parámetro | Tipo | Descripción |
  |---|---|---|
  | `name` | String | Nombre de la cuenta (ej. `Dropi CO Main`) |
* **Query Parameters:** `from`, `to`, `limit`, `offset`
* **Respuesta Exitosa (200 OK):**
```json
{
  "kpis": {
    "processed": 45000,
    "delivered": 43200,
    "rate": 96.0,
    "cost": 380.50,
    "sema": "green"
  },
  "processes": [
    {
      "name": "Logística (Garantías) - Proveedores",
      "process": "Logística (Garantías) - Proveedores",
      "processed": 149,
      "delivered": 145,
      "failed": 2,
      "rate": 97.3,
      "cost": 1.21,
      "sema": "green"
    }
  ],
  "worklist": {
    "total": 12,
    "limit": 10,
    "offset": 0,
    "rows": [
      {
        "phone": "+573119876543",
        "contactId": "ct_abc123",
        "process": "Confirmación de Órdenes",
        "reason": "Número no registrado en WhatsApp",
        "date": "2026-07-27"
      }
    ]
  }
}
```

---

## ⚠️ Esquema Estándar de Errores

### 1. Error de Validación (400 Bad Request)
Generado por el middleware de **Zod** cuando los datos enviados no cumplen el contrato:

```json
{
  "error": "Parámetros inválidos",
  "details": [
    {
      "field": "from",
      "message": "\"from\" no puede ser mayor que \"to\""
    }
  ]
}
```

### 2. Exceso de Peticiones (429 Too Many Requests)
Generado por `express-rate-limit` al superar 60 peticiones/minuto:

```json
{
  "error": "Demasiadas peticiones. Por favor intente más tarde."
}
```

### 3. Ruta no Encontrada (404 Not Found)
```json
{
  "error": "Ruta no encontrada"
}
```

### 4. Error Interno del Servidor (500 Internal Server Error)
```json
{
  "error": "Error interno del servidor"
}
```

---

## ⚙️ Variables de Entorno y Configuración

El servidor valida las variables de entorno al iniciar mediante Zod ([env.js](file:///C:/Users/Osman/Documents/Trabajo/Dropi/Comercial/Dashboard/server/src/config/env.js)). Si falta una variable requerida, la aplicación se detiene inmediatamente (Fail-Fast).

| Variable | Tipo | Requerida | Valor por Defecto | Descripción |
|---|---|---|---|---|
| `PORT` | Number | No | `3000` | Puerto HTTP del servidor |
| `NODE_ENV` | String | No | `development` | Entorno (`development` / `production`) |
| `PG_HOST` | String | **Sí** | - | Host de la base de datos PostgreSQL |
| `PG_PORT` | Number | No | `5432` | Puerto de PostgreSQL |
| `PG_DB` | String | **Sí** | - | Nombre de la base de datos |
| `PG_USER` | String | **Sí** | - | Usuario de la base de datos |
| `PG_PASSWORD` | String | **Sí** | - | Contraseña de PostgreSQL |
| `PG_SSL` | Boolean | No | `false` | Activa conexión SSL para Postgres |
| `CACHE_TTL_SECONDS` | Number | No | `60` | Tiempo de vida de la memoria caché |

---

*Documentación mantenida automáticamente y actualizada para el equipo de desarrollo de Dropi LatAm.*
