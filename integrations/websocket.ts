import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { acceptWebSocket, WebSocket } from "https://deno.land/std@0.177.0/ws/mod.ts";
import { Application } from "oak";
import { logger } from "../utils/logger.ts";
import { getEnv } from "../src/config/environment.ts";
import { getCache, setCache } from "../src/config/redis.ts";

// WebSocket client connection with metadata
interface WebSocketClient {
  id: string;
  socket: WebSocket;
  userId?: string;
  sessionId?: string;
  connectedAt: number;
  meta: Record<string, unknown>;
}

/**
 * WebSocket service for real-time communication
 */
export class WebSocketService {
  private clients: Map<string, WebSocketClient> = new Map();
  private channels: Map<string, Set<string>> = new Map();
  private heartbeatInterval: number;
  private wsPort: number;
  private heartbeatIntervalId?: number;
  private isRunning: boolean = false;

  constructor(options = { heartbeatIntervalMs: 30000 }) {
    this.heartbeatInterval = options.heartbeatIntervalMs;
    this.wsPort = parseInt(getEnv("WS_PORT", "8081"));
  }

  /**
   * Initialize the WebSocket server
   */
  public async initialize(app: Application): Promise<void> {
    try {
      // Start a separate WebSocket server
      this.startWebSocketServer();
      
      // In Oak, we handle WebSocket upgrades on specific paths
      app.use(async (ctx, next) => {
        if (ctx.request.url.pathname === "/ws") {
          if (!ctx.isUpgradable) {
            ctx.response.status = 400;
            ctx.response.body = "Bad Request";
            return;
          }
          
          // Upgrade the connection to WebSocket
          const socket = await ctx.upgrade();
          this.handleConnection(socket, ctx.request.url.search);
          return;
        }
        
        await next();
      });
      
      // Start heartbeat for connection monitoring
      this.startHeartbeat();
      
      logger.info(`WebSocket server initialized on port ${this.wsPort}`);
    } catch (error) {
      logger.error("Failed to initialize WebSocket server:", error);
      throw error;
    }
  }
  
  /**
   * Start a standalone WebSocket server
   */
  private async startWebSocketServer(): Promise<void> {
    if (this.isRunning) return;
    
    try {
      this.isRunning = true;
      
      const handler = async (req: Request): Promise<Response> => {
        if (req.headers.get("upgrade") === "websocket") {
          try {
            const { socket, response } = Deno.upgradeWebSocket(req);
            
            // Handle WebSocket connection
            socket.onopen = () => {
              const url = new URL(req.url);
              this.handleConnection(socket, url.search);
            };
            
            return response;
          } catch (err) {
            logger.error("WebSocket upgrade error:", err);
            return new Response("WebSocket upgrade failed", { status: 400 });
          }
        }
        
        return new Response("Not a WebSocket request", { status: 400 });
      };
      
      // Start the WebSocket server
      serve(handler, { port: this.wsPort });
      
      logger.info(`Standalone WebSocket server started on port ${this.wsPort}`);
    } catch (error) {
      this.isRunning = false;
      logger.error("Failed to start WebSocket server:", error);
      throw error;
    }
  }

