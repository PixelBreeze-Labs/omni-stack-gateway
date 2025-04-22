// src/controllers/user.controller.ts
import {
    Controller,
    Post,
    Get,
    Body,
    UseGuards,
    Req,
    Delete,
    Param,
    Headers,
    Query,
    Patch,
    UnauthorizedException, NotFoundException
} from '@nestjs/common';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { UserService } from '../services/user.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CreateUserDto, GetOrCreateUserDto, CreateQytetaretUserDto } from '../dtos/user.dto';
import { Client } from '../schemas/client.schema';
import {InjectModel} from "@nestjs/mongoose";
import {Model} from "mongoose";
import {StaffUserResponse} from "../interfaces/staff-user.interface";
import {ChangePasswordDto} from "../dtos/user.dto";
import { GetOrCreateGuestDto } from '../dtos/guest.dto';
import { EmailService } from "../services/email.service";

@ApiTags('Users')
@Controller('users')
export class UserController {
    constructor(
        private userService: UserService,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        private emailService: EmailService
    ) {}

    @Post()
    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @ApiOperation({ summary: 'Create new user' })
    @ApiResponse({ status: 201, description: 'User created successfully' })
    async createUser(
        @Body() createUserDto: CreateUserDto,
        @Req() req: Request & { client: Client }
    ) {
        // Pass along client_ids from the authenticated client.
        return this.userService.create({
            ...createUserDto,
            client_ids: [req.client.id],
        });
    }

    @Get()
    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @ApiOperation({ summary: 'List users' })
    @ApiResponse({ status: 200, description: 'List of users' })
    async listUsers(@Req() req: Request & { client: Client }) {
        return this.userService.findByClientId(req.client.id);
    }

    @Delete(':id')
    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @ApiOperation({ summary: 'Delete user' })
    @ApiResponse({ status: 200, description: 'User deleted successfully' })
    async deleteUser(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.userService.delete(id);
    }

    @Post(':venueShortCode/register')
    @ApiOperation({ summary: 'Register new user' })
    @ApiResponse({ status: 201, description: 'User registered successfully' })
    async registerUser(
        @Param('venueShortCode') venueShortCode: string,
        @Headers('webhook-api-key') webhookApiKey: string,
        @Headers('x-api-key') apiKey: string,
        @Body() userData: any
    ) {

         // Extract the email_verify_link if it exists
        const { email_verify_link, ...userDataWithoutLink } = userData;

        // // Find client and validate webhook key
        const client = await this.clientModel.findOne({
            'venueBoostConnection.venueShortCode': venueShortCode,
            'venueBoostConnection.webhookApiKey': webhookApiKey,
            'venueBoostConnection.status': 'connected'
        });

        if (!client) {
            throw new UnauthorizedException('Invalid venue or webhook key');
        }

        // Pass along client_ids from the authenticated client.
        return this.userService.registerUser({
            ...userDataWithoutLink,
            client_ids: [client._id.toString()],
        }, email_verify_link);
    }


    @Post(':venueShortCode/get-or-create')
    async getOrCreateWithLoyalty(
        @Param('venueShortCode') venueShortCode: string,
        @Headers('webhook-api-key') webhookApiKey: string,
        @Headers('x-api-key') apiKey: string,
        @Body() userData: any // Use 'any' to capture all incoming fields
    ) {
        // Extract the email_verify_link if it exists
        const { email_verify_link, ...userDataWithoutLink } = userData;
        
        return this.userService.getOrCreateWithLoyalty(
            venueShortCode, 
            webhookApiKey, 
            userDataWithoutLink as GetOrCreateUserDto,
            email_verify_link
        );
    }

    @Get(':venueShortCode/wallet-info/:userId')
    @ApiOperation({ summary: 'Get user wallet info' })
    @ApiResponse({ status: 200, description: 'Wallet info retrieved successfully' })
    async getWalletInfo(
        @Param('venueShortCode') encodedVenueShortCode: string,
        @Param('userId') userId: string,
        @Headers('webhook-api-key') webhookApiKey: string,
        @Headers('x-api-key') apiKey: string,
    ) {
        // Decode the URL-encoded short code
        const venueShortCode = decodeURIComponent(encodedVenueShortCode);
        return this.userService.getWalletInfo(venueShortCode, webhookApiKey, userId);
    }

    @Get('staff')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get users registered via Staffluent with their businesses' })
    @ApiResponse({ status: 200, description: 'Returns a list of staff users and their businesses' })
    async getStaffUsers(
        @Req() req: Request & { client: Client },
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
        @Query('sort') sort?: string
    ): Promise<StaffUserResponse> {
        return this.userService.getStaffUsers(
            req.client.id,
            {
                page,
                limit,
                search,
                sort
            }
        );
    }

