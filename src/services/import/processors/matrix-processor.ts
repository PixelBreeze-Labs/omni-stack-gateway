// src/services/import/processors/matrix-processor.ts
import {InjectModel} from "@nestjs/mongoose";
import {Model} from "mongoose";
import {Product} from "../../../schemas/product.schema";
import {ProductVariationConfig} from "../../../schemas/product-variation-config.schema";
import {BaseImportProcessor} from "./base-processor";
import {Injectable} from "@nestjs/common";

@Injectable()
export class MatrixImportProcessor extends BaseImportProcessor {
    constructor(
        @InjectModel(Product.name) private productModel: Model<Product>,
        @InjectModel(ProductVariationConfig.name) private variationModel: Model<ProductVariationConfig>
    ) {
        super();
    }

    async validateRow(row: any) {
        const errors = [];
        if (!row.code) errors.push('Code is required');
        if (!row.matrix) errors.push('Attribute matrix required');
        return { valid: errors.length === 0, errors };
    }

    async processRow(row: any) {
        const product = await this.productModel.create({
            code: row.code,
            name: row.name,
            hasVariations: true
        });

        const combinations = this.generateCombinations(row.matrix);
        await this.variationModel.create({
            productId: product.id,
            attributes: row.matrix,
            combinations
        });

        return { product, combinations };
    }

    private generateCombinations(matrix: any) {
        const attributes = Object.entries(matrix);
        const combinations = this.cartesianProduct(attributes);

        return combinations.map((combo, index) => ({
            sku: `${combo.baseCode}-${index + 1}`,
            attributes: combo.reduce((acc, [key, value]) => ({
                ...acc,
                [key]: value
            }), {})
        }));
    }

    private cartesianProduct(arrays: any[]) {
        return arrays.reduce((acc, curr) =>
            acc.flatMap(x =>
                curr[1].map(y => [...x, [curr[0], y]])
            ), [[]]
        );
    }

    async afterProcess() {}
}