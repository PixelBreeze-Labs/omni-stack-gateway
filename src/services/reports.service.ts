
// src/services/reports.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Report } from '../interfaces/report.interface';
import { ClientApp } from '../interfaces/client-app.interface';
import { EmailService } from './email.service';

@Injectable()
export class ReportsService {
    constructor(
        @InjectModel('Report') private readonly reportModel: Model<Report>,
        @InjectModel('ClientApp') private readonly clientAppModel: Model<ClientApp>,
        private readonly emailService: EmailService
    ) {}

    async create(report: Report): Promise<Report> {
        const newReport = new this.reportModel(report);
        const savedReport = await newReport.save();

        // Add debug logging
        console.log('Looking for client app with ID:', report.clientApp.id);

        // Find the associated client app
        const clientApp = await this.clientAppModel.findOne({
            _id: report.clientApp.id  // Changed from clientApp.id to _id
        });

        console.log('Found client app:', clientApp);

        if (clientApp) {
            try {
                console.log('Attempting to send email notification...');
                await this.emailService.sendReportNotification(savedReport, clientApp);
                console.log('Email notification sent successfully');
            } catch (error) {
                console.error('Failed to send email notification:', error);
            }
        } else {
            console.log('No client app found for ID:', report.clientApp.id);
        }

        return savedReport;
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