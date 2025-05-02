// src/controllers/compliance-certification.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ComplianceMonitoringAgentService } from '../services/compliance-monitoring-agent.service';
import { StaffCertification } from '../schemas/staff-certification.schema';

@ApiTags('Compliance Certifications')
@Controller('compliance-certifications')
export class ComplianceCertificationController {
  constructor(private readonly complianceService: ComplianceMonitoringAgentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new staff certification' })
  @ApiResponse({ status: 201, description: 'Certification created successfully' })
  async createCertification(@Body() certData: Partial<StaffCertification>): Promise<StaffCertification> {
    return this.complianceService.createCertification(certData);
  }

  @Get('staff/:userId/business/:businessId')
  @ApiOperation({ summary: 'Get certifications for a staff member' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiParam({ name: 'businessId', description: 'Business ID' })
  @ApiQuery({ name: 'includeExpired', required: false, type: Boolean })
  async getStaffCertifications(
    @Param('userId') userId: string,
    @Param('businessId') businessId: string,
    @Query('includeExpired') includeExpired?: boolean
  ): Promise<StaffCertification[]> {
    return this.complianceService.getStaffCertifications(
      userId,
      businessId,
      includeExpired === 'true' || includeExpired === true
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get certification by ID' })
  @ApiParam({ name: 'id', description: 'Certification ID' })
  async getCertification(@Param('id') id: string): Promise<StaffCertification> {
    return this.complianceService.getCertificationById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a staff certification' })
  @ApiParam({ name: 'id', description: 'Certification ID' })
  async updateCertification(
    @Param('id') id: string,
    @Body() certData: Partial<StaffCertification>
  ): Promise<StaffCertification> {
    return this.complianceService.updateCertification(id, certData);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a staff certification' })
  @ApiParam({ name: 'id', description: 'Certification ID' })
  async deleteCertification(@Param('id') id: string): Promise<StaffCertification> {
    return this.complianceService.deleteCertification(id);
  }
}