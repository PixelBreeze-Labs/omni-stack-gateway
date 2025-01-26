// src/controllers/student-verification.controller.ts
import { Controller, Put, Body } from '@nestjs/common';
import { SnapfoodAdminService } from '../services/snapfood-admin.service';
import {ApiBody, ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";

@ApiTags('Student Verification')
@Controller('api/student-verification')
export class StudentVerificationController {
    constructor(private readonly snapfoodAdminService: SnapfoodAdminService) {}

    @ApiOperation({ summary: 'Send student verification email' })
    @ApiBody({ description: 'Verification data' })
    @ApiResponse({ status: 200, description: 'Email sent' })
    @Put('email')
    async sendVerificationEmail(@Body() data: any) {
        return await this.snapfoodAdminService.forward(
            'external/student-verification/email',
            'PUT',
            data
        );
    }
}