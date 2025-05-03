// src/controllers/resource-item.controller.ts
import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ResourceRequestAgentService } from '../services/resource-request-agent.service';
import { ResourceItem, ResourceType, ResourceStatus } from '../schemas/resource-item.schema';

@ApiTags('Resource Items')
@Controller('resource-items')
export class ResourceItemController {
  constructor(private readonly resourceService: ResourceRequestAgentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new resource item' })
  @ApiResponse({ status: 201, description: 'Resource item created successfully' })
  async createResourceItem(@Body() itemData: Partial<ResourceItem>): Promise<ResourceItem> {
    return this.resourceService.createResourceItem(itemData);
  }

  @Get('business/:businessId')
  @ApiOperation({ summary: 'Get resource items for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'type', required: false, enum: ResourceType })
  @ApiQuery({ name: 'status', required: false, enum: ResourceStatus })
  async getBusinessResources(
    @Param('businessId') businessId: string,
    @Query('type') type?: ResourceType,
    @Query('status') status?: ResourceStatus,
    @Query('minQuantity') minQuantity?: number,
    @Query('supplier') supplier?: string
  ): Promise<ResourceItem[]> {
    return this.resourceService.getBusinessResources(businessId, {
      type,
      status,
      minQuantity: minQuantity !== undefined ? Number(minQuantity) : undefined,
      supplier
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get resource item by ID' })
  @ApiParam({ name: 'id', description: 'Resource item ID' })
  async getResourceItem(@Param('id') id: string): Promise<ResourceItem> {
    return this.resourceService.getResourceItemById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a resource item' })
  @ApiParam({ name: 'id', description: 'Resource item ID' })
  async updateResourceItem(
    @Param('id') id: string,
    @Body() itemData: Partial<ResourceItem>
  ): Promise<ResourceItem> {
    return this.resourceService.updateResourceItem(id, itemData);
  }
}