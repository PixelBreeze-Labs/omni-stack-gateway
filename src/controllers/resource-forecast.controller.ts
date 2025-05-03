// src/controllers/resource-forecast.controller.ts
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ResourceRequestAgentService } from '../services/resource-request-agent.service';
import { ResourceForecast, ForecastStatus } from '../schemas/resource-forecast.schema';

@ApiTags('Resource Forecasts')
@Controller('resource-forecasts')
export class ResourceForecastController {
  constructor(private readonly resourceService: ResourceRequestAgentService) {}

  @Get('business/:businessId')
  @ApiOperation({ summary: 'Get resource forecasts for a business' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'status', required: false, enum: ForecastStatus })
  @ApiQuery({ name: 'resourceItemId', required: false })
  @ApiQuery({ name: 'minConfidence', required: false })
  async getBusinessForecasts(
    @Param('businessId') businessId: string,
    @Query('resourceItemId') resourceItemId?: string,
    @Query('status') status?: ForecastStatus,
    @Query('minConfidence') minConfidence?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ): Promise<ResourceForecast[]> {
    return this.resourceService.getResourceForecasts(businessId, {
      resourceItemId,
      status,
      minConfidence: minConfidence !== undefined ? Number(minConfidence) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get resource forecast by ID' })
  @ApiParam({ name: 'id', description: 'Resource forecast ID' })
  async getResourceForecast(@Param('id') id: string): Promise<ResourceForecast> {
    return this.resourceService.getResourceForecastById(id);
  }
}