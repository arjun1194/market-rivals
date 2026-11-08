// WebSocket client with automatic reconnect. The session token survives page reloads,
// so a refreshed tab rejoins the same seat.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
export { store };

export class Net {
  constructor(handlers) {
    this.handlers = handlers;
    this.token = store.get('mr-token');
    this.queue = [];
    this.connect();
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}`);
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'hello', token: this.token }));
      this.handlers.open?.();
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'welcome') {
        this.token = msg.token;
        store.set('mr-token', msg.token);
        for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
      }
      this.handlers[msg.t]?.(msg);
    };
    ws.onclose = () => {
      this.handlers.close?.();
      setTimeout(() => this.connect(), 1500);
    };
  }

  send(msg) {
    if (this.ws?.readyState === 1 && this.token) this.ws.send(JSON.stringify(msg));
    else this.queue.push(msg);
  }
}
