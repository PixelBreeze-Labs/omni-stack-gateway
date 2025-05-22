// src/services/osha-reports.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OshaComplianceRequirement } from '../schemas/osha-compliance-requirement.schema';
import { OshaInspection } from '../schemas/osha-inspection.schema';
import { OshaViolation } from '../schemas/osha-violation.schema';
import { ConstructionSite } from '../schemas/construction-site.schema';
import { Business } from '../schemas/business.schema';
import * as PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';

interface ReportFilters {
  businessId: string;
  constructionSiteId?: string;
  reportType?: 'summary' | 'detailed' | 'violations';
  dateFrom?: Date;
  dateTo?: Date;
  includeInspections?: boolean;
  includeViolations?: boolean;
}

@Injectable()
export class OshaReportsService {
  private readonly logger = new Logger(OshaReportsService.name);

  constructor(
    @InjectModel(OshaComplianceRequirement.name)
    private oshaComplianceModel: Model<OshaComplianceRequirement>,
    @InjectModel(OshaInspection.name)
    private oshaInspectionModel: Model<OshaInspection>,
    @InjectModel(OshaViolation.name)
    private oshaViolationModel: Model<OshaViolation>,
    @InjectModel(ConstructionSite.name)
    private constructionSiteModel: Model<ConstructionSite>,
    @InjectModel(Business.name)
    private businessModel: Model<Business>
  ) {}

  async generatePdfReport(filters: ReportFilters): Promise<Buffer> {
    try {
      // Get report data
      const reportData = await this.getReportData(filters);
      
      // Create PDF document
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      
      doc.on('data', (chunk) => chunks.push(chunk));
      
      await new Promise<void>((resolve) => {
        doc.on('end', resolve);
        
        // Generate PDF content
        this.generatePdfContent(doc, reportData, filters);
        doc.end();
      });
      
      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.error(`Error generating PDF report: ${error.message}`, error.stack);
      throw error;
    }
  }

  async generateExcelReport(filters: ReportFilters): Promise<Buffer> {
    try {
      // Get report data
      const reportData = await this.getReportData(filters);
      
      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      
      // Add requirements sheet
      const requirementsSheet = workbook.addWorksheet('OSHA Requirements');
      this.addRequirementsToExcel(requirementsSheet, reportData.requirements);
      
      // Add inspections sheet if requested
      if (filters.includeInspections && reportData.inspections) {
        const inspectionsSheet = workbook.addWorksheet('Inspections');
        this.addInspectionsToExcel(inspectionsSheet, reportData.inspections);
      }
      
      // Add violations sheet if requested
      if (filters.includeViolations && reportData.violations) {
        const violationsSheet = workbook.addWorksheet('Violations');
        this.addViolationsToExcel(violationsSheet, reportData.violations);
      }
      
      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(buffer);
    } catch (error) {
      this.logger.error(`Error generating Excel report: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getReportPreview(filters: ReportFilters) {
    try {
      const reportData = await this.getReportData(filters);
      
      return {
        title: `OSHA Compliance Report - ${filters.reportType || 'Summary'}`,
        generated_at: new Date().toISOString(),
        business_name: reportData.business?.name || 'Unknown Business',
        site_name: reportData.site?.name,
        summary: {
          total_requirements: reportData.requirements.length,
          compliant: reportData.requirements.filter(r => r.status === 'compliant').length,
          non_compliant: reportData.requirements.filter(r => r.status === 'non_compliant').length,
          pending: reportData.requirements.filter(r => r.status === 'pending').length,
        },
        data: this.formatPreviewData(reportData, filters.reportType)
      };
    } catch (error) {
      this.logger.error(`Error generating report preview: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async getReportData(filters: ReportFilters) {
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

    // Get business info
    const business = await this.businessModel.findById(businessId).exec();
    
    // Get site info if specified
    let site = null;
    if (constructionSiteId) {
      site = await this.constructionSiteModel.findById(constructionSiteId).exec();
    }

    // Get requirements
    const requirements = await this.oshaComplianceModel
      .find(baseQuery)
      .populate('assignedTo', 'name email')
      .populate('constructionSiteId', 'name')
      .sort({ createdAt: -1 })
      .exec();

    // Get inspections if needed
    let inspections = [];
    if (filters.includeInspections || filters.reportType === 'detailed') {
      const requirementIds = requirements.map(r => r._id);
      inspections = await this.oshaInspectionModel
        .find({ 
          oshaComplianceRequirementId: { $in: requirementIds },
          isDeleted: false 
        })
        .populate('inspectorId', 'name email')
        .populate('oshaComplianceRequirementId', 'title')
        .sort({ inspectionDate: -1 })
        .exec();
    }

    // Get violations if needed
    let violations = [];
    if (filters.includeViolations || filters.reportType === 'violations') {
      const inspectionIds = inspections.map(i => i._id);
      violations = await this.oshaViolationModel
        .find({ 
          oshaInspectionId: { $in: inspectionIds },
          isDeleted: false 
        })
        .populate('oshaInspectionId')
        .populate('assignedTo', 'name email')
        .sort({ createdAt: -1 })
        .exec();
    }

    return {
      business,
      site,
      requirements,
      inspections,
      violations
    };
  }

  private generatePdfContent(doc: any, reportData: any, filters: ReportFilters) {
    // Header
    doc.fontSize(20).text('OSHA Compliance Report', { align: 'center' });
    doc.fontSize(12).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown();

    // Business info
    doc.fontSize(14).text(`Business: ${reportData.business?.name || 'Unknown'}`, { underline: true });
    if (reportData.site) {
      doc.text(`Site: ${reportData.site.name}`);
    }
    doc.moveDown();

    // Summary
    doc.fontSize(12).text('Summary:', { underline: true });
    doc.text(`Total Requirements: ${reportData.requirements.length}`);
    doc.text(`Compliant: ${reportData.requirements.filter(r => r.status === 'compliant').length}`);
    doc.text(`Non-Compliant: ${reportData.requirements.filter(r => r.status === 'non_compliant').length}`);
    doc.text(`Pending: ${reportData.requirements.filter(r => r.status === 'pending').length}`);
    doc.moveDown();

    // Requirements table
    doc.fontSize(12).text('Requirements:', { underline: true });
    doc.moveDown(0.5);

    reportData.requirements.forEach((req, index) => {
      if (doc.y > 700) { // New page if needed
        doc.addPage();
      }
      
      doc.fontSize(10);
      doc.text(`${index + 1}. ${req.title}`, { continued: false });
      doc.text(`   Category: ${req.category} | Status: ${req.status} | Priority: ${req.priority}`);
      if (req.assignedTo) {
        doc.text(`   Assigned to: ${req.assignedTo.name}`);
      }
      if (req.nextInspectionDate) {
        doc.text(`   Next Inspection: ${new Date(req.nextInspectionDate).toLocaleDateString()}`);
      }
      doc.moveDown(0.5);
    });

    // Add violations if report type is violations
    if (filters.reportType === 'violations' && reportData.violations.length > 0) {
      doc.addPage();
      doc.fontSize(14).text('Violations', { underline: true });
      doc.moveDown();

      reportData.violations.forEach((violation, index) => {
        if (doc.y > 700) {
          doc.addPage();
        }
        
        doc.fontSize(10);
        doc.text(`${index + 1}. ${violation.description}`);
        doc.text(`   Type: ${violation.violationType} | Severity: ${violation.severity} | Status: ${violation.status}`);
        if (violation.correctionDeadline) {
          doc.text(`   Deadline: ${new Date(violation.correctionDeadline).toLocaleDateString()}`);
        }
        doc.moveDown(0.5);
      });
    }
  }

  private addRequirementsToExcel(worksheet: ExcelJS.Worksheet, requirements: any[]) {
    // Add headers
    worksheet.addRow([
      'ID', 'Title', 'Category', 'Status', 'Priority', 'Assigned To', 
      'Last Inspection', 'Next Inspection', 'Created At'
    ]);

    // Style headers
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data
    requirements.forEach(req => {
      worksheet.addRow([
        req._id.toString(),
        req.title,
        req.category,
        req.status,
        req.priority,
        req.assignedTo?.name || 'Unassigned',
        req.lastInspectionDate ? new Date(req.lastInspectionDate).toLocaleDateString() : '',
        req.nextInspectionDate ? new Date(req.nextInspectionDate).toLocaleDateString() : '',
        new Date(req.createdAt).toLocaleDateString()
      ]);
    });

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      column.width = 15;
    });
  }

  private addInspectionsToExcel(worksheet: ExcelJS.Worksheet, inspections: any[]) {
    // Add headers
    worksheet.addRow([
      'ID', 'Requirement', 'Inspector', 'Date', 'Type', 'Status', 'Result', 'Violations Found'
    ]);

    // Style headers
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data
    inspections.forEach(inspection => {
      worksheet.addRow([
        inspection._id.toString(),
        inspection.oshaComplianceRequirementId?.title || 'Unknown',
        inspection.inspectorId?.name || 'Unknown',
        new Date(inspection.inspectionDate).toLocaleDateString(),
        inspection.inspectionType,
        inspection.status,
        inspection.result || 'Pending',
        inspection.violationsFound || 0
      ]);
    });

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      column.width = 15;
    });
  }

  private addViolationsToExcel(worksheet: ExcelJS.Worksheet, violations: any[]) {
    // Add headers
    worksheet.addRow([
      'ID', 'Type', 'Description', 'Severity', 'Status', 'Assigned To', 'Deadline', 'Fine Amount'
    ]);

    // Style headers
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data
    violations.forEach(violation => {
      worksheet.addRow([
        violation._id.toString(),
        violation.violationType,
        violation.description,
        violation.severity,
        violation.status,
        violation.assignedTo?.name || 'Unassigned',
        violation.correctionDeadline ? new Date(violation.correctionDeadline).toLocaleDateString() : '',
        violation.fineAmount || 0
      ]);
    });

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      column.width = 15;
    });
  }

  private formatPreviewData(reportData: any, reportType?: string) {
    switch (reportType) {
      case 'violations':
        return reportData.violations.map(v => ({
          type: 'violation',
          id: v._id,
          description: v.description,
          severity: v.severity,
          status: v.status,
          deadline: v.correctionDeadline
        }));
      
      case 'detailed':
        return reportData.requirements.map(r => ({
          type: 'requirement',
          id: r._id,
          title: r.title,
          category: r.category,
          status: r.status,
          priority: r.priority,
          assignedTo: r.assignedTo?.name,
          nextInspection: r.nextInspectionDate,
          inspectionCount: reportData.inspections.filter(i => 
            i.oshaComplianceRequirementId._id.toString() === r._id.toString()
          ).length
        }));
      
      default: // summary
        return reportData.requirements.map(r => ({
          type: 'requirement',
          id: r._id,
          title: r.title,
          status: r.status,
          priority: r.priority,
          nextInspection: r.nextInspectionDate
        }));
    }
  }
}