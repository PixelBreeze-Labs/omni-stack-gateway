// src/controllers/user.controller.ts
import {Controller, Post, Get, Body, UseGuards, Req, Delete, Param} from '@nestjs/common';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { UserService } from '../services/user.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CreateUserDto } from '../dtos/user.dto';
import { Client } from '../schemas/client.schema';

@ApiTags('Users')
@Controller('users')
export class UserController {
    constructor(private userService: UserService) {}

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
}