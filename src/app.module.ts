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
import { Campaign, CampaignSchema } from './schemas/campaign.schema';
import { Wallet, WalletSchema } from './schemas/wallet.schema';
import { CampaignEvent, CampaignEventSchema } from './schemas/campaign-event.schema';
import { Submission, SubmissionSchema } from './schemas/submission.schema';
import { Business, BusinessSchema } from './schemas/business.schema';
import { StripePrice, StripePriceSchema} from './schemas/stripe-price.schema';
import { StripeProduct, StripeProductSchema } from './schemas/stripe-product.schema';
import { SubscriptionConfig, SubscriptionConfigSchema } from './schemas/subscription-config.schema';
import { VerificationToken, VerificationTokenSchema } from './schemas/verification-token.schema';
import { MagicLinkToken, MagicLinkTokenSchema } from './schemas/magic-link-token.schema';
import { AppClient, AppClientSchema } from './schemas/app-client.schema';
import { Employee, EmployeeSchema } from './schemas/employee.schema';
import { Property, PropertySchema } from './schemas/property.schema';
import { Guest, GuestSchema } from './schemas/guest.schema';
import { Booking, BookingSchema } from './schemas/booking.schema';
import { OperatingEntity, OperatingEntitySchema } from './schemas/operating-entity.schema';
import { SocialProfile, SocialProfileSchema } from './schemas/social-profile.schema';



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
import { SnapFoodController } from "./controllers/snapfood.controller";
import { OrderController } from "./controllers/order.controller";
import { WebhookController } from "./controllers/webhook.controller";
import { CampaignTrackingController } from './controllers/campaign-tracking.controller';
import { WalletController } from './controllers/wallet.controller';
import { BenefitController } from './controllers/benefit.controller';
import { SnapfoodAIAssistantController } from './controllers/snapfood-ai-assistant.controller';
import { SubmissionController } from './controllers/submission.controller';
import { BusinessRegistrationController } from './controllers/business-registration.controller';
import { PasswordResetController } from './controllers/sf-password-reset.controller';
import { SubscriptionConfigController } from './controllers/subscription-config.controller';
import { SubscriptionController } from './controllers/subscription.contoller';
import { BusinessController } from './controllers/business.controller';
import { MagicLinkController } from './controllers/magic-link.controller';
import { AdminSubscriptionController } from './controllers/admin-subscription.controller';
import { StaffluentDashboardController } from './controllers/staffluent-dashboard.controller';
import { StaffluentAnalyticsController } from './controllers/staffluent-analytics.controller';
import { AdminFeatureController } from './controllers/admin-feature.controller';
import { LandingPageController } from './controllers/landing-page.controller';
import { PropertyController } from './controllers/property.controller';
import { GuestController } from './controllers/guest.controller';
import { BookingController } from './controllers/booking.controller';
import { CommunicationsController } from './controllers/communications.controller';
import { OperatingEntityController } from './controllers/operating-entity.controller';
import { SocialProfileController } from './controllers/social-profile.controller';



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
import { CampaignTrackingService } from './services/campaign-tracking.service';
import { WalletService } from './services/wallet.service';
import { BenefitService } from './services/benefit.service';
import { SnapfoodAIAssistantService } from './services/snapfood-ai-assistant.service';
import { SubmissionService } from './services/submission.service';
import { BusinessRegistrationService } from './services/business-registration.service';
import { VerificationService } from './services/verification.service';
import { SubscriptionConfigService } from './services/subscription-config.service';
import { SubscriptionService } from './services/subscription.service';
import { BusinessService } from './services/business.service';
import { SupabaseVbAppService } from "./services/supabase-vb-app.service";
import { MagicLinkService } from "./services/magic-link.service";
import { AdminSubscriptionService } from "./services/admin-subscription.service";
import { StaffluentAnalyticsService } from "./services/staffluent-analytics.service";
import { StaffluentDashboardService } from "./services/staffluent-dashboard.service";
import { FeatureAccessService } from "./services/feature-access.service";
import { SidebarFeatureService } from "./services/sidebar-feature.service";
import { PropertyService } from "./services/property.service";
import { GuestService } from "./services/guest.service";
import { BookingService } from "./services/booking.service";
import { CommunicationsService } from "./services/communications.service";
import { OperatingEntityService } from './services/operating-entity.service';
import { SocialProfileService } from './services/social-profile.service';


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
      { name: Address.name, schema: AddressSchema },
      { name: Campaign.name, schema: CampaignSchema },
      { name: CampaignEvent.name, schema: CampaignEventSchema },
      { name: Wallet.name, schema: WalletSchema },
      { name: Submission.name, schema: SubmissionSchema },
      { name: Business.name, schema: BusinessSchema },
      { name: StripePrice.name, schema: StripePriceSchema },
      { name: StripeProduct.name, schema: StripeProductSchema },
      { name: SubscriptionConfig.name, schema: SubscriptionConfigSchema },
      { name: VerificationToken.name, schema: VerificationTokenSchema },
      { name: MagicLinkToken.name, schema: MagicLinkTokenSchema },
      { name: AppClient.name, schema: AppClientSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Property.name, schema: PropertySchema },
      { name: Guest.name, schema: GuestSchema },
      { name: Booking.name, schema: BookingSchema },
      { name: OperatingEntity.name, schema: OperatingEntitySchema },
      { name: SocialProfile.name, schema: SocialProfileSchema },
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
    SnapFoodController,
    OrderController,
    WebhookController,
    CampaignTrackingController,
    WalletController,
    BenefitController,
    SnapfoodAIAssistantController,
    SubmissionController,
    BusinessRegistrationController,
    PasswordResetController,
    SubscriptionConfigController,
    SubscriptionController,
    BusinessController,
    MagicLinkController,
    AdminSubscriptionController,
    StaffluentAnalyticsController,
    StaffluentDashboardController,
    AdminFeatureController,
    LandingPageController,
    PropertyController,
    GuestController,
    BookingController,
    CommunicationsController,
    OperatingEntityController,
    SocialProfileController
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
    AuthService,
    UserService,
    CustomerService,
    ByBestSyncService,
    MemberService,
    LoyaltyProgramService,
    LocationSyncService,
    StoreService,
    VenueBoostService,
    OrderService,
    CampaignTrackingService,
    WalletService,
    BenefitService,
    SnapfoodAIAssistantService,
    SubmissionService,
    BusinessRegistrationService,
    VerificationService,
    SubscriptionConfigService,
    SubscriptionService,
    BusinessService,
    SupabaseVbAppService,
    MagicLinkService,
    AdminSubscriptionService,
    StaffluentDashboardService,
    FeatureAccessService,
    StaffluentAnalyticsService,
    SidebarFeatureService,
    PropertyService,
    GuestService,
    BookingService,
    CommunicationsService,
    OperatingEntityService,
    SocialProfileService
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