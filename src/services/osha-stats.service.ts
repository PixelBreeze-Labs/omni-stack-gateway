// src/services/osha-stats.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { 
  OshaComplianceRequirement,
  OshaComplianceStatus,
  OshaComplianceCategory,
  OshaCompliancePriority
} from '../schemas/osha-compliance-requirement.schema';
import { OshaInspection } from '../schemas/osha-inspection.schema';
import { OshaViolation } from '../schemas/osha-violation.schema';
import { OshaEquipmentCompliance } from '../schemas/osha-equipment-compliance.schema';

interface StatsFilters {
  businessId: string;
  constructionSiteId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

@Injectable()
export class OshaStatsService {
  private readonly logger = new Logger(OshaStatsService.name);

  constructor(
    @InjectModel(OshaComplianceRequirement.name) 
    private oshaComplianceModel: Model<OshaComplianceRequirement>,
    @InjectModel(OshaInspection.name)
    private oshaInspectionModel: Model<OshaInspection>,
    @InjectModel(OshaViolation.name)
    private oshaViolationModel: Model<OshaViolation>,
    @InjectModel(OshaEquipmentCompliance.name)
    private oshaEquipmentModel: Model<OshaEquipmentCompliance>
  ) {}

  async getComplianceStats(filters: StatsFilters) {
    try {
      const { businessId, constructionSiteId, dateFrom, dateTo } = filters;

      // Build base query
      const baseQuery: any = { 
        businessId,
        isDeleted: false 
      };
      
      if (constructionSiteId) {
        baseQuery.constructionSiteId = constructionSiteId;
      }

      if (dateFrom || dateTo) {
        baseQuery.createdAt = {};
        if (dateFrom) baseQuery.createdAt.$gte = dateFrom;
        if (dateTo) baseQuery.createdAt.$lte = dateTo;
      }

      // Get total requirements
      const totalRequirements = await this.oshaComplianceModel.countDocuments(baseQuery);

      // Get status breakdown
      const statusStats = await this.oshaComplianceModel.aggregate([
        { $match: baseQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);

      const byStatus = {
        compliant: 0,
        non_compliant: 0,
        pending: 0
      };

      statusStats.forEach(stat => {
        if (stat._id in byStatus) {
          byStatus[stat._id] = stat.count;
        }
      });

      // Calculate compliance rate
      const complianceRate = totalRequirements > 0 
        ? Math.round((byStatus.compliant / totalRequirements) * 100) 
        : 0;

      // Get category breakdown
      const categoryStats = await this.oshaComplianceModel.aggregate([
        { $match: baseQuery },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]);

      const byCategory = {};
      categoryStats.forEach(stat => {
        byCategory[stat._id] = stat.count;
      });

      // Get priority breakdown
      const priorityStats = await this.oshaComplianceModel.aggregate([
        { $match: baseQuery },
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ]);

      const byPriority = {
        high: 0,
        medium: 0,
        low: 0
      };

      priorityStats.forEach(stat => {
        if (stat._id in byPriority) {
          byPriority[stat._id] = stat.count;
        }
      });

      // Get upcoming inspections (next 30 days)
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const inspectionsDue = await this.oshaComplianceModel.countDocuments({
        ...baseQuery,
        nextInspectionDate: {
          $gte: new Date(),
          $lte: thirtyDaysFromNow
        }
      });

      // Get overdue inspections
      const overdueInspections = await this.oshaComplianceModel.countDocuments({
        ...baseQuery,
        nextInspectionDate: { $lt: new Date() },
        status: { $ne: OshaComplianceStatus.COMPLIANT }
      });

      // Get open violations
      const openViolations = await this.oshaViolationModel.countDocuments({
        status: { $in: ['open', 'pending_correction'] }
      });

      // Get equipment certifications expiring (next 60 days)
      const sixtyDaysFromNow = new Date();
      sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);

      const equipmentCertificationsExpiring = await this.oshaEquipmentModel.countDocuments({
        certificationExpiry: {
          $gte: new Date(),
          $lte: sixtyDaysFromNow
        },
        isDeleted: false
      });

      // Get last audit info
      const lastInspection = await this.oshaInspectionModel
        .findOne({})
        .sort({ inspectionDate: -1 })
        .exec();

      const lastAuditDaysAgo = lastInspection 
        ? Math.floor((new Date().getTime() - new Date(lastInspection.inspectionDate).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Get recent inspections
      const recentInspections = await this.oshaInspectionModel
        .find({})
        .populate({
          path: 'oshaComplianceRequirementId',
          select: 'title businessId',
          match: { businessId }
        })
        .sort({ inspectionDate: -1 })
        .limit(5)
        .exec();

      const filteredRecentInspections = recentInspections
        .filter(inspection => inspection.oshaComplianceRequirementId)
        .map(inspection => ({
          id: inspection._id.toString(),
          title: (inspection.oshaComplianceRequirementId as any).title,
          date: inspection.inspectionDate.toISOString().split('T')[0],
          result: inspection.result || 'pending'
        }));

      return {
        compliance_rate: complianceRate,
        open_violations: openViolations,
        inspections_due: inspectionsDue,
        last_audit_days_ago: lastAuditDaysAgo,
        total_requirements: totalRequirements,
        overdue_inspections: overdueInspections,
        by_category: byCategory,
        by_status: byStatus,
        by_priority: byPriority,
        equipment_certifications_expiring: equipmentCertificationsExpiring,
        recent_inspections: filteredRecentInspections
      };
    } catch (error) {
      this.logger.error(`Error calculating OSHA compliance stats: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getComplianceSummary(businessId: string) {
    try {
      const stats = await this.getComplianceStats({ businessId });
      
      const criticalIssues = stats.open_violations + stats.overdue_inspections;
      const upcomingInspections = stats.inspections_due;
      
      let status: 'good' | 'warning' | 'critical' = 'good';
      
      if (criticalIssues > 5 || stats.compliance_rate < 70) {
        status = 'critical';
      } else if (criticalIssues > 0 || stats.compliance_rate < 85) {
        status = 'warning';
      }

      return {
        overall_compliance: stats.compliance_rate,
        critical_issues: criticalIssues,
        upcoming_inspections: upcomingInspections,
        status
      };
    } catch (error) {
      this.logger.error(`Error calculating OSHA compliance summary: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getComplianceTrends(businessId: string, period: '30d' | '90d' | '1y' = '30d') {
    try {
      const now = new Date();
      const startDate = new Date();
      
      // Calculate start date based on period
      switch (period) {
        case '30d':
          startDate.setDate(now.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(now.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
      }

      // Get requirements created in this period
      const requirements = await this.oshaComplianceModel
        .find({
          businessId,
          isDeleted: false,
          createdAt: { $gte: startDate }
        })
        .sort({ createdAt: 1 })
        .exec();

      // Get inspections in this period
      const inspections = await this.oshaInspectionModel
        .find({
          inspectionDate: { $gte: startDate }
        })
        .populate({
          path: 'oshaComplianceRequirementId',
          select: 'businessId',
          match: { businessId }
        })
        .sort({ inspectionDate: 1 })
        .exec();

      const filteredInspections = inspections.filter(inspection => 
        inspection.oshaComplianceRequirementId
      );

      // Get violations in this period
      const violations = await this.oshaViolationModel
        .find({
          createdAt: { $gte: startDate }
        })
        .populate({
          path: 'oshaInspectionId',
          populate: {
            path: 'oshaComplianceRequirementId',
            select: 'businessId',
            match: { businessId }
          }
        })
        .sort({ createdAt: 1 })
        .exec();

      const filteredViolations = violations.filter(violation => 
        (violation.oshaInspectionId as any)?.oshaComplianceRequirementId
      );

      // Group data by date (weekly for longer periods, daily for 30d)
      const groupBy = period === '30d' ? 'day' : 'week';
      const trendData = this.groupTrendData(
        requirements,
        filteredInspections,
        filteredViolations,
        startDate,
        now,
        groupBy
      );

      return {
        compliance_trend: trendData,
        period
      };
    } catch (error) {
      this.logger.error(`Error calculating OSHA compliance trends: ${error.message}`, error.stack);
      throw error;
    }
  }

  private groupTrendData(
    requirements: any[],
    inspections: any[],
    violations: any[],
    startDate: Date,
    endDate: Date,
    groupBy: 'day' | 'week'
  ) {
    const trendData = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
      const nextPeriod = new Date(current);
      if (groupBy === 'day') {
        nextPeriod.setDate(current.getDate() + 1);
      } else {
        nextPeriod.setDate(current.getDate() + 7);
      }

      // Count items in this period
      const periodRequirements = requirements.filter(req => 
        new Date(req.createdAt) >= current && new Date(req.createdAt) < nextPeriod
      );

      const periodInspections = inspections.filter(inspection => 
        new Date(inspection.inspectionDate) >= current && new Date(inspection.inspectionDate) < nextPeriod
      );

      const periodViolations = violations.filter(violation => 
        new Date(violation.createdAt) >= current && new Date(violation.createdAt) < nextPeriod
      );

      // Calculate compliance rate for this period
      const compliantRequirements = periodRequirements.filter(req => 
        req.status === OshaComplianceStatus.COMPLIANT
      ).length;

      const complianceRate = periodRequirements.length > 0 
        ? Math.round((compliantRequirements / periodRequirements.length) * 100)
        : 0;

      trendData.push({
        date: current.toISOString().split('T')[0],
        compliance_rate: complianceRate,
        violations: periodViolations.length,
        inspections: periodInspections.length
      });

      current.setTime(nextPeriod.getTime());
    }

    return trendData;
  }
}