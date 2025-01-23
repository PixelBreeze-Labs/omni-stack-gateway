// src/services/import/processors/simple-processor.ts
import {InjectModel} from "@nestjs/mongoose";
import {Product} from "../../../schemas/product.schema";
import {Model} from "mongoose";
import {BaseImportProcessor} from "./base-processor";
import {Injectable} from "@nestjs/common";

@Injectable()
export class SimpleImportProcessor extends BaseImportProcessor {
    constructor(
        @InjectModel(Product.name) private productModel: Model<Product>
    ) {
        super();
    }

    async validateRow(row: any) {
        const errors = [];
        if (!row.code) errors.push('Code is required');
        if (!row.name) errors.push('Name is required');
        return { valid: errors.length === 0, errors };
    }

    async processRow(row: any) {
        return this.productModel.create({
            code: row.code,
            name: row.name,
            price: row.price,
            stockQuantity: row.stock
        });
    }

    async afterProcess() {}
}
