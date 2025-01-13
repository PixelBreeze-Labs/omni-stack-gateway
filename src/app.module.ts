// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GatewayController } from './controllers/gateway.controller';
import { SnapfoodService } from './services/snapfood.service';
import { SnapfoodAdminService } from './services/snapfood-admin.service';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
  ],
  controllers: [GatewayController],
  providers: [SnapfoodService, SnapfoodAdminService],
})
export class AppModule {}