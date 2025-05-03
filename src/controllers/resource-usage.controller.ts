// src/controllers/resource-usage.controller.ts
import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ResourceRequestAgentService } from '../services/resource-request-agent.service';
import { ResourceUsage } from '../schemas/resource-usage.schema';
import { User } from '../decorators/user.decorator';

@ApiTags('Resource Usage')
@Controller('resource-usage')
export class ResourceUsageController {
  constructor(private readonly resourceService: ResourceRequestAgentService) {}

  @Post()
  @ApiOperation({ summary: 'Record resource usage' })
  @ApiResponse({ status: 201, description: 'Resource usage recorded successfully' })
  async recordResourceUsage(
    @Body() usageData: Partial<ResourceUsage>,
    @User('_id') userId: string
  ): Promise<ResourceUsage> {
    // Set the user if not provided
    if (!usageData.userId) {
      usageData.userId = userId;
    }
    
    // Set the date if not provided
    if (!usageData.date) {
      usageData.date = new Date();
    }
    
    return this.resourceService.recordResourceUsage(usageData);
  }

  @Get('business/:businessId')
  @ApiOperation({ summary: 'Get resource usage for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'resourceItemId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'clientId', required: false })
  async getBusinessUsage(
    @Param('businessId') businessId: string,
    @Query('resourceItemId') resourceItemId?: string,
    @Query('userId') userId?: string,
    @Query('clientId') clientId?: string,
    @Query('projectId') projectId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ): Promise<ResourceUsage[]> {
    return this.resourceService.getResourceUsage(businessId, {
      resourceItemId,
      userId,
      clientId,
      projectId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    });
  }
}