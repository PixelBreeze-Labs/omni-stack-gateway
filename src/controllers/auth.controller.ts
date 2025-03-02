// controllers/auth.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {SalesAssociateLoginDto} from "../dtos/user.dto";
import {StaffluentsBusinessAdminLoginDto} from "../dtos/staffluent-login.dto";

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
}