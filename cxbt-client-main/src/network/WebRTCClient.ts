export class WebRTCClient {
  private gameWs!: WebSocket;
  private gameUrl: string;
  private onReadyCallback?: () => void;
  private closedByApp = false;
  private reconnectTimer: number | null = null;
  private pendingQueue: string[] = [];
  public onMessage?: (msg: any) => void;

  constructor(gameUrl: string, _signalingUrl?: string, onReady?: () => void) {
    this.gameUrl = gameUrl;
    this.onReadyCallback = onReady;
    this.connect();
  }

  private connect() {
    if (this.closedByApp) return;
    try {
      this.gameWs = new WebSocket(this.gameUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.gameWs.onopen = () => {
      while (this.pendingQueue.length > 0 && this.gameWs.readyState === WebSocket.OPEN) {
        const payload = this.pendingQueue.shift();
        if (payload) this.gameWs.send(payload);
      }
      if (this.onReadyCallback) this.onReadyCallback();
    };

    this.gameWs.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (this.onMessage) this.onMessage(msg);
      } catch (err) {
        console.error('WebSocket message parsing error:', err);
      }
    };

    this.gameWs.onclose = () => {
      if (!this.closedByApp) {
        this.scheduleReconnect();
      }
    };

    this.gameWs.onerror = () => {
      // onclose will handle reconnection
    };
  }

  private scheduleReconnect() {
    if (this.closedByApp || this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 600);
  }

  sendJSON(obj: any) {
    const raw = JSON.stringify(obj);
    if (this.gameWs && this.gameWs.readyState === WebSocket.OPEN) {
      this.gameWs.send(raw);
    } else if (!this.closedByApp && obj?.type !== 'sync') {
      if (this.pendingQueue.length < 32) {
        this.pendingQueue.push(raw);
      }
    }
  }

  sendMove(
    userId: number | string,
    x: number,
    y: number,
    z: number,
    yaw: number,
    sequence: number,
    extra?: Record<string, any>
  ) {
    this.sendJSON({
      type: 'sync',
      userId,
      x,
      y,
      z,
      yaw,
      sequence,
      ...(extra || {}),
    });
  }

  close() {
    this.closedByApp = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.gameWs?.close();
    } catch {}
  }
}

