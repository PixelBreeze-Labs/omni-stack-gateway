// src/modules/auto-assignment-agent.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AutoAssignmentAgentService } from '../services/auto-assignment-agent.service';
import { AgentPermissionService } from '../services/agent-permission.service';
import { AutoAssignmentController } from '../controllers/auto-assignment.controller';
import { AgentConfigController } from '../controllers/agent-config.controller';
import { TaskAssignment, TaskAssignmentSchema } from '../schemas/task-assignment.schema';
import { StaffProfile, StaffProfileSchema } from '../schemas/staff-profile.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { Business, BusinessSchema } from '../schemas/business.schema';
import { AgentConfiguration, AgentConfigurationSchema } from '../schemas/agent-configuration.schema';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: TaskAssignment.name, schema: TaskAssignmentSchema },
      { name: StaffProfile.name, schema: StaffProfileSchema },
      { name: User.name, schema: UserSchema },
      { name: Business.name, schema: BusinessSchema },
      { name: AgentConfiguration.name, schema: AgentConfigurationSchema }
    ])
  ],
  controllers: [AutoAssignmentController, AgentConfigController],
  providers: [AutoAssignmentAgentService, AgentPermissionService],
  exports: [AutoAssignmentAgentService, AgentPermissionService]
})
export class AutoAssignmentAgentModule {}