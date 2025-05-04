import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Log, LogType } from '../schemas/log.schema';
import { CreateLogDto, ListLogsDto } from '../dtos/log.dto';

@Injectable()
export class LogService {
    constructor(
        @InjectModel(Log.name) private logModel: Model<Log>
    ) {}

    async create(createLogDto: CreateLogDto) {
        return this.logModel.create(createLogDto);
    }

    async findAll(query: ListLogsDto) {
        const { type, clientId, sessionId, page = 1, limit = 50, startDate, endDate } = query;
        const skip = (page - 1) * limit;

        // Build filters
        const filters: any = {};
        
        if (type) {
            filters.type = type;
        }
        
        if (clientId) {
            filters.clientId = clientId;
        }
        
        if (sessionId) {
            filters.sessionId = sessionId;
        }
        
        // Add date range filter if provided
        if (startDate || endDate) {
            filters.createdAt = {};
            
            if (startDate) {
                filters.createdAt.$gte = startDate;
            }
            
            if (endDate) {
                filters.createdAt.$lte = endDate;
            }
        }

        // Get total count for pagination
        const total = await this.logModel.countDocuments(filters);
        const totalPages = Math.ceil(total / limit);

        // Get paginated logs
        const logs = await this.logModel
            .find(filters)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        return {
            items: logs,
            total,
            pages: totalPages,
            page,
            limit
        };
    }

    async getLogsBySessionId(sessionId: string) {
        return this.logModel.find({ sessionId }).sort({ createdAt: -1 });
    }

    async getLogStats(clientId?: string) {
        // Build match condition
        const matchCondition: any = {};
        if (clientId) {
            matchCondition.clientId = clientId;
        }
        
        // Get logs by type
        const typeStats = await this.logModel.aggregate([
            { $match: matchCondition },
            { $group: { _id: '$type', count: { $sum: 1 } } }
        ]);
        
        // Get logs by action type
        const actionStats = await this.logModel.aggregate([
            { $match: matchCondition },
            { $group: { _id: '$actionType', count: { $sum: 1 } } }
        ]);
        
        // Get error rate
        const totalLogs = await this.logModel.countDocuments(matchCondition);
        const errorLogs = await this.logModel.countDocuments({ 
            ...matchCondition,
            type: LogType.ERROR 
        });
        
        return {
            total: totalLogs,
            errorRate: totalLogs ? (errorLogs / totalLogs) * 100 : 0,
            byType: typeStats,
            byAction: actionStats
        };
    }

    // Method to clear old logs (can be used by a scheduled task)
    async clearOldLogs(daysToKeep: number) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        const result = await this.logModel.deleteMany({
            createdAt: { $lt: cutoffDate }
        });
        
        return {
            message: `Cleared ${result.deletedCount} old logs`,
            deletedCount: result.deletedCount
        };
    }
}