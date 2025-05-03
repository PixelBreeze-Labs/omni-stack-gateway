// src/modules/resource-request-agent.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ResourceRequestAgentService } from '../services/resource-request-agent.service';
import { AgentPermissionService } from '../services/agent-permission.service';
import { ResourceItemController } from '../controllers/resource-item.controller';
import { ResourceRequestController } from '../controllers/resource-request.controller';
import { ResourceForecastController } from '../controllers/resource-forecast.controller';
import { ResourceUsageController } from '../controllers/resource-usage.controller';
import { ResourceOptimizationController } from '../controllers/resource-optimization.controller';
import { ResourceAgentConfigController } from '../controllers/resource-agent-config.controller';
import { ResourceItem, ResourceItemSchema } from '../schemas/resource-item.schema';
import { ResourceRequest, ResourceRequestSchema } from '../schemas/resource-request.schema';
import { ResourceUsage, ResourceUsageSchema } from '../schemas/resource-usage.schema';
import { ResourceForecast, ResourceForecastSchema } from '../schemas/resource-forecast.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { Business, BusinessSchema } from '../schemas/business.schema';
import { AgentConfiguration, AgentConfigurationSchema } from '../schemas/agent-configuration.schema';
import { EmailService } from '../services/email.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    MongooseModule.forFeature([
      { name: ResourceItem.name, schema: ResourceItemSchema },
      { name: ResourceRequest.name, schema: ResourceRequestSchema },
      { name: ResourceUsage.name, schema: ResourceUsageSchema },
      { name: ResourceForecast.name, schema: ResourceForecastSchema },
      { name: User.name, schema: UserSchema },
      { name: Business.name, schema: BusinessSchema },
      { name: AgentConfiguration.name, schema: AgentConfigurationSchema }
    ])
  ],
  controllers: [
    ResourceItemController,
    ResourceRequestController,
    ResourceForecastController,
    ResourceUsageController,
    ResourceOptimizationController,
    ResourceAgentConfigController
  ],
  providers: [
    ResourceRequestAgentService,
    AgentPermissionService,
    EmailService
  ],
  exports: [ResourceRequestAgentService]
})
export class ResourceRequestAgentModule {}