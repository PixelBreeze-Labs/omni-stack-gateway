// controllers/auth.controller.ts
import { Controller, Post, Body, Headers } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SalesAssociateLoginDto } from "../dtos/user.dto";
import { StaffluentsBusinessAdminLoginDto } from "../dtos/staffluent-login.dto";
import {SnapfoodLoginDto} from "../dtos/snapfood-login.dto";
import { StaffluentOneSignalService } from '../services/staffluent-onesignal.service';

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
    constructor(private authService: AuthService,
        private staffluentOneSignalService: StaffluentOneSignalService) {}

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

    @Post('snapfood/login')
    @ApiOperation({ summary: 'Snapfood user login' })
    @ApiResponse({ status: 200, description: 'Login successful' })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async snapfoodLogin(@Body() loginDto: SnapfoodLoginDto) {
        const result = await this.authService.snapfoodLogin(loginDto);
        return result;
    }




    @Post('register-notifications')
    @ApiOperation({ summary: 'Register device for notifications after login' })
    async registerNotifications(
        @Body() body: {
            businessId: string;
            userId: string;
            playerId: string;  // Keep as playerId to match your frontend
            platform: 'web' | 'ios' | 'android';
            userRole?: string;
            deviceToken?: string;
        },
        @Headers('business-x-api-key') apiKey?: string,
    ) {
        try {
            console.log('Notification registration request:', body);
    
            // Simple fix: pass playerId directly, let service handle the logic
            const result = await this.staffluentOneSignalService.registerStaffluentDevice({
                userId: body.userId,
                businessId: body.businessId,
                playerId: body.playerId,  // Keep as playerId
                platform: body.platform,
                userRole: body.userRole || 'business_staff',
                isActive: true,
            });
    
            console.log('OneSignal registration result:', result);
    
            // Always return success - the service handles errors gracefully now
            return {
                success: true,
                message: 'Notifications registered successfully',
                playerId: result?.id || body.playerId,
            };
            
        } catch (error) {
            console.error('Notification registration error:', error);
            
            // Even on error, return success to avoid blocking user flow
            return {
                success: true,
                message: 'Notifications registration completed with warnings',
                error: error.message,
            };
        }
    }
}