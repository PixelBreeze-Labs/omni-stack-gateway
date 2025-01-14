// src/app.module.ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StudentVerificationController } from './controllers/student-verification.controller';
import { GatewayController } from './controllers/gateway.controller';
import { SnapfoodAdminService } from './services/snapfood-admin.service';
import { SnapfoodService } from './services/snapfood.service';
import { ApiKeyMiddleware } from './middleware/api-key.middleware';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
  ],
  controllers: [GatewayController, StudentVerificationController],
  providers: [SnapfoodService, SnapfoodAdminService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
        .apply(ApiKeyMiddleware)
        .forRoutes('*');
  }
}