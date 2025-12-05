/**
 * Event Bus for communication between Phaser Game and React UI
 */

export type GameEventType =
  | "inventory:toggle"
  | "inventory:open"
  | "inventory:close"
  | "inventory:update"
  | "inventory:item-added"
  | "inventory:item-removed"
  | "menu:toggle"
  | "menu:update"
  | "menu:open"
  | "menu:close"
  | "menu:select"
  | "menu:volume-change"
  | "dialog:show"
  | "dialog:hide"
  | "dialog:advance"
  | "chat:open"
  | "chat:close"
  | "chat:message"
  | "chat:near-statue"
  | "chat:not-near-statue"
  | "weather:update"
  | "notification:item-collected"
  | "notification:clear"
  | "tile-info:show"
  | "tile-info:hide"
  | "game:pause"
  | "game:resume"
  | "game:save";

export interface GameEvent {
  type: GameEventType;
  payload?: unknown;
}

type EventHandler = (payload?: unknown) => void;

class GameEventBus {
  private handlers: Map<GameEventType, Set<EventHandler>> = new Map();

  /**
   * Subscribe to an event
   */
  public on(eventType: GameEventType, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)?.add(handler);

    // Return unsubscribe function
    return () => {
      this.off(eventType, handler);
    };
  }

  /**
   * Unsubscribe from an event
   */
  public off(eventType: GameEventType, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(eventType);
      }
    }
  }

  /**
   * Emit an event
   */
  public emit(eventType: GameEventType, payload?: unknown): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Remove all handlers for a specific event type
   */
  public removeAllListeners(eventType?: GameEventType): void {
    if (eventType) {
      this.handlers.delete(eventType);
    } else {
      this.handlers.clear();
    }
  }
}

// Singleton instance
export const gameEventBus = new GameEventBus();
