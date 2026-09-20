# StockFlow — Backend API Engine

The core Go service powering StockFlow's real-time warehouse management system. Built with **Go 1.24+** and **Gin**, featuring in-memory cache striping, native Server-Sent Events (SSE) broadcasting, and transaction-safe concurrency control against race conditions and overselling.

---

## Architecture Overview

The backend follows a strict layered architecture:

- **`cmd/api/`**: Main entrypoint initializing configuration, MongoDB Atlas connection pooling, routes, and middleware.
- **`cmd/chaos/`**: Concurrency benchmarking and fault-injection test suite (2,000 requests, 50-buyer inventory contention).
- **`internal/events/`**: Non-blocking `EventBroker` managing SSE client connections, channel fan-out, and 20s heartbeat pings.
- **`internal/middleware/`**: JWT auth & RBAC guards, CORS, and an in-memory cache middleware (`sync.RWMutex`) with automated cache eviction on mutations.
- **`internal/service/`**: Domain business logic (PO & SO lifecycles, bin capacity calculations, inventory ledger).
- **`internal/repository/`**: Data access layer supporting both MongoDB Atlas and an in-memory test store.

---

## Directory Structure

```
backend/
├── cmd/
│   ├── api/          # Application entrypoint
│   └── chaos/        # Concurrency & chaos testing suite
├── internal/
│   ├── config/       # Environment & configuration parsing
│   ├── database/     # MongoDB driver initialization & health checks
│   ├── events/       # Server-Sent Events broker & fan-out engine
│   ├── handler/      # HTTP controllers (JSON handlers)
│   ├── middleware/   # JWT, RBAC, and in-memory cache middleware
│   ├── models/       # Data structures & MongoDB schemas
│   ├── repository/   # Persistence layer interfaces & implementations
│   ├── service/      # Transactional business logic
│   └── utils/        # JWT utilities, hashing & response helpers
├── Dockerfile        # Production container build
├── go.mod
└── go.sum
```

---

## Environment Variables

Copy the sample environment file:

```bash
cp .env.example .env
```

| Key                | Default                 | Description                                           |
| :----------------- | :---------------------- | :---------------------------------------------------- |
| `PORT`             | `8080`                  | HTTP port to listen on                                |
| `MONGO_URI`        | —                       | MongoDB Atlas connection URI                          |
| `DB_NAME`          | `stockflow`             | Target database name                                  |
| `JWT_SECRET`       | —                       | Cryptographic secret for signing tokens               |
| `USE_IN_MEMORY_DB` | `false`                 | Enable fallback in-memory store for offline dev/tests |
| `CORS_ORIGIN`      | `https://stock-flow-brown.vercel.app` | Allowed frontend CORS origins                         |

---

## Running the Backend

### Local Development

```bash
go run cmd/api/main.go
```

### Running Tests

Execute the comprehensive test suite with the race detector enabled:

```bash
go test -v -race ./...
```

### Running Chaos & Load Tests

Verify system resilience against overselling and high concurrent load:

```bash
go run cmd/chaos/main.go
```
