import { io, Socket } from "socket.io-client";

export interface PlayerData {
  id: string;
  x: number;
  y: number;
  direction?: string;
}

export type PlayerJoinCallback = (player: PlayerData) => void;
export type PlayerMoveCallback = (player: PlayerData) => void;
export type PlayerLeaveCallback = (playerId: string) => void;
export type AllPlayersCallback = (players: PlayerData[]) => void;

export class MultiplayerService {
  private socket: Socket | null = null;
  private serverUrl: string;
  private isConnected: boolean = false;
  private socketId: string | null = null;

  // Callbacks
  private onPlayerJoinCallbacks: PlayerJoinCallback[] = [];
  private onPlayerMoveCallbacks: PlayerMoveCallback[] = [];
  private onPlayerLeaveCallbacks: PlayerLeaveCallback[] = [];
  private onAllPlayersCallbacks: AllPlayersCallback[] = [];

  constructor(serverUrl: string = "http://localhost:3001") {
    this.serverUrl = serverUrl;
    console.log("MultiplayerService initialized with server URL:", this.serverUrl);
  }

  public connect(): void {
    if (this.socket?.connected) {
      console.log("Already connected to multiplayer server");
      return;
    }

    console.log("Attempting to connect to WebSocket server:", this.serverUrl);

    this.socket = io(this.serverUrl, {
      // Allow both polling and websocket - Socket.io will upgrade to websocket automatically
      transports: ["polling", "websocket"],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
    });

    this.socket.on("connect", () => {
      console.log("✓ Connected to multiplayer server:", this.serverUrl);
      console.log("✓ Transport:", this.socket?.io?.engine?.transport?.name);
      this.isConnected = true;
      if (this.socket) {
        this.socketId = this.socket.id || null;
        console.log("Socket ID:", this.socketId);
        console.log("Event listeners registered:", {
          allplayers: this.socket.hasListeners("allplayers"),
          newplayer: this.socket.hasListeners("newplayer"),
          move: this.socket.hasListeners("move"),
          remove: this.socket.hasListeners("remove"),
        });
      }
    });

    this.socket.on("connect_error", (error) => {
      console.error("✗ WebSocket connection error:", error.message);
      console.error("Server URL:", this.serverUrl);
      console.error("Error details:", error);
      this.isConnected = false;
    });

    this.socket.on("disconnect", (reason) => {
      console.log("Disconnected from multiplayer server. Reason:", reason);
      this.isConnected = false;
    });

    this.socket.on("reconnect_attempt", (attemptNumber) => {
      console.log(`Reconnection attempt ${attemptNumber}...`);
    });

    this.socket.on("reconnect", (attemptNumber) => {
      console.log(`✓ Reconnected after ${attemptNumber} attempts`);
      this.isConnected = true;
      if (this.socket) {
        this.socketId = this.socket.id || null;
        console.log("New Socket ID after reconnect:", this.socketId);
      }
      // Note: GameScene should re-register the player after reconnect
    });

    this.socket.on("reconnect_failed", () => {
      console.error("✗ Failed to reconnect to multiplayer server");
      this.isConnected = false;
    });

    this.socket.on("allplayers", (players: PlayerData[]) => {
      console.log("📥 Received 'allplayers' event:", players);
      console.log("📥 Number of callbacks registered:", this.onAllPlayersCallbacks.length);
      this.onAllPlayersCallbacks.forEach((callback) => {
        try {
          callback(players);
        } catch (error) {
          console.error("Error in allplayers callback:", error);
        }
      });
    });

    this.socket.on("newplayer", (player: PlayerData) => {
      console.log("📥 Received 'newplayer' event:", player);
      console.log("📥 Number of callbacks registered:", this.onPlayerJoinCallbacks.length);
      this.onPlayerJoinCallbacks.forEach((callback) => {
        try {
          callback(player);
        } catch (error) {
          console.error("Error in newplayer callback:", error);
        }
      });
    });

    this.socket.on("move", (player: PlayerData) => {
      console.log("📥 Received 'move' event:", player);
      console.log("📥 Number of callbacks registered:", this.onPlayerMoveCallbacks.length);
      this.onPlayerMoveCallbacks.forEach((callback) => {
        try {
          callback(player);
        } catch (error) {
          console.error("Error in move callback:", error);
        }
      });
    });

    this.socket.on("remove", (playerId: string) => {
      console.log("📥 Received 'remove' event:", playerId);
      console.log("📥 Number of callbacks registered:", this.onPlayerLeaveCallbacks.length);
      this.onPlayerLeaveCallbacks.forEach((callback) => {
        try {
          callback(playerId);
        } catch (error) {
          console.error("Error in remove callback:", error);
        }
      });
    });

    // Add a catch-all listener to see all events (for debugging)
    this.socket.onAny((eventName, ...args) => {
      console.log("🔔 Socket.io event received:", eventName, args);
    });
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  public sendMovement(x: number, y: number, direction?: string): void {
    if (this.socket?.connected) {
      this.socket.emit("move", { x, y, direction });
    }
  }

  public registerNewPlayer(x: number, y: number): void {
    if (this.socket?.connected) {
      this.socket.emit("newplayer", { x, y });
    }
  }

  public isConnectedToServer(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  public getSocketId(): string | null {
    return this.socketId;
  }

  // Callback registration methods
  public onPlayerJoin(callback: PlayerJoinCallback): void {
    this.onPlayerJoinCallbacks.push(callback);
    console.log("✓ Registered onPlayerJoin callback. Total:", this.onPlayerJoinCallbacks.length);
  }

  public onPlayerMove(callback: PlayerMoveCallback): void {
    this.onPlayerMoveCallbacks.push(callback);
    console.log("✓ Registered onPlayerMove callback. Total:", this.onPlayerMoveCallbacks.length);
  }

  public onPlayerLeave(callback: PlayerLeaveCallback): void {
    this.onPlayerLeaveCallbacks.push(callback);
    console.log("✓ Registered onPlayerLeave callback. Total:", this.onPlayerLeaveCallbacks.length);
  }

  public onAllPlayers(callback: AllPlayersCallback): void {
    this.onAllPlayersCallbacks.push(callback);
    console.log("✓ Registered onAllPlayers callback. Total:", this.onAllPlayersCallbacks.length);
  }

  // Remove callbacks (useful for cleanup)
  public removePlayerJoinCallback(callback: PlayerJoinCallback): void {
    this.onPlayerJoinCallbacks = this.onPlayerJoinCallbacks.filter(
      (cb) => cb !== callback
    );
  }

  public removePlayerMoveCallback(callback: PlayerMoveCallback): void {
    this.onPlayerMoveCallbacks = this.onPlayerMoveCallbacks.filter(
      (cb) => cb !== callback
    );
  }

  public removePlayerLeaveCallback(callback: PlayerLeaveCallback): void {
    this.onPlayerLeaveCallbacks = this.onPlayerLeaveCallbacks.filter(
      (cb) => cb !== callback
    );
  }

  public removeAllPlayersCallback(callback: AllPlayersCallback): void {
    this.onAllPlayersCallbacks = this.onAllPlayersCallbacks.filter(
      (cb) => cb !== callback
    );
  }
}