    @Get('staff/admin')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get admin users registered via Staffluent with their businesses' })
    @ApiResponse({ status: 200, description: 'Returns a list of staff admin users and their businesses' })
    async getStaffAdminUsers(
        @Req() req: Request & { client: Client },
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
        @Query('sort') sort?: string
    ): Promise<StaffUserResponse> {  // Add the return type here
        return this.userService.getStaffAdminUsers(
            req.client.id,
            {
                page,
                limit,
                search,
                sort
            }
        );
    }
    // Updated controller method that uses ClientAuthGuard and extracts userId from request
    @Patch('password/:userId')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Change user password' })
    @ApiResponse({ status: 200, description: 'Password changed successfully' })
    @ApiResponse({ status: 400, description: 'Invalid request' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async changePassword(
        @Param('userId') userId: string,
        @Req() req: Request & { client: Client },
        @Body() changePasswordDto: ChangePasswordDto
    ) {
        // Verify that the user belongs to the authenticated client
        const user = await this.userService.findById(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (!user.client_ids.includes(req.client.id)) {
            throw new UnauthorizedException('User does not belong to this client');
        }

        return this.userService.changePassword(
            userId,
            changePasswordDto
        );
    }


    @Post(':venueShortCode/get-or-create-guest')
    async getOrCreateGuest(
        @Param('venueShortCode') encodedVenueShortCode: string,
        @Headers('webhook-api-key') webhookApiKey: string,
        @Headers('x-api-key') apiKey: string,
        @Body() guestData: GetOrCreateGuestDto
    ) {
        // Decode the URL-encoded short code
        const venueShortCode = decodeURIComponent(encodedVenueShortCode);
        return this.userService.getOrCreateGuest(venueShortCode, webhookApiKey, guestData);
    }

    @Post('qytetaret')
    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @ApiOperation({ summary: 'Create Qytetaret user' })
    @ApiResponse({ status: 201, description: 'User created successfully' })
    async createQytetaretUser(
        @Body() createQytetaretUserDto: CreateQytetaretUserDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.userService.createQytetaretUser({
            ...createQytetaretUserDto,
            client_ids: [req.client.id],
        });
    }

    // Add these endpoints to your src/controllers/user.controller.ts

    @Get('with-nextjs-id')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get users with nextJsUserId' })
    @ApiResponse({ status: 200, description: 'Returns users with nextJsUserId in external_ids' })
    async getUsersWithNextJsId(
        @Req() req: Request & { client: Client },
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string
    ) {
        return this.userService.findUsersWithNextJsId(
            req.client.id,
            {
                page,
                limit,
                search
            }
        );
    }

    @Get('with-multiple-reports')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get users with multiple active reports' })
    @ApiResponse({ status: 200, description: 'Returns users with multiple active reports' })
    async getUsersWithMultipleReports(
        @Req() req: Request & { client: Client },
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
        @Query('minReports') minReports?: number
    ) {
        return this.userService.findUsersWithMultipleActiveReports(
            req.client.id,
            {
                page,
                limit,
                search,
                minReports: minReports ? parseInt(minReports as unknown as string) : undefined
            }
        );
    }


    @Post('email/new-member-notification')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Send notification to admin about new member registration' })
    @ApiResponse({ status: 200, description: 'Email sent successfully' })
    async sendNewMemberNotification(
        @Body() data: {
            member: {
                first_name: string;
                last_name: string;
                email: string;
                phone_number?: string;
                city?: string;
                address?: string;
                birthday?: string;
                preferred_brand?: string;
            },
            source: 'landing_page' | 'from_my_club';
            preferredBrand?: string;
            adminEmail: string;
        }
    ) {
        try {
            // Format source text for display
            const sourceText = data.source === 'landing_page' ? 'Faqja Kryesore' : 'Klubin e Klientëve';
            
            // Boolean flags for template conditionals
            const isLandingPage = data.source === 'landing_page';
            const isMyClub = data.source === 'from_my_club';
            
            // Send email to admin
            await this.emailService.sendTemplateEmail(
                'MetroShop',
                'metroshop@omnistackhub.xyz',
                'metroshopweb@gmail.com', // Fixed email or data.adminEmail
                'Regjistrim i një anëtari të ri',
                'templates/metroshop/new-member-notification.html',
                {
                    member: data.member,
                    sourceText: sourceText,
                    preferredBrand: data.preferredBrand,
                    isLandingPage: isLandingPage,
                    isMyClub: isMyClub,
                    year: new Date().getFullYear()
                }
            );
            
            return { success: true, message: 'Email sent successfully' };
        } catch (error) {
            return { success: false, message: 'Failed to send template email: ' + error.message };
        }
    }

    @Post('email/new-user-welcome')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Send welcome email to a new user' })
    @ApiResponse({ status: 200, description: 'Email sent successfully' })
    async sendNewUserWelcome(
        @Body() data: {
            name: string;
            email: string;
            password: string;
        }
    ) {
        try {
            await this.emailService.sendTemplateEmail(
                'MetroShop',
                'metroshop@omnistackhub.xyz',
                data.email,
                `${data.name}, Llogaria juaj në MetroShop është gati!`,
                'templates/metroshop/new-member-to-user-welcome.html',
                {
                    userName: data.name,
                    userEmail: data.email,
                    password: data.password,
                    year: new Date().getFullYear()
                }
            );
            
            return { success: true, message: 'Email sent successfully' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }
}