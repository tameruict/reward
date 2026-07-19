"use strict";

class EventHub {
  constructor() {
    this.clients = new Set();
  }

  add(res) {
    this.clients.add(res);
    res.write(`event: ready\ndata: ${JSON.stringify({ connected: true, at: new Date().toISOString() })}\n\n`);
    return () => this.clients.delete(res);
  }

  emit(type, payload) {
    const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(message);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  close() {
    for (const client of this.clients) client.end();
    this.clients.clear();
  }
}

module.exports = { EventHub };
