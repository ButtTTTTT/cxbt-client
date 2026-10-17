export class WebRTCClient {
  private gameWs: WebSocket; // Game events
  public onMessage?: (msg: any) => void;

  constructor(gameUrl: string, _signalingUrl?: string, onReady?: () => void) {
    this.gameWs = new WebSocket(gameUrl);
    
    this.gameWs.onopen = () => {
      console.log('Game WebSocket opened!');
      if (onReady) onReady();
    };

    // Game WS handles game logic events from Redis
    this.gameWs.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (this.onMessage) this.onMessage(msg);
      } catch (err) {
        console.error('WebSocket message parsing error:', err);
      }
    };
  }
  
  sendJSON(obj: any) {
    if (this.gameWs.readyState === WebSocket.OPEN) {
      this.gameWs.send(JSON.stringify(obj));
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
    this.gameWs.close();
  }
}

