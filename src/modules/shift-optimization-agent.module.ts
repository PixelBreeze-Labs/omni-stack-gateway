// src/modules/shift-optimization-agent.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ShiftOptimizationAgentService } from '../services/shift-optimization-agent.service';
import { AgentPermissionService } from '../services/agent-permission.service';
import { ShiftOptimizationController } from '../controllers/shift-optimization.controller';
import { StaffProfile, StaffProfileSchema } from '../schemas/staff-profile.schema';
import { TaskAssignment, TaskAssignmentSchema } from '../schemas/task-assignment.schema';
import { ShiftPattern, ShiftPatternSchema } from '../schemas/shift-pattern.schema';
import { ShiftOptimizationReport, ShiftOptimizationReportSchema } from '../schemas/shift-optimization-report.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { Business, BusinessSchema } from '../schemas/business.schema';
import { AgentConfiguration, AgentConfigurationSchema } from '../schemas/agent-configuration.schema';
import { EmailService } from '../services/email.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: StaffProfile.name, schema: StaffProfileSchema },
      { name: TaskAssignment.name, schema: TaskAssignmentSchema },
      { name: ShiftPattern.name, schema: ShiftPatternSchema },
      { name: ShiftOptimizationReport.name, schema: ShiftOptimizationReportSchema },
      { name: User.name, schema: UserSchema },
      { name: Business.name, schema: BusinessSchema },
      { name: AgentConfiguration.name, schema: AgentConfigurationSchema }
    ])
  ],
  controllers: [ShiftOptimizationController],
  providers: [ShiftOptimizationAgentService, AgentPermissionService, EmailService],
  exports: [ShiftOptimizationAgentService]
})
export class ShiftOptimizationAgentModule {}