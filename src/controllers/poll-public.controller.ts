// src/controllers/poll-public.controller.ts
import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
    NotFoundException,
    HttpStatus,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiBody,
    ApiQuery,
} from '@nestjs/swagger';
import { PollService } from '../services/poll.service';
import { PollVoteDto } from '../dtos/poll.dto';
import { Poll } from '../schemas/poll.schema';

@ApiTags('Public Polls')
@Controller('public/polls')
export class PollPublicController {
    constructor(private readonly pollService: PollService) {}

    @Get(':id')
    @ApiOperation({ summary: 'Get a poll by ID for public display' })
    @ApiParam({ name: 'id', description: 'Poll ID' })
    @ApiQuery({ name: 'clientId', description: 'Client ID', required: true })
    @ApiResponse({ 
        status: HttpStatus.OK, 
        description: 'The poll data', 
        type: Poll 
    })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Poll not found' })
    async getPoll(
        @Param('id') id: string,
        @Query('clientId') clientId: string
    ): Promise<Poll> {
        if (!clientId) {
            throw new NotFoundException('Client ID is required');
        }
        return this.pollService.findOne(id, clientId);
    }

    @Get('wordpress/:wordpressId')
    @ApiOperation({ summary: 'Get a poll by WordPress ID for public display' })
    @ApiParam({ name: 'wordpressId', description: 'WordPress Poll ID' })
    @ApiQuery({ name: 'clientId', description: 'Client ID', required: true })
    @ApiResponse({ 
        status: HttpStatus.OK, 
        description: 'The poll data', 
        type: Poll 
    })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Poll not found' })
    async getPollByWordpressId(
        @Param('wordpressId') wordpressId: number,
        @Query('clientId') clientId: string
    ): Promise<Poll> {
        if (!clientId) {
            throw new NotFoundException('Client ID is required');
        }
        return this.pollService.findByWordpressId(wordpressId, clientId);
    }

    @Post(':id/vote')
    @ApiOperation({ summary: 'Vote on a poll option' })
    @ApiParam({ name: 'id', description: 'Poll ID' })
    @ApiQuery({ name: 'clientId', description: 'Client ID', required: true })
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
        @Query('clientId') clientId: string,
        @Body() voteDto: PollVoteDto
    ): Promise<Poll> {
        if (!clientId) {
            throw new NotFoundException('Client ID is required');
        }
        return this.pollService.vote(id, clientId, voteDto);
    }
}