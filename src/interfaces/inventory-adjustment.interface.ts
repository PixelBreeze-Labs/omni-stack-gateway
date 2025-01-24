// src/interfaces/inventory-adjustment.interface.ts
export interface IInventoryAdjustment {
    productId: string;
    warehouseId: string;
    clientId: string;
    quantity: number;
    type: string;
    status: string;
    approvedBy?: string;
}