  /**
   * Handle new WebSocket connections
   */
  private handleConnection(socket: WebSocket, search?: string): void {
    const clientId = crypto.randomUUID();
    
    // Parse connection parameters from search string
    const params = search ? new URLSearchParams(search.substring(1)) : new URLSearchParams();
    const userId = params.get("userId") || undefined;
    const sessionId = params.get("sessionId") || undefined;
    
    // Add client to connection pool
    const client: WebSocketClient = {
      id: clientId,
      socket,
      userId,
      sessionId,
      connectedAt: Date.now(),
      meta: {}
    };
    
    this.clients.set(clientId, client);
    
    logger.info(`WebSocket client connected: ${clientId} (total: ${this.clients.size})`);

    // Setup message handler
    socket.onmessage = (event) => {
      this.handleMessage(client, typeof event.data === 'string' ? event.data : '');
    };

    // Setup close handler
    socket.onclose = () => {
      this.handleDisconnect(clientId);
    };

    // Setup error handler
    socket.onerror = (error) => {
      logger.error(`WebSocket error for client ${clientId}:`, error);
      this.handleDisconnect(clientId);
    };

    // Send welcome message
    this.sendToClient(clientId, {
      type: "connection",
      id: clientId,
      timestamp: Date.now()
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(client: WebSocketClient, data: string): void {
    try {
      const message = JSON.parse(data);
      const { type } = message;

      switch (type) {
        case "subscribe":
          this.handleSubscribe(client, message);
          break;
          
        case "unsubscribe":
          this.handleUnsubscribe(client, message);
          break;
          
        case "message":
          this.handleClientMessage(client, message);
          break;
          
        case "pong":
          // Update client's last seen time
          client.meta.lastPong = Date.now();
          break;
          
        default:
          // Custom message handler or event emitter could be added here
          logger.debug(`Received message type ${type} from client ${client.id}`);
      }
    } catch (error) {
      logger.error(`Error handling WebSocket message from client ${client.id}:`, error);
    }
  }

  /**
   * Handle client subscription to a channel
   */
  private handleSubscribe(client: WebSocketClient, message: any): void {
    const { channel } = message;
    
    if (!channel) {
      this.sendToClient(client.id, {
        type: "error",
        message: "Missing channel parameter"
      });
      return;
    }

    // Get or create channel
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }

    // Add client to channel
    this.channels.get(channel)?.add(client.id);
    
    logger.debug(`Client ${client.id} subscribed to channel ${channel}`);
    
    // Confirm subscription
    this.sendToClient(client.id, {
      type: "subscribed",
      channel,
      timestamp: Date.now()
    });
  }

  /**
   * Handle client unsubscription from a channel
   */
  private handleUnsubscribe(client: WebSocketClient, message: any): void {
    const { channel } = message;
    
    if (!channel) {
      this.sendToClient(client.id, {
        type: "error",
        message: "Missing channel parameter"
      });
      return;
    }

    // Remove client from channel
    this.channels.get(channel)?.delete(client.id);
    
    // Remove channel if empty
    if (this.channels.get(channel)?.size === 0) {
      this.channels.delete(channel);
    }
    
    logger.debug(`Client ${client.id} unsubscribed from channel ${channel}`);
    
    // Confirm unsubscription
    this.sendToClient(client.id, {
      type: "unsubscribed",
      channel,
      timestamp: Date.now()
    });
  }

  /**
   * Handle client message relay
   */
  private handleClientMessage(client: WebSocketClient, message: any): void {
    const { channel, data } = message;
    
    if (!channel) {
      this.sendToClient(client.id, {
        type: "error",
        message: "Missing channel parameter"
      });
      return;
    }

    // Record message timestamp
    const timestamp = Date.now();
    
    // Relay message to channel
    this.broadcast(channel, {
      type: "message",
      channel,
      senderId: client.id,
      data,
      timestamp
    }, [client.id]);
    
    // Store message in Redis for persistence
    if (data) {
      const messageId = crypto.randomUUID();
      const cacheKey = `ws:channel:${channel}:msg:${messageId}`;
      
      setCache(cacheKey, JSON.stringify({
        id: messageId,
        channel,
        senderId: client.id,
        data,
        timestamp
      }), 86400); // TTL 24 hours
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove client from all channels
    for (const [channel, clients] of this.channels.entries()) {
      if (clients.has(clientId)) {
        clients.delete(clientId);
        
        // Remove channel if empty
        if (clients.size === 0) {
          this.channels.delete(channel);
        } else {
          // Notify other clients about the disconnect
          this.broadcast(channel, {
            type: "user_disconnect",
            userId: client.userId,
            clientId
          });
        }
      }
    }

    // Remove client from connection pool
    this.clients.delete(clientId);
    
    logger.info(`WebSocket client disconnected: ${clientId} (remaining: ${this.clients.size})`);
  }

  /**
   * Send message to a specific client
   */
  public sendToClient(clientId: string, data: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    try {
      client.socket.send(JSON.stringify(data));
      return true;
    } catch (error) {
      logger.error(`Error sending message to client ${clientId}:`, error);
      return false;
    }
  }

  /**
   * Broadcast message to all clients in a channel
   */
  public broadcast(
    channel: string,
    data: unknown,
    excludeClientIds: string[] = []
  ): void {
    const clients = this.channels.get(channel);
    if (!clients || clients.size === 0) return;

    const message = JSON.stringify(data);
    
    for (const clientId of clients) {
      if (excludeClientIds.includes(clientId)) continue;
      
      const client = this.clients.get(clientId);
      if (client) {
        try {
          client.socket.send(message);
        } catch (error) {
          logger.error(`Error broadcasting to client ${clientId}:`, error);
          // Consider removing problematic clients
        }
      }
    }
    
    logger.debug(`Broadcast message to ${clients.size - excludeClientIds.length} clients in channel ${channel}`);
  }

  /**
   * Broadcast message to all connected clients
   */
  public broadcastAll(data: unknown, excludeClientIds: string[] = []): void {
    const message = JSON.stringify(data);
    
    for (const [clientId, client] of this.clients.entries()) {
      if (excludeClientIds.includes(clientId)) continue;
      
      try {
        client.socket.send(message);
      } catch (error) {
        logger.error(`Error broadcasting to client ${clientId}:`, error);
      }
    }
    
    logger.debug(`Broadcast message to all ${this.clients.size - excludeClientIds.length} clients`);
  }

  /**
   * Start heartbeat to detect disconnected clients
   */
  private startHeartbeat(): void {
    // Use setInterval instead of direct timeout assignment
    this.heartbeatIntervalId = setInterval(() => {
      const now = Date.now();
      
      this.broadcastAll({ type: "ping", timestamp: now });
      
      // Check for stale connections
      for (const [clientId, client] of this.clients.entries()) {
        const lastPong = client.meta.lastPong as number || client.connectedAt;
        
        // If no pong received for 2x heartbeat interval, consider disconnected
        if (now - lastPong > this.heartbeatInterval * 2) {
          logger.info(`Client ${clientId} timed out, closing connection`);
          
          try {
            client.socket.close();
          } catch (error) {
            // Socket might already be closed
          }
          
          this.handleDisconnect(clientId);
        }
      }
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatIntervalId !== undefined) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = undefined;
    }
  }

  /**
   * Get channel history
   */
  public async getChannelHistory(channel: string, limit: number = 50): Promise<any[]> {
    try {
      const pattern = `ws:channel:${channel}:msg:*`;
      const messages = await getCache(pattern);
      
      if (!messages) return [];
      
      const history = Object.values(messages)
        .map(msg => JSON.parse(msg))
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-limit);
      
      return history;
    } catch (error) {
      logger.error(`Error getting channel history for ${channel}:`, error);
      return [];
    }
  }

  /**
   * Get client count
   */
  public getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get channel subscriptions
   */
  public getChannelSubscriptions(): Record<string, number> {
    const subscriptions: Record<string, number> = {};
    
    for (const [channel, clients] of this.channels.entries()) {
      subscriptions[channel] = clients.size;
    }
    
    return subscriptions;
  }

  /**
   * Close the WebSocket server
   */
  public close(): void {
    // Stop heartbeat
    this.stopHeartbeat();
    
    // Close all connections
    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.socket.close();
      } catch (error) {
        // Ignore errors on close
      }
    }
    
    // Clear maps
    this.clients.clear();
    this.channels.clear();
    this.isRunning = false;
    
    logger.info("WebSocket server closed");
  }
}