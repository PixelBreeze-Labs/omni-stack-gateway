// src/services/import/bybest-import.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product } from '../../schemas/product.schema';
import { BaseImportService } from './base-import.service';
import {ValidationResult} from "../../interfaces/import.interface";

@Injectable()
export class BybestProductsImportService extends BaseImportService {
    constructor(
        @InjectModel(Product.name) private productModel: Model<Product>
    ) {
        super();
    }

    async validateRow(row: any, brandId: string): Promise<ValidationResult> {
        const errors: string[] = [];

        if (!row.code) errors.push('Code is required');
        if (!row.barcode) errors.push('Barcode is required');

        // Check unique code
        if (row.code) {
            const existing = await this.productModel.findOne({ code: row.code, brandId });
            if (existing) errors.push(`Product with code ${row.code} already exists for this brand`);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    async transformRow(row: any, brandId: string) {
        return {
            code: row.code,
            barcode: row.barcode,
            name: row.name || row.code,
            initialStock: Number(row.initialStock || 0),
            ...(brandId && { brandId })
        };
    }

    protected async saveRow(row: any, clientId: string): Promise<void> {
        await this.productModel.create({
            ...row,
            clientId
        });
    }
}