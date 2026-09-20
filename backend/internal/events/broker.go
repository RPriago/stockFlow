package events

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// Event represents an SSE message with an event name and JSON payload
type Event struct {
	Name string
	Data any
}

// EventBroker manages active SSE client channels and broadcasts events
type EventBroker struct {
	mu      sync.RWMutex
	clients map[chan Event]struct{}
}

var (
	globalBroker *EventBroker
	once         sync.Once
)

// GetBroker returns the singleton EventBroker instance
func GetBroker() *EventBroker {
	once.Do(func() {
		globalBroker = &EventBroker{
			clients: make(map[chan Event]struct{}),
		}
	})
	return globalBroker
}

// AddClient registers a new SSE client channel
func (b *EventBroker) AddClient() chan Event {
	b.mu.Lock()
	defer b.mu.Unlock()
	ch := make(chan Event, 16)
	b.clients[ch] = struct{}{}
	return ch
}

// RemoveClient unregisters an SSE client channel
func (b *EventBroker) RemoveClient(ch chan Event) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if _, ok := b.clients[ch]; ok {
		delete(b.clients, ch)
		close(ch)
	}
}

// Broadcast sends an event to all connected SSE clients non-blockingly
func (b *EventBroker) Broadcast(name string, data any) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	ev := Event{Name: name, Data: data}
	for ch := range b.clients {
		select {
		case ch <- ev:
		default:
			// Skip slow or saturated clients to preserve real-time throughput
		}
	}
}

// ServeHTTP handles the SSE streaming loop with client disconnect detection and keep-alive heartbeats
func (b *EventBroker) ServeHTTP(c *gin.Context) {
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")

	ch := b.AddClient()
	defer b.RemoveClient(ch)

	// Send initial greeting event
	c.SSEvent("connected", gin.H{"status": "connected", "time": time.Now().UnixMilli()})
	c.Writer.Flush()

	clientGone := c.Request.Context().Done()
	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-clientGone:
			return
		case <-heartbeat.C:
			c.SSEvent("ping", gin.H{"time": time.Now().UnixMilli()})
			c.Writer.Flush()
		case ev, ok := <-ch:
			if !ok {
				return
			}
			c.SSEvent(ev.Name, ev.Data)
			c.Writer.Flush()
		}
	}
}
