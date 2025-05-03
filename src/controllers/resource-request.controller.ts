// src/controllers/resource-request.controller.ts
import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ResourceRequestAgentService } from '../services/resource-request-agent.service';
import { ResourceRequest, RequestStatus, RequestPriority, RequestSource } from '../schemas/resource-request.schema';
import { User } from '../decorators/user.decorator';

@ApiTags('Resource Requests')
@Controller('resource-requests')
export class ResourceRequestController {
  constructor(private readonly resourceService: ResourceRequestAgentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new resource request' })
  @ApiResponse({ status: 201, description: 'Resource request created successfully' })
  async createResourceRequest(
    @Body() requestData: Partial<ResourceRequest>,
    @User('_id') userId: string
  ): Promise<ResourceRequest> {
    // Set the requesting user if not provided
    if (!requestData.requestedBy) {
      requestData.requestedBy = userId;
    }
    
    return this.resourceService.createResourceRequest(requestData);
  }

  @Get('business/:businessId')
  @ApiOperation({ summary: 'Get resource requests for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'status', required: false, enum: RequestStatus })
  @ApiQuery({ name: 'priority', required: false, enum: RequestPriority })
  @ApiQuery({ name: 'source', required: false, enum: RequestSource })
  async getBusinessRequests(
    @Param('businessId') businessId: string,
    @Query('status') status?: RequestStatus,
    @Query('priority') priority?: RequestPriority,
    @Query('source') source?: RequestSource,
    @Query('requestedBy') requestedBy?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ): Promise<ResourceRequest[]> {
    return this.resourceService.getBusinessRequests(businessId, {
      status,
      priority,
      source,
      requestedBy,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get resource request by ID' })
  @ApiParam({ name: 'id', description: 'Resource request ID' })
  async getResourceRequest(@Param('id') id: string): Promise<ResourceRequest> {
    return this.resourceService.getResourceRequestById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a resource request' })
  @ApiParam({ name: 'id', description: 'Resource request ID' })
  async updateResourceRequest(
    @Param('id') id: string,
    @Body() requestData: Partial<ResourceRequest>,
    @User('_id') userId: string
  ): Promise<ResourceRequest> {
    return this.resourceService.updateResourceRequest(id, requestData, userId);
  }

  @Put(':id/approve')
  @ApiOperation({ summary: 'Approve a resource request' })
  @ApiParam({ name: 'id', description: 'Resource request ID' })
  async approveRequest(
    @Param('id') id: string,
    @Body() data: { notes?: string },
    @User('_id') userId: string
  ): Promise<ResourceRequest> {
    return this.resourceService.updateResourceRequest(
      id, 
      { 
        status: RequestStatus.APPROVED,
        notes: data.notes
      },
      userId
    );
  }

  @Put(':id/reject')
  @ApiOperation({ summary: 'Reject a resource request' })
  @ApiParam({ name: 'id', description: 'Resource request ID' })
  async rejectRequest(
    @Param('id') id: string,
    @Body() data: { rejectionReason: string },
    @User('_id') userId: string
  ): Promise<ResourceRequest> {
    return this.resourceService.updateResourceRequest(
      id, 
      { 
        status: RequestStatus.REJECTED,
        rejectionReason: data.rejectionReason,
        notes: data.rejectionReason
      },
      userId
    );
  }
}