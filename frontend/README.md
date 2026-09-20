# StockFlow — Frontend Client

This is the user-facing web application for StockFlow, built with **Next.js 16 (App Router)**, **TypeScript**, and **Tailwind CSS v4**. It interfaces directly with the Go backend to deliver real-time inventory management across all devices.

---

## Architecture & Design Principles

1. **Real-Time Push Synchronization (SSE)**:
   - Centrally managed via [`src/context/RealtimeContext.tsx`](src/context/RealtimeContext.tsx).
   - Establishes a persistent browser `EventSource` connection to `${NEXT_PUBLIC_API_URL}/events?token=<jwt>`.
   - Dispatches decoupled custom browser events (`stockflow-sync`, `stockflow-notification-refresh`) to active pages without prop drilling.
   - Equipped with automated reconnection backoff and token refresh awareness.

2. **Adaptive Mobile-First Design**:
   - Engineered to render cleanly across all screen sizes, including ultra-narrow viewports (<340px width like Samsung Galaxy Z Fold 5 cover screens).
   - Features responsive floating popovers that automatically switch to centered, padded bottom sheets on mobile devices.
   - Touch-friendly action buttons and scrollable pill navigation for category filtering.

3. **Bilingual Localization (EN / ID)**:
   - Powered by [`src/context/LanguageContext.tsx`](src/context/LanguageContext.tsx).
   - Provides instantaneous switching between English and Bahasa Indonesia across all UI components, status badges, and error toasts.

4. **Flicker-Free Theme Engine**:
   - Smooth light/dark mode transitions adhering to system preferences and persistent user selection with zero tab-switching artifacts.

---

## Directory Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js 16 App Router pages
│   │   ├── dashboard/          # Analytics & KPI velocity metrics
│   │   ├── products/           # Product catalog, categories, barcodes & variants
│   │   ├── warehouses/         # Facilities, bin locations & capacity tracking
│   │   ├── inventory/          # Stock-in, stock-out, adjust & ledger trail
│   │   ├── purchase-orders/    # Inbound procurement lifecycle & receiving
│   │   ├── outbound-orders/    # Sales orders, soft reservation & fulfillment
│   │   ├── users/              # User management & role assignment
│   │   ├── login/              # Authentication entrypoint
│   │   └── layout.tsx          # Root layout with global providers
│   ├── components/             # Reusable UI components
│   │   ├── Navbar.tsx          # Responsive navbar with search, notifications & language switch
│   │   ├── Sidebar.tsx         # Mobile drawer & desktop navigation sidebar
│   │   └── DashboardLayout.tsx # Protected application wrapper
│   ├── context/                # Global state providers
│   │   ├── AuthContext.tsx     # Session management & RBAC state
│   │   ├── LanguageContext.tsx # Bilingual translation engine
│   │   └── RealtimeContext.tsx # Server-Sent Events client broker
│   └── lib/                    # API clients and utilities
│       └── api.ts              # Axios/Fetch wrapper with credentials & interceptors
├── public/                     # Static assets
├── package.json
└── tailwind.config.ts
```

---

## Getting Started

### 1. Environment Configuration

Create a local environment file from the template:

```bash
cp .env.local.example .env.local
```

Set the backend API endpoint in `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Development Server

```bash
npm run dev
```

The application will be accessible at [http://localhost:3000](http://localhost:3000).

---

## Production Build & Verification

To verify TypeScript types and generate production-optimized static routes:

```bash
npm run build
```

To run ESLint checks:

```bash
npm run lint
```
