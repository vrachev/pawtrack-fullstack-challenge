type EventHandler = (data: any) => void;

class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();

  public on(event: string, handler: EventHandler): void {
    const existing = this.handlers.get(event) || [];
    existing.push(handler);
    this.handlers.set(event, existing);
  }

  public emit(event: string, data: any): void {
    const handlers = this.handlers.get(event) || [];
    for (const handler of handlers) {
      handler(data);
    }
  }
}

export const eventBus = new EventBus();

// Log events in development
eventBus.on('booking.created', (data) => {
  console.log(`[event] booking.created: ${data.bookingId}`);
});

eventBus.on('booking.statusChanged', (data) => {
  console.log(`[event] booking.statusChanged: ${data.bookingId} -> ${data.newStatus}`);
});
