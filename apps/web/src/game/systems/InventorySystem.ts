/**
 * Inventory System - Handles inventory items and management
 * UI is now handled by React components via event bus
 */

import { type InventoryItem, ITEM_TYPES } from "../config/GameConstants";
import { gameEventBus } from "../utils/GameEventBus";

export class InventorySystem {
  private isInventoryOpen = false;
  private inventoryItems: Map<string, InventoryItem> = new Map();
  private onInventoryChange?: () => void;

  public setOnInventoryChange(callback: () => void): void {
    this.onInventoryChange = callback;
  }

  public init(): void {
    // Initialize inventory items map with empty quantities
    ITEM_TYPES.forEach((item) => {
      this.inventoryItems.set(item.id, { ...item, quantity: 0 });
    });
    // Emit initial inventory state
    this.emitInventoryUpdate();
  }

  // Deprecated: UI is now handled by React
  public createInventoryUI(): void {
    // No-op: UI is handled by React components
  }

  // Deprecated: UI is now handled by React
  public createInventoryRecap(): void {
    // No-op: UI is handled by React components
  }

  private emitInventoryUpdate(): void {
    gameEventBus.emit("inventory:update", {
      inventory: new Map(this.inventoryItems),
    });
  }

  public getInventoryData(): Record<string, number> {
    const inventory: Record<string, number> = {};
    this.inventoryItems.forEach((item, itemId) => {
      if (item.quantity > 0) {
        inventory[itemId] = item.quantity;
      }
    });
    return inventory;
  }

  public loadInventoryData(inventory: Record<string, number>): void {
    Object.entries(inventory).forEach(([itemId, quantity]) => {
      const item = this.inventoryItems.get(itemId);
      if (item) {
        item.quantity = quantity;
      }
    });
    this.emitInventoryUpdate();
  }

  public getInventoryItems(): Map<string, InventoryItem> {
    return this.inventoryItems;
  }

  public addItem(itemId: string, quantity: number = 1): void {
    const item = this.inventoryItems.get(itemId);
    if (item) {
      item.quantity += quantity;
      this.emitInventoryUpdate();
      gameEventBus.emit("inventory:item-added", { itemId, quantity });
      if (this.onInventoryChange) {
        this.onInventoryChange();
      }
    }
  }

  public removeItem(itemId: string, quantity: number = 1): boolean {
    const item = this.inventoryItems.get(itemId);
    if (item && item.quantity >= quantity) {
      item.quantity -= quantity;
      this.emitInventoryUpdate();
      gameEventBus.emit("inventory:item-removed", { itemId, quantity });
      if (this.onInventoryChange) {
        this.onInventoryChange();
      }
      return true;
    }
    return false;
  }

  public getItemQuantity(itemId: string): number {
    const item = this.inventoryItems.get(itemId);
    return item?.quantity || 0;
  }

  public toggleInventory(): void {
    this.isInventoryOpen = !this.isInventoryOpen;
    if (this.isInventoryOpen) {
      gameEventBus.emit("inventory:open");
    } else {
      gameEventBus.emit("inventory:close");
    }
    gameEventBus.emit("inventory:toggle", { isOpen: this.isInventoryOpen });
    this.emitInventoryUpdate();
  }

  public isOpen(): boolean {
    return this.isInventoryOpen;
  }
}
