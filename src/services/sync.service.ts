// src/services/sync.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client } from '../schemas/client.schema';
import { SyncPricesDto, SyncStocksDto, SyncProductsDto } from '../dtos/sync.dto';
import { Brand } from '../schemas/brand.schema';
import { BrandApiConfig } from '../schemas/brand-api-config.schema';

@Injectable()
export class SyncService {
    private readonly logger = new Logger(SyncService.name);

    constructor(
        @InjectModel(Brand.name) private brandModel: Model<Brand>,
        @InjectModel(BrandApiConfig.name) private configModel: Model<BrandApiConfig>
    ) {}

    async syncPrices(client: Client, syncDto: SyncPricesDto) {
        const startTime = new Date();
        let productsUpdated = 0;
        let variantsUpdated = 0;

        try {
            // Get all brands for client
            const brands = await this.brandModel
                .find({ clientId: client.id })
                .populate('apiConfig');

            for (const brand of brands) {
                const updates = await this.processBrandPrices(brand, syncDto.sync_date);
                productsUpdated += updates.products;
                variantsUpdated += updates.variants;
            }

            return {
                status: 'success',
                message: 'Price synchronization completed successfully',
                data: {
                    products_synced: productsUpdated,
                    variants_synced: variantsUpdated,
                    sync_time: new Date().toISOString(),
                    sync_id: startTime.getTime().toString()
                }
            };
        } catch (error) {
            this.logger.error(`Price sync failed for client ${client.id}:`, error);
            throw error;
        }
    }

    async syncStocks(client: Client, syncDto: SyncStocksDto) {
        const startTime = new Date();
        let stocksUpdated = 0;

        try {
            const brands = await this.brandModel
                .find({ clientId: client.id })
                .populate('apiConfig');

            for (const brand of brands) {
                stocksUpdated += await this.processBrandStocks(brand, syncDto.sync_date);
            }

            return {
                status: 'success',
                message: 'Stock synchronization completed successfully',
                data: {
                    products_synced: stocksUpdated,
                    sync_time: new Date().toISOString(),
                    sync_id: startTime.getTime().toString()
                }
            };
        } catch (error) {
            this.logger.error(`Stock sync failed for client ${client.id}:`, error);
            throw error;
        }
    }

    async syncProducts(client: Client, syncDto: SyncProductsDto) {
        const startTime = new Date();
        let productsUpdated = 0;

        try {
            const brands = await this.brandModel
                .find({ clientId: client.id })
                .populate('apiConfig');

            for (const brand of brands) {
                productsUpdated += await this.processBrandProducts(brand, syncDto.sync_date);
            }

            return {
                status: 'success',
                message: 'Product synchronization completed successfully',
                data: {
                    products_synced: productsUpdated,
                    sync_time: new Date().toISOString(),
                    sync_id: startTime.getTime().toString()
                }
            };
        } catch (error) {
            this.logger.error(`Product sync failed for client ${client.id}:`, error);
            throw error;
        }
    }

    private async processBrandPrices(brand: Brand, syncDate: string) {
        // Implement price processing logic
        return { products: 0, variants: 0 };
    }

    private async processBrandStocks(brand: Brand, syncDate: string) {
        // Implement stock processing logic
        return 0;
    }

    private async processBrandProducts(brand: Brand, syncDate: string) {
        // Implement product processing logic
        return 0;
    }
}