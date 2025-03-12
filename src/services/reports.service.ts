// Extended ReportsService with community features
import { Injectable } from '@nestjs/common';
import { InjectModel, InjectRepository } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MongoRepository } from 'typeorm';
import { Report as MongoReport, FileAttachment } from '../interfaces/report.interface';
import { ClientApp } from '../interfaces/client-app.interface';
import { EmailService } from './email.service';
import { SupabaseService } from './supabase.service';
import { CreateReportDto } from '../modules/report/dtos/create-report.dto';
import { UpdateReportDto } from '../modules/report/dtos/update-report.dto';
import { Report as TypeOrmReport } from '../modules/report/entities/report.entity';
import { ObjectId } from 'mongodb';

@Injectable()
export class ReportsService {
    constructor(
        @InjectModel('Report') private readonly reportModel: Model<MongoReport>,
        @InjectModel('ClientApp') private readonly clientAppModel: Model<ClientApp>,
        @InjectRepository(TypeOrmReport)
        private readonly communityReportRepository: MongoRepository<TypeOrmReport>,
        private readonly emailService: EmailService,
        private readonly supabaseService: SupabaseService
    ) {}

    // Existing methods for the original reports system
    async create(report: MongoReport): Promise<MongoReport> {
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

    async findAll(query: any): Promise<MongoReport[]> {
        const filter = {};
        if (query.status) filter['status'] = query.status;
        if (query.clientAppId) filter['clientApp.id'] = query.clientAppId;

        return await this.reportModel
            .find(filter)
            .sort({ 'metadata.timestamp': -1 })
            .exec();
    }

    async findOne(id: string): Promise<MongoReport> {
        return await this.reportModel.findById(id).exec();
    }

    async update(id: string, report: Partial<MongoReport>): Promise<MongoReport> {
        return await this.reportModel
            .findByIdAndUpdate(id, report, { new: true })
            .exec();
    }

    async updateStatus(id: string, status: string): Promise<MongoReport> {
        return await this.reportModel
            .findByIdAndUpdate(id, { status }, { new: true })
            .exec();
    }

    async delete(id: string): Promise<MongoReport> {
        return await this.reportModel.findByIdAndDelete(id).exec();
    }

    // New community reporting methods
    async createCommunityReport(createReportDto: CreateReportDto, files: Express.Multer.File[] = [], audioFile: Express.Multer.File): Promise<TypeOrmReport> {
        const mediaUrls: string[] = [];

        // Upload images to Supabase
        if (files && files.length > 0) {
            for (const file of files) {
                const filename = `${Date.now()}-${file.originalname}`;
                const url = await this.supabaseService.uploadImage(file.buffer, filename);
                mediaUrls.push(url);
            }
        }

        // Handle audio upload
        let audioUrl: string | null = null;
        if (audioFile && audioFile.buffer) {
            try {
                const audioFilename = `audio-${Date.now()}.webm`;
                audioUrl = await this.supabaseService.uploadAudio(audioFile.buffer, audioFilename);
            } catch (error) {
                console.error('Audio upload failed', error);
            }
        }

        // Create the report object
        const report = this.communityReportRepository.create({
            ...createReportDto,
            media: mediaUrls.length > 0 ? mediaUrls : [],
            audio: audioUrl || undefined,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        return this.communityReportRepository.save(report);
    }

    async findAllCommunityReports(options: {
        page?: number;
        limit?: number;
        category?: string;
        status?: string;
        sortBy?: string;
    }) {
        const {
            page = 1,
            limit = 12,
            category = 'all',
            status = 'all',
            sortBy = 'newest'
        } = options;

        const query: any = {};

        if (category !== 'all') {
            query.category = category;
        }

        if (status !== 'all') {
            query.status = status;
        }

        const sort: any = {};
        if (sortBy === 'newest') {
            sort.createdAt = -1;
        } else {
            sort.createdAt = 1;
        }

        const skip = (page - 1) * limit;

        const [reports, total] = await Promise.all([
            this.communityReportRepository.find({
                where: query,
                skip: skip,
                take: limit,
                order: sort
            }),
            this.communityReportRepository.count(query)
        ]);

        // Transform reports to include string ID
        const transformedReports = reports.map(report => {
            const fixedMedia = report.media?.map(url => {
                if (typeof url === 'string' && url.startsWith('https://https://')) {
                    return url.replace('https://https://', 'https://');
                }
                return url;
            });

            const plainReport = {
                ...report,
                id: report._id.toString(), // Add string ID
                media: fixedMedia,
                _id: undefined // Remove the buffer ID
            };
            return plainReport;
        });

        return {
            data: transformedReports,
            meta: {
                total,
                page,
                limit,
                hasMore: total > skip + reports.length
            }
        };
    }

    // In backend ReportService.findOne
    async findOneCommunityReport(id: string): Promise<TypeOrmReport> {
        const objectId = new ObjectId(id);
        const report = await this.communityReportRepository.findOne({ where: { _id: objectId } });
        if (!report) {
            throw new Error(`Report with ID ${id} not found`);
        }

        const transformedReport = {
            ...report,
            id: report._id.toString(),
            media: report.media?.map(url => {
                if (typeof url === 'string' && url.startsWith('https://https://')) {
                    return url.replace('https://https://', 'https://');
                }
                return url;
            }),
            activities: [
                {
                    type: 'CREATED',
                    date: report.createdAt,
                    status: report.status
                },
                ...(report.createdAt.toString() !== report.updatedAt.toString() ? [{
                    type: 'UPDATED',
                    date: report.updatedAt,
                    status: report.status
                }] : [])
            ],
            _id: undefined
        };

        return transformedReport as TypeOrmReport;
    }

    async getFeaturedCommunityReports(): Promise<{ data: TypeOrmReport[] }> {
        // Get all reports
        const allReports = await this.communityReportRepository.find();

        // Shuffle randomly
        const shuffled = allReports.sort(() => 0.5 - Math.random());

        // Take first 6 reports
        const featured = shuffled.slice(0, 6);

        // Transform reports while maintaining the original Report type
        const allFeatured = featured.map(report => {
            // Create a new object that matches the Report type
            const transformedReport = {
                ...report,
                id: report._id.toString(),
                _id: undefined
            };

            // Fix media URLs if needed
            if (transformedReport.media) {
                transformedReport.media = transformedReport.media.map(url =>
                    typeof url === 'string' && url.startsWith('https://https://')
                        ? url.replace('https://https://', 'https://')
                        : url
                );
            }

            return transformedReport;
        });

        return {
            data: allFeatured as TypeOrmReport[]
        };
    }

    async getMapCommunityReports(): Promise<{ data: TypeOrmReport[] }> {
        // Get all reports
        const reports = await this.communityReportRepository.find();

        // Transform reports
        const transformedReports = reports.map(report => {
            const fixedMedia = report.media?.map(url => {
                if (typeof url === 'string' && url.startsWith('https://https://')) {
                    return url.replace('https://https://', 'https://');
                }
                return url;
            });

            return {
                ...report,
                id: report._id.toString(),
                media: fixedMedia,
                _id: undefined
            };
        });

        return {
            data: transformedReports as TypeOrmReport[]
        };
    }

    async updateCommunityReport(id: string, updateReportDto: UpdateReportDto): Promise<TypeOrmReport> {
        const report = await this.findOneCommunityReport(id);
        Object.assign(report, {
            ...updateReportDto,
            updatedAt: new Date(),
        });
        return this.communityReportRepository.save(report);
    }

    async removeCommunityReport(id: string): Promise<void> {
        const result = await this.communityReportRepository.delete(id);
        if (result.affected === 0) {
            throw new Error(`Report with ID ${id} not found`);
        }
    }

    async findNearbyCommunityReports(lat: number, lng: number, maxDistance: number = 5000): Promise<TypeOrmReport[]> {
        return this.communityReportRepository.find({
            where: {
                location: {
                    $geoWithin: {
                        $centerSphere: [[lng, lat], maxDistance / 6378100]
                    }
                }
            } as any
        });
    }
}