// src/services/osha-inspection.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { 
  OshaInspection,
  InspectionStatus,
  InspectionResult 
} from '../schemas/osha-inspection.schema';
import { OshaComplianceRequirement } from '../schemas/osha-compliance-requirement.schema';
import { OshaViolation } from '../schemas/osha-violation.schema';
import { 
  CreateOshaInspectionDto,
  UpdateOshaInspectionDto 
} from '../dtos/osha-inspection.dto';

@Injectable()
export class OshaInspectionService {
  private readonly logger = new Logger(OshaInspectionService.name);

  constructor(
    @InjectModel(OshaInspection.name)
    private oshaInspectionModel: Model<OshaInspection>,
    @InjectModel(OshaComplianceRequirement.name)
    private oshaComplianceModel: Model<OshaComplianceRequirement>,
    @InjectModel(OshaViolation.name)
    private oshaViolationModel: Model<OshaViolation>
  ) {}

  async create(createDto: CreateOshaInspectionDto): Promise<OshaInspection> {
    try {
      // Verify the compliance requirement exists
      const requirement = await this.oshaComplianceModel
        .findById(createDto.oshaComplianceRequirementId)
        .exec();

      if (!requirement) {
        throw new NotFoundException('OSHA compliance requirement not found');
      }

      // Calculate inspection duration if start and end times are provided
      if (createDto.inspectionStartTime && createDto.inspectionEndTime) {
        const startTime = new Date(createDto.inspectionStartTime);
        const endTime = new Date(createDto.inspectionEndTime);
        createDto.inspectionDuration = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
      }

      // Create the inspection
      const inspection = new this.oshaInspectionModel({
        ...createDto,
        status: InspectionStatus.SCHEDULED
      });

      const savedInspection = await inspection.save();

      // Create violations if any were found
      if (createDto.violationsDetails && createDto.violationsDetails.length > 0) {
        await this.createViolationsFromInspection(savedInspection._id.toString(), createDto.violationsDetails);
      }

      return await this.findById(savedInspection._id.toString());
    } catch (error) {
      this.logger.error(`Error creating OSHA inspection: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findById(id: string): Promise<OshaInspection> {
    try {
      const inspection = await this.oshaInspectionModel
        .findOne({ _id: id, isDeleted: false })
        .populate('oshaComplianceRequirementId', 'title category')
        .populate('inspectorId', 'name email')
        .exec();

      if (!inspection) {
        throw new NotFoundException('OSHA inspection not found');
      }

      return inspection;
    } catch (error) {
      this.logger.error(`Error fetching OSHA inspection: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findByRequirement(requirementId: string): Promise<OshaInspection[]> {
    try {
      return await this.oshaInspectionModel
        .find({ 
          oshaComplianceRequirementId: requirementId,
          isDeleted: false 
        })
        .populate('inspectorId', 'name email')
        .sort({ inspectionDate: -1 })
        .exec();
    } catch (error) {
      this.logger.error(`Error fetching inspections by requirement: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findByInspector(inspectorId: string, limit: number = 10): Promise<OshaInspection[]> {
    try {
      return await this.oshaInspectionModel
        .find({ 
          inspectorId,
          isDeleted: false 
        })
        .populate('oshaComplianceRequirementId', 'title category')
        .sort({ inspectionDate: -1 })
        .limit(limit)
        .exec();
    } catch (error) {
      this.logger.error(`Error fetching inspections by inspector: ${error.message}`, error.stack);
      throw error;
    }
  }

  async update(id: string, updateDto: UpdateOshaInspectionDto): Promise<OshaInspection> {
    try {
      // Calculate inspection duration if start and end times are provided
      if (updateDto.inspectionStartTime && updateDto.inspectionEndTime) {
        const startTime = new Date(updateDto.inspectionStartTime);
        const endTime = new Date(updateDto.inspectionEndTime);
        updateDto.inspectionDuration = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
      }

      const updatedInspection = await this.oshaInspectionModel
        .findOneAndUpdate(
          { _id: id, isDeleted: false },
          { ...updateDto, updatedAt: new Date() },
          { new: true }
        )
        .populate('oshaComplianceRequirementId', 'title category')
        .populate('inspectorId', 'name email')
        .exec();

      if (!updatedInspection) {
        throw new NotFoundException('OSHA inspection not found');
      }

      // Update violations if provided
      if (updateDto.violationsDetails && updateDto.violationsDetails.length > 0) {
        await this.updateViolationsFromInspection(id, updateDto.violationsDetails);
      }

      // If inspection is completed, update the related compliance requirement
      if (updateDto.status === InspectionStatus.COMPLETED) {
        await this.updateComplianceRequirementFromInspection(updatedInspection);
      }

      return updatedInspection;
    } catch (error) {
      this.logger.error(`Error updating OSHA inspection: ${error.message}`, error.stack);
      throw error;
    }
  }

  async markAsCompleted(id: string, result: InspectionResult): Promise<OshaInspection> {
    try {
      const inspection = await this.oshaInspectionModel
        .findOneAndUpdate(
          { _id: id, isDeleted: false },
          { 
            status: InspectionStatus.COMPLETED,
            result,
            updatedAt: new Date()
          },
          { new: true }
        )
        .populate('oshaComplianceRequirementId', 'title category')
        .populate('inspectorId', 'name email')
        .exec();

      if (!inspection) {
        throw new NotFoundException('OSHA inspection not found');
      }

      // Update the related compliance requirement
      await this.updateComplianceRequirementFromInspection(inspection);

      return inspection;
    } catch (error) {
      this.logger.error(`Error marking inspection as completed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.oshaInspectionModel
        .findOneAndUpdate(
          { _id: id, isDeleted: false },
          { 
            isDeleted: true, 
            deletedAt: new Date(),
            updatedAt: new Date() 
          }
        )
        .exec();

      if (!result) {
        throw new NotFoundException('OSHA inspection not found');
      }

      return true;
    } catch (error) {
      this.logger.error(`Error deleting OSHA inspection: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async createViolationsFromInspection(
    inspectionId: string, 
    violationsDetails: any[]
  ): Promise<void> {
    try {
      const violations = violationsDetails.map(violation => ({
        oshaInspectionId: inspectionId,
        violationType: violation.violationType || 'other',
        description: violation.description,
        severity: violation.severity,
        regulationViolated: violation.regulationViolated,
        status: 'open'
      }));

      await this.oshaViolationModel.insertMany(violations);
    } catch (error) {
      this.logger.error(`Error creating violations from inspection: ${error.message}`, error.stack);
      // Don't throw here to avoid breaking the main inspection creation
    }
  }

  private async updateViolationsFromInspection(
    inspectionId: string, 
    violationsDetails: any[]
  ): Promise<void> {
    try {
      // Remove existing violations for this inspection
      await this.oshaViolationModel.deleteMany({ oshaInspectionId: inspectionId });

      // Create new violations
      if (violationsDetails.length > 0) {
        await this.createViolationsFromInspection(inspectionId, violationsDetails);
      }
    } catch (error) {
      this.logger.error(`Error updating violations from inspection: ${error.message}`, error.stack);
    }
  }

  private async updateComplianceRequirementFromInspection(inspection: OshaInspection): Promise<void> {
    try {
      const updateData: any = {
        lastInspectionDate: inspection.inspectionDate,
        updatedAt: new Date()
      };

      // Update status based on inspection result
      if (inspection.result === InspectionResult.PASSED) {
        updateData.status = 'compliant';
      } else if (inspection.result === InspectionResult.FAILED) {
        updateData.status = 'non_compliant';
      }

      // Set next inspection date if provided
      if (inspection.nextInspectionDate) {
        updateData.nextInspectionDate = inspection.nextInspectionDate;
      }

      await this.oshaComplianceModel
        .findByIdAndUpdate(inspection.oshaComplianceRequirementId, updateData)
        .exec();
    } catch (error) {
      this.logger.error(`Error updating compliance requirement from inspection: ${error.message}`, error.stack);
    }
  }
}