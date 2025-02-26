import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';
import { AdminSubscriptionService } from '../services/admin-subscription.service';
import { AdminRegisterDto } from '../dtos/admin-register.dto';

@ApiTags('Admin Subscription Management')
@ApiBearerAuth()
@Controller('admin-subscription')
@UseGuards(ClientAuthGuard)
export class AdminSubscriptionController {
    constructor(
        private adminSubscriptionService: AdminSubscriptionService
    ) {}

    @ApiOperation({ summary: 'Register and subscribe a business directly from admin panel' })
    @ApiResponse({
        status: 201,
        description: 'Business registered and subscribed successfully',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                message: { type: 'string', example: 'Business registered and subscribed successfully' },
                businessId: { type: 'string', example: '60d5ec9f1a0a0e001f4f3c7a' },
                userId: { type: 'string', example: '60d5ec9f1a0a0e001f4f3c7b' },
                email: { type: 'string', example: 'business@example.com' },
                password: { type: 'string', example: 'Temp1234!' },
                subscription: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', example: 'sub_1234567890' },
                        status: { type: 'string', example: 'active' }
                    }
                },
                auth_response: {
                    type: 'object',
                    properties: {
                        user: {
                            type: 'object',
                            properties: {
                                id: { type: 'number', example: 123 },
                                name: { type: 'string', example: 'John Doe' },
                                email: { type: 'string', example: 'business@example.com' }
                            }
                        },
                        token: { type: 'string' },
                        account_type: { type: 'string', example: 'business' },
                        refresh_token: { type: 'string' }
                    }
                }
            }
        }
    })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 409, description: 'User with this email already exists' })
    @Post('admin-register')
    async adminRegisterAndSubscribe(
        @Req() req: Request & { client: Client },
        @Body() data: AdminRegisterDto
    ) {
        // Create a properly typed object that includes the clientId
        const registrationData = {
            businessName: data.businessName,
            businessEmail: data.businessEmail,
            businessType: data.businessType,
            fullName: data.fullName,
            phone: data.phone,
            address: data.address,
            subscription: data.subscription,
            autoVerifyEmail: data.autoVerifyEmail,
            sendWelcomeEmail: data.sendWelcomeEmail,
            clientId: req.client.id
        };

        return this.adminSubscriptionService.registerAndSubscribeBusiness(registrationData);
    }
}