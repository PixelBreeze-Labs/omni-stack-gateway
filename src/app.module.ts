// src/app.module.ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { StudentVerificationController } from './controllers/student-verification.controller';
import { GatewayController } from './controllers/gateway.controller';
import { SnapfoodAdminService } from './services/snapfood-admin.service';
import { SnapfoodService } from './services/snapfood.service';
import { ApiKeyMiddleware } from './middleware/api-key.middleware';
import configuration from './config/configuration';
import { ClientAppSchema } from './schemas/client-app.schema';
import { ReportSchema } from './schemas/report.schema';
import { ReportsController } from './controllers/reports.controller';
import { ReportsService } from './services/reports.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: 'ClientApp', schema: ClientAppSchema },
      { name: 'Report', schema: ReportSchema }
    ]),
  ],
  controllers: [
    GatewayController,
    StudentVerificationController,
    ReportsController
  ],
  providers: [
    SnapfoodService,
    SnapfoodAdminService,
    ReportsService
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
        .apply(ApiKeyMiddleware)
        .forRoutes('*');
  }
}