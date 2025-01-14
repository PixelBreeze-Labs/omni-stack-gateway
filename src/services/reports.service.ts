// src/services/reports.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Report } from '../interfaces/report.interface';

@Injectable()
export class ReportsService {
    constructor(
        @InjectModel('Report') private readonly reportModel: Model<Report>
    ) {}

    async create(report: Report): Promise<Report> {
        const newReport = new this.reportModel(report);
        return await newReport.save();
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