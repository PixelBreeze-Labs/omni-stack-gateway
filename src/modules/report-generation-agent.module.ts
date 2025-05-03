import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ReportGenerationAgentService } from '../services/report-generation-agent.service';
import { AgentPermissionService } from '../services/agent-permission.service';
import { ReportTemplateController } from '../controllers/report-template.controller';
import { GeneratedReportController } from '../controllers/generated-report.controller';
import { ReportTemplate, ReportTemplateSchema } from '../schemas/report-template.schema';
import { GeneratedReport, GeneratedReportSchema } from '../schemas/generated-report.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { Business, BusinessSchema } from '../schemas/business.schema';
import { AgentConfiguration, AgentConfigurationSchema } from '../schemas/agent-configuration.schema';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from '../services/email.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule, // Add this to get access to ConfigService needed by EmailService
    MongooseModule.forFeature([
      { name: ReportTemplate.name, schema: ReportTemplateSchema },
      { name: GeneratedReport.name, schema: GeneratedReportSchema },
      { name: User.name, schema: UserSchema },
      { name: Business.name, schema: BusinessSchema },
      { name: AgentConfiguration.name, schema: AgentConfigurationSchema }
    ])
  ],
  controllers: [
    ReportTemplateController,
    GeneratedReportController
  ],
  providers: [
    ReportGenerationAgentService, 
    AgentPermissionService,
    EmailService
  ],
  exports: [ReportGenerationAgentService]
})
export class ReportGenerationAgentModule {}