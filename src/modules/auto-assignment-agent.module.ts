// src/modules/auto-assignment-agent.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AutoAssignmentAgentService } from '../services/auto-assignment-agent.service';
import { AutoAssignmentController } from '../controllers/auto-assignment.controller';
import { TaskAssignment, TaskAssignmentSchema } from '../schemas/task-assignment.schema';
import { StaffProfile, StaffProfileSchema } from '../schemas/staff-profile.schema';
import { AgentConfiguration, AgentConfigurationSchema } from '../schemas/agent-configuration.schema';
import { AgentConfigController } from '../controllers/agent-config.controller';
import { AgentPermissionService } from '../services/agent-permission.service';
import { SchedulerRegistry } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: TaskAssignment.name, schema: TaskAssignmentSchema },
      { name: StaffProfile.name, schema: StaffProfileSchema },
      { name: AgentConfiguration.name, schema: AgentConfigurationSchema }
    ])
  ],
  controllers: [
    AutoAssignmentController,
    AgentConfigController
  ],
  providers: [
    AutoAssignmentAgentService,
    AgentPermissionService,
    SchedulerRegistry
  ],
  exports: [AutoAssignmentAgentService, AgentPermissionService, SchedulerRegistry]
})
export class AutoAssignmentAgentModule {}