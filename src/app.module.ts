import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
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

// Controller imports
import { ReportsController } from './controllers/reports.controller';
import { ClientAppController } from './controllers/client-app.controller';
import { ProductController } from './controllers/product.controller';
import { ImportController } from './controllers/import.controller';
import { ScanController } from './controllers/scan.controller';

// Service imports
import { ReportsService } from './services/reports.service';
import { ClientAppService } from './services/client-app.service';
import { ProductService } from './services/product.service';
import { ExchangeRateService } from './services/exchange-rate.service';
import { ImportServiceFactory } from './services/import/import-factory.service';
import { BybestProductsImportService } from './services/import/bybest-products-import.service';
import { BaseImportService } from './services/import/base-import.service';
import {ClientController} from "./controllers/client.controller";
import {ClientService} from "./services/client.service";
import {ClientApiKeyService} from "./services/client-api-key.service";
import {BrandController} from "./controllers/brand.controller";
import {BrandService} from "./services/brand.service";
import { ScanService } from './services/scan.service';


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
    ScanController
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
    BaseImportService,
    ScanService
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
        .apply(ApiKeyMiddleware)
        .forRoutes('*');
  }
}