// src/controllers/member.controller.ts
import { Controller, Post, Get, Put, Delete, Body, Param, Req, UseGuards, Query } from '@nestjs/common';
import { MemberService } from '../services/member.service';
import {CreateMemberDto, ListMemberDto, UpdateMemberDto} from '../dtos/member.dto';
import {ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery} from '@nestjs/swagger';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import {Member} from "../schemas/member.schema";

@ApiTags('Members')
@Controller('members')
export class MemberController {
    constructor(private readonly memberService: MemberService) {}

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Post()
    @ApiOperation({ summary: 'Create new member' })
    @ApiResponse({ status: 201, description: 'Member created successfully' })
    async create(
        @Body() createMemberDto: CreateMemberDto,
        @Req() req: any  // Optionally, you can add client info if needed
    ) {
        return this.memberService.create(createMemberDto);
    }

    @ApiOperation({ summary: 'Get all members' })
    @ApiQuery({ type: ListMemberDto })
    @ApiResponse({ status: 200, description: 'List of members' })
    @Get()
    async findAll(@Query() query: ListMemberDto): Promise<{
        items: Member[];
        total: number;
        pages: number;
        page: number;
        limit: number;
    }> {
        return this.memberService.findAll(query);
    }

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Get(':id')
    @ApiOperation({ summary: 'Get member by ID' })
    @ApiParam({ name: 'id', description: 'Member ID' })
    @ApiResponse({ status: 200, description: 'Member details' })
    async findOne(@Param('id') id: string) {
        return this.memberService.findOne(id);
    }

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Put(':id')
    @ApiOperation({ summary: 'Update member' })
    @ApiParam({ name: 'id', description: 'Member ID' })
    @ApiResponse({ status: 200, description: 'Member updated' })
    async update(@Param('id') id: string, @Body() updateMemberDto: UpdateMemberDto) {
        return this.memberService.update(id, updateMemberDto);
    }

    @ApiBearerAuth()
    @UseGuards(ClientAuthGuard)
    @Delete(':id')
    @ApiOperation({ summary: 'Delete member' })
    @ApiParam({ name: 'id', description: 'Member ID' })
    @ApiResponse({ status: 200, description: 'Member deleted' })
    async remove(@Param('id') id: string) {
        return this.memberService.remove(id);
    }
}
