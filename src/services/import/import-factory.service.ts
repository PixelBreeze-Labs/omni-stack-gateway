// src/services/import/import-factory.service.ts
import { Injectable } from '@nestjs/common';
import { BybestProductsImportService } from './bybest-products-import.service';

@Injectable()
export class ImportServiceFactory {
    constructor(
        private byBestProductsImportService: BybestProductsImportService
    ) {}

    getImportService(type: string) {
        switch (type) {
            case 'bybest-products':
                return this.byBestProductsImportService;
            default:
                throw new Error(`No import service for type: ${type}`);
        }
    }
}
