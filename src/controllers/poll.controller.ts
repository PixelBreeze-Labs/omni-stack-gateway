// src/controllers/poll.controller.ts
import {
    Controller,
    Get,
    Post,
    Body,
    Put,
    Param,
    Delete,
    Query,
    Req,
    UseGuards,
    HttpStatus,
    HttpCode,
    UnauthorizedException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiParam,
    ApiBody,
    ApiQuery
} from '@nestjs/swagger';
import { PollService } from '../services/poll.service';
import {
    CreatePollDto,
    CreateMultiClientPollDto,
    UpdatePollDto,
    PollVoteDto,
    ListPollsQueryDto,
    AddClientToPollDto,
    RemoveClientFromPollDto
} from '../dtos/poll.dto';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Poll } from '../schemas/poll.schema';

@ApiTags('Polls')
@Controller('polls')
export class PollController {
    constructor(
        private readonly pollService: PollService
    ) {}

    @Post()
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a new poll' })
    @ApiResponse({
        status: HttpStatus.CREATED,
        description: 'The poll has been successfully created',
        type: Poll
    })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
    async create(
        @Body() createPollDto: CreatePollDto,
        @Req() req: Request & { client: any }
    ): Promise<Poll> {
        // Ensure the clientId in the DTO matches the authenticated client
        createPollDto.clientId = req.client.id;
        
        // Create the poll
        return this.pollService.create(createPollDto);
    }

    @Post('multi-client')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a new multi-client poll' })
    @ApiResponse({
        status: HttpStatus.CREATED,
        description: 'The multi-client poll has been successfully created',
        type: Poll
    })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
    async createMultiClient(
        @Body() createMultiClientPollDto: CreateMultiClientPollDto
    ): Promise<Poll> {
        // Create the multi-client poll
        return this.pollService.createMultiClientPoll(createMultiClientPollDto);
    }

    @Get()
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all polls for the client' })
    @ApiResponse({ 
        status: HttpStatus.OK, 
        description: 'List of polls' 
    })
    @ApiQuery({ name: 'includeMultiClient', description: 'Include multi-client polls', required: false, type: Boolean })
    async findAll(
        @Query() query: ListPollsQueryDto,
        @Req() req: Request & { client: any }
    ) {
        return this.pollService.findAll(req.client.id, query);
    }

    @Get('owned')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all polls owned by the client (primary client)' })
    @ApiResponse({ 
        status: HttpStatus.OK, 
        description: 'List of owned polls'
    })
    async findOwnedPolls(
        @Query() query: ListPollsQueryDto,
        @Req() req: Request & { client: any }
    ) {
        return this.pollService.findOwnedPolls(req.client.id, query);
    }

    @Get('multi-client')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all multi-client polls the client has access to' })
    @ApiResponse({ 
        status: HttpStatus.OK, 
        description: 'List of multi-client polls'
    })
    async findMultiClientPolls(
        @Query() query: ListPollsQueryDto,
        @Req() req: Request & { client: any }
    ) {
        return this.pollService.findMultiClientPolls(req.client.id, query);
    }

    @Get('stats')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get poll statistics' })
    @ApiResponse({ 
        status: HttpStatus.OK, 
        description: 'Poll statistics' 
    })
    async getStats(
        @Req() req: Request & { client: any }
    ) {
        return this.pollService.getStats(req.client.id);
    }

    @Get(':id')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get a specific poll' })
    @ApiParam({ name: 'id', description: 'Poll ID' })
    @ApiQuery({ name: 'clientId', description: 'Client ID (optional)', required: false })
    @ApiResponse({ 
        status: HttpStatus.OK, 
        description: 'The poll data', 
        type: Poll 
    })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Poll not found' })
    async findOne(
        @Param('id') id: string,
        @Query('clientId') queryClientId: string,
        @Req() req: Request & { client: any }
    ): Promise<Poll> {
        // Use the clientId from query parameter if provided, otherwise use the authenticated client's ID
        const clientId = queryClientId || req.client.id;
        
        return this.pollService.findOne(id, clientId);
    }

    @Get(':id/client-specific')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get a poll with client-specific styling applied' })
    @ApiParam({ name: 'id', description: 'Poll ID' })
    @ApiResponse({ 
        status: HttpStatus.OK, 
        description: 'The poll data with client-specific styling', 
        type: Poll 
    })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Poll not found' })
    async getClientSpecific(
        @Param('id') id: string,
        @Req() req: Request & { client: any }
    ): Promise<Poll> {
        return this.pollService.getClientSpecificPoll(id, req.client.id);
    }

    @Get('wordpress/:wordpressId')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get a poll by WordPress ID' })
    @ApiParam({ name: 'wordpressId', description: 'WordPress Poll ID' })
    @ApiResponse({ 
        status: HttpStatus.OK, 
        description: 'The poll data', 
        type: Poll 
    })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Poll not found' })
    async findByWordpressId(
        @Param('wordpressId') wordpressId: number,
        @Req() req: Request & { client: any }
    ): Promise<Poll> {
        return this.pollService.findByWordpressId(wordpressId, req.client.id);
    }

    @Put(':id')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update a poll' })
    @ApiParam({ name: 'id', description: 'Poll ID' })
    @ApiBody({ type: UpdatePollDto })
    @ApiResponse({ 
        status: HttpStatus.OK, 
        description: 'The poll has been successfully updated', 
        type: Poll 
    })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Poll not found' })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Not authorized to update this poll' })
    async update(
        @Param('id') id: string,
        @Body() updatePollDto: UpdatePollDto,
        @Req() req: Request & { client: any }
    ): Promise<Poll> {
        return this.pollService.update(id, req.client.id, updatePollDto);
    }

    @Delete(':id')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete a poll' })
    @ApiParam({ name: 'id', description: 'Poll ID' })
    @ApiQuery({ name: 'clientId', description: 'Client ID (optional)', required: false })
    @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'The poll has been successfully deleted' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Poll not found' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Not authorized to delete this poll' })
    async remove(
        @Param('id') id: string,
        @Query('clientId') queryClientId: string,
        @Req() req: Request & { client: any }
    ): Promise<void> {
        // Use the clientId from query parameter if provided, otherwise use the authenticated client's ID
        const clientId = queryClientId || req.client.id;
        await this.pollService.delete(id, clientId);
    }

    @Post(':id/vote')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Vote on a poll option' })
    @ApiParam({ name: 'id', description: 'Poll ID' })
    @ApiBody({ type: PollVoteDto })
    @ApiResponse({ 
        status: HttpStatus.OK, 
        description: 'Vote registered successfully', 
        type: Poll 
    })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Poll not found' })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid option index' })
    async vote(
        @Param('id') id: string,
        @Body() voteDto: PollVoteDto,
        @Req() req: Request & { client: any }
    ): Promise<Poll> {
        return this.pollService.vote(id, req.client.id, voteDto);
    }

    @Post(':id/clients')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Add a client to a poll' })
    @ApiParam({ name: 'id', description: 'Poll ID' })
    @ApiBody({ type: AddClientToPollDto })
    @ApiResponse({ 
        status: HttpStatus.OK, 
        description: 'Client added to poll successfully', 
        type: Poll 
    })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Poll not found' })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid client ID' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Not authorized to add clients to this poll' })
    async addClient(
        @Param('id') id: string,
        @Body() addClientDto: AddClientToPollDto,
        @Req() req: Request & { client: any }
    ): Promise<Poll> {
        return this.pollService.addClient(id, req.client.id, addClientDto);
    }

    @Delete(':id/clients/:clientId')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Remove a client from a poll' })
    @ApiParam({ name: 'id', description: 'Poll ID' })
    @ApiParam({ name: 'clientId', description: 'Client ID to remove' })
    @ApiResponse({ 
        status: HttpStatus.OK, 
        description: 'Client removed from poll successfully', 
        type: Poll 
    })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Poll not found' })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid client ID or cannot remove primary client' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Not authorized to remove clients from this poll' })
    async removeClient(
        @Param('id') id: string,
        @Param('clientId') clientIdToRemove: string,
        @Req() req: Request & { client: any }
    ): Promise<Poll> {
        // Create the DTO from the path parameter
        const removeClientDto: RemoveClientFromPollDto = {
            clientId: clientIdToRemove
        };
        
        return this.pollService.removeClient(id, req.client.id, removeClientDto);
    }


    @Get('stats/by-client/:clientId')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get poll statistics for a specific client' })
    @ApiParam({ name: 'clientId', description: 'Client ID' })
    @ApiResponse({ 
        status: HttpStatus.OK, 
        description: 'Poll statistics' 
    })
    async getStatsByClientId(
        @Param('clientId') clientId: string,
        @Req() req: Request & { client: any }
    ) {
        return this.pollService.getStats(clientId);
    }

    @Get('by-client/:clientId')
    @UseGuards(ClientAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all polls for a specific client' })
    @ApiParam({ name: 'clientId', description: 'Client ID' })
    @ApiResponse({ 
        status: HttpStatus.OK, 
        description: 'List of polls', 
    })
    async findAllByClientId(
        @Param('clientId') clientId: string,
        @Query() query: ListPollsQueryDto,
        @Req() req: Request & { client: any }
    ) {
        return this.pollService.findAll(clientId, query);
    }
}