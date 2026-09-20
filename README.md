# StockFlow — Modern Real-Time Warehouse Management System

[![Go Version](https://img.shields.io/badge/Go-1.24+-00ADD8?style=flat-square&logo=go&logoColor=white)](https://golang.org)
[![Next.js](https://img.shields.io/badge/Next.js-16.3-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

[Live Demo](https://stock-flow-brown.vercel.app/) • [Architecture](#system-architecture) • [Workflows](#operational-workflows) • [Real-Time Sync](#real-time-event-synchronization) • [Benchmarks](#concurrency--chaos-benchmarks) • [Setup Guide](#local-setup)

---

## The Engineering Problem

Most open-source warehouse software treats inventory like a generic spreadsheet: a single mutable `quantity` column updated by raw `UPDATE` queries. In high-velocity environments where multiple floor workers pick, pack, and receive goods simultaneously, this approach inevitably causes race conditions, phantom inventory, overselling, and unallocated bin overflow.

StockFlow was engineered from the ground up to solve these specific distributed-state challenges:
1. **Zero Overselling Under Heavy Contention**: Atomic transactional checks verify real available balance before granting reservations or dispatches.
2. **Deterministic Auditability**: Physical quantities are tracked through an append-only double-entry ledger (`IN`, `OUT`, `ADJUST`, `RESERVE`, `TRANSFER`), ensuring every single unit on a shelf maps back to a specific order or manual reconciliation.
3. **Instant Multi-User State Synchronization**: When one warehouse associate completes a shipment or receives an intake pallet, all other associates' browser tabs immediately reflect the updated stock levels and KPI velocities without page reloads or polling bombardment.

---

## Core Capabilities

### 1. Hierarchical Storage & Bin Capacity Management
- **Five-tier Location Topology**: `Warehouse → Zone → Rack → Shelf → Bin`.
- **Dimensional & Physical Capacity Enforcement**: Storage bins enforce maximum unit quotas. Inbound allocations reject attempts to overfill bins, displaying exact remaining capacities in real time.
- **Visual Utilization Metrics**: Real-time bin occupancy bars and facility space tracking across multiple distributed logistics hubs.

### 2. Multi-User Real-Time Sync (Server-Sent Events)
- **Zero-Polling Event Stream**: A lightweight Go Gin broker (`/api/v1/events`) streams targeted `data_changed` events over long-lived HTTP connections using buffered Go channels.
- **Near-Zero Memory Footprint**: 2,000 active concurrent connections consume less than 4 MB of RAM (each connection runs inside a native ~2 KB Go goroutine with no polling database queries).
- **Thundering-Herd Shielding**: When multiple clients auto-refresh after an event, the backend's in-memory cache middleware serves the requests directly from RAM (`X-Cache: HIT`), preventing MongoDB Atlas connection starvation.
- **Automatic Resilience**: Auto-reconnect with exponential backoff and 20-second heartbeat pings keeps streams alive through reverse proxies and cloud firewalls.

### 3. Strict Inbound & Outbound State Machines
- **Purchase Order (PO) Lifecycle**: `Draft → Ordered → Received / Cancelled`.
  - Line-item tracking with supplier catalog linking.
  - Multi-bin receipt allocation: incoming goods can be received directly into designated warehouse bins with instant stock balance credit.
- **Sales Order (SO) Lifecycle**: `Draft → Confirmed → Picking → Packing → Shipped → Delivered / Cancelled`.
  - **Soft Stock Reservation**: Confirming an order locks inventory into a reserved state so subsequent orders cannot claim it.
  - **Auto-Release on Cancellation**: Cancelling an in-flight order immediately returns all reserved items to the available bin balances.

### 4. Dynamic KPI Velocity Engine & Comparative Analytics
- **5 Live Dashboard Metrics**:
  - `Total Catalog Products`: Net catalog growth percentage accounting for soft-deleted items.
  - `Total Stock on Hand`: Net balance delta derived from inbound vs. outbound physical movements.
  - `Low-Stock Alerts`: Immediate ratio of products at or below safety stock thresholds.
  - `Pending Inbound POs`: Active intake volume and velocity compared to previous period.
  - `Active Outbound Orders`: Dispatch queue volume and fulfillment rate.
- **Context-Aware Comparison Windows**: Automatically recalibrates metrics based on the active timeframe (`Today vs Yesterday`, `Last 7 Days vs Prev 7 Days`, `This Month vs Last Month`, `Last 30 Days vs Prev 30 Days`, `All Time vs Last Year`).
- **Audit-Safe Soft Deletion**: Deleted products retain historical metrics (`is_deleted`, `deleted_at`) to ensure baseline comparative calculations remain accurate over time.

### 5. Proactive Alerting & In-App Notification Center
- **Dynamic Unread Badge**: Live bell counter updating instantly when inventory drops below safety thresholds or order states transition.
- **Filterable Notification Drawer**: Filter by `All` or `Unread`, with batch mark-as-read, manual item deletion, and automated 72-hour TTL cleanup.
- **Direct Action Links**: One-click navigation directly to affected SKU details or order inspection screens.

### 6. Internationalization, Dark Mode & Responsive Design
- **Bilingual Engine**: Seamless instant switching between English (EN) and Bahasa Indonesia (ID) across every screen, modal, error message, and badge.
- **Flicker-Free Theme**: Dark and light modes backed by local storage and system preference detection with zero tab-switch glitching.
- **Screen-Adaptive UX**: Custom layouts tested down to narrow viewports (<340px width, including foldable devices like Samsung Galaxy Z Fold 5 cover screen). Notifications and action bars automatically adapt into centered bottom sheets and wrapped toolbars.

---

## System Architecture

%%{init: {'flowchart': {'curve': 'stepAfter'}}}%%
flowchart TD
    subgraph ClientLayer ["Client Layer (Next.js 16 App Router)"]
        UI["Web UI (Tailwind CSS v4)"]
        RTContext["RealtimeProvider (SSE EventSource)"]
        AuthContext["Auth & Role Context"]
        ApiClient["Fetch API Client"]
        UI --- RTContext
        UI --- AuthContext
        UI --> ApiClient
    end

    subgraph GatewayLayer ["Middleware & Security Layer"]
        CORS["CORS Handler"]
        AuthGuard["JWT Auth & RBAC Middleware"]
        CacheMW["In-Memory Cache (sync.RWMutex)"]
        CORS --> AuthGuard
        AuthGuard --> CacheMW
    end

    subgraph BackendCore ["Backend Engine (Go + Gin)"]
        Handlers["HTTP Handlers"]
        Broker["EventBroker (SSE Fan-out)"]
        Services["Domain Services (PO, SO, Inventory, Products)"]
        Repos["Repository Layer"]
        Handlers --> Services
        Services --> Repos
        Services --> Broker
    end

    subgraph StorageLayer ["Persistence Layer"]
        MongoDB[("MongoDB Atlas")]
        MemStore[("In-Memory Fallback Store")]
        Repos -. Production .-> MongoDB
        Repos -. Testing/Offline .-> MemStore
    end

    ApiClient -->|"HTTP REST API"| GatewayLayer
    RTContext <-->|"SSE Stream /api/v1/events"| Broker
    CacheMW -->|"Cache Miss or Mutation"| Handlers
    CacheMW -.->|"Cache Hit (0.8ms)"| ApiClient

---

## Operational Workflows

### Procurement & Fulfillment Flow

%%{init: {'flowchart': {'curve': 'stepAfter'}}}%%
flowchart LR
    subgraph INBOUND ["1. Inbound Procurement"]
        PO1["Create PO (Draft)"] --> PO2["Send to Supplier (Ordered)"]
        PO2 --> PO3["Goods Receipt & QC"]
        PO3 --> PO4["Bin Assignment & Capacity Check"]
    end

    subgraph CORE ["2. Inventory Balance & Ledger"]
        PO4 -->|"Stock IN (+Qty)"| BAL[("Physical Inventory Balance")]
        BAL --- LEDGER[("Movement Audit Ledger")]
        BAL -->|"Stock Reservation"| SO2
    end

    subgraph OUTBOUND ["3. Outbound Order Fulfillment"]
        SO1["Sales Order Created (Draft)"] --> SO2["Confirm Order & Reserve Stock"]
        SO2 --> SO3["Warehouse Picking"]
        SO3 --> SO4["Packing & Verification"]
        SO4 --> SO5["Carrier Dispatch (Shipped)"]
        SO5 --> SO6["Delivered to Customer"]
    end

---

## Real-Time Event Synchronization

%%{init: {'flowchart': {'curve': 'stepAfter'}}}%%
flowchart TD
    subgraph UserA ["User A (Browser 1)"]
        ActionA["Mutates Data (Add Product / Inbound PO / Bin Move)"]
    end

    subgraph Backend ["StockFlow Backend (Go)"]
        API["POST / PUT / DELETE Endpoint"]
        CacheLayer["CacheMiddleware (Invalidate Cache Entry)"]
        Broker["EventBroker (Broadcast Channel)"]
        API --> CacheLayer
        CacheLayer -->|"On 2xx Success"| Broker
    end

    subgraph Clients ["Connected Clients (SSE Stream)"]
        ClientB["User B (Products Page)"]
        ClientC["User C (Inventory Page)"]
        ClientD["User D (Dashboard KPIs)"]
        Broker -->|"SSE data_changed: products"| ClientB
        Broker -->|"SSE data_changed: inventory"| ClientC
        Broker -->|"SSE data_changed: any"| ClientD
    end

    subgraph ClientSync ["Client Auto-Refresh (Zero Polling)"]
        RefetchB["Selective Background Fetch"]
        RefetchC["Selective Background Fetch"]
        RefetchD["Recalculate KPI Velocities"]
        ClientB --> RefetchB
        ClientC --> RefetchC
        ClientD --> RefetchD
    end

    ActionA -->|"HTTP Mutation"| API

---

## Role-Based Access Matrix

StockFlow implements strict role boundaries verified at both the API route middleware and frontend UI navigation levels:

| Feature / Module | Super Admin | Warehouse Manager | Warehouse Staff |
| :--- | :---: | :---: | :---: |
| **System Settings & User Provisioning** | Full Access | No Access | No Access |
| **Warehouse & Bin Creation** | Full Access | Full Access | Read Only |
| **Product Catalog & Pricing** | Full Access | Full Access | Read Only |
| **Stock-In Operations** | Full Access | Full Access | Full Access |
| **Stock-Out Operations** | Full Access | Full Access | Full Access |
| **Manual Stock Adjustments** | Full Access | Full Access | No Access |
| **PO Creation & Supplier Management** | Full Access | Full Access | Read Only |
| **PO Goods Intake (Receiving)** | Full Access | Full Access | Full Access |
| **SO Creation & Approval** | Full Access | Full Access | Read Only |
| **Order Picking, Packing & Shipping** | Full Access | Full Access | Full Access |
| **Dashboard Analytics & Velocity Reports** | Full Access | Full Access | Summary Only |

---

## In-Memory Caching Strategy

Rather than adding external Redis infrastructure overhead for modest single-node or containerized deployments, StockFlow includes a custom, lock-striped in-memory cache (`backend/internal/middleware/cache.go`):

- **Read Scalability**: Uses `sync.RWMutex` so concurrent read operations execute completely non-blocking.
- **Targeted Auto-Invalidation**: When any mutating request (`POST`, `PUT`, `DELETE`, `PATCH`) succeeds with a `2xx` status code, the middleware automatically purges the specific cache partition associated with that resource family (`products`, `inventory`, `warehouses`, `purchase-orders`, `sales-orders`).
- **Zero-Stale Guarantees**: Mutations immediately evict cached reads before the response completes, guaranteeing the next fetch retrieves fresh state.
- **Transparent Bypass**: Authentication endpoints, health checks, and SSE streams (`/api/v1/events`) bypass the caching layer entirely.

---

## Concurrency & Chaos Benchmarks

Stress and race-condition tests were executed using the integrated chaos testing suite (`backend/cmd/chaos/main.go`):

| Test Scenario | Load Pattern | Recorded Outcome |
| :--- | :--- | :--- |
| **Read Throughput** | 2,000 concurrent HTTP GET requests | 100% success rate, 0.85 ms average latency (served via in-memory cache) |
| **High Contention Overselling** | 50 concurrent buyers competing for exactly 5 remaining units | Exactly 5 orders confirmed, 45 requests cleanly rejected with HTTP 400. Stock balance remained exactly 0 with zero negative balances |
| **Database Failure Resilience** | Simulated MongoDB Atlas network drop | Automatically fails over to in-memory storage engine; system operations continued without process termination |
| **Malformed Auth Flooding** | 500 simultaneous forged JWT tokens | 100% rejected with HTTP 401 in <0.2 ms per request |
| **Race Detector Verification** | Full test suite run via `go test -race -v ./...` | 0 data races detected across all services, brokers, and middleware |

*Note: Benchmarks reflect local execution runs on Apple Silicon (M-series); production figures may vary based on cloud network latency and host resources.*

---

## Tech Stack

### Backend
- **Go 1.24+** — Core runtime providing native concurrency and minimal memory footprint
- **Gin Web Framework** — High-performance HTTP routing and native SSE streaming
- **MongoDB Go Driver** — Official driver configured with replica set connection pooling
- **golang-jwt/jwt/v5 & bcrypt** — Cryptographic authentication and salted password hashing

### Frontend
- **Next.js 16.3** — App Router architecture with React Server Components
- **TypeScript 5.0+** — Strict type safety across all data contracts and API models
- **Tailwind CSS v4** — Modern utility-first styling with optimized build compilation
- **Lucide React** — Consistent, accessible interface iconography

---

## Local Setup

### Prerequisites
- **Go 1.24+** installed locally ([golang.org](https://golang.org))
- **Node.js 20.x+** and **npm** ([nodejs.org](https://nodejs.org))
- A running **MongoDB** instance (local instance or MongoDB Atlas URI) — *or use in-memory mode without any DB setup*

### 1. Clone the Repository
```bash
git clone https://github.com/RPriago/stockFlow.git
cd stockFlow
```

### 2. Backend Setup
```bash
cd backend
cp .env.example .env
```

Configure `backend/.env`:
```env
PORT=8080
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/?retryWrites=true&w=majority
DB_NAME=stockflow
JWT_SECRET=your_super_secret_jwt_key_min_32_chars
USE_IN_MEMORY_DB=false    # Set to true to test locally without MongoDB
CORS_ORIGIN=http://localhost:3000
```

Run the backend server:
```bash
go run cmd/api/main.go
```

### 3. Frontend Setup
In a separate terminal:
```bash
cd frontend
cp .env.local.example .env.local
```

Configure `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
```

Install dependencies and start the Next.js development server:
```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Initial Administrator Seed Account
On its very first launch against a clean database, StockFlow automatically provisions an initial Super Admin account:
- The system prints the generated temporary credentials **once to the server console log**.
- Log in using those credentials, immediately navigate to **Team Management** (`/users`), and update your password.

---

## Production Deployment

- **Frontend**: Continuously deployed on [Vercel](https://vercel.com)
- **Backend**: Containerized and hosted on [Render](https://render.com)
- **Database**: [MongoDB Atlas](https://www.mongodb.com/atlas) with multi-region replication

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
