package events

import (
	"testing"
	"time"
)

func TestEventBroker(t *testing.T) {
	broker := GetBroker()
	if broker == nil {
		t.Fatal("expected non-nil broker")
	}

	ch := broker.AddClient()
	if ch == nil {
		t.Fatal("expected non-nil client channel")
	}

	testData := map[string]string{"message": "product created"}
	broker.Broadcast("data_changed", testData)

	select {
	case ev := <-ch:
		if ev.Name != "data_changed" {
			t.Errorf("expected event Name 'data_changed', got '%s'", ev.Name)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for broadcast event")
	}

	broker.RemoveClient(ch)

	// After removal, broadcasting should not panic or block
	broker.Broadcast("data_changed", testData)
}
