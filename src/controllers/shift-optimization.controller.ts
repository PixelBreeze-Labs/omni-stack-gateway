// src/controllers/shift-optimization.controller.ts
import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ShiftOptimizationAgentService, OptimizationStrategy } from '../services/shift-optimization-agent.service';

@Controller('shift-optimization')
export class ShiftOptimizationController {
  constructor(
    private readonly shiftOptimizationService: ShiftOptimizationAgentService
  ) {}

  @Get('summary/:businessId')
  async getOptimizationSummary(@Param('businessId') businessId: string) {
    return this.shiftOptimizationService.getOptimizationSummary(businessId);
  }

  @Get('forecast/:businessId')
  async getForecast(
    @Param('businessId') businessId: string,
    @Query('date') date: string
  ) {
    return this.shiftOptimizationService.getForecastByDate(businessId, date);
  }

  @Get('recommendations/:businessId')
  async getRecommendations(
    @Param('businessId') businessId: string,
    @Query('day') day: number
  ) {
    return this.shiftOptimizationService.getShiftRecommendationsByDay(businessId, day);
  }

  @Post('run-optimization/:businessId')
  async runOptimization(
    @Param('businessId') businessId: string,
    @Body('strategy') strategy: OptimizationStrategy
  ) {
    return this.shiftOptimizationService.runManualOptimization(businessId, strategy);
  }

  @Post('run-forecast/:businessId')
  async runForecast(@Param('businessId') businessId: string) {
    return this.shiftOptimizationService.runManualForecastUpdate(businessId);
  }

  @Post('configuration/:businessId')
  async updateConfiguration(
    @Param('businessId') businessId: string,
    @Body() config: any
  ) {
    return this.shiftOptimizationService.updateBusinessConfiguration(businessId, config);
  }

  @Get('configuration/:businessId')
  async getConfiguration(@Param('businessId') businessId: string) {
    return this.shiftOptimizationService.getBusinessConfiguration(businessId);
  }
}