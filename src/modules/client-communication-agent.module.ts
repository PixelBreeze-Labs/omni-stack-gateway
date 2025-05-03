// src/modules/client-communication-agent.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientCommunicationAgentService } from '../services/client-communication-agent.service';
import { AgentPermissionService } from '../services/agent-permission.service';
import { ClientMessageController } from '../controllers/client-message.controller';
import { CommunicationTemplateController } from '../controllers/communication-template.controller';
import { TopicClassifierController } from '../controllers/topic-classifier.controller';
import { ClientCommunicationConfigController } from '../controllers/client-communication-config.controller';
import { ClientMessage, ClientMessageSchema } from '../schemas/client-message.schema';
import { CommunicationTemplate, CommunicationTemplateSchema } from '../schemas/communication-template.schema';
import { TopicClassifier, TopicClassifierSchema } from '../schemas/topic-classifier.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { Business, BusinessSchema } from '../schemas/business.schema';
import { AgentConfiguration, AgentConfigurationSchema } from '../schemas/agent-configuration.schema';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    MongooseModule.forFeature([
      { name: ClientMessage.name, schema: ClientMessageSchema },
      { name: CommunicationTemplate.name, schema: CommunicationTemplateSchema },
      { name: TopicClassifier.name, schema: TopicClassifierSchema },
      { name: User.name, schema: UserSchema },
      { name: Business.name, schema: BusinessSchema },
      { name: AgentConfiguration.name, schema: AgentConfigurationSchema }
    ])
  ],
  controllers: [
    ClientMessageController,
    CommunicationTemplateController,
    TopicClassifierController,
    ClientCommunicationConfigController
  ],
  providers: [ClientCommunicationAgentService, AgentPermissionService],
  exports: [ClientCommunicationAgentService]
})
export class ClientCommunicationAgentModule {}