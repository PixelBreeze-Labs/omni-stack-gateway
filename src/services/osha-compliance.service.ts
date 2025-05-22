// src/services/osha-compliance.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { 
  OshaComplianceRequirement, 
  OshaComplianceCategory,
  OshaComplianceFrequency 
} from '../schemas/osha-compliance-requirement.schema';
import { OshaEquipmentCompliance } from '../schemas/osha-equipment-compliance.schema';
import { 
  CreateOshaComplianceRequirementDto, 
  UpdateOshaComplianceRequirementDto,
  OshaComplianceRequirementQueryDto 
} from '../dtos/osha-compliance-requirement.dto';

@Injectable()
export class OshaComplianceService {
  private readonly logger = new Logger(OshaComplianceService.name);

  constructor(
    @InjectModel(OshaComplianceRequirement.name) 
    private oshaComplianceModel: Model<OshaComplianceRequirement>,
    @InjectModel(OshaEquipmentCompliance.name)
    private oshaEquipmentModel: Model<OshaEquipmentCompliance>
  ) {}

  async create(createDto: CreateOshaComplianceRequirementDto): Promise<OshaComplianceRequirement> {
    try {
      // Calculate next inspection date if not provided
      if (!createDto.nextInspectionDate && createDto.frequency) {
        createDto.nextInspectionDate = this.calculateNextInspectionDate(createDto.frequency);
      }

      // Create the main compliance requirement
      const requirement = new this.oshaComplianceModel(createDto);
      const savedRequirement = await requirement.save();

      // If this is equipment category, create equipment compliance records
      if (createDto.category === OshaComplianceCategory.EQUIPMENT) {
        await this.createEquipmentCompliance(savedRequirement._id.toString(), createDto);
      }

      return await this.findById(savedRequirement._id.toString(), createDto.businessId);
    } catch (error) {
      this.logger.error(`Error creating OSHA compliance requirement: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findAll(queryDto: OshaComplianceRequirementQueryDto) {
    try {
      const { 
        businessId, 
        constructionSiteId, 
        category, 
        complianceType,
        priority, 
        assignedTo, 
        page = 1, 
        limit = 10 
      } = queryDto;

      // Build query
      const query: any = { 
        businessId,
        isDeleted: false 
      };

      if (constructionSiteId) query.constructionSiteId = constructionSiteId;
      if (category) query.category = category;
      if (complianceType) query.complianceType = complianceType;
      if (priority) query.priority = priority;
      if (assignedTo) query.assignedTo = assignedTo;

      // Execute query with pagination
      const skip = (page - 1) * limit;
      const requirements = await this.oshaComplianceModel
        .find(query)
        .populate('assignedTo', 'name email')
        .populate('constructionSiteId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      const total = await this.oshaComplianceModel.countDocuments(query);

      return {
        data: requirements,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        }
      };
    } catch (error) {
      this.logger.error(`Error fetching OSHA compliance requirements: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findById(id: string, businessId: string): Promise<OshaComplianceRequirement> {
    try {
      const requirement = await this.oshaComplianceModel
        .findOne({ _id: id, businessId, isDeleted: false })
        .populate('assignedTo', 'name email')
        .populate('constructionSiteId', 'name')
        .exec();

      if (!requirement) {
        throw new NotFoundException('OSHA compliance requirement not found');
      }

      return requirement;
    } catch (error) {
      this.logger.error(`Error fetching OSHA compliance requirement: ${error.message}`, error.stack);
      throw error;
    }
  }

  async update(id: string, updateDto: UpdateOshaComplianceRequirementDto): Promise<OshaComplianceRequirement> {
    try {
      // Calculate next inspection date if frequency changed
      if (updateDto.frequency && !updateDto.nextInspectionDate) {
        updateDto.nextInspectionDate = this.calculateNextInspectionDate(updateDto.frequency);
      }

      const updatedRequirement = await this.oshaComplianceModel
        .findOneAndUpdate(
          { _id: id, businessId: updateDto.businessId, isDeleted: false },
          { ...updateDto, updatedAt: new Date() },
          { new: true }
        )
        .populate('assignedTo', 'name email')
        .populate('constructionSiteId', 'name')
        .exec();

      if (!updatedRequirement) {
        throw new NotFoundException('OSHA compliance requirement not found');
      }

      return updatedRequirement;
    } catch (error) {
      this.logger.error(`Error updating OSHA compliance requirement: ${error.message}`, error.stack);
      throw error;
    }
  }

  async delete(id: string, businessId: string): Promise<boolean> {
    try {
      const result = await this.oshaComplianceModel
        .findOneAndUpdate(
          { _id: id, businessId, isDeleted: false },
          { 
            isDeleted: true, 
            deletedAt: new Date(),
            updatedAt: new Date() 
          },
          { new: true }
        )
        .exec();

      if (!result) {
        throw new NotFoundException('OSHA compliance requirement not found');
      }

      // Also soft delete related equipment compliance records
      await this.oshaEquipmentModel.updateMany(
        { oshaComplianceRequirementId: id },
        { 
          isDeleted: true, 
          deletedAt: new Date(),
          updatedAt: new Date() 
        }
      );

      return true;
    } catch (error) {
      this.logger.error(`Error deleting OSHA compliance requirement: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOverdueInspections(businessId: string): Promise<OshaComplianceRequirement[]> {
    try {
      const today = new Date();
      return await this.oshaComplianceModel
        .find({
          businessId,
          isDeleted: false,
          nextInspectionDate: { $lt: today },
          status: { $ne: 'compliant' }
        })
        .populate('assignedTo', 'name email')
        .populate('constructionSiteId', 'name')
        .sort({ nextInspectionDate: 1 })
        .exec();
    } catch (error) {
      this.logger.error(`Error fetching overdue inspections: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findUpcomingInspections(businessId: string, days: number = 30): Promise<OshaComplianceRequirement[]> {
    try {
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(today.getDate() + days);

      return await this.oshaComplianceModel
        .find({
          businessId,
          isDeleted: false,
          nextInspectionDate: { 
            $gte: today,
            $lte: futureDate 
          }
        })
        .populate('assignedTo', 'name email')
        .populate('constructionSiteId', 'name')
        .sort({ nextInspectionDate: 1 })
        .exec();
    } catch (error) {
      this.logger.error(`Error fetching upcoming inspections: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async createEquipmentCompliance(
    requirementId: string, 
    createDto: CreateOshaComplianceRequirementDto
  ): Promise<void> {
    try {
      // Create basic equipment compliance record
      const equipmentCompliance = new this.oshaEquipmentModel({
        oshaComplianceRequirementId: requirementId,
        equipmentType: 'other', // Default, should be specified in a more complete implementation
        status: 'pending',
        nextInspectionDate: createDto.nextInspectionDate,
        nextMaintenanceDate: createDto.nextInspectionDate,
      });

      await equipmentCompliance.save();
    } catch (error) {
      this.logger.error(`Error creating equipment compliance: ${error.message}`, error.stack);
      // Don't throw here to avoid breaking the main requirement creation
    }
  }

  private calculateNextInspectionDate(frequency: OshaComplianceFrequency): string {
    const now = new Date();
    
    switch (frequency) {
      case OshaComplianceFrequency.DAILY:
        now.setDate(now.getDate() + 1);
        break;
      case OshaComplianceFrequency.WEEKLY:
        now.setDate(now.getDate() + 7);
        break;
      case OshaComplianceFrequency.MONTHLY:
        now.setMonth(now.getMonth() + 1);
        break;
      case OshaComplianceFrequency.QUARTERLY:
        now.setMonth(now.getMonth() + 3);
        break;
      case OshaComplianceFrequency.ANNUALLY:
        now.setFullYear(now.getFullYear() + 1);
        break;
      default:
        now.setMonth(now.getMonth() + 1); // Default to monthly
    }
    
    return now.toISOString().split('T')[0]; // Return YYYY-MM-DD format
  }
}