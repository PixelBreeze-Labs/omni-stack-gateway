// src/modules/compliance-monitoring-agent.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ComplianceMonitoringAgentService } from '../services/compliance-monitoring-agent.service';
import { AgentPermissionService } from '../services/agent-permission.service';
import { ComplianceCertificationController } from '../controllers/compliance-certification.controller';
import { ComplianceRuleController } from '../controllers/compliance-rule.controller';
import { ComplianceAlertController } from '../controllers/compliance-alert.controller';
import { StaffCertification, StaffCertificationSchema } from '../schemas/staff-certification.schema';
import { ComplianceRule, ComplianceRuleSchema } from '../schemas/compliance-rule.schema';
import { ComplianceAlert, ComplianceAlertSchema } from '../schemas/compliance-alert.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { Business, BusinessSchema } from '../schemas/business.schema';
import { AgentConfiguration, AgentConfigurationSchema } from '../schemas/agent-configuration.schema';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: StaffCertification.name, schema: StaffCertificationSchema },
      { name: ComplianceRule.name, schema: ComplianceRuleSchema },
      { name: ComplianceAlert.name, schema: ComplianceAlertSchema },
      { name: User.name, schema: UserSchema },
      { name: Business.name, schema: BusinessSchema },
      { name: AgentConfiguration.name, schema: AgentConfigurationSchema }
    ])
  ],
  controllers: [
    ComplianceCertificationController,
    ComplianceRuleController,
    ComplianceAlertController
  ],
  providers: [ComplianceMonitoringAgentService, AgentPermissionService],
  exports: [ComplianceMonitoringAgentService]
})
export class ComplianceMonitoringAgentModule {}