// controllers/auth.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SalesAssociateLoginDto } from "../dtos/user.dto";
import { StaffluentsBusinessAdminLoginDto } from "../dtos/staffluent-login.dto";


// Define the mobile login DTO
class StaffluentMobileLoginDto {
    email: string;
    password: string;
    source_app?: string;
    firebase_token?: string;
    device_id?: string;
    device_type?: string;
    device_model?: string;
    os_version?: string;
    app_version?: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) {}

    @Post('sales-associate/login')
    @ApiOperation({ summary: 'Sales associate login' })
    @ApiResponse({ status: 200, description: 'Login successful' })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    async salesAssociateLogin(@Body() loginDto: SalesAssociateLoginDto) {
        const { token, user } = await this.authService.salesAssociateLogin(loginDto);
        return { token, user };
    }

    @Post('staffluent/business-admin/login')
    @ApiOperation({ summary: 'Staffluent business admin login' })
    @ApiResponse({ status: 200, description: 'Login successful' })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    async staffluentsBusinessAdminLogin(@Body() loginDto: StaffluentsBusinessAdminLoginDto) {
        const result = await this.authService.staffluentsUnifiedLogin(loginDto);
        return result;
    }

    @Post('staffluent/mobile/login')
    @ApiOperation({ summary: 'Staffluent mobile staff login' })
    @ApiResponse({ status: 200, description: 'Login successful' })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    @ApiResponse({ status: 404, description: 'User or business not found' })
    async staffluentsMobileLogin(@Body() loginDto: StaffluentMobileLoginDto) {
        const result = await this.authService.staffluentMobileLogin(loginDto);
        return result;
    }

    @Post('staffluent/business-admin/by-userId')
    @ApiOperation({ summary: 'Get Staffluent business admin by user ID' })
    @ApiResponse({ status: 200, description: 'Authentication successful' })
    @ApiResponse({ status: 401, description: 'Authentication failed' })
    @ApiResponse({ status: 404, description: 'User or business not found' })
    async getBusinessAdminByUserId(@Body() payload: { userId: string }) {
        const result = await this.authService.getBusinessAdminByUserId(payload.userId);
        return result;
    }
}