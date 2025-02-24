
// src/services/reports.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {FileAttachment, Report} from '../interfaces/report.interface';
import { ClientApp } from '../interfaces/client-app.interface';
import { EmailService } from './email.service';
import { SupabaseService } from './supabase.service';


@Injectable()
export class ReportsService {
    constructor(
        @InjectModel('Report') private readonly reportModel: Model<Report>,
        @InjectModel('ClientApp') private readonly clientAppModel: Model<ClientApp>,
        private readonly emailService: EmailService,
        private readonly supabaseService: SupabaseService
    ) {}

    async create(report: Report): Promise<Report> {
        // Process file uploads if any
        let filesToSave: FileAttachment[] = [];
        if (report.content.files && report.content.files.length > 0) {
            // Create a temporary report to get an ID
            const tempReport = new this.reportModel({
                ...report,
                content: {
                    ...report.content,
                    files: [] // Start with empty files array
                }
            });
            const savedTempReport = await tempReport.save();

            // Upload files to Supabase
            filesToSave = await this.supabaseService.uploadReportFiles(
                savedTempReport._id.toString(),
                report.content.files
            );

            // Update the report with file URLs
            await this.reportModel.findByIdAndUpdate(
                savedTempReport._id,
                {
                    'content.files': filesToSave
                }
            );

            // Get the updated report
            const updatedReport = await this.reportModel.findById(savedTempReport._id);

            // Find the associated client app
            const clientApp = await this.clientAppModel.findOne({
                _id: report.clientApp.id
            });

            if (clientApp) {
                try {
                    await this.emailService.sendReportNotification(updatedReport, clientApp);
                } catch (error) {
                    console.error('Failed to send email notification:', error);
                }
            }

            return updatedReport;
        } else {
            // No files to process, continue with normal flow
            const newReport = new this.reportModel(report);
            const savedReport = await newReport.save();

            // Find the associated client app
            const clientApp = await this.clientAppModel.findOne({
                _id: report.clientApp.id
            });

            if (clientApp) {
                try {
                    await this.emailService.sendReportNotification(savedReport, clientApp);
                } catch (error) {
                    console.error('Failed to send email notification:', error);
                }
            }

            return savedReport;
        }
    }
    async findAll(query: any): Promise<Report[]> {
        const filter = {};
        if (query.status) filter['status'] = query.status;
        if (query.clientAppId) filter['clientApp.id'] = query.clientAppId;

        return await this.reportModel
            .find(filter)
            .sort({ 'metadata.timestamp': -1 })
            .exec();
    }

    async findOne(id: string): Promise<Report> {
        return await this.reportModel.findById(id).exec();
    }

    async update(id: string, report: Partial<Report>): Promise<Report> {
        return await this.reportModel
            .findByIdAndUpdate(id, report, { new: true })
            .exec();
    }

    async updateStatus(id: string, status: string): Promise<Report> {
        return await this.reportModel
            .findByIdAndUpdate(id, { status }, { new: true })
            .exec();
    }

    async delete(id: string): Promise<Report> {
        return await this.reportModel.findByIdAndDelete(id).exec();
    }
}