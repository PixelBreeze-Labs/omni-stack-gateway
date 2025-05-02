// src/modules/auto-assignment-agent.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AutoAssignmentAgentService } from '../services/auto-assignment-agent.service';
import { AutoAssignmentController } from '../controllers/auto-assignment.controller';
import { TaskAssignment, TaskAssignmentSchema } from '../schemas/task-assignment.schema';
import { StaffProfile, StaffProfileSchema } from '../schemas/staff-profile.schema';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: TaskAssignment.name, schema: TaskAssignmentSchema },
      { name: StaffProfile.name, schema: StaffProfileSchema }
    ])
  ],
  controllers: [AutoAssignmentController],
  providers: [AutoAssignmentAgentService],
  exports: [AutoAssignmentAgentService]
})
export class AutoAssignmentAgentModule {}