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
    UnauthorizedException
} from '@nestjs/common';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { UserService } from '../services/user.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CreateUserDto, GetOrCreateUserDto } from '../dtos/user.dto';
import { Client } from '../schemas/client.schema';
import {InjectModel} from "@nestjs/mongoose";
import {Model} from "mongoose";
import {StaffUserResponse} from "../interfaces/staff-user.interface";

@ApiTags('Users')
@Controller('users')
export class UserController {
    constructor(
        private userService: UserService,
        @InjectModel(Client.name) private clientModel: Model<Client>,
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
        @Body() createUserDto: CreateUserDto,
    ) {

        // Find client and validate webhook key
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
            ...createUserDto,
            client_ids: [client._id.toString()],
        });
    }


    @Post(':venueShortCode/get-or-create')
    async getOrCreateWithLoyalty(
        @Param('venueShortCode') venueShortCode: string,
        @Headers('webhook-api-key') webhookApiKey: string,
        @Headers('x-api-key') apiKey: string,
        @Body() userData: GetOrCreateUserDto
    ) {
        return this.userService.getOrCreateWithLoyalty(venueShortCode, webhookApiKey, userData);
    }

    @Get(':venueShortCode/wallet-info/:userId')
    @ApiOperation({ summary: 'Get user wallet info' })
    @ApiResponse({ status: 200, description: 'Wallet info retrieved successfully' })
    async getWalletInfo(
        @Param('venueShortCode') venueShortCode: string,
        @Param('userId') userId: string,
        @Headers('webhook-api-key') webhookApiKey: string,
        @Headers('x-api-key') apiKey: string,
    ) {
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
}