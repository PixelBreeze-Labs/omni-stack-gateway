import {Injectable, NotFoundException} from "@nestjs/common";
import {InjectModel} from "@nestjs/mongoose";
import {Product} from "../schemas/product.schema";
import {ProductVariationConfig} from "../schemas/product-variation-config.schema";
import {Model} from "mongoose";
import {CreateVariationDto, VariationCombination} from "../dtos/variation.dto";
import {GenerateMatrixDto} from "../dtos/template.dto";

@Injectable()
export class ProductVariationService {
    constructor(
        @InjectModel(Product.name) private productModel: Model<Product>,
        @InjectModel(ProductVariationConfig.name) private configModel: Model<ProductVariationConfig>
    ) {}

    async createVariations(productId: string, dto: CreateVariationDto) {
        const product = await this.productModel.findById(productId);
        if (!product) throw new NotFoundException('Product not found');

        await this.productModel.updateOne(
            { _id: productId },
            { hasVariations: true }
        );

        return this.configModel.create({
            productId,
            attributes: dto.attributes,
            combinations: dto.combinations
        });
    }

    async generateMatrix(productId: string, dto: GenerateMatrixDto) {
        const combinations = this.generateCombinations(dto.matrix, dto.skuPrefix);

        if (dto.defaultPrice) {
            combinations.forEach(c => c.price = dto.defaultPrice);
        }

        if (dto.defaultStock) {
            combinations.forEach(c => c.stock = dto.defaultStock);
        }

        return this.createVariations(productId, {
            attributes: Object.entries(dto.matrix).map(([name, values]) => ({
                name,
                values
            })),
            combinations
        });
    }

    private generateCombinations(matrix: Record<string, string[]>, skuPrefix?: string): VariationCombination[] {
        const attributes = Object.entries(matrix);
        const combinations = this.cartesianProduct(attributes);

        return combinations.map((combo, index) => ({
            sku: `${skuPrefix || ''}${index + 1}`,
            attributes: combo.reduce((acc, [key, value]) => ({
                ...acc,
                [key]: value
            }), {})
        }));
    }

    private cartesianProduct(arrays: any[]): any[] {
        return arrays.reduce((acc, curr) =>
                acc.flatMap(x => curr[1].map(y => [...x, [curr[0], y]])),
            [[]]
        );
    }

    async findByProduct(productId: string) {
        const config = await this.configModel.findOne({ productId });
        if (!config) return null;

        return {
            attributes: config.attributes,
            combinations: config.combinations
        };
    }
}