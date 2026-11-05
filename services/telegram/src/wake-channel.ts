import WebSocket from 'ws';

/** Wake notifications are hints, never job delivery. Subscribe before checking
 * the durable queue, then wait against that revision to avoid lost-wake races. */
export class WakeChannel {
  revision = 0;
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private keepalive?: ReturnType<typeof setInterval>;
  private listener?: () => void;
  private stopped = false;
  private retryMs = 1000;

  constructor(private url: string, private token: string, private signal: AbortSignal) {
    signal.addEventListener('abort', () => this.close(), { once: true });
    if (signal.aborted) this.close();
    else this.connect();
  }

  private notify() { this.revision++; this.listener?.(); }

  private connect() {
    if (this.stopped) return;
    const url = new URL(this.url);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = this.socket = new WebSocket(url, {
      headers: { Authorization: `Bearer ${this.token}` },
      handshakeTimeout: 15000, maxPayload: 4096, followRedirects: false,
    });
    let lastPong = Date.now();
    ws.on('open', () => {
      this.retryMs = 1000;
      console.log('[wake] Connected (hibernating WebSocket)');
      ws.send('ping');
      this.keepalive = setInterval(() => {
        if (Date.now() - lastPong > 75000) { ws.terminate(); return; }
        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
      }, 25000);
      this.notify(); // Recheck jobs that arrived before/reconnecting the socket.
    });
    ws.on('message', (data) => {
      if (data.toString() === 'pong') { lastPong = Date.now(); return; }
      try { if (JSON.parse(data.toString()).woken === true) this.notify(); }
      catch { /* Ignore malformed hints; bounded queue checks still recover. */ }
    });
    ws.on('error', () => { /* close handles retries; never log auth headers. */ });
    ws.on('close', () => {
      clearInterval(this.keepalive);
      this.notify();
      if (this.stopped) return;
      console.log('[wake] Disconnected; reconnecting with backoff');
      this.timer = setTimeout(() => this.connect(), this.retryMs + Math.random() * 1000);
      this.retryMs = Math.min(this.retryMs * 2, 60000);
    });
  }

  waitSince(revision: number, timeoutMs = 60000): Promise<void> {
    if (this.stopped || this.revision !== revision) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => { clearTimeout(timer); this.listener = undefined; resolve(); };
      const timer = setTimeout(finish, timeoutMs); // Runs on the Mac, never Cloudflare.
      this.listener = finish;
    });
  }

  close() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearInterval(this.keepalive);
    this.socket?.terminate();
    this.notify();
  }
}
