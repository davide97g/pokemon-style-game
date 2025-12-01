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
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on("connect", () => {
      console.log("✓ Connected to multiplayer server:", this.serverUrl);
      this.isConnected = true;
      if (this.socket) {
        this.socketId = this.socket.id || null;
        console.log("Socket ID:", this.socketId);
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
    });

    this.socket.on("reconnect_failed", () => {
      console.error("✗ Failed to reconnect to multiplayer server");
      this.isConnected = false;
    });

    this.socket.on("allplayers", (players: PlayerData[]) => {
      console.log("Received all players:", players);
      this.onAllPlayersCallbacks.forEach((callback) => callback(players));
    });

    this.socket.on("newplayer", (player: PlayerData) => {
      console.log("New player joined:", player);
      this.onPlayerJoinCallbacks.forEach((callback) => callback(player));
    });

    this.socket.on("move", (player: PlayerData) => {
      this.onPlayerMoveCallbacks.forEach((callback) => callback(player));
    });

    this.socket.on("remove", (playerId: string) => {
      console.log("Player left:", playerId);
      this.onPlayerLeaveCallbacks.forEach((callback) => callback(playerId));
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
  }

  public onPlayerMove(callback: PlayerMoveCallback): void {
    this.onPlayerMoveCallbacks.push(callback);
  }

  public onPlayerLeave(callback: PlayerLeaveCallback): void {
    this.onPlayerLeaveCallbacks.push(callback);
  }

  public onAllPlayers(callback: AllPlayersCallback): void {
    this.onAllPlayersCallbacks.push(callback);
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
