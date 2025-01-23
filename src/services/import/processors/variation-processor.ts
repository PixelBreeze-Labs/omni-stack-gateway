// src/services/import/processors/variation-processor.ts
import {InjectModel} from "@nestjs/mongoose";
import {Model} from "mongoose";
import {ProductVariationConfig} from "../../../schemas/product-variation-config.schema";
import {BaseImportProcessor} from "./base-processor";
import {Product} from "../../../schemas/product.schema";
import {Injectable} from "@nestjs/common";

@Injectable()
export class VariationImportProcessor extends BaseImportProcessor {
    constructor(
        @InjectModel(Product.name) private productModel: Model<Product>,
        @InjectModel(ProductVariationConfig.name) private variationModel: Model<ProductVariationConfig>
    ) {
        super();
    }

    async validateRow(row: any) {
        const errors = [];
        if (!row.parent_code && !row.code) errors.push('Either parent or variation code required');
        if (row.parent_code && !row.attributes) errors.push('Attributes required for variations');
        return { valid: errors.length === 0, errors };
    }

    async processRow(row: any) {
        if (!row.parent_code) {
            const parent = await this.productModel.create({
                code: row.code,
                name: row.name,
                hasVariations: true
            });
            return { type: 'parent', data: parent };
        }

        const parent = await this.productModel.findOne({ code: row.parent_code });
        const variation = await this.variationModel.create({
            productId: parent.id,
            attributes: row.attributes,
            sku: row.code,
            price: row.price,
            stock: row.stock
        });

        return { type: 'variation', data: variation };
    }

    async afterProcess() {}
}