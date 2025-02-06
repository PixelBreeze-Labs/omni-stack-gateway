import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { StudentVerificationController } from './controllers/student-verification.controller';
import { GatewayController } from './controllers/gateway.controller';
import { SnapfoodAdminService } from './services/snapfood-admin.service';
import { TrackmasterAdminService } from './services/trackmaster-admin.service';
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
import { StockLevel, StockLevelSchema } from './schemas/stock-level.schema';
import { StockMovement, StockMovementSchema } from './schemas/stock-movement.schema';
import { FamilyAccount, FamilyAccountSchema } from './schemas/family-account.schema';
import { Sync, SyncSchema } from './schemas/sync.schema';
import { Customer, CustomerSchema } from './schemas/customer.schema';
import { User, UserSchema } from './schemas/user.schema';
import { Member, MemberSchema } from './schemas/member.schema';
import { Order, OrderSchema } from './schemas/order.schema';
import { Activity, ActivitySchema } from './schemas/activity.schema';
import { Benefit, BenefitSchema } from './schemas/benefit.schema';
import { BenefitUsage, BenefitUsageSchema } from './schemas/benefit-usage.schema';
import { City, CitySchema } from './schemas/city.schema';
import { Country, CountrySchema } from './schemas/country.schema';
import { State, StateSchema } from './schemas/state.schema';
import { Store, StoreSchema } from './schemas/store.schema';
import { Address, AddressSchema } from './schemas/address.schema';


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
import { OperationController } from './controllers/operation.controller';
import { StockLevelController } from './controllers/stock-level.controller';
import { StockMovementController } from './controllers/stock-movement.controller';
import { FamilyAccountController} from "./controllers/family-account.controller";
import { SalesFamilyAccountController} from "./controllers/sales/family-account.controller";
import { SyncController } from "./controllers/sync.controller";
import { CustomerController } from "./controllers/customer.controller";
import { SalesCustomerController } from "./controllers/sales/customer.controller";
import { AuthController } from "./controllers/auth.controller";
import { UserController } from "./controllers/user.controller";
import { ByBestSyncController } from "./controllers/bybest-sync.controller";
import { MemberController } from "./controllers/member.controller";
import { LoyaltyProgramController } from './controllers/loyalty-program.controller';
import { LocationController } from './controllers/system/location.controller';
import { StoreController } from "./controllers/store.controller";
import { VenueBoostController } from "./controllers/venueboost.controller";
import { OrderController } from "./controllers/order.controller";


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
import {BatchController} from "./controllers/batch.controller";
import {BatchService} from "./services/batch.service";
import { OperationService } from './services/operation.service';
import { StockLevelService } from './services/stock-level.service';
import { StockMovementService } from './services/stock-movement.service';
import { FamilyAccountService } from './services/family-account.service';
import { SyncService } from './services/sync.service';
import { CustomerService } from './services/customer.service';
import { AuthService } from './services/auth.service';
import { ByBestSyncService } from './services/bybest-sync.service';
import { UserService } from "./services/user.service";
import { MemberService } from "./services/member.service";
import { LoyaltyProgramService } from './services/loyalty-program.service';
import { LocationSyncService } from './services/location-sync.service';
import { StoreService } from './services/store.service';
import { VenueBoostService } from "./services/venueboost.service";
import { OrderService } from "./services/order.service";

// Others
import {JwtModule} from "@nestjs/jwt";

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
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: '8h',
        algorithm: 'HS256'
      },
      verifyOptions: {
        algorithms: ['HS256']
      }
    }),
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
      { name: TemplateField.name, schema: TemplateFieldSchema },
      { name: StockLevel.name, schema: StockLevelSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: FamilyAccount.name, schema: FamilyAccountSchema },
      { name: Sync.name, schema: SyncSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: User.name, schema: UserSchema },
      { name: Member.name, schema: MemberSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: Benefit.name, schema: BenefitSchema },
      { name: BenefitUsage.name, schema: BenefitUsageSchema },
      { name: Country.name, schema: CountrySchema },
      { name: State.name, schema: StateSchema },
      { name: City.name, schema: CitySchema },
      { name: Store.name, schema: StoreSchema },
      { name: Address.name, schema: AddressSchema }
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
    InventoryAdjustmentController,
    BatchController,
    OperationController,
    StockLevelController,
    StockMovementController,
    FamilyAccountController,
    SyncController,
    CustomerController,
    AuthController,
    UserController,
    ByBestSyncController,
    MemberController,
    LoyaltyProgramController,
    SalesFamilyAccountController,
    SalesCustomerController,
    LocationController,
    StoreController,
    VenueBoostController,
    OrderController
  ],
  providers: [
    SnapfoodService,
    SnapfoodAdminService,
    TrackmasterAdminService,
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
    InventoryAdjustmentService,
    BatchService,
    OperationService,
    StockLevelService,
    StockMovementService,
    FamilyAccountService,
    SyncService,
    CustomerService,
    AuthService,
    UserService,
    ByBestSyncService,
    MemberService,
    LoyaltyProgramService,
    LocationSyncService,
    StoreService,
    VenueBoostService,
    OrderService
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
        .apply(ApiKeyMiddleware)
        .exclude(
            { path: 'docs', method: RequestMethod.ALL },
            { path: 'docs/(.*)', method: RequestMethod.ALL },
            { path: 'docs-json', method: RequestMethod.ALL }
        )
        .forRoutes('*');
  }
}