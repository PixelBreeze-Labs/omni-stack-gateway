import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { StudentVerificationController } from './controllers/student-verification.controller';
import { GatewayController } from './controllers/gateway.controller';
import { SnapfoodAdminService } from './services/snapfood-admin.service';
import { SnapfoodService } from './services/snapfood.service';
import { ApiKeyMiddleware } from './middleware/api-key.middleware';
import { EmailService } from './services/email.service';
import configuration from './config/configuration';
import { MongooseModuleAsyncOptions } from '@nestjs/mongoose';

// Schema imports
import { ClientAppSchema } from './schemas/client-app.schema';
import { ReportSchema } from './schemas/report.schema';
import { Product, ProductSchema } from './schemas/product.schema';
import { Warehouse, WarehouseSchema } from './schemas/warehouse.schema';
import { InventoryItem, InventoryItemSchema } from './schemas/inventory-item.schema';
import { Batch, BatchSchema } from './schemas/batch.schema';
import { Brand, BrandSchema } from './schemas/brand.schema';
import { BrandApiConfigSchema, BrandApiConfig } from './schemas/brand-api-config.schema';
import { Client, ClientSchema } from './schemas/client.schema';
import { Operation, OperationSchema } from './schemas/operation.schema';
import { OperationItem, OperationItemSchema } from './schemas/operation-item.schema';
import { ScanLog, ScanLogSchema } from './schemas/scan-log.schema';
import { InventoryAdjustment, InventoryAdjustmentSchema } from './schemas/inventory-adjustment.schema';
import { WarehouseLocation, WarehouseLocationSchema } from './schemas/warehouse-location.schema';
import { ImportTemplate, ImportTemplateSchema } from './schemas/template.schema';
import { ProductVariationConfig, ProductVariationConfigSchema } from './schemas/product-variation-config.schema';
import { TemplateField, TemplateFieldSchema } from './schemas/template-field.schema';

// Controller imports
import { ReportsController } from './controllers/reports.controller';
import { ClientAppController } from './controllers/client-app.controller';
import { ProductController } from './controllers/product.controller';
import { ImportController } from './controllers/import.controller';
import { ScanController } from './controllers/scan.controller';
import { InventoryController } from './controllers/inventory.controller';
import { WarehouseLocationController } from './controllers/warehouse-location.controller';
import { WarehouseController } from './controllers/warehouse.controller';
import { ScanReportController } from './controllers/scan-report.controller';
import { InventoryAdjustmentController } from './controllers/inventory-adjustment.controller';

// Service imports
import { ReportsService } from './services/reports.service';
import { ClientAppService } from './services/client-app.service';
import { ProductService } from './services/product.service';
import { ExchangeRateService } from './services/exchange-rate.service';
import { ImportServiceFactory } from './services/import/import-factory.service';
import { BybestProductsImportService } from './services/import/bybest-products-import.service';
import {ClientController} from "./controllers/client.controller";
import {ClientService} from "./services/client.service";
import {ClientApiKeyService} from "./services/client-api-key.service";
import {BrandController} from "./controllers/brand.controller";
import {BrandService} from "./services/brand.service";
import { ScanService } from './services/scan.service';
import { InventoryService } from './services/inventory.service';
import { WarehouseService } from './services/warehouse.service';
import { ScanReportService } from './services/scan-report.service';
import { WarehouseLocationService } from './services/warehouse-location.service';
import {TemplateService} from "./services/import/processors/template.service";
import {ProductVariationService} from "./services/product-variation-service";
import {SimpleImportProcessor} from "./services/import/processors/simple-processor";
import {VariationImportProcessor} from "./services/import/processors/variation-processor";
import {MatrixImportProcessor} from "./services/import/processors/matrix-processor";
import {TemplateController} from "./controllers/template.controller";
import {ProductVariationController} from "./controllers/product-variation.controller";
import {SupabaseService} from "./services/supabase.service";
import {ImageProcessingService} from "./services/image-processing.service";
import {OpenAIService} from "./services/openai.service";
import {BrandScraperService} from "./services/scraping/brand-scraper.service";
import {InventoryAdjustmentService} from "./services/inventory-adjustments.service";
import {ScraperController} from "./controllers/scraper.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    HttpModule,
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    } as MongooseModuleAsyncOptions),
    MongooseModule.forFeature([
      { name: 'ClientApp', schema: ClientAppSchema },
      { name: 'Report', schema: ReportSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: InventoryItem.name, schema: InventoryItemSchema },
      { name: Batch.name, schema: BatchSchema },
      { name: Brand.name, schema: BrandSchema },
      { name: BrandApiConfig.name, schema: BrandApiConfigSchema },
      { name: Client.name, schema: ClientSchema },
      { name: Operation.name, schema: OperationSchema },
      { name: OperationItem.name, schema: OperationItemSchema },
      { name: ScanLog.name, schema: ScanLogSchema },
      { name: InventoryAdjustment.name, schema: InventoryAdjustmentSchema },
      { name: WarehouseLocation.name, schema: WarehouseLocationSchema },
      { name: ImportTemplate.name, schema: ImportTemplateSchema },
      { name: ProductVariationConfig.name, schema: ProductVariationConfigSchema },
      { name: TemplateField.name, schema: TemplateFieldSchema }
    ]),
  ],
  controllers: [
    GatewayController,
    StudentVerificationController,
    ReportsController,
    ClientAppController,
    ProductController,
    ImportController,
    ClientController,
    BrandController,
    ScanController,
    InventoryController,
    WarehouseLocationController,
    WarehouseController,
    ScanReportController,
    TemplateController,
    ProductVariationController,
    ScraperController,
    InventoryAdjustmentController
  ],
  providers: [
    SnapfoodService,
    SnapfoodAdminService,
    ReportsService,
    EmailService,
    ClientAppService,
    ProductService,
    ExchangeRateService,
    BybestProductsImportService,
    ImportServiceFactory,
    ClientService,
    ClientApiKeyService,
    BrandService,
    ScanService,
    InventoryService,
    WarehouseService,
    WarehouseLocationService,
    ScanReportService,
    TemplateService,
    ProductVariationService,
    SimpleImportProcessor,
    VariationImportProcessor,
    MatrixImportProcessor,
    SupabaseService,
    ImageProcessingService,
    OpenAIService,
    BrandScraperService,
    InventoryAdjustmentService
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
        .apply(ApiKeyMiddleware)
        .exclude(
            { path: 'docs', method: RequestMethod.ALL },
            { path: 'docs/(.*)', method: RequestMethod.ALL },
            { path: 'docs-json', method: RequestMethod.ALL }, // <-- exclude JSON endpoint
        )
        .forRoutes('*');
  }
}