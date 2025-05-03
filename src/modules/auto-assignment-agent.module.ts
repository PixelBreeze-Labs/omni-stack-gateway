// src/modules/auto-assignment-agent.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AutoAssignmentAgentService } from '../services/auto-assignment-agent.service';
import { AgentPermissionService } from '../services/agent-permission.service';
import { ClientService } from '../services/client.service';
import { ClientApiKeyService } from '../services/client-api-key.service';
import { ReportsService } from '../services/reports.service';
import { PollService } from '../services/poll.service'; // Add this import
import { AutoAssignmentController } from '../controllers/auto-assignment.controller';
import { AgentConfigController } from '../controllers/agent-config.controller';
import { TaskAssignment, TaskAssignmentSchema } from '../schemas/task-assignment.schema';
import { StaffProfile, StaffProfileSchema } from '../schemas/staff-profile.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { Business, BusinessSchema } from '../schemas/business.schema';
import { AgentConfiguration, AgentConfigurationSchema } from '../schemas/agent-configuration.schema';
import { Client, ClientSchema } from '../schemas/client.schema';
import { Poll, PollSchema } from '../schemas/poll.schema';
import { ClientApp, ClientAppSchema } from '../schemas/client-app.schema';
// report
import { Report, ReportSchema } from '../schemas/report.schema';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from '../services/email.service';
import { SupabaseService } from '../services/supabase.service';
import { ClientAppService } from '../services/client-app.service';
@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule, // Add this to get access to ConfigService needed by EmailService
    MongooseModule.forFeature([
      { name: TaskAssignment.name, schema: TaskAssignmentSchema },
      { name: StaffProfile.name, schema: StaffProfileSchema },
      { name: User.name, schema: UserSchema },
      { name: Business.name, schema: BusinessSchema },
      { name: AgentConfiguration.name, schema: AgentConfigurationSchema },
      { name: Client.name, schema: ClientSchema },
      { name: Poll.name, schema: PollSchema },
      { name: ClientApp.name, schema: ClientAppSchema },
      { name: Report.name, schema: ReportSchema }
    ])
  ],
  controllers: [AutoAssignmentController, AgentConfigController],
  providers: [
    AutoAssignmentAgentService, 
    AgentPermissionService, 
    ClientService, 
    ClientApiKeyService, 
    ReportsService,
    PollService,
    EmailService,
    SupabaseService,
    ClientAppService
  ],
  exports: [
    AutoAssignmentAgentService, 
    AgentPermissionService, 
    ClientService, 
    ClientApiKeyService, 
    ReportsService,
    PollService,
    EmailService,
    SupabaseService,
    ClientAppService
  ]
})
export class AutoAssignmentAgentModule {}