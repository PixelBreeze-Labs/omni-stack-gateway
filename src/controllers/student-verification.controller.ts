// src/controllers/student-verification.controller.ts
import { Controller, Put, Body } from '@nestjs/common';
import { SnapfoodAdminService } from '../services/snapfood-admin.service';

@Controller('api/student-verification')
export class StudentVerificationController {
    constructor(private readonly snapfoodAdminService: SnapfoodAdminService) {}

    @Put('email')
    async sendVerificationEmail(@Body() data: any) {
        return await this.snapfoodAdminService.forward(
            'external/student-verification/email',
            'PUT',
            data
        );
    }
}