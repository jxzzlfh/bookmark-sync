# WebSocket Keepalive Patterns for Extensions

## Service Worker Lifecycle Challenge

Chrome extension service workers are terminated after ~30 seconds of inactivity. WebSocket connections help keep them alive since Chrome 116+.

## Keepalive Strategy

### Basic Ping/Pong

```typescript
const PING_INTERVAL = 20_000; // 20 seconds (under 30s timeout)

class ExtensionWebSocket {
  private ws: WebSocket | null = null;
  private pingInterval: number | null = null;
  private reconnectTimeout: number | null = null;
  private reconnectDelay = 1000;

  constructor(private serverUrl: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.onopen = () => {
        console.log('Connected to sync server');
        this.reconnectDelay = 1000; // Reset on successful connect
        this.startPing();
        resolve();
      };

      this.ws.onclose = (event) => {
        console.log('Connection closed:', event.code, event.reason);
        this.stopPing();
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'ping', timestamp: Date.now() });
      }
    }, PING_INTERVAL);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      console.log(`Reconnecting in ${this.reconnectDelay}ms...`);
      this.connect().catch(() => {
        // Exponential backoff with max 30 seconds
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
      });
    }, this.reconnectDelay);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(data: unknown): void {
    if (this.isConnected()) {
      this.ws!.send(JSON.stringify(data));
    }
  }

  private handleMessage(raw: string): void {
    try {
      const data = JSON.parse(raw);
      
      if (data.type === 'pong') {
        // Server acknowledged our ping
        return;
      }

      // Dispatch to message handlers
      this.onMessage?.(data);
    } catch (e) {
      console.error('Failed to parse message:', e);
    }
  }

  onMessage?: (data: unknown) => void;

  disconnect(): void {
    this.stopPing();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.ws?.close(1000, 'Client disconnect');
    this.ws = null;
  }
}
```

## Server-Side Implementation

### Node.js with ws library

```typescript
import { WebSocketServer, WebSocket } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

const HEARTBEAT_INTERVAL = 30_000;
const CLIENT_TIMEOUT = 60_000;

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  lastActivity: number;
}

wss.on('connection', (ws: ExtendedWebSocket) => {
  ws.isAlive = true;
  ws.lastActivity = Date.now();

  ws.on('message', (data) => {
    ws.lastActivity = Date.now();
    
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        return;
      }

      // Handle other messages
      handleClientMessage(ws, message);
    } catch (e) {
      console.error('Invalid message:', e);
    }
  });

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Server-initiated heartbeat
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    const extWs = ws as ExtendedWebSocket;
    
    if (!extWs.isAlive) {
      console.log('Terminating inactive client');
      return ws.terminate();
    }

    extWs.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

wss.on('close', () => {
  clearInterval(heartbeat);
});
```

## Connection State Management

### Handling Browser Sleep/Wake

```typescript
// Detect when browser wakes from sleep
let lastCheck = Date.now();

setInterval(() => {
  const now = Date.now();
  const elapsed = now - lastCheck;
  
  // If more than 2x the interval passed, browser likely slept
  if (elapsed > PING_INTERVAL * 2) {
    console.log('Detected wake from sleep, reconnecting...');
    wsManager.reconnect();
  }
  
  lastCheck = now;
}, PING_INTERVAL);
```

### Offline Detection

```typescript
// Check network status before reconnecting
async function canReachServer(url: string): Promise<boolean> {
  try {
    const response = await fetch(url.replace('wss:', 'https:').replace('ws:', 'http:') + '/health', {
      method: 'HEAD',
      mode: 'no-cors'
    });
    return true;
  } catch {
    return false;
  }
}

// In reconnect logic
if (await canReachServer(this.serverUrl)) {
  this.connect();
} else {
  // Schedule retry with longer delay
  this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60_000);
  this.scheduleReconnect();
}
```

## Best Practices

1. **Ping interval**: Keep under 30 seconds (20s recommended)
2. **Exponential backoff**: Start at 1s, max 30s for reconnects
3. **Server heartbeat**: Server should also check client liveness
4. **Graceful disconnect**: Send close frame with reason code
5. **Message queuing**: Queue messages during reconnection
6. **State recovery**: Request full sync after reconnection

## Message Queue During Disconnect

```typescript
class QueuedWebSocket extends ExtensionWebSocket {
  private messageQueue: unknown[] = [];
  private maxQueueSize = 100;

  send(data: unknown): void {
    if (this.isConnected()) {
      super.send(data);
    } else {
      if (this.messageQueue.length < this.maxQueueSize) {
        this.messageQueue.push(data);
      }
    }
  }

  protected onReconnected(): void {
    // Flush queued messages
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift();
      super.send(message);
    }
  }
}
```
