// src/services/business-storage.service.ts (Fixed version)
import { Injectable, Logger, BadRequestException, PayloadTooLargeException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business } from '../schemas/business.schema';
import { SupabaseService, BusinessFileInfo, StorageUsage } from './supabase.service';
import { TIER_LIMITS } from '../constants/features.constants';
import { AuditLogService } from '../services/audit-log.service';
import { AuditAction, AuditSeverity, ResourceType } from '../schemas/audit-log.schema';

export interface UploadResult {
    success: boolean;
    file: BusinessFileInfo;
    message: string;
    storageUsage?: StorageUsage;
}

export interface DeleteResult {
    success: boolean;
    message: string;
    storageUsage?: StorageUsage;
}

export interface StorageSettings {
    limitMB: number;
    maxFileSizeMB: number;
    allowedFileTypes: string[];
}

@Injectable()
export class BusinessStorageService {
    private readonly logger = new Logger(BusinessStorageService.name);
    
    // Fallback defaults (only used if plan detection fails)
    private readonly FALLBACK_STORAGE_LIMIT_MB = 5; // 5MB fallback
    private readonly FALLBACK_MAX_FILE_SIZE_MB = 5;  // 5MB per file fallback
    private readonly ALLOWED_FILE_TYPES = [
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv'
    ];

    constructor(
        @InjectModel(Business.name) private businessModel: Model<Business>,
        private readonly supabaseService: SupabaseService,
        private readonly auditLogService: AuditLogService 
    ) {}

    /**
     * Upload an image for a business with validation and storage limit checks
     */
    async uploadImage(
        businessId: string,
        file: Buffer,
        filename: string,
        category: string = 'other',
        userId?: string,
        req?: any
    ): Promise<UploadResult> {
        const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
        const userAgent = req?.get('User-Agent');
    
        try {
            this.logger.log(`Uploading image for business ${businessId}: ${filename} (${file.length} bytes)`);
    
            // Get business and storage settings
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                throw new NotFoundException('Business not found');
            }
    
            const storageSettings = this.getStorageSettings(business);
    
            // Validate file type
            if (!this.validateFileType(filename, storageSettings.allowedFileTypes)) {
                // Log failed upload attempt
                await this.auditLogService.createAuditLog({
                    businessId,
                    userId,
                    action: AuditAction.FILE_UPLOADED,
                    resourceType: ResourceType.FILE,
                    resourceName: filename,
                    success: false,
                    errorMessage: 'Invalid file type',
                    severity: AuditSeverity.MEDIUM,
                    ipAddress,
                    userAgent,
                    metadata: {
                        fileName: filename,
                        fileSize: file.length,
                        category,
                        errorReason: 'invalid_file_type',
                        allowedTypes: storageSettings.allowedFileTypes
                    }
                });
    
                throw new BadRequestException(
                    `File type not allowed. Allowed types: ${storageSettings.allowedFileTypes.join(', ')}`
                );
            }
    
            // Validate file size
            const fileSizeMB = file.length / (1024 * 1024);
            if (fileSizeMB > storageSettings.maxFileSizeMB) {
                // Log failed upload attempt
                await this.auditLogService.createAuditLog({
                    businessId,
                    userId,
                    action: AuditAction.FILE_UPLOADED,
                    resourceType: ResourceType.FILE,
                    resourceName: filename,
                    success: false,
                    errorMessage: 'File too large',
                    severity: AuditSeverity.MEDIUM,
                    ipAddress,
                    userAgent,
                    metadata: {
                        fileName: filename,
                        fileSize: file.length,
                        fileSizeMB: fileSizeMB.toFixed(2),
                        maxAllowedMB: storageSettings.maxFileSizeMB,
                        category,
                        errorReason: 'file_too_large'
                    }
                });
    
                throw new PayloadTooLargeException(
                    `File size (${fileSizeMB.toFixed(2)}MB) exceeds maximum allowed size (${storageSettings.maxFileSizeMB}MB)`
                );
            }
    
            // Check storage limit
            const canUpload = await this.supabaseService.canUploadFile(
                businessId,
                file.length,
                storageSettings.limitMB
            );
    
            if (!canUpload) {
                const usage = await this.supabaseService.getBusinessStorageUsage(
                    businessId,
                    storageSettings.limitMB
                );
    
                // Log storage limit exceeded
                await this.auditLogService.createAuditLog({
                    businessId,
                    userId,
                    action: AuditAction.STORAGE_LIMIT_EXCEEDED,
                    resourceType: ResourceType.STORAGE,
                    resourceName: filename,
                    success: false,
                    errorMessage: 'Storage limit exceeded',
                    severity: AuditSeverity.HIGH,
                    ipAddress,
                    userAgent,
                    metadata: {
                        fileName: filename,
                        fileSize: file.length,
                        fileSizeMB: fileSizeMB.toFixed(2),
                        currentUsageMB: usage.totalSizeMB,
                        limitMB: usage.limitMB,
                        remainingMB: usage.remainingMB,
                        category
                    }
                });
    
                throw new PayloadTooLargeException(
                    `Storage limit exceeded. Used: ${usage.totalSizeMB}MB / ${usage.limitMB}MB. ` +
                    `Remaining: ${usage.remainingMB}MB. File size: ${fileSizeMB.toFixed(2)}MB`
                );
            }
    
            // Upload file
            const fileInfo = await this.supabaseService.uploadBusinessImage(
                businessId,
                file,
                filename,
                category
            );
    
            // Get updated storage usage
            const storageUsage = await this.supabaseService.getBusinessStorageUsage(
                businessId,
                storageSettings.limitMB
            );
    
            // Log successful upload
            await this.auditLogService.createAuditLog({
                businessId,
                userId,
                action: AuditAction.FILE_UPLOADED,
                resourceType: ResourceType.FILE,
                resourceId: fileInfo.name,
                resourceName: filename,
                success: true,
                severity: AuditSeverity.LOW,
                ipAddress,
                userAgent,
                metadata: {
                    fileName: filename,
                    fileSize: file.length,
                    fileSizeMB: fileSizeMB.toFixed(2),
                    category,
                    fileUrl: fileInfo.url,
                    storageUsed: storageUsage.totalSizeMB,
                    storageLimit: storageUsage.limitMB,
                    storageRemaining: storageUsage.remainingMB
                }
            });
    
            this.logger.log(`Successfully uploaded image for business ${businessId}: ${fileInfo.url}`);
    
            return {
                success: true,
                file: fileInfo,
                message: 'File uploaded successfully',
                storageUsage
            };
    
        } catch (error) {
            this.logger.error(`Failed to upload image for business ${businessId}:`, error);
            throw error;
        }
    }

    /**
     * Delete a file for a business
     */
    async deleteFile(businessId: string, fileName: string, userId?: string, req?: any): Promise<DeleteResult> {
        const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
        const userAgent = req?.get('User-Agent');
    
        try {
            this.logger.log(`Deleting file for business ${businessId}: ${fileName}`);
    
            // Verify business exists
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                throw new NotFoundException('Business not found');
            }
    
            // Get file info before deletion
            let fileInfo: any = null;
            try {
                fileInfo = await this.supabaseService.getBusinessFile(businessId, fileName);
            } catch (error) {
                // File not found
            }
    
            // Delete file
            await this.supabaseService.deleteBusinessFile(businessId, fileName);
    
            // Get updated storage usage
            const storageSettings = this.getStorageSettings(business);
            const storageUsage = await this.supabaseService.getBusinessStorageUsage(
                businessId,
                storageSettings.limitMB
            );
    
            // Log successful deletion
            await this.auditLogService.createAuditLog({
                businessId,
                userId,
                action: AuditAction.FILE_DELETED,
                resourceType: ResourceType.FILE,
                resourceId: fileName,
                resourceName: fileName,
                success: true,
                severity: AuditSeverity.MEDIUM,
                ipAddress,
                userAgent,
                metadata: {
                    fileName,
                    fileSize: fileInfo?.size || 'unknown',
                    category: fileInfo?.category || 'unknown',
                    storageUsed: storageUsage.totalSizeMB,
                    storageLimit: storageUsage.limitMB,
                    storageFreed: fileInfo?.size ? (fileInfo.size / (1024 * 1024)).toFixed(2) : 'unknown'
                }
            });
    
            this.logger.log(`Successfully deleted file for business ${businessId}: ${fileName}`);
    
            return {
                success: true,
                message: 'File deleted successfully',
                storageUsage
            };
    
        } catch (error) {
            // Log failed deletion
            await this.auditLogService.createAuditLog({
                businessId,
                userId,
                action: AuditAction.FILE_DELETED,
                resourceType: ResourceType.FILE,
                resourceName: fileName,
                success: false,
                errorMessage: error.message,
                severity: AuditSeverity.MEDIUM,
                ipAddress,
                userAgent,
                metadata: {
                    fileName,
                    errorReason: error.name
                }
            });
    
            this.logger.error(`Failed to delete file for business ${businessId}:`, error);
            throw error;
        }
    }
    /**
     * List all files for a business
     */
    async listFiles(businessId: string, category?: string): Promise<BusinessFileInfo[]> {
        try {
            this.logger.log(`Listing files for business ${businessId}${category ? ` in category ${category}` : ''}`);

            // Verify business exists
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                throw new NotFoundException('Business not found');
            }

            // Validate category if provided
            if (category) {
                const validCategories = ['sites', 'general', 'compliance', 'management', 'business', 'legal', 'hr', 'other'];
                if (!validCategories.includes(category)) {
                    throw new BadRequestException(
                        `Invalid category. Valid categories: ${validCategories.join(', ')}`
                    );
                }
            }

            const files = await this.supabaseService.listBusinessFiles(businessId, category);

            this.logger.log(`Found ${files.length} files for business ${businessId}`);

            return files;

        } catch (error) {
            this.logger.error(`Failed to list files for business ${businessId}:`, error);
            throw error;
        }
    }

    /**
     * Get storage usage for a business
     */
    async getStorageUsage(businessId: string): Promise<StorageUsage> {
        try {
            this.logger.log(`Getting storage usage for business ${businessId}`);

            // Verify business exists
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                throw new NotFoundException('Business not found');
            }

            const storageSettings = this.getStorageSettings(business);
            const usage = await this.supabaseService.getBusinessStorageUsage(
                businessId,
                storageSettings.limitMB
            );

            this.logger.log(`Storage usage for business ${businessId}: ${usage.totalSizeMB}MB / ${usage.limitMB}MB`);

            return usage;

        } catch (error) {
            this.logger.error(`Failed to get storage usage for business ${businessId}:`, error);
            throw error;
        }
    }

    /**
     * Initialize storage for a new business
     */
    async initializeBusinessStorage(businessId: string): Promise<void> {
        try {
            this.logger.log(`Initializing storage for business ${businessId}`);

            // Verify business exists
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                throw new NotFoundException('Business not found');
            }

            await this.supabaseService.initializeBusinessStorage(businessId);

            this.logger.log(`Successfully initialized storage for business ${businessId}`);

        } catch (error) {
            this.logger.error(`Failed to initialize storage for business ${businessId}:`, error);
            throw error;
        }
    }

    /**
     * Update storage limit for a business (admin function)
     */
    async updateStorageLimit(businessId: string, newLimitMB: number): Promise<Business> {
        try {
            this.logger.log(`Updating storage limit for business ${businessId} to ${newLimitMB}MB`);

            if (newLimitMB <= 0) {
                throw new BadRequestException('Storage limit must be greater than 0');
            }

            const business = await this.businessModel.findById(businessId);
            if (!business) {
                throw new NotFoundException('Business not found');
            }

            // Set storage override flag and custom limits
            business.metadata.set('storage_overriden', 'true');
            business.metadata.set('storageLimitMB', newLimitMB.toString());
            await business.save();

            this.logger.log(`Successfully updated storage limit for business ${businessId}`);

            return business;

        } catch (error) {
            this.logger.error(`Failed to update storage limit for business ${businessId}:`, error);
            throw error;
        }
    }

    /**
     * Override storage settings for a business
     */
    async overrideStorageSettings(
        businessId: string, 
        settings: {
            enableOverride: boolean;
            storageLimitMB?: number;
            maxFileSizeMB?: number;
        },
        userId?: string,
        req?: any
    ): Promise<any> {
        const ipAddress = req ? this.extractIpAddress(req) : 'unknown';
        const userAgent = req?.get('User-Agent');
    
        try {
            this.logger.log(`Overriding storage settings for business ${businessId}:`, settings);
    
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                throw new NotFoundException('Business not found');
            }
    
            const previousSettings = this.getStorageSettings(business);
    
            if (settings.enableOverride) {
                // Enable override and set custom limits
                business.metadata.set('storage_overriden', 'true');
                
                if (settings.storageLimitMB !== undefined) {
                    if (settings.storageLimitMB <= 0) {
                        throw new BadRequestException('Storage limit must be greater than 0');
                    }
                    business.metadata.set('storageLimitMB', settings.storageLimitMB.toString());
                }
    
                if (settings.maxFileSizeMB !== undefined) {
                    if (settings.maxFileSizeMB <= 0) {
                        throw new BadRequestException('Max file size must be greater than 0');
                    }
                    business.metadata.set('maxFileSizeMB', settings.maxFileSizeMB.toString());
                }
    
                // Log override enabled
                await this.auditLogService.createAuditLog({
                    businessId,
                    userId,
                    action: AuditAction.STORAGE_OVERRIDE_ENABLED,
                    resourceType: ResourceType.STORAGE,
                    success: true,
                    severity: AuditSeverity.HIGH,
                    ipAddress,
                    userAgent,
                    metadata: {
                        previousLimitMB: previousSettings.limitMB,
                        newLimitMB: settings.storageLimitMB,
                        previousMaxFileSizeMB: previousSettings.maxFileSizeMB,
                        newMaxFileSizeMB: settings.maxFileSizeMB,
                        customSettings: settings
                    }
                });
            } else {
                // Disable override - remove custom settings
                business.metadata.delete('storage_overriden');
                business.metadata.delete('storageLimitMB');
                business.metadata.delete('maxFileSizeMB');
    
                // Log override disabled
                await this.auditLogService.createAuditLog({
                    businessId,
                    userId,
                    action: AuditAction.STORAGE_OVERRIDE_DISABLED,
                    resourceType: ResourceType.STORAGE,
                    success: true,
                    severity: AuditSeverity.MEDIUM,
                    ipAddress,
                    userAgent,
                    metadata: {
                        previousLimitMB: previousSettings.limitMB,
                        previousMaxFileSizeMB: previousSettings.maxFileSizeMB,
                        revertedToPlanLimits: true
                    }
                });
            }
    
            await business.save();
    
            // Get updated storage settings and usage
            const storageSettings = this.getStorageSettings(business);
            const storageUsage = await this.supabaseService.getBusinessStorageUsage(
                businessId,
                storageSettings.limitMB
            );
    
            const message = settings.enableOverride 
                ? 'Storage override enabled with custom settings'
                : 'Storage override disabled, using plan-based limits';
    
            this.logger.log(`Successfully updated storage override for business ${businessId}`);
    
            return {
                success: true,
                message,
                business,
                storageSettings,
                storageUsage
            };
    
        } catch (error) {
            this.logger.error(`Failed to override storage settings for business ${businessId}:`, error);
            throw error;
        }
    }

    /**
     * Get detailed storage information for a business
     */
    async getDetailedStorageInfo(businessId: string): Promise<{
        storageSettings: StorageSettings;
        storageUsage: StorageUsage;
        isOverridden: boolean;
        planBasedLimits: any;
        filesByCategory: { [category: string]: number };
        recentFiles: BusinessFileInfo[];
    }> {
        try {
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                throw new NotFoundException('Business not found');
            }

            const storageSettings = this.getStorageSettings(business);
            const storageUsage = await this.supabaseService.getBusinessStorageUsage(
                businessId,
                storageSettings.limitMB
            );

            // Check if storage is overridden
            const isOverridden = business.metadata?.get('storage_overriden') === 'true';

            // Get plan-based limits for comparison
            const planBasedLimits = this.getPlanBasedLimits(business);

            // Get files by category
            const allFiles = await this.supabaseService.listBusinessFiles(businessId);
            const filesByCategory = allFiles.reduce((acc, file) => {
                acc[file.category] = (acc[file.category] || 0) + 1;
                return acc;
            }, {} as { [category: string]: number });

            // Get recent files (last 10)
            const recentFiles = allFiles
                .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
                .slice(0, 10);

            return {
                storageSettings,
                storageUsage,
                isOverridden,
                planBasedLimits,
                filesByCategory,
                recentFiles
            };

        } catch (error) {
            this.logger.error(`Failed to get detailed storage info for business ${businessId}:`, error);
            throw error;
        }
    }

    // Add helper method
        private extractIpAddress(req: any): string {
            return (
                req?.headers?.['x-forwarded-for'] ||
                req?.headers?.['x-real-ip'] ||
                req?.connection?.remoteAddress ||
                req?.socket?.remoteAddress ||
                'unknown'
            ).split(',')[0].trim();
        }

    /**
     * Get storage settings for a business based on plan or override
     */
    private getStorageSettings(business: Business): StorageSettings {
        // Check if storage is overridden
        const isOverridden = business.metadata?.get('storage_overriden') === 'true';
        
        if (isOverridden) {
            const customLimit = business.metadata?.get('storageLimitMB');
            const customMaxFileSize = business.metadata?.get('maxFileSizeMB');

            return {
                limitMB: customLimit ? parseInt(customLimit) : this.FALLBACK_STORAGE_LIMIT_MB,
                maxFileSizeMB: customMaxFileSize ? parseInt(customMaxFileSize) : this.FALLBACK_MAX_FILE_SIZE_MB,
                allowedFileTypes: this.ALLOWED_FILE_TYPES
            };
        }

        // Use plan-based limits
        const planBasedLimits = this.getPlanBasedLimits(business);
        
        return {
            limitMB: planBasedLimits.storage_gb * 1024, // Convert GB to MB
            maxFileSizeMB: Math.min(planBasedLimits.storage_gb * 1024 * 0.1, 50), // 10% of total or 50MB max
            allowedFileTypes: this.ALLOWED_FILE_TYPES
        };
    }

    /**
     * Get plan-based limits from tier configuration
     */
    private getPlanBasedLimits(business: Business): any {
        // Get the subscription tier - you might need to adjust this based on your business model
        let tier = 'basic'; // default
        
        if (business.subscriptionStatus === 'trialing') {
            tier = 'trialing';
        } else if (business.subscriptionDetails?.planId) {
            // Map plan IDs to tiers based on your pricing structure
            const planId = business.subscriptionDetails.planId.toLowerCase();
            if (planId.includes('enterprise')) {
                tier = 'enterprise';
            } else if (planId.includes('professional') || planId.includes('pro')) {
                tier = 'professional';
            } else {
                tier = 'basic';
            }
        }

        const limits = TIER_LIMITS[tier];
        
        if (!limits) {
            this.logger.warn(`No limits found for tier ${tier}, using fallback`);
            return {
                storage_gb: this.FALLBACK_STORAGE_LIMIT_MB / 1024,
                max_file_size_mb: this.FALLBACK_MAX_FILE_SIZE_MB
            };
        }

        return limits;
    }

    /**
     * Validate file type
     */
    private validateFileType(filename: string, allowedTypes: string[]): boolean {
        const ext = filename.split('.').pop()?.toLowerCase();
        return allowedTypes.includes(ext || '');
    }

    /**
     * Get file info by filename
     */
    async getFileInfo(businessId: string, fileName: string): Promise<BusinessFileInfo> {
        try {
            const file = await this.supabaseService.getBusinessFile(businessId, fileName);
            
            if (!file) {
                throw new NotFoundException('File not found');
            }

            return file;

        } catch (error) {
            this.logger.error(`Failed to get file info for business ${businessId}, file ${fileName}:`, error);
            throw error;
        }
    }

    /**
     * Bulk delete files for a business
     */
    async bulkDeleteFiles(businessId: string, fileNames: string[]): Promise<{ 
        successful: string[], 
        failed: string[], 
        message: string,
        storageUsage?: StorageUsage
    }> {
        try {
            this.logger.log(`Bulk deleting ${fileNames.length} files for business ${businessId}`);

            const business = await this.businessModel.findById(businessId);
            if (!business) {
                throw new NotFoundException('Business not found');
            }

            const successful: string[] = [];
            const failed: string[] = [];

            for (const fileName of fileNames) {
                try {
                    await this.supabaseService.deleteBusinessFile(businessId, fileName);
                    successful.push(fileName);
                } catch (error) {
                    failed.push(fileName);
                    this.logger.warn(`Failed to delete file ${fileName}:`, error.message);
                }
            }

            // Get updated storage usage
            const storageSettings = this.getStorageSettings(business);
            const storageUsage = await this.supabaseService.getBusinessStorageUsage(
                businessId,
                storageSettings.limitMB
            );

            const message = `Deleted ${successful.length} files successfully. ${failed.length} files failed.`;
            this.logger.log(message);

            return {
                successful,
                failed,
                message,
                storageUsage
            };

        } catch (error) {
            this.logger.error(`Failed bulk delete for business ${businessId}:`, error);
            throw error;
        }
    }

    /**
     * Check if business can upload file (considering limits)
     */
    async canUploadFile(businessId: string, fileSizeBytes: number, filename: string): Promise<{
        canUpload: boolean;
        reason?: string;
        storageUsage?: StorageUsage;
    }> {
        try {
            const business = await this.businessModel.findById(businessId);
            if (!business) {
                return {
                    canUpload: false,
                    reason: 'Business not found'
                };
            }

            const storageSettings = this.getStorageSettings(business);

            // Check file type
            if (!this.validateFileType(filename, storageSettings.allowedFileTypes)) {
                return {
                    canUpload: false,
                    reason: `File type not allowed. Allowed types: ${storageSettings.allowedFileTypes.join(', ')}`
                };
            }

            // Check file size
            const fileSizeMB = fileSizeBytes / (1024 * 1024);
            if (fileSizeMB > storageSettings.maxFileSizeMB) {
                return {
                    canUpload: false,
                    reason: `File size (${fileSizeMB.toFixed(2)}MB) exceeds maximum allowed size (${storageSettings.maxFileSizeMB}MB)`
                };
            }

            // Check storage limit
            const canUpload = await this.supabaseService.canUploadFile(
                businessId,
                fileSizeBytes,
                storageSettings.limitMB
            );

            const storageUsage = await this.supabaseService.getBusinessStorageUsage(
                businessId,
                storageSettings.limitMB
            );

            if (!canUpload) {
                return {
                    canUpload: false,
                    reason: `Storage limit would be exceeded. Used: ${storageUsage.totalSizeMB}MB / ${storageUsage.limitMB}MB. ` +
                            `Remaining: ${storageUsage.remainingMB}MB. File size: ${fileSizeMB.toFixed(2)}MB`,
                    storageUsage
                };
            }

            return {
                canUpload: true,
                storageUsage
            };

        } catch (error) {
            this.logger.error(`Error checking upload capability for business ${businessId}:`, error);
            return {
                canUpload: false,
                reason: 'Error checking upload capability'
            };
        }
    }
}