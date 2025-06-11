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
import { ChatGateway } from './gateways/chat.gateway';

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
import { GeneralCampaign, GeneralCampaignSchema } from './schemas/general-campaign.schema';
import { Chat, ChatSchema } from './schemas/chat.schema';
import { Promotion, PromotionSchema } from './schemas/promotion.schema';
import { Discount, DiscountSchema } from './schemas/discount.schema';
import { CheckinSubmission, CheckinSubmissionSchema } from './schemas/checkin-submission.schema';
import { CheckinFormConfig, CheckinFormConfigSchema } from './schemas/checkin-form-config.schema';
import { ReportComment, ReportCommentSchema } from './schemas/report-comment.schema';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { ReportFlag, ReportFlagSchema } from './schemas/report-flag.schema';
import { AiModel, AiModelSchema } from './schemas/ai-model.schema';
import { SocialChat, SocialChatSchema } from './schemas/social-chat.schema';
import { SocialMessage, SocialMessageSchema } from './schemas/social-message.schema';
import { VerificationPhone, VerificationPhoneSchema } from './schemas/verification-phone.schema';
import { TaskAssignment, TaskAssignmentSchema } from './schemas/task-assignment.schema';
import { StaffProfile, StaffProfileSchema } from './schemas/staff-profile.schema';
import { AgentConfiguration, AgentConfigurationSchema } from './schemas/agent-configuration.schema';
import { ChatbotMessage, ChatbotMessageSchema } from './schemas/chatbot-message.schema';
import { KnowledgeDocument, KnowledgeDocumentSchema } from './schemas/knowledge-document.schema';
import { UnrecognizedQuery, UnrecognizedQuerySchema } from './schemas/unrecognized-query.schema';
import { QueryResponsePair, QueryResponsePairSchema } from './schemas/query-response-pair.schema';
import { WeatherAlert, WeatherAlertSchema } from './schemas/weather-alert.schema';  
import { BusinessWeatherSettings, BusinessWeatherSettingsSchema } from './schemas/business-weather-settings.schema';
import { ProjectWeatherSettings, ProjectWeatherSettingsSchema } from './schemas/project-weather-settings.schema';
import { AppProject, AppProjectSchema } from './schemas/app-project.schema';
import { SaasNotification, SaasNotificationSchema } from './schemas/saas-notification.schema';
import { ConstructionSite, ConstructionSiteSchema } from './schemas/construction-site.schema';
import { OshaComplianceRequirement, OshaComplianceRequirementSchema } from './schemas/osha-compliance-requirement.schema';
import { OshaInspection, OshaInspectionSchema } from './schemas/osha-inspection.schema';
import { OshaViolation, OshaViolationSchema } from './schemas/osha-violation.schema';
import { OshaEquipmentCompliance, OshaEquipmentComplianceSchema } from './schemas/osha-equipment-compliance.schema';
import { BusinessOnboarding, BusinessOnboardingSchema } from './schemas/business-onboarding.schema';
import { BusinessClientMessage, BusinessClientMessageSchema } from './schemas/business-client-message.schema';
import { SkillAssessment, SkillAssessmentSchema } from './schemas/skill-assessment.schema';
import { SkillTemplate, SkillTemplateSchema } from './schemas/skill-assessment.schema';
import { SkillDevelopmentPlan, SkillDevelopmentPlanSchema } from './schemas/skill-assessment.schema';
import { RouteOptimizationRequest, RouteOptimizationRequestSchema } from './schemas/route-optimization-request.schema';
import { TeamLocation, TeamLocationSchema } from './schemas/team-location.schema';
import { Route, RouteSchema } from './schemas/route.schema';
import { FieldTask, FieldTaskSchema } from './schemas/field-task.schema';


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
import { GeneralCampaignController } from './controllers/general-campaign.controller';
import { ChatController } from './controllers/chat.controller';
import { PromotionController } from './controllers/promotion.controller';
import { DiscountController } from './controllers/discount.controller';
import { CommunityReportController } from './controllers/community-report.controller';
import { CheckinSubmissionController } from './controllers/checkin-submission.controller';
import { CheckinFormConfigController } from './controllers/checkin-form-config.controller';
import { NotificationController } from './controllers/notification.controller';
import { CoreNotificationController } from './controllers/core-notification.controller';
import { SocialChatController } from './controllers/social-chat.controller';
import { SocialMessageController } from './controllers/social-message.controller';
import { SnapfoodieController } from './controllers/snapfoodie.controller';
import { VerificationController } from './controllers/verification-phone.controller';
import { BusinessAgentConfigController } from './controllers/business-agent-config.controller';
import { StaffluentIntegrationController } from './controllers/staffluent-integration.controller';
import { BusinessTaskAssignmentController } from './controllers/business-task-assignment.controller';
import { StaffluentSuperadminController } from './controllers/staffluent-superadmin.controller';
import { BusinessChatbotController } from './controllers/business-chatbot.controller';
import { KnowledgeBaseController } from './controllers/knowledge-base.controller';
import { BusinessWeatherAlertController } from './controllers/business-weather-alert.controller';
import { VBAppProjectSyncController } from './controllers/vb-app-project-sync.controller';
import { VBConstructionSiteSyncController } from './controllers/vb-construction-site-sync.controller';
import { BusinessProjectController } from './controllers/business-project.controller';
import { OshaStatsController } from './controllers/osha-stats.controller';
import { OshaReportsController } from './controllers/osha-reports.controller';
import { OshaComplianceController } from './controllers/osha-compliance.controller';
import { OshaAuditController } from './controllers/osha-audit.controller';
import { BusinessOnboardingController } from './controllers/business-onboarding.controller';
import { BusinessStorageController } from './controllers/business-storage.controller';
import { BusinessMessagingController } from './controllers/business-messaging.controller';
import { BusinessSkillsController } from './controllers/business-skills.controller';
import { BusinessGeneralController } from './controllers/business-general.controller';

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
import { GeneralCampaignService } from './services/general-campaign.service';
import { ChatService } from './services/chat.service';
import { PromotionService } from './services/promotion.service';
import { DiscountService } from './services/discount.service';
import { CommunityReportService } from './services/community-report.service';
import { CheckinFormConfigService } from './services/checkin-form-config.service';
import { CheckinSubmissionService } from './services/checkin-submission.service';
import { NotificationService } from './services/notification.service';
import { CoreNotificationService } from './services/core-notification.service';
import { SocialChatService } from './services/social-chat.service';
import { SnapfoodieService } from './services/snapfoodie.service';
import { OneSignalService } from './services/onesignal.service';
import { StaffluentTaskService } from './services/staffluent-task.service';
import { StaffluentEmployeeService } from './services/staffluent-employee.service';
import { BusinessTaskAssignmentService } from './services/business-task-assignment.service';
import { BusinessChatbotService } from './services/business-chatbot.service';
import { KnowledgeBaseService } from './services/knowledge-base.service';
import { WeatherService } from './services/weather.service';
import { WeatherMonitorService } from './services/weather-monitor.service'; 
import { SaasNotificationService } from './services/saas-notification.service';
import { VBAppProjectSyncService } from './services/vb-app-project-sync.service';
import { VBConstructionSiteSyncService } from './services/vb-construction-site-sync.service';
import { OshaInspectionService } from './services/osha-inspection.service';
import { OshaComplianceService } from './services/osha-compliance.service';
import { OshaReportsService } from './services/osha-reports.service';
import { OshaStatsService } from './services/osha-stats.service';
import { BusinessOnboardingService } from './services/business-onboarding.service';
import { BusinessMessagingService } from './services/business-messaging.service';
import { BusinessSkillsService } from './services/business-skills.service';
import { BusinessGeneralService } from './services/business-general.service';

// Others
import {JwtModule} from "@nestjs/jwt";

// Groupped

// Report Tags
import { ReportTag, ReportTagSchema } from './schemas/report-tag.schema';
import { ReportTagService } from './services/report-tag.service';
import { ReportTagController } from './controllers/report-tag.controller';

// AI Models
import { AiModelService } from './services/ai-model.service';
import { AiModelController } from './controllers/ai-model.controller';
import { AiModelClass, AiModelClassSchema } from './schemas/ai-model-class.schema';
import { DetectionResult, DetectionResultSchema } from './schemas/detection-result.schema';
import { DetectionSummary, DetectionSummarySchema } from './schemas/detection-summary.schema';
import {TwilioVerificationService} from "./services/twilio-verification.service";
import { BusinessStorageService } from './services/business-storage.service';

// Log
import { LogService } from './services/log.service';
import { LogController } from './controllers/log.controller';
import { Log, LogSchema } from './schemas/log.schema';

// Generated Images
import { GeneratedImageService } from './services/generated-image.service';
import { GeneratedImageController } from './controllers/generated-image.controller';
import { GeneratedImage, GeneratedImageSchema } from './schemas/generated-image.schema';

import { PollController } from './controllers/poll.controller';
import { PollPublicController } from './controllers/poll-public.controller';
import { PollService } from './services/poll.service';
import { Poll, PollSchema } from './schemas/poll.schema';
import { OrderCronService } from './services/order-cron.service';


// CRM
import { CRMService } from './services/crm.service';
import { CRMAIAssistantService } from './services/crm-ai-assistant.service';
import { CRMAIAssistantController } from './controllers/crm-ai-assistant.controller';
import { CronJobHistory, CronJobHistorySchema } from './schemas/cron-job-history.schema';
import { AutoAssignmentAgentModule } from './modules/auto-assignment-agent.module';
import { ComplianceMonitoringAgentModule } from './modules/compliance-monitoring-agent.module';
import { ReportGenerationAgentModule } from './modules/report-generation-agent.module';
import { ClientCommunicationAgentModule } from './modules/client-communication-agent.module';
import { ResourceRequestAgentModule } from './modules/resource-request-agent.module';
import { ShiftOptimizationAgentModule } from './modules/shift-optimization-agent.module';
import { MLModule } from './modules/ml.module';

// Ticket
import { TicketService } from './services/ticket.service';
import { TicketController } from './controllers/ticket.controller';
import { Ticket, TicketSchema } from './schemas/ticket.schema';

// SaaS Notifications
import { SaasNotificationController } from './controllers/saas-notification.controller';

// Route Optimization
import { RouteOptimizationController } from './controllers/route-optimization.controller';
import { RouteOptimizationService } from './services/route-optimization.service';

// Field Task
import { FieldTaskController } from './controllers/field-task.controller';
import { FieldTaskService } from './services/field-task.service';

// Team Location
import { TeamLocationController } from './controllers/team-location.controller';
import { TeamLocationService } from './services/team-location.service';

// Service Area
import { ServiceAreaController } from './controllers/service-area.controller';
import { ServiceAreaService } from './services/service-area.service';

// Route Analytics
import { RouteAnalyticsController } from './controllers/route-analytics.controller';
import { RouteAnalyticsService } from './services/route-analytics.service';

// Weather Route
import { WeatherRouteController } from './controllers/weather-route.controller';
import { WeatherRouteService } from './services/weather-route.service';

// Google Maps
import { GoogleMapsService } from './services/google-maps.service';

// Route Progress Schema
import { RouteProgress, RouteProgressSchema } from './schemas/route-progress.schema';
import { TeamAvailability, TeamAvailabilitySchema } from './schemas/team-availability.schema';

// Quality Inspection (Schema, Service, Controller)
import { QualityInspection, QualityInspectionSchema } from './schemas/quality-inspection.schema';
import { QualityInspectionService } from './services/quality-inspection.service';
import { BusinessQualityInspectionController } from './controllers/business-quality-inspection.controller';
import { StaffQualityInspectionController } from './controllers/staff-quality-inspection.controller';
import { ReviewerQualityInspectionController } from './controllers/reviewer-quality-inspection.controller';
import { FinalApproverQualityInspectionController } from './controllers/final-approver-quality-inspection.controller';
import { ClientQualityInspectionController } from './controllers/client-quality-inspection.controller';

// Client Feedback
import { ClientFeedbackService } from './services/client-feedback.service';
import { ClientFeedbackController } from './controllers/client-feedback.controller';
import { BusinessClientFeedbackController } from './controllers/business-client-feedback.controller';
import { ClientFeedback, ClientFeedbackSchema } from './schemas/client-feedback.schema';

// Audit Logs
import { AuditLogService } from './services/audit-log.service';
import { BusinessAuditController } from './controllers/business-audit.controller';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';

// AppClient
import { AppClientService } from './services/app-client.service';

// App Activity
import { AppActivity, AppActivitySchema } from './schemas/app-activity.schema';
import { AppActivityService } from './services/app-activity.service';
import { BusinessActivityController } from './controllers/business-activity.controller';

// Project Assignment
import { ProjectAssignmentService } from './services/project-assignment.service';
import { ProjectAssignmentController } from './controllers/project-assignment.controller';

// Project Issue
import { ProjectIssueService } from './services/project-issue.service';
import { ProjectIssueController } from './controllers/project-issue.controller';
import { ProjectIssue, ProjectIssueSchema } from './schemas/project-issue.schema';

// Project Comments
import { ProjectCommentsService } from './services/project-comments.service';
import { ProjectCommentsController } from './controllers/project-comments.controller';
import { ProjectComment, ProjectCommentSchema } from './schemas/project-comment.schema';

// Project Gallery
import { ProjectGalleryService } from './services/project-gallery.service';
import { ProjectGalleryController } from './controllers/project-gallery.controller';
import { ProjectGallery, ProjectGallerySchema } from './schemas/project-gallery.schema';

// Supply Requests + Equipment schema
import { SupplyRequestService } from './services/supply-request.service';
import { SupplyRequestController } from './controllers/supply-request.controller';
import { SupplyRequest, SupplyRequestSchema } from './schemas/supply-request.schema';
import { Equipment, EquipmentSchema } from './schemas/equipment.schema';

// Project Message
import { ProjectMessageService } from './services/project-message.service';
import { ProjectMessageController } from './controllers/project-message.controller';
import { ProjectMessage, ProjectMessageSchema } from './schemas/project-message.schema';

// Project Checklist
import { ProjectChecklistService } from './services/project-checklist.service';
import { ProjectChecklistController } from './controllers/project-checklist.controller';
import { ProjectChecklist, ProjectChecklistSchema } from './schemas/project-checklist.schema';

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
      { name: GeneralCampaign.name, schema: GeneralCampaignSchema },
      { name: Chat.name, schema: ChatSchema },
      { name: Discount.name, schema: DiscountSchema },
      { name: Promotion.name, schema: PromotionSchema },
      { name: ReportTag.name, schema: ReportTagSchema },
      { name: CheckinSubmission.name, schema: CheckinSubmissionSchema },
      { name: CheckinFormConfig.name, schema: CheckinFormConfigSchema },
      { name: ReportComment.name, schema: ReportCommentSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: ReportFlag.name, schema: ReportFlagSchema },
      { name: AiModel.name, schema: AiModelSchema },
      { name: AiModelClass.name, schema: AiModelClassSchema },
      { name: DetectionResult.name, schema: DetectionResultSchema },
      { name: DetectionSummary.name, schema: DetectionSummarySchema },
      { name: SocialChat.name, schema: SocialChatSchema },
      { name: SocialMessage.name, schema: SocialMessageSchema },
      { name: VerificationPhone.name, schema: VerificationPhoneSchema },
      { name: Poll.name, schema: PollSchema },
      { name: CronJobHistory.name, schema: CronJobHistorySchema },
      { name: Log.name, schema: LogSchema },
      { name: GeneratedImage.name, schema: GeneratedImageSchema },
      { name: TaskAssignment.name, schema: TaskAssignmentSchema },
      { name: StaffProfile.name, schema: StaffProfileSchema },
      { name: AgentConfiguration.name, schema: AgentConfigurationSchema },
      { name: ChatbotMessage.name, schema: ChatbotMessageSchema },
      { name: KnowledgeDocument.name, schema: KnowledgeDocumentSchema },
      { name: UnrecognizedQuery.name, schema: UnrecognizedQuerySchema },
      { name: QueryResponsePair.name, schema: QueryResponsePairSchema },
      { name: WeatherAlert.name, schema: WeatherAlertSchema },
      { name: BusinessWeatherSettings.name, schema: BusinessWeatherSettingsSchema },
      { name: ProjectWeatherSettings.name, schema: ProjectWeatherSettingsSchema },
      { name: AppProject.name, schema: AppProjectSchema },
      { name: SaasNotification.name, schema: SaasNotificationSchema },
      { name: ConstructionSite.name, schema: ConstructionSiteSchema },
      { name: OshaInspection.name, schema: OshaInspectionSchema },
      { name: OshaViolation.name, schema: OshaViolationSchema },
      { name: OshaComplianceRequirement.name, schema: OshaComplianceRequirementSchema },
      { name: OshaEquipmentCompliance.name, schema: OshaEquipmentComplianceSchema },
      { name: BusinessOnboarding.name, schema: BusinessOnboardingSchema },
      { name: BusinessClientMessage.name, schema: BusinessClientMessageSchema },
      { name: Ticket.name, schema: TicketSchema },
      { name: SkillAssessment.name, schema: SkillAssessmentSchema },
      { name: SkillTemplate.name, schema: SkillTemplateSchema },
      { name: SkillDevelopmentPlan.name, schema: SkillDevelopmentPlanSchema },
      { name: RouteOptimizationRequest.name, schema: RouteOptimizationRequestSchema },
      { name: TeamLocation.name, schema: TeamLocationSchema },
      { name: Route.name, schema: RouteSchema },
      { name: FieldTask.name, schema: FieldTaskSchema },
      { name: RouteProgress.name, schema: RouteProgressSchema },
      { name: TeamAvailability.name, schema: TeamAvailabilitySchema },
      { name: QualityInspection.name, schema: QualityInspectionSchema },
      { name: ClientFeedback.name, schema: ClientFeedbackSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: AppActivity.name, schema: AppActivitySchema },
      { name: ProjectIssue.name, schema: ProjectIssueSchema },
      { name: ProjectComment.name, schema: ProjectCommentSchema },
      { name: ProjectGallery.name, schema: ProjectGallerySchema },
      { name: SupplyRequest.name, schema: SupplyRequestSchema },
      { name: Equipment.name, schema: EquipmentSchema },
      { name: ProjectMessage.name, schema: ProjectMessageSchema },
      { name: ProjectChecklist.name, schema: ProjectChecklistSchema }
    ]),
    AutoAssignmentAgentModule,
    ComplianceMonitoringAgentModule,
    ReportGenerationAgentModule,
    ClientCommunicationAgentModule,
    ResourceRequestAgentModule,
    ShiftOptimizationAgentModule,
    MLModule,  
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
    SocialProfileController,
    GeneralCampaignController,
    ChatController,
    DiscountController,
    PromotionController,
    CommunityReportController,
    ReportTagController,
    CheckinSubmissionController,
    CheckinFormConfigController,
    NotificationController,
    AiModelController,
    CoreNotificationController,
    SocialChatController,
    SocialMessageController,
    SnapfoodieController,
    VerificationController,
    PollController,
    PollPublicController,
    CRMAIAssistantController,
    LogController,
    GeneratedImageController,
    BusinessAgentConfigController,
    StaffluentIntegrationController,
    BusinessTaskAssignmentController,
    StaffluentSuperadminController,
    BusinessChatbotController,
    KnowledgeBaseController,
    BusinessWeatherAlertController,
    VBAppProjectSyncController,
    VBConstructionSiteSyncController,
    BusinessProjectController,
    OshaComplianceController,
    OshaReportsController,
    OshaStatsController,
    OshaAuditController,
    BusinessOnboardingController,
    BusinessStorageController,
    BusinessMessagingController,
    TicketController,
    SaasNotificationController,
    BusinessSkillsController,
    BusinessGeneralController,
    RouteOptimizationController,
    FieldTaskController,
    TeamLocationController,
    ServiceAreaController,
    RouteAnalyticsController,
    WeatherRouteController,
    BusinessQualityInspectionController,
    StaffQualityInspectionController,
    ReviewerQualityInspectionController,
    FinalApproverQualityInspectionController,
    ClientQualityInspectionController,
    ClientFeedbackController,
    BusinessClientFeedbackController,
    BusinessAuditController,
    BusinessActivityController,
    ProjectAssignmentController,
    ProjectIssueController,
    ProjectCommentsController,
    ProjectGalleryController,
    SupplyRequestController,
    ProjectMessageController,
    ProjectChecklistController
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
    SocialProfileService,
    GeneralCampaignService,
    ChatService,
    PromotionService,
    DiscountService,
    CommunityReportService,
    ReportTagService,
    CheckinFormConfigService,
    CheckinSubmissionService,
    NotificationService,
    AiModelService,
    CoreNotificationService,
    SocialChatService,
    SnapfoodieService,
    OneSignalService,
    ChatGateway,
    TwilioVerificationService,
    PollService,
    OrderCronService,
    CRMAIAssistantService,
    CRMService,
    LogService,
    GeneratedImageService,
    StaffluentTaskService,
    StaffluentEmployeeService,
    BusinessTaskAssignmentService,
    BusinessChatbotService,
    KnowledgeBaseService,
    WeatherService,
    WeatherMonitorService,
    SaasNotificationService,
    VBAppProjectSyncService,
    VBConstructionSiteSyncService,
    OshaInspectionService,
    OshaComplianceService,
    OshaReportsService,
    OshaStatsService,
    BusinessOnboardingService,
    BusinessStorageService,
    BusinessMessagingService,
    TicketService,
    BusinessSkillsService,
    BusinessGeneralService,
    RouteOptimizationService,
    FieldTaskService,
    TeamLocationService,
    ServiceAreaService,
    RouteAnalyticsService,
    WeatherRouteService,
    GoogleMapsService,
    AppClientService,
    QualityInspectionService,
    ClientFeedbackService,
    AuditLogService,
    AppActivityService,
    ProjectAssignmentService,
    ProjectIssueService,
    ProjectCommentsService,
    ProjectGalleryService,
    SupplyRequestService,
    ProjectMessageService,
    ProjectChecklistService
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