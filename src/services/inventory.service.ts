// src/services/inventory.service.ts
import {InventoryAdjustment} from "../schemas/inventory-adjustment.schema";
import {Injectable} from "@nestjs/common";
import {AdjustInventoryDto} from "../dtos/inventory.dto";
import {InjectModel} from "@nestjs/mongoose";
import {Product} from "../schemas/product.schema";
import {Model} from "mongoose";
import {InventoryItem} from "../schemas/inventory-item.schema";

@Injectable()
export class InventoryService {
    constructor(
        @InjectModel(InventoryAdjustment.name) private adjustmentModel: Model<InventoryAdjustment>,
        @InjectModel(Product.name) private productModel: Model<Product>,
        @InjectModel(InventoryItem.name) private inventoryItemModel: Model<InventoryItem>
    ) {}

    async adjust(dto: AdjustInventoryDto, clientId: string) {
        const session = await this.adjustmentModel.db.startSession();
        session.startTransaction();

        try {
            const adjustment = await this.adjustmentModel.create([{
                ...dto,
                clientId
            }], { session });

            await this.updateProductStock(dto.productId, dto.warehouseId, dto.quantity, dto.type);

            await session.commitTransaction();
            return adjustment;
        } catch (error) {
            await session.abortTransaction();
            throw error;
        }
    }

    private async updateProductStock(productId: string, warehouseId: string, quantity: number, type: string) {
        const updateQuery = type === 'set'
            ? { $set: { [`stock.${warehouseId}`]: quantity } }
            : { $inc: { [`stock.${warehouseId}`]: type === 'add' ? quantity : -quantity } };

        await this.productModel.updateOne({ _id: productId }, updateQuery);
    }

    async getInventory(productId: string, warehouseId: string) {
        const inventory = await this.inventoryItemModel.findOne({
            productId,
            warehouseId
        });
        return inventory || { quantity: 0 };
    }
}