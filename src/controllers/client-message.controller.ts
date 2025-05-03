// src/controllers/client-message.controller.ts
import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ClientCommunicationAgentService } from '../services/client-communication-agent.service';
import { ClientMessage, MessageStatus, MessageDirection, MessagePriority, MessageChannel } from '../schemas/client-message.schema';
import { User } from '../decorators/user.decorator';

@ApiTags('Client Messages')
@Controller('client-messages')
export class ClientMessageController {
  constructor(private readonly communicationService: ClientCommunicationAgentService) {}

  @Get('business/:businessId')
  @ApiOperation({ summary: 'Get messages for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'status', required: false, enum: MessageStatus })
  @ApiQuery({ name: 'direction', required: false, enum: MessageDirection })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'assignedTo', required: false })
  async getBusinessMessages(
    @Param('businessId') businessId: string,
    @Query('status') status?: MessageStatus,
    @Query('direction') direction?: MessageDirection,
    @Query('clientId') clientId?: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('priority') priority?: MessagePriority,
    @Query('channel') channel?: MessageChannel,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ): Promise<ClientMessage[]> {
    return this.communicationService.getBusinessMessages(businessId, {
      status,
      direction,
      clientId,
      assignedTo,
      priority,
      channel,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    });
  }

  @Get('thread/:messageId')
  @ApiOperation({ summary: 'Get message thread' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  async getMessageThread(
    @Param('messageId') messageId: string
  ): Promise<ClientMessage[]> {
    return this.communicationService.getMessageThread(messageId);
  }

  @Post('inbound')
  @ApiOperation({ summary: 'Process inbound message' })
  @ApiResponse({ status: 201, description: 'Message processed successfully' })
  async processInboundMessage(
    @Body() messageData: Partial<ClientMessage>
  ): Promise<ClientMessage> {
    return this.communicationService.processInboundMessage(messageData);
  }

  @Put(':messageId/status')
  @ApiOperation({ summary: 'Update message status' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  async updateMessageStatus(
    @Param('messageId') messageId: string,
    @Body() data: { status: MessageStatus, note?: string },
    @User('_id') userId: string
  ): Promise<ClientMessage> {
    return this.communicationService.updateMessageStatus(
      messageId,
      data.status,
      userId,
      data.note
    );
  }

  @Put(':messageId/assign')
  @ApiOperation({ summary: 'Reassign message' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  async reassignMessage(
    @Param('messageId') messageId: string,
    @Body() data: { assigneeId: string, note?: string },
    @User('_id') userId: string
  ): Promise<ClientMessage> {
    return this.communicationService.reassignMessage(
      messageId,
      data.assigneeId,
      userId,
      data.note
    );
  }

  @Post(':messageId/reply')
  @ApiOperation({ summary: 'Send reply to message' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  async sendReply(
    @Param('messageId') messageId: string,
    @Body() data: { content: string },
    @User('_id') userId: string
  ): Promise<ClientMessage> {
    return this.communicationService.sendReplyToMessage(
      messageId,
      data.content,
      userId
    );
  }
}