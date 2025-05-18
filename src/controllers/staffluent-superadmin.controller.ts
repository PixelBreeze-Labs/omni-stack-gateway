import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CronJobHistory } from '../schemas/cron-job-history.schema';
import { AgentFeatureFlag, Business } from '../schemas/business.schema';
import { TaskAssignment, TaskStatus } from '../schemas/task-assignment.schema';
import { StaffProfile } from '../schemas/staff-profile.schema';
import { AgentConfiguration } from '../schemas/agent-configuration.schema';
import { BusinessWeatherSettings } from '../schemas/business-weather-settings.schema';

@ApiTags('Staffluent Superadmin Dashboard')
@ApiBearerAuth()
@Controller('staffluent-superadmin')
@UseGuards(ClientAuthGuard)
export class StaffluentSuperadminController {
    constructor(
        @InjectModel(CronJobHistory.name) private cronJobHistoryModel: Model<CronJobHistory>,
        @InjectModel(Business.name) private businessModel: Model<Business>,
        @InjectModel(TaskAssignment.name) private taskAssignmentModel: Model<TaskAssignment>,
        @InjectModel(StaffProfile.name) private staffProfileModel: Model<StaffProfile>,
        @InjectModel(AgentConfiguration.name) private agentConfigModel: Model<AgentConfiguration>,
        @InjectModel(BusinessWeatherSettings.name) private businessWeatherSettingsModel: Model<BusinessWeatherSettings>
    ) {}

    @ApiOperation({ summary: 'Get cron job history statistics for client businesses' })
    @ApiResponse({
        status: 200,
        description: 'Returns statistics about cron job executions',
        schema: {
            type: 'object',
            properties: {
                totalRuns: { type: 'number', example: 425 },
                successful: { type: 'number', example: 410 },
                failed: { type: 'number', example: 15 },
                jobTypes: {
                    type: 'object',
                    additionalProperties: {
                        type: 'object',
                        properties: {
                            total: { type: 'number', example: 150 },
                            successful: { type: 'number', example: 145 },
                            failed: { type: 'number', example: 5 },
                            avgDuration: { type: 'number', example: 1.23 }
                        }
                    },
                    example: {
                        'scheduledEmployeeSync': {
                            total: 120,
                            successful: 118,
                            failed: 2,
                            avgDuration: 1.5
                        },
                        'scheduledTaskSync': {
                            total: 240,
                            successful: 235,
                            failed: 5,
                            avgDuration: 0.8
                        }
                    }
                },
                businessStats: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            businessId: { type: 'string', example: '60d5ec9f1a0a0e001f4f3c7a' },
                            businessName: { type: 'string', example: 'Acme Inc.' },
                            total: { type: 'number', example: 50 },
                            successful: { type: 'number', example: 48 },
                            failed: { type: 'number', example: 2 }
                        }
                    }
                }
            }
        }
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiQuery({ name: 'days', required: false, type: Number, description: 'Number of days to look back (default: 7)' })
    @Get('cron-stats')
    async getCronJobStats(
        @Req() req: Request & { client: Client },
        @Query('days') days: number = 7
    ) {
        // Get all businesses for this client
        const businesses = await this.businessModel.find({ 
            clientId: req.client.id,
            isDeleted: false
        });
        
        const businessIds = businesses.map(b => b.id);
        
        // Set date range for query
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        // Get all cron job history records for these businesses
        const cronJobs = await this.cronJobHistoryModel.find({
            $or: [
                { businessId: { $in: businessIds } },
                { businessIds: { $in: businessIds } }
            ],
            startTime: { $gte: startDate }
        });
        
        // Calculate statistics
        const stats = {
            totalRuns: cronJobs.length,
            successful: cronJobs.filter(job => job.status === 'completed').length,
            failed: cronJobs.filter(job => job.status === 'failed').length,
            jobTypes: {},
            businessStats: []
        };
        
        // Group by job type
        const jobTypes = {};
        cronJobs.forEach(job => {
            if (!jobTypes[job.jobName]) {
                jobTypes[job.jobName] = {
                    total: 0,
                    successful: 0,
                    failed: 0,
                    durations: []
                };
            }
            
            jobTypes[job.jobName].total++;
            
            if (job.status === 'completed') {
                jobTypes[job.jobName].successful++;
                if (job.duration) {
                    jobTypes[job.jobName].durations.push(job.duration);
                }
            } else if (job.status === 'failed') {
                jobTypes[job.jobName].failed++;
            }
        });
        
        // Calculate average durations and format for output
        stats.jobTypes = Object.keys(jobTypes).reduce((acc, key) => {
            const jobType = jobTypes[key];
            const avgDuration = jobType.durations.length > 0
                ? jobType.durations.reduce((sum, val) => sum + val, 0) / jobType.durations.length
                : 0;
                
            acc[key] = {
                total: jobType.total,
                successful: jobType.successful,
                failed: jobType.failed,
                avgDuration: parseFloat(avgDuration.toFixed(2))
            };
            
            return acc;
        }, {});
        
        // Calculate per-business statistics
        const businessMap = businesses.reduce((acc, business) => {
            acc[business.id] = business.name;
            return acc;
        }, {});
        
        const businessStats = {};
        cronJobs.forEach(job => {
            // Handle both single businessId and businessIds array
            const ids = job.businessId ? [job.businessId] : (job.businessIds || []);
            
            ids.forEach(id => {
                if (!businessIds.includes(id)) return;
                
                if (!businessStats[id]) {
                    businessStats[id] = {
                        businessId: id,
                        businessName: businessMap[id] || 'All Businesses',
                        total: 0,
                        successful: 0,
                        failed: 0
                    };
                }
                
                businessStats[id].total++;
                
                if (job.status === 'completed') {
                    businessStats[id].successful++;
                } else if (job.status === 'failed') {
                    businessStats[id].failed++;
                }
            });
        });
        
        stats.businessStats = Object.values(businessStats);
        
        return stats;
    }

    @ApiOperation({ summary: 'Get recent cron job history for client businesses' })
    @ApiResponse({
        status: 200,
        description: 'Returns list of recent cron job executions',
        schema: {
            type: 'object',
            properties: {
                total: { type: 'number', example: 100 },
                page: { type: 'number', example: 1 },
                limit: { type: 'number', example: 20 },
                jobs: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', example: '60d5ec9f1a0a0e001f4f3c7a' },
                            jobName: { type: 'string', example: 'scheduledEmployeeSync' },
                            startTime: { type: 'string', format: 'date-time' },
                            endTime: { type: 'string', format: 'date-time' },
                            duration: { type: 'number', example: 1.5 },
                            status: { type: 'string', example: 'completed' },
                            businessId: { type: 'string', example: '60d5ec9f1a0a0e001f4f3c7a' },
                            businessName: { type: 'string', example: 'Acme Inc.' },
                            details: { 
                                type: 'object',
                                additionalProperties: true,
                                example: {
                                    processedCount: 15,
                                    failedCount: 0
                                }
                            }
                        }
                    }
                }
            }
        }
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
    @ApiQuery({ name: 'status', required: false, enum: ['completed', 'failed', 'started'], description: 'Filter by status' })
    @ApiQuery({ name: 'jobName', required: false, type: String, description: 'Filter by job name' })
    @ApiQuery({ name: 'businessId', required: false, type: String, description: 'Filter by business ID' })
    @Get('cron-history')
    async getCronJobHistory(
        @Req() req: Request & { client: Client },
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 20,
        @Query('status') status?: 'completed' | 'failed' | 'started',
        @Query('jobName') jobName?: string,
        @Query('businessId') businessId?: string
    ) {
        // Get all businesses for this client if no specific businessId is provided
        let businessIds = [];
        
        if (businessId) {
            // Verify the business belongs to this client
            const business = await this.businessModel.findOne({
                _id: businessId,
                clientId: req.client.id,
                isDeleted: false
            });
            
            if (business) {
                businessIds = [business.id];
            } else {
                return {
                    total: 0,
                    page,
                    limit,
                    jobs: []
                };
            }
        } else {
            const businesses = await this.businessModel.find({ 
                clientId: req.client.id,
                isDeleted: false
            });
            
            businessIds = businesses.map(b => b.id);
        }
        
        // Build query
        const query: any = {
            $or: [
                { businessId: { $in: businessIds } },
                { businessIds: { $in: businessIds } }
            ]
        };
        
        if (status) {
            query.status = status;
        }
        
        if (jobName) {
            query.jobName = jobName;
        }
        
        // Count total matching documents
        const total = await this.cronJobHistoryModel.countDocuments(query);
        
        // Get paginated results
        const skip = (page - 1) * limit;
        const jobs = await this.cronJobHistoryModel.find(query)
            .sort({ startTime: -1 })
            .skip(skip)
            .limit(limit);
            
        // Get business names
        const businessMap = {};
        for (const job of jobs) {
            // Get business IDs from either businessId or businessIds
            const ids = job.businessId ? [job.businessId] : (job.businessIds || []);
            
            for (const id of ids) {
                if (!businessMap[id] && businessIds.includes(id)) {
                    const business = await this.businessModel.findById(id);
                    businessMap[id] = business ? business.name : 'All Businesses';
                }
            }
        }
        
        // Format response
        const formattedJobs = jobs.map(job => {
            const businessId = job.businessId || (job.businessIds && job.businessIds[0]);
            
            return {
                id: job._id,
                jobName: job.jobName,
                startTime: job.startTime,
                endTime: job.endTime,
                duration: job.duration,
                status: job.status,
                businessId,
                businessName: businessMap[businessId] || 'All Businesses',
                details: job.details || {},
                error: job.error
            };
        });
        
        return {
            total,
            page,
            limit,
            jobs: formattedJobs
        };
    }

    @ApiOperation({ summary: 'Get task assignment statistics for client businesses' })
    @ApiResponse({
        status: 200,
        description: 'Returns statistics about task assignments',
        schema: {
            type: 'object',
            properties: {
                totalTasks: { type: 'number', example: 250 },
                unassigned: { type: 'number', example: 50 },
                assigned: { type: 'number', example: 150 },
                completed: { type: 'number', example: 40 },
                canceled: { type: 'number', example: 10 },
                businessStats: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            businessId: { type: 'string', example: '60d5ec9f1a0a0e001f4f3c7a' },
                            businessName: { type: 'string', example: 'Acme Inc.' },
                            totalTasks: { type: 'number', example: 80 },
                            unassigned: { type: 'number', example: 15 },
                            assigned: { type: 'number', example: 45 },
                            completed: { type: 'number', example: 15 },
                            canceled: { type: 'number', example: 5 },
                            autoAssignEnabled: { type: 'boolean', example: true }
                        }
                    }
                }
            }
        }
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @Get('task-stats')
    async getTaskStats(@Req() req: Request & { client: Client }) {
        // Get all businesses for this client
        const businesses = await this.businessModel.find({ 
            clientId: req.client.id,
            isDeleted: false
        });
        
        const businessIds = businesses.map(b => b.id);
        
        // Get all tasks for these businesses
        const tasks = await this.taskAssignmentModel.find({
            businessId: { $in: businessIds },
            isDeleted: false
        });
        
        // Calculate overall statistics
        const stats = {
            totalTasks: tasks.length,
            unassigned: tasks.filter(task => task.status === TaskStatus.UNASSIGNED).length,
            assigned: tasks.filter(task => task.status === TaskStatus.ASSIGNED).length,
            inProgress: tasks.filter(task => task.status === TaskStatus.IN_PROGRESS).length,
            completed: tasks.filter(task => task.status === TaskStatus.COMPLETED).length,
            canceled: tasks.filter(task => task.status === TaskStatus.CANCELLED).length,
            pendingApproval: tasks.filter(task => task.metadata?.pendingAssignment).length,
            businessStats: []
        };
        
        // Calculate per-business statistics
        for (const business of businesses) {
            const businessTasks = tasks.filter(task => task.businessId === business.id);
            
            // Check if auto-assignment is enabled for this business
            const agentConfig = await this.agentConfigModel.findOne({
                businessId: business.id,
                agentType: 'auto-assignment'
              });
              
            const isAutoAssignEnabled = agentConfig?.isEnabled || false;            
            
            stats.businessStats.push({
                businessId: business.id,
                businessName: business.name,
                totalTasks: businessTasks.length,
                unassigned: businessTasks.filter(task => task.status === TaskStatus.UNASSIGNED).length,
                assigned: businessTasks.filter(task => task.status === TaskStatus.ASSIGNED).length,
                inProgress: businessTasks.filter(task => task.status === TaskStatus.IN_PROGRESS).length,
                completed: businessTasks.filter(task => task.status === TaskStatus.COMPLETED).length,
                canceled: businessTasks.filter(task => task.status === TaskStatus.CANCELLED).length,
                pendingApproval: businessTasks.filter(task => task.metadata?.pendingAssignment).length,
                autoAssignEnabled: isAutoAssignEnabled
            });
        }
        
        return stats;
    }

    @ApiOperation({ summary: 'Get employee statistics for client businesses' })
    @ApiResponse({
        status: 200,
        description: 'Returns statistics about employees',
        schema: {
            type: 'object',
            properties: {
                totalEmployees: { type: 'number', example: 120 },
                activeEmployees: { type: 'number', example: 110 },
                businessStats: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            businessId: { type: 'string', example: '60d5ec9f1a0a0e001f4f3c7a' },
                            businessName: { type: 'string', example: 'Acme Inc.' },
                            totalEmployees: { type: 'number', example: 45 },
                            activeEmployees: { type: 'number', example: 42 },
                            specializations: {
                                type: 'object',
                                additionalProperties: { type: 'number' },
                                example: {
                                    'Sales': 10,
                                    'Engineering': 15,
                                    'Marketing': 8
                                }
                            },
                            skillLevels: {
                                type: 'object',
                                additionalProperties: { type: 'number' },
                                example: {
                                    'novice': 10,
                                    'intermediate': 15,
                                    'advanced': 12,
                                    'expert': 8
                                }
                            }
                        }
                    }
                }
            }
        }
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @Get('employee-stats')
    async getEmployeeStats(@Req() req: Request & { client: Client }) {
        // Get all businesses for this client
        const businesses = await this.businessModel.find({ 
            clientId: req.client.id,
            isDeleted: false
        });
        
        const businessIds = businesses.map(b => b.id);
        
        // Get all staff profiles for these businesses
        const staffProfiles = await this.staffProfileModel.find({
            businessId: { $in: businessIds }
        });
        
        // Calculate overall statistics
        const stats = {
            totalEmployees: staffProfiles.length,
            activeEmployees: staffProfiles.filter(staff => !staff.metadata?.isInactive).length,
            businessStats: []
        };
        
        // Calculate per-business statistics
        for (const business of businesses) {
            const businessStaff = staffProfiles.filter(staff => staff.businessId === business.id);
            
            // Count specializations
            const specializations = {};
            businessStaff.forEach(staff => {
                if (staff.specializations && staff.specializations.length > 0) {
                    staff.specializations.forEach(spec => {
                        specializations[spec] = (specializations[spec] || 0) + 1;
                    });
                }
            });
            
            // Count skill levels
            const skillLevels = {
                novice: 0,
                intermediate: 0,
                advanced: 0,
                expert: 0
            };
            
            businessStaff.forEach(staff => {
                // Process skills if they exist
                if (staff.skills) {
                    Object.values(staff.skills).forEach(skill => {
                        if (skill && skill.level) {
                            skillLevels[skill.level.toLowerCase()] = 
                                (skillLevels[skill.level.toLowerCase()] || 0) + 1;
                        }
                    });
                }
            });
            
            stats.businessStats.push({
                businessId: business.id,
                businessName: business.name,
                totalEmployees: businessStaff.length,
                activeEmployees: businessStaff.filter(staff => !staff.metadata?.isInactive).length,
                specializations,
                skillLevels
            });
        }
        
        return stats;
    }
    @ApiOperation({ summary: 'Get auto-assignment statistics for client businesses' })
    @ApiResponse({
        status: 200,
        description: 'Returns statistics about auto-assignments',
        schema: {
            type: 'object',
            properties: {
                totalBusinesses: { type: 'number', example: 5 },
                businessesWithAutoAssign: { type: 'number', example: 3 },
                totalAutoAssignments: { type: 'number', example: 120 },
                successful: { type: 'number', example: 110 },
                failed: { type: 'number', example: 10 },
                pendingApproval: { type: 'number', example: 5 },
                businessStats: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            businessId: { type: 'string', example: '60d5ec9f1a0a0e001f4f3c7a' },
                            businessName: { type: 'string', example: 'Acme Inc.' },
                            enabled: { type: 'boolean', example: true },
                            totalAssignments: { type: 'number', example: 50 },
                            successful: { type: 'number', example: 45 },
                            failed: { type: 'number', example: 5 },
                            pendingApproval: { type: 'number', example: 2 }
                        }
                    }
                }
            }
        }
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiQuery({ name: 'days', required: false, type: Number, description: 'Number of days to look back (default: 30)' })
    @Get('auto-assignment-stats')
    async getAutoAssignmentStats(
        @Req() req: Request & { client: Client },
        @Query('days') days: number = 30
    ) {
        // Get all businesses for this client
        const businesses = await this.businessModel.find({ 
            clientId: req.client.id,
            isDeleted: false
        });
        
        const businessIds = businesses.map(b => b.id);
        
        // Set date range for query
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        // Get all auto-assignment jobs from cron history
        const autoAssignJobs = await this.cronJobHistoryModel.find({
            $or: [
                { businessId: { $in: businessIds } },
                { businessIds: { $in: businessIds } }
            ],
            jobName: {
                $in: [
                    'findOptimalAssigneeForVenueBoostTask',
                    'businessAutoAssign',
                    'processBusinessUnassignedTasks',
                    'processUnassignedTasks'
                ]
            },
            startTime: { $gte: startDate }
        });
        
        // Get pending approval tasks
        const pendingApprovalTasks = await this.taskAssignmentModel.find({
            businessId: { $in: businessIds },
            'metadata.pendingAssignment': { $exists: true },
            isDeleted: false
        });
        
        // Calculate overall statistics
        const agentConfigs = await this.agentConfigModel.find({
            businessId: { $in: businessIds },
            agentType: 'auto-assignment',
            isEnabled: true
        });
        const enabledBusinessIds = agentConfigs.map(config => config.businessId);
        const businessesWithAutoAssign = enabledBusinessIds.length;
        
        const stats = {
            totalBusinesses: businesses.length,
            businessesWithAutoAssign,
            totalAutoAssignments: autoAssignJobs.length,
            successful: autoAssignJobs.filter(job => job.status === 'completed').length,
            failed: autoAssignJobs.filter(job => job.status === 'failed').length,
            pendingApproval: pendingApprovalTasks.length,
            businessStats: []
        };
        
        // Calculate per-business statistics
        for (const business of businesses) {
            // Check if auto-assignment is enabled
            const agentConfig = await this.agentConfigModel.findOne({
                businessId: business.id,
                agentType: 'auto-assignment'
            });
            const isEnabled = agentConfig?.isEnabled || false;
            
            // Get jobs for this business
            const businessJobs = autoAssignJobs.filter(job => {
                return (job.businessId === business.id) || 
                       (job.businessIds && job.businessIds.includes(business.id)) ||
                       (job.details?.businessId === business.id);
            });
            
            // Get pending approval tasks for this business
            const businessPendingTasks = pendingApprovalTasks.filter(
                task => task.businessId === business.id
            );
            
            stats.businessStats.push({
                businessId: business.id,
                businessName: business.name,
                enabled: isEnabled,
                totalAssignments: businessJobs.length,
                successful: businessJobs.filter(job => job.status === 'completed').length,
                failed: businessJobs.filter(job => job.status === 'failed').length,
                pendingApproval: businessPendingTasks.length
            });
        }
        
        return stats;
    }

    @ApiOperation({ summary: 'Get detailed business information' })
    @ApiResponse({
        status: 200,
        description: 'Returns detailed information about a specific business',
        schema: {
            type: 'object',
            properties: {
                business: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', example: '60d5ec9f1a0a0e001f4f3c7a' },
                        name: { type: 'string', example: 'Acme Inc.' },
                        email: { type: 'string', example: 'admin@acme.com' },
                        type: { type: 'string', example: 'corporation' },
                        subscriptionStatus: { type: 'string', example: 'active' },
                        subscriptionEndDate: { type: 'string', format: 'date-time' },
                        enabledFeatures: {
                            type: 'array',
                            items: { type: 'string' },
                            example: ['auto_assignment_agent', 'compliance_monitoring_agent']
                        }
                    }
                },
                stats: {
                    type: 'object',
                    properties: {
                        employees: { type: 'number', example: 45 },
                        tasks: {
                            type: 'object',
                            properties: {
                                total: { type: 'number', example: 80 },
                                unassigned: { type: 'number', example: 15 },
                                assigned: { type: 'number', example: 45 },
                                completed: { type: 'number', example: 15 }
                            }
                        },
                        autoAssignments: {
                            type: 'object',
                            properties: {
                                total: { type: 'number', example: 50 },
                                successful: { type: 'number', example: 45 },
                                failed: { type: 'number', example: 5 }
                            }
                        }
                    }
                }
            }
        }
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Business not found' })
    @ApiParam({ name: 'businessId', description: 'Business ID' })
    @ApiQuery({ name: 'days', required: false, type: Number, description: 'Number of days to look back for statistics (default: 30)' })
    @Get('business/:businessId')
    async getBusinessDetails(
        @Req() req: Request & { client: Client },
        @Param('businessId') businessId: string,
        @Query('days') days: number = 30
    ) {
        // Verify the business belongs to this client
        const business = await this.businessModel.findOne({
            _id: businessId,
            clientId: req.client.id,
            isDeleted: false
        });
        
        if (!business) {
            return {
                statusCode: 404,
                message: 'Business not found'
            };
        }
        
        // Set date range for auto-assignment statistics
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        // Get staff profiles for this business
        const staffProfiles = await this.staffProfileModel.find({
            businessId: business.id
        });
        
        // Get tasks for this business
        const tasks = await this.taskAssignmentModel.find({
            businessId: business.id,
            isDeleted: false
        });
        
        // Get auto-assignment jobs for this business
        const autoAssignJobs = await this.cronJobHistoryModel.find({
            $or: [
                { businessId: business.id },
                { businessIds: business.id },
                { 'details.businessId': business.id }
            ],
            jobName: {
                $in: [
                    'findOptimalAssigneeForVenueBoostTask',
                    'businessAutoAssign',
                    'processBusinessUnassignedTasks'
                ]
            },
            startTime: { $gte: startDate }
        });
        
        // Format the response
        return {
            business: {
                id: business._id,
                name: business.name,
                email: business.email,
                type: business.type,
                subscriptionStatus: business.subscriptionStatus,
                subscriptionEndDate: business.subscriptionEndDate,
                enabledFeatures: business.includedFeatures || []
            },
            stats: {
                employees: staffProfiles.length,
                tasks: {
                    total: tasks.length,
                    unassigned: tasks.filter(task => task.status === TaskStatus.UNASSIGNED).length,
                    assigned: tasks.filter(task => task.status === TaskStatus.ASSIGNED).length,
                    inProgress: tasks.filter(task => task.status === TaskStatus.IN_PROGRESS).length,
                    completed: tasks.filter(task => task.status === TaskStatus.COMPLETED).length,
                    canceled: tasks.filter(task => task.status === TaskStatus.CANCELLED).length,
                    pendingApproval: tasks.filter(task => task.metadata?.pendingAssignment).length
                },
                autoAssignments: {
                    total: autoAssignJobs.length,
                    successful: autoAssignJobs.filter(job => job.status === 'completed').length,
                    failed: autoAssignJobs.filter(job => job.status === 'failed').length
                }
            }
        };
    }

    @ApiOperation({ summary: 'Get weather monitoring statistics and job history' })
    @ApiResponse({
        status: 200,
        description: 'Returns statistics and history about weather monitoring jobs',
        schema: {
            type: 'object',
            properties: {
                stats: {
                    type: 'object',
                    properties: {
                        totalJobs: { type: 'number', example: 120 },
                        successful: { type: 'number', example: 115 },
                        failed: { type: 'number', example: 5 },
                        avgDuration: { type: 'number', example: 45.3 },
                        totalAlerts: { type: 'number', example: 67 },
                        businessesWithAlerts: { type: 'number', example: 8 },
                        businessesWithWeatherEnabled: { type: 'number', example: 12 }
                    }
                },
                businessStats: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            businessId: { type: 'string', example: '60d5ec9f1a0a0e001f4f3c7a' },
                            businessName: { type: 'string', example: 'Acme Inc.' },
                            weatherEnabled: { type: 'boolean', example: true },
                            totalJobs: { type: 'number', example: 10 },
                            successful: { type: 'number', example: 9 },
                            failed: { type: 'number', example: 1 },
                            alertCount: { type: 'number', example: 12 },
                            lastRunStatus: { type: 'string', example: 'completed' },
                            lastRunDate: { type: 'string', format: 'date-time' }
                        }
                    }
                },
                recentJobs: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', example: '60d5ec9f1a0a0e001f4f3c7a' },
                            jobName: { type: 'string', example: 'weatherCheckJob' },
                            startTime: { type: 'string', format: 'date-time' },
                            endTime: { type: 'string', format: 'date-time' },
                            duration: { type: 'number', example: 45.3 },
                            status: { type: 'string', example: 'completed' },
                            totalBusinesses: { type: 'number', example: 15 },
                            processedBusinesses: { type: 'number', example: 12 },
                            failedBusinesses: { type: 'number', example: 3 },
                            totalAlerts: { type: 'number', example: 8 }
                        }
                    }
                }
            }
        }
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiQuery({ name: 'days', required: false, type: Number, description: 'Number of days to look back (default: 30)' })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of recent jobs to return (default: 10)' })
    @Get('weather-monitoring')
    async getWeatherMonitoringStats(
        @Req() req: Request & { client: Client },
        @Query('days') days: number = 30,
        @Query('limit') limit: number = 10
    ) {
        // Get all businesses for this client
        const businesses = await this.businessModel.find({ 
            clientId: req.client.id,
            isDeleted: false
        });
        
        const businessIds = businesses.map(b => b.id);
        
        // Set date range for query
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        // Get all weather monitoring jobs from cron history
        const weatherJobs = await this.cronJobHistoryModel.find({
            $or: [
                { businessId: { $in: businessIds } },
                { businessIds: { $in: businessIds } },
                { businessId: null, businessIds: null } // Include global jobs with no specific business
            ],
            jobName: 'weatherCheckJob',
            startTime: { $gte: startDate }
        }).sort({ startTime: -1 });
        
        // Get weather settings to determine which businesses have weather monitoring enabled
        const weatherSettings = await this.businessWeatherSettingsModel.find({
            businessId: { $in: businessIds }
        });
        
        const enabledBusinessIds = weatherSettings
            .filter(setting => setting.enableWeatherAlerts)
            .map(setting => setting.businessId);
        
        // Calculate overall statistics
        let totalAlerts = 0;
        let businessesWithAlerts = 0;
        
        // Calculate durations
        const durations = weatherJobs
            .filter(job => job.duration && job.status === 'completed')
            .map(job => job.duration);
        
        const avgDuration = durations.length > 0
            ? durations.reduce((sum, val) => sum + val, 0) / durations.length
            : 0;
        
        // Count businesses with alerts
        const businessesWithAlertsSet = new Set();
        
        weatherJobs.forEach(job => {
            // Extract alert counts from job details
            if (job.details?.totalAlerts) {
                totalAlerts += job.details.totalAlerts;
            }
            
            // Count unique businesses with alerts
            if (job.details?.businessResults) {
                job.details.businessResults.forEach(result => {
                    if (result.alertCount && result.alertCount > 0) {
                        businessesWithAlertsSet.add(result.businessId);
                    }
                });
            }
        });
        
        businessesWithAlerts = businessesWithAlertsSet.size;
        
        // Prepare stats object
        const stats = {
            totalJobs: weatherJobs.length,
            successful: weatherJobs.filter(job => job.status === 'completed').length,
            failed: weatherJobs.filter(job => job.status === 'failed').length,
            avgDuration: parseFloat(avgDuration.toFixed(2)),
            totalAlerts,
            businessesWithAlerts,
            businessesWithWeatherEnabled: enabledBusinessIds.length
        };
        
        // Calculate per-business statistics
        const businessStatsMap = {};
        
        for (const business of businesses) {
            // Check if weather monitoring is enabled
            const weatherEnabled = enabledBusinessIds.includes(business.id);
            
            // Find jobs related to this business
            const businessJobs = weatherJobs.filter(job => {
                if (job.businessId === business.id) return true;
                if (job.businessIds && job.businessIds.includes(business.id)) return true;
                
                // Check in details
                if (job.details?.businessResults) {
                    return job.details.businessResults.some(
                        result => result.businessId === business.id
                    );
                }
                
                return false;
            });
            
            // Count alerts for this business
            let alertCount = 0;
            businessJobs.forEach(job => {
                if (job.details?.businessResults) {
                    job.details.businessResults.forEach(result => {
                        if (result.businessId === business.id && result.alertCount) {
                            alertCount += result.alertCount;
                        }
                    });
                }
            });
            
            // Get last run status
            let lastRunStatus = null;
            let lastRunDate = null;
            
            if (businessJobs.length > 0) {
                // Sort by start time descending to get the most recent
                const sortedJobs = [...businessJobs].sort((a, b) => 
                    b.startTime.getTime() - a.startTime.getTime()
                );
                
                const lastJob = sortedJobs[0];
                lastRunStatus = lastJob.status;
                lastRunDate = lastJob.startTime;
            }
            
            businessStatsMap[business.id] = {
                businessId: business.id,
                businessName: business.name,
                weatherEnabled,
                totalJobs: businessJobs.length,
                successful: businessJobs.filter(job => job.status === 'completed').length,
                failed: businessJobs.filter(job => job.status === 'failed').length,
                alertCount,
                lastRunStatus,
                lastRunDate
            };
        }
        
        const businessStats = Object.values(businessStatsMap);
        
        // Format recent jobs for the response
        const recentJobs = weatherJobs.slice(0, limit).map(job => {
            return {
                id: job._id,
                jobName: job.jobName,
                startTime: job.startTime,
                endTime: job.endTime,
                duration: job.duration,
                status: job.status,
                totalBusinesses: job.details?.totalBusinesses || 0,
                processedBusinesses: job.processedCount || 0,
                failedBusinesses: job.failedCount || 0,
                totalAlerts: job.details?.totalAlerts || 0,
                error: job.error
            };
        });
        
        return {
            stats,
            businessStats,
            recentJobs
        };
    }
}