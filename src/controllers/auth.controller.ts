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




// Fixed backend endpoint - handle OneSignal ID properly
@Post('register-notifications')
@ApiOperation({ summary: 'Register device for notifications after login' })
async registerNotifications(
    @Body() body: {
        businessId: string;
        userId: string;
        playerId: string;  // This is now the OneSignal ID from dashboard
        platform: 'web' | 'ios' | 'android';
        userRole?: string;
        subscriptionId?: string; // Optional subscription ID
        deviceToken?: string;
    },
    @Headers('business-x-api-key') apiKey?: string,
) {
    try {
        console.log('=== Notification Registration Request ===');
        console.log('Request body:', body);
        console.log('PlayerId (OneSignal ID):', body.playerId);
        console.log('SubscriptionId:', body.subscriptionId);
        console.log('========================================');

        // FIXED: Use the OneSignal ID (playerId) to update the correct player
        const result = await this.staffluentOneSignalService.registerStaffluentDevice({
            userId: body.userId,
            businessId: body.businessId,
            playerId: body.playerId,  // This is the OneSignal ID that shows in dashboard
            platform: body.platform,
            userRole: body.userRole || 'business_staff',
            isActive: true,
        });

        console.log('OneSignal registration result:', result);

        return {
            success: true,
            message: 'Notifications registered successfully',
            playerId: body.playerId, // Return the OneSignal ID we used
            oneSignalId: body.playerId,
            subscriptionId: body.subscriptionId,
            note: `Look for OneSignal ID: ${body.playerId} in your dashboard`
        };
        
    } catch (error) {
        console.error('Notification registration error:', error);
        
        return {
            success: true, // Still return success to avoid blocking user flow
            message: 'Notifications registration completed with warnings',
            error: error.message,
            playerId: body.playerId,
        };
    }
}
}