package chaos_test

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type LatencyMetrics struct {
	Count        int
	Throughput   float64
	P50          time.Duration
	P90          time.Duration
	P95          time.Duration
	P99          time.Duration
	Max          time.Duration
	Min          time.Duration
	Mean         time.Duration
	ErrorCount   int64
	SuccessCount int64
}

func calculateMetrics(latencies []time.Duration, totalDuration time.Duration, errorCount, successCount int64) LatencyMetrics {
	if len(latencies) == 0 {
		return LatencyMetrics{}
	}

	sort.Slice(latencies, func(i, j int) bool {
		return latencies[i] < latencies[j]
	})

	var sum time.Duration
	for _, l := range latencies {
		sum += l
	}

	n := len(latencies)
	p50 := latencies[n*50/100]
	p90 := latencies[n*90/100]
	p95 := latencies[n*95/100]
	p99 := latencies[n*99/100]
	if n*99/100 >= n {
		p99 = latencies[n-1]
	}

	throughput := float64(n) / totalDuration.Seconds()

	return LatencyMetrics{
		Count:        n,
		Throughput:   throughput,
		P50:          p50,
		P90:          p90,
		P95:          p95,
		P99:          p99,
		Max:          latencies[n-1],
		Min:          latencies[0],
		Mean:         sum / time.Duration(n),
		ErrorCount:   errorCount,
		SuccessCount: successCount,
	}
}

func TestE2E_Performance_Audit_Comprehensive(t *testing.T) {
	router, _, prod, wh, loc, _, _, _, adminToken, _ := setupChaosTestEnvironment()

	endpoints := []struct {
		name        string
		method      string
		path        string
		body        string
		authHeader  string
		concurrency int
		totalReqs   int
	}{
		{
			name:        "GET /api/v1/products (Catalog Read)",
			method:      http.MethodGet,
			path:        "/api/v1/products",
			authHeader:  "Bearer " + adminToken,
			concurrency: 50,
			totalReqs:   1000,
		},
		{
			name:        "GET /api/v1/inventory (Inventory Listing)",
			method:      http.MethodGet,
			path:        "/api/v1/inventory",
			authHeader:  "Bearer " + adminToken,
			concurrency: 50,
			totalReqs:   1000,
		},
		{
			name:        "GET /api/v1/inventory/analytics/capacity (Analytics Aggregation)",
			method:      http.MethodGet,
			path:        "/api/v1/inventory/analytics/capacity",
			authHeader:  "Bearer " + adminToken,
			concurrency: 50,
			totalReqs:   1000,
		},
		{
			name:        "POST /api/v1/inventory/stock-in (Transactional Write)",
			method:      http.MethodPost,
			path:        "/api/v1/inventory/stock-in",
			body:        fmt.Sprintf(`{"product_id":"%s","warehouse_id":"%s","location_id":"%s","quantity":1,"reference_type":"po","reference_id":"PERF-PO-01"}`, prod.ID.Hex(), wh.ID.Hex(), loc.ID.Hex()),
			authHeader:  "Bearer " + adminToken,
			concurrency: 25,
			totalReqs:   500,
		},
		{
			name:        "POST /api/v1/auth/login (Bcrypt CPU Bound)",
			method:      http.MethodPost,
			path:        "/api/v1/auth/login",
			body:        `{"email":"admin@chaos.test","password":"AdminPass123!"}`,
			concurrency: 10,
			totalReqs:   100,
		},
	}

	fmt.Println("\n=========================================================================================================")
	fmt.Println("                       STOCKFLOW E2E PERFORMANCE BENCHMARK & LOAD PROFILE")
	fmt.Println("=========================================================================================================")
	fmt.Printf("%-35s | %6s | %10s | %9s | %9s | %9s | %9s | %10s\n",
		"Endpoint / Workflow", "Reqs", "Throughput", "p50", "p95", "p99", "Max", "Error Rate")
	fmt.Println("---------------------------------------------------------------------------------------------------------")

	for _, ep := range endpoints {
		latencies := make([]time.Duration, ep.totalReqs)
		var successCount, errorCount int64
		sem := make(chan struct{}, ep.concurrency)
		var wg sync.WaitGroup

		start := time.Now()

		for i := 0; i < ep.totalReqs; i++ {
			wg.Add(1)
			sem <- struct{}{}

			go func(idx int) {
				defer wg.Done()
				defer func() { <-sem }()

				var req *http.Request
				if ep.body != "" {
					req = httptest.NewRequest(ep.method, ep.path, bytes.NewBufferString(ep.body))
					req.Header.Set("Content-Type", "application/json")
				} else {
					req = httptest.NewRequest(ep.method, ep.path, nil)
				}
				if ep.authHeader != "" {
					req.Header.Set("Authorization", ep.authHeader)
				}
				req.Header.Set("X-Requested-With", "XMLHttpRequest")

				w := httptest.NewRecorder()

				t0 := time.Now()
				router.ServeHTTP(w, req)
				dur := time.Since(t0)

				latencies[idx] = dur

				if w.Code >= 200 && w.Code < 300 {
					atomic.AddInt64(&successCount, 1)
				} else {
					atomic.AddInt64(&errorCount, 1)
				}
			}(i)
		}

		wg.Wait()
		totalDuration := time.Since(start)

		m := calculateMetrics(latencies, totalDuration, errorCount, successCount)
		errRate := float64(errorCount) / float64(ep.totalReqs) * 100

		fmt.Printf("%-35s | %6d | %8.1f r/s | %9v | %9v | %9v | %9v | %9.1f%%\n",
			ep.name, ep.totalReqs, m.Throughput, m.P50, m.P95, m.P99, m.Max, errRate)
	}

	fmt.Println("=========================================================================================================")
}
