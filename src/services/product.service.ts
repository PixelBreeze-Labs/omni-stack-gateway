import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product } from '../schemas/product.schema';

@Injectable()
export class ProductService {
    constructor(
        @InjectModel(Product.name) private productModel: Model<Product>
    ) {}

    async create(data: any): Promise<Product> {
        const product = new this.productModel(data);
        return product.save();
    }

    async findAll(query: any = {}) {
        const filters: any = { isActive: true };

        if (query.search) {
            filters.$or = [
                { name: new RegExp(query.search, 'i') },
                { code: new RegExp(query.search, 'i') },
                { barcode: new RegExp(query.search, 'i') }
            ];
        }

        if (query.brandId) {
            filters.brandId = query.brandId;
        }

        if (query.clientId) {
            filters.clientId = query.clientId;
        }

        const page = query.page || 1;
        const limit = query.limit || 10;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            this.productModel
                .find(filters)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 }),
            this.productModel.countDocuments(filters)
        ]);

        return {
            items,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        };
    }

    async findOne(id: string) {
        const product = await this.productModel.findById(id);
        if (!product) {
            throw new NotFoundException('Product not found');
        }
        return product;
    }

    async update(id: string, updateData: Partial<Product>) {
        const product = await this.productModel.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true }
        );

        if (!product) {
            throw new NotFoundException('Product not found');
        }

        return product;
    }

    async remove(id: string) {
        const product = await this.productModel.findByIdAndUpdate(
            id,
            { $set: { isActive: false } },
            { new: true }
        );

        if (!product) {
            throw new NotFoundException('Product not found');
        }

        return product;
    }

    async hardDelete(id: string) {
        const product = await this.productModel.findByIdAndDelete(id);
        if (!product) {
            throw new NotFoundException('Product not found');
        }
        return product;
    }
}