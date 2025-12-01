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
  }

  public connect(): void {
    if (this.socket?.connected) {
      console.log("Already connected to multiplayer server");
      return;
    }

    this.socket = io(this.serverUrl, {
      transports: ["websocket"],
    });

    this.socket.on("connect", () => {
      console.log("Connected to multiplayer server");
      this.isConnected = true;
      if (this.socket) {
        this.socketId = this.socket.id;
        console.log("Socket ID:", this.socketId);
      }
    });

    this.socket.on("disconnect", () => {
      console.log("Disconnected from multiplayer server");
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

