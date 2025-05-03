// src/controllers/resource-optimization.controller.ts
import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ResourceRequestAgentService } from '../services/resource-request-agent.service';

@ApiTags('Resource Optimization')
@Controller('resource-optimization')
export class ResourceOptimizationController {
  constructor(private readonly resourceService: ResourceRequestAgentService) {}

  @Get('business/:businessId/suggestions')
  @ApiOperation({ summary: 'Get resource optimization suggestions' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  async getOptimizationSuggestions(
    @Param('businessId') businessId: string
  ): Promise<any[]> {
    return this.resourceService.getResourceOptimizationSuggestions(businessId);
  }

  @Get('business/:businessId/summary')
  @ApiOperation({ summary: 'Get resource inventory summary' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  async getInventorySummary(
    @Param('businessId') businessId: string
  ): Promise<any> {
    return this.resourceService.getResourceInventorySummary(businessId);
  }

  @Post('business/:businessId/check-inventory')
  @ApiOperation({ summary: 'Run a manual inventory check' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiResponse({ status: 200, description: 'Inventory check completed' })
  async runInventoryCheck(
    @Param('businessId') businessId: string
  ): Promise<{ success: boolean; lowInventoryCount: number }> {
    const lowInventoryCount = await this.resourceService.runManualInventoryCheck(businessId);
    return { success: true, lowInventoryCount };
  }

  @Post('business/:businessId/update-forecasts')
  @ApiOperation({ summary: 'Run a manual forecast update' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiResponse({ status: 200, description: 'Forecasts updated' })
  async updateForecasts(
    @Param('businessId') businessId: string
  ): Promise<{ success: boolean; forecastCount: number }> {
    const forecastCount = await this.resourceService.runManualForecastUpdate(businessId);
    return { success: true, forecastCount };
  }
}