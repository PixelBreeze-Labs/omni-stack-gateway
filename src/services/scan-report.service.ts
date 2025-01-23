// src/services/scan-report.service.ts
import {ScanReportQueryDto} from "../dtos/scan-report.dto";
import {ScanLog} from "../schemas/scan-log.schema";
import {Model} from "mongoose";
import {InjectModel} from "@nestjs/mongoose";
import {Injectable} from "@nestjs/common";
import { Types } from 'mongoose';

@Injectable()
export class ScanReportService {
    constructor(
        @InjectModel(ScanLog.name) private scanLogModel: Model<ScanLog>
    ) {}

    async getDailyReport(query: ScanReportQueryDto, clientId: string) {
        const pipeline = [
            { $match: { clientId: new Types.ObjectId(clientId) } },
            { $group: {
                    _id: {
                        date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        action: "$action"
                    },
                    count: { $sum: 1 }
                }}
        ];

        return this.scanLogModel.aggregate(pipeline);
    }

    async getProductHistory(productId: string) {
        return this.scanLogModel
            .find({ productId })
            .sort({ createdAt: -1 })
            .populate('warehouseId', 'name code');
    }
}