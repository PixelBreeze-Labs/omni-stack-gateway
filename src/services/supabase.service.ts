// src/services/supabase.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

export interface FileAttachment {
    name: string;
    type: string;
    content?: string; // base64
    url?: string;
    size?: number;
}

export interface BusinessFileInfo {
    name: string;
    path: string;
    url: string;
    size: number;
    category: string;
    lastModified: Date;
    type: string;
}

export interface StorageUsage {
    totalSizeMB: number;
    limitMB: number;
    remainingMB: number;
    fileCount: number;
    percentUsed: number;
}

@Injectable()
export class SupabaseService {
    private readonly logger = new Logger(SupabaseService.name);
    private supabase;

    constructor(private configService: ConfigService) {
        this.supabase = createClient(
            this.configService.get('SUPABASE_URL'),
            this.configService.get('SUPABASE_KEY')
        );
    }

    // ========== EXISTING METHODS (unchanged but updated bucket) ==========
    async uploadFile(buffer: Buffer, path: string): Promise<string> {
        const { data, error } = await this.supabase
            .storage
            .from('products')
            .upload(path, buffer, {
                contentType: 'image/jpeg',
                upsert: true
            });

        if (error) throw error;

        const { data: { publicUrl } } = this.supabase
            .storage
            .from('products')
            .getPublicUrl(data.path);

        return publicUrl;
    }

    async uploadReportFile(buffer: Buffer, filename: string, contentType: string, reportId: string): Promise<string> {
        const timestamp = Date.now();
        const path = `reports/${reportId}/${timestamp}_${filename}`;

        const { data, error } = await this.supabase
            .storage
            .from('products')
            .upload(path, buffer, {
                contentType: contentType,
                upsert: true
            });

        if (error) throw error;

        const { data: { publicUrl } } = this.supabase
            .storage
            .from('products')
            .getPublicUrl(data.path);

        return publicUrl;
    }

    async uploadReportFiles(reportId: string, files: FileAttachment[]): Promise<FileAttachment[]> {
        const processedFiles: FileAttachment[] = [];

        for (const file of files) {
            if (!file.content) continue;

            try {
                const fileBuffer = Buffer.from(file.content, 'base64');
                const publicUrl = await this.uploadReportFile(
                    fileBuffer,
                    file.name,
                    file.type,
                    reportId
                );

                processedFiles.push({
                    name: file.name,
                    type: file.type,
                    url: publicUrl,
                    size: file.size
                });
            } catch (error) {
                console.error(`Failed to upload file ${file.name}:`, error);
            }
        }

        return processedFiles;
    }

    async uploadCommunityImage(file: Buffer, filename: string): Promise<string> {
        const path = `community/images/${Date.now()}_${filename}`;

        const { data, error } = await this.supabase
            .storage
            .from('products')
            .upload(path, file, {
                contentType: 'image/jpeg',
                upsert: true
            });

        if (error) throw error;

        const { data: { publicUrl } } = this.supabase
            .storage
            .from('products')
            .getPublicUrl(data.path);

        return publicUrl;
    }

    async uploadCommunityAudio(file: Buffer, filename: string): Promise<string> {
        const path = `community/audio/${Date.now()}_${filename}`;

        const { data, error } = await this.supabase
            .storage
            .from('products')
            .upload(path, file, {
                contentType: 'audio/webm',
                upsert: true
            });

        if (error) throw error;

        const { data: { publicUrl } } = this.supabase
            .storage
            .from('products')
            .getPublicUrl(data.path);

        return publicUrl;
    }

    async deleteCommunityFile(path: string): Promise<void> {
        const { error } = await this.supabase
            .storage
            .from('products')
            .remove([path]);

        if (error) throw error;
    }

    async uploadCheckinFile(file: Buffer, filename: string, subpath: string = 'attachments'): Promise<string> {
        const contentType = this.getContentType(filename);
        const path = `checkin/${subpath}/${Date.now()}_${filename}`;

        const { data, error } = await this.supabase
            .storage
            .from('products')
            .upload(path, file, {
                contentType: contentType,
                upsert: true
            });

        if (error) throw error;

        const { data: { publicUrl } } = this.supabase
            .storage
            .from('products')
            .getPublicUrl(data.path);

        return publicUrl;
    }

    async deleteCheckinFile(path: string): Promise<void> {
        const { error } = await this.supabase
            .storage
            .from('products')
            .remove([path]);

        if (error) throw error;
    }

    async uploadBlogImage(buffer: Buffer, filename: string): Promise<string> {
        const timestamp = Date.now();
        const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
        const path = `blogs/images/${timestamp}_${safeFilename}`;

        const { data, error } = await this.supabase
            .storage
            .from('products')
            .upload(path, buffer, {
                contentType: this.getContentTypeFromFilename(filename),
                upsert: true
            });

        if (error) throw error;

        const { data: { publicUrl } } = this.supabase
            .storage
            .from('products')
            .getPublicUrl(data.path);

        return publicUrl;
    }

    // ========== BUSINESS STORAGE METHODS (Fixed) ==========

    /**
     * Upload an image file for a specific business
     */
    async uploadBusinessImage(
        businessId: string, 
        buffer: Buffer, 
        filename: string, 
        category: string = 'other'
    ): Promise<BusinessFileInfo> {
        try {
            const timestamp = Date.now();
            const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
            const path = `business_storage/${businessId}/${category}/${timestamp}_${safeFilename}`;

            this.logger.log(`Uploading to path: ${path}, size: ${buffer.length} bytes`);

            const { data, error } = await this.supabase
                .storage
                .from('staffluent-content')
                .upload(path, buffer, {
                    contentType: this.getContentType(filename),
                    upsert: true
                });

            if (error) {
                this.logger.error(`Failed to upload business image: ${error.message}`, error);
                throw error;
            }

            const { data: { publicUrl } } = this.supabase
                .storage
                .from('staffluent-content')
                .getPublicUrl(data.path);

            this.logger.log(`Upload successful, public URL: ${publicUrl}`);

            return {
                name: safeFilename,
                path: data.path,
                url: publicUrl,
                size: buffer.length, // Use actual buffer length
                category,
                lastModified: new Date(),
                type: this.getContentType(filename)
            };

        } catch (error) {
            this.logger.error(`Error uploading business image for ${businessId}:`, error);
            throw error;
        }
    }

    /**
     * Upload a chat file for business messaging
     */
    async uploadChatFile(
        businessId: string,
        appClientId: string,
        buffer: Buffer,
        filename: string
    ): Promise<BusinessFileInfo> {
        try {
            const timestamp = Date.now();
            const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
            const path = `chat_files/${businessId}/${appClientId}/${timestamp}_${safeFilename}`;

            this.logger.log(`Uploading chat file to path: ${path}, size: ${buffer.length} bytes`);

            const { data, error } = await this.supabase
                .storage
                .from('staffluent-content')
                .upload(path, buffer, {
                    contentType: this.getContentType(filename),
                    upsert: true
                });

            if (error) {
                this.logger.error(`Failed to upload chat file: ${error.message}`, error);
                throw error;
            }

            const { data: { publicUrl } } = this.supabase
                .storage
                .from('staffluent-content')
                .getPublicUrl(data.path);

            this.logger.log(`Chat file upload successful, public URL: ${publicUrl}`);

            return {
                name: safeFilename,
                path: data.path,
                url: publicUrl,
                size: buffer.length,
                category: 'chat',
                lastModified: new Date(),
                type: this.getContentType(filename)
            };

        } catch (error) {
            this.logger.error(`Error uploading chat file for ${businessId}:`, error);
            throw error;
        }
    }

    /**
     * List all files for a business (Fixed to properly get file sizes)
     */
    async listBusinessFiles(businessId: string, category?: string): Promise<BusinessFileInfo[]> {
        try {
            const folderPath = category 
                ? `business_storage/${businessId}/${category}`
                : `business_storage/${businessId}`;

            this.logger.log(`Listing files in: ${folderPath}`);

            // Get all files recursively if no category specified
            let allFiles: any[] = [];

            if (category) {
                // List files in specific category
                const { data, error } = await this.supabase
                    .storage
                    .from('staffluent-content')
                    .list(folderPath, {
                        limit: 1000,
                        sortBy: { column: 'created_at', order: 'desc' }
                    });

                if (error) {
                    this.logger.error(`Failed to list business files: ${error.message}`, error);
                    throw error;
                }

                allFiles = (data || []).map(file => ({
                    ...file,
                    fullPath: `${folderPath}/${file.name}`,
                    category
                }));
            } else {
                // List all categories
                const { data: categories, error: categoryError } = await this.supabase
                    .storage
                    .from('staffluent-content')
                    .list(folderPath, {
                        limit: 1000,
                        sortBy: { column: 'created_at', order: 'desc' }
                    });

                if (categoryError) {
                    this.logger.error(`Failed to list categories: ${categoryError.message}`, categoryError);
                    throw categoryError;
                }

                // For each category (folder), list its files
                for (const categoryItem of categories || []) {
                    if (categoryItem.name === '.emptyFolderPlaceholder') continue;
                    
                    const categoryPath = `${folderPath}/${categoryItem.name}`;
                    const { data: filesInCategory, error: filesError } = await this.supabase
                        .storage
                        .from('staffluent-content')
                        .list(categoryPath, {
                            limit: 1000,
                            sortBy: { column: 'created_at', order: 'desc' }
                        });

                    if (!filesError && filesInCategory) {
                        const categoryFiles = filesInCategory
                            .filter(file => file.name !== '.emptyFolderPlaceholder')
                            .map(file => ({
                                ...file,
                                fullPath: `${categoryPath}/${file.name}`,
                                category: categoryItem.name
                            }));
                        
                        allFiles.push(...categoryFiles);
                    }
                }
            }

            const files: BusinessFileInfo[] = [];

            for (const file of allFiles) {
                if (file.name === '.emptyFolderPlaceholder') continue;

                const { data: { publicUrl } } = this.supabase
                    .storage
                    .from('staffluent-content')
                    .getPublicUrl(file.fullPath);

                // Get actual file info to ensure we have the correct size
                let fileSize = 0;
                try {
                    const { data: fileInfo, error: infoError } = await this.supabase
                        .storage
                        .from('staffluent-content')
                        .info(file.fullPath);
                    
                    if (!infoError && fileInfo) {
                        fileSize = fileInfo.size || 0;
                    }
                } catch (infoError) {
                    // Fallback to metadata size if info call fails
                    fileSize = file.metadata?.size || 0;
                }

                files.push({
                    name: file.name,
                    path: file.fullPath,
                    url: publicUrl,
                    size: fileSize,
                    category: file.category || 'other',
                    lastModified: new Date(file.updated_at || file.created_at),
                    type: file.metadata?.mimetype || this.getContentType(file.name)
                });
            }

            this.logger.log(`Found ${files.length} files for business ${businessId}`);
            return files;

        } catch (error) {
            this.logger.error(`Error listing business files for ${businessId}:`, error);
            throw error;
        }
    }

    /**
     * Delete a business file (Fixed)
     */
    async deleteBusinessFile(businessId: string, fileName: string): Promise<void> {
        try {
            this.logger.log(`Looking for file to delete: ${fileName} for business ${businessId}`);

            // Get all files to find the exact path
            const allFiles = await this.listBusinessFiles(businessId);
            const file = allFiles.find(f => 
                f.name === fileName || 
                f.name.endsWith(fileName) || 
                f.path.endsWith(fileName)
            );

            if (!file) {
                throw new Error(`File not found: ${fileName}`);
            }

            this.logger.log(`Deleting file at path: ${file.path}`);

            const { error } = await this.supabase
                .storage
                .from('staffluent-content')
                .remove([file.path]);

            if (error) {
                this.logger.error(`Failed to delete business file: ${error.message}`, error);
                throw error;
            }

            this.logger.log(`Successfully deleted business file: ${file.path}`);

        } catch (error) {
            this.logger.error(`Error deleting business file for ${businessId}:`, error);
            throw error;
        }
    }

    /**
     * Get storage usage for a business (Fixed)
     */
    async getBusinessStorageUsage(businessId: string, limitMB: number): Promise<StorageUsage> {
        try {
            const files = await this.listBusinessFiles(businessId);
            
            const totalSizeBytes = files.reduce((total, file) => total + file.size, 0);
            const totalSizeMB = totalSizeBytes / (1024 * 1024);
            const remainingMB = Math.max(0, limitMB - totalSizeMB);
            const percentUsed = limitMB > 0 ? (totalSizeMB / limitMB) * 100 : 0;

            const usage = {
                totalSizeMB: parseFloat(totalSizeMB.toFixed(2)),
                limitMB,
                remainingMB: parseFloat(remainingMB.toFixed(2)),
                fileCount: files.length,
                percentUsed: parseFloat(percentUsed.toFixed(2))
            };

            this.logger.log(`Storage usage for ${businessId}: ${usage.totalSizeMB}MB / ${usage.limitMB}MB (${usage.percentUsed}%)`);
            return usage;

        } catch (error) {
            this.logger.error(`Error getting storage usage for ${businessId}:`, error);
            throw error;
        }
    }

    /**
     * Check if a business can upload a file (within storage limits)
     */
    async canUploadFile(businessId: string, fileSizeBytes: number, limitMB: number): Promise<boolean> {
        try {
            const usage = await this.getBusinessStorageUsage(businessId, limitMB);
            const fileSizeMB = fileSizeBytes / (1024 * 1024);
            
            const canUpload = (usage.totalSizeMB + fileSizeMB) <= limitMB;
            this.logger.log(`Can upload check for ${businessId}: ${canUpload} (current: ${usage.totalSizeMB}MB + new: ${fileSizeMB.toFixed(2)}MB = ${(usage.totalSizeMB + fileSizeMB).toFixed(2)}MB vs limit: ${limitMB}MB)`);
            
            return canUpload;

        } catch (error) {
            this.logger.error(`Error checking upload capacity for ${businessId}:`, error);
            return false;
        }
    }

    /**
     * Initialize storage structure for a new business
     */
    async initializeBusinessStorage(businessId: string): Promise<void> {
        try {
            const categories = ['sites', 'general', 'compliance', 'management', 'business', 'legal', 'hr', 'other'];
            
            for (const category of categories) {
                const path = `business_storage/${businessId}/${category}/.emptyFolderPlaceholder`;
                
                await this.supabase
                    .storage
                    .from('staffluent-content')
                    .upload(path, Buffer.from(''), {
                        contentType: 'text/plain',
                        upsert: true
                    });
            }

            this.logger.log(`Initialized storage structure for business ${businessId}`);

        } catch (error) {
            this.logger.error(`Error initializing storage for ${businessId}:`, error);
            throw error;
        }
    }

    /**
     * Get business file by name (Fixed)
     */
    async getBusinessFile(businessId: string, fileName: string): Promise<BusinessFileInfo | null> {
        try {
            const files = await this.listBusinessFiles(businessId);
            const file = files.find(f => 
                f.name === fileName || 
                f.name.endsWith(fileName) || 
                f.path.endsWith(fileName)
            );
            
            return file || null;

        } catch (error) {
            this.logger.error(`Error getting business file for ${businessId}:`, error);
            throw error;
        }
    }

    /**
     * Bulk delete business files
     */
    async bulkDeleteBusinessFiles(businessId: string, fileNames: string[]): Promise<void> {
        try {
            const allFiles = await this.listBusinessFiles(businessId);
            const filesToDelete = allFiles.filter(file => 
                fileNames.some(fileName => 
                    file.name === fileName || 
                    file.name.endsWith(fileName) || 
                    file.path.endsWith(fileName)
                )
            );

            if (filesToDelete.length === 0) {
                return;
            }

            const pathsToDelete = filesToDelete.map(file => file.path);

            const { error } = await this.supabase
                .storage
                .from('staffluent-content')
                .remove(pathsToDelete);

            if (error) {
                this.logger.error(`Failed to bulk delete business files: ${error.message}`, error);
                throw error;
            }

            this.logger.log(`Successfully deleted ${filesToDelete.length} business files for ${businessId}`);

        } catch (error) {
            this.logger.error(`Error bulk deleting business files for ${businessId}:`, error);
            throw error;
        }
    }

    // ========== HELPER METHODS ==========

    private getContentType(filename: string): string {
        const ext = filename.split('.').pop()?.toLowerCase();

        switch (ext) {
            case 'jpg':
            case 'jpeg':
                return 'image/jpeg';
            case 'png':
                return 'image/png';
            case 'gif':
                return 'image/gif';
            case 'webp':
                return 'image/webp';
            case 'svg':
                return 'image/svg+xml';
            case 'pdf':
                return 'application/pdf';
            case 'doc':
                return 'application/msword';
            case 'docx':
                return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            case 'xls':
                return 'application/vnd.ms-excel';
            case 'xlsx':
                return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            case 'txt':
                return 'text/plain';
            case 'csv':
                return 'text/csv';
            case 'mp3':
                return 'audio/mpeg';
            case 'mp4':
                return 'video/mp4';
            case 'webm':
                return 'audio/webm';
            default:
                return 'application/octet-stream';
        }
    }

    private getContentTypeFromFilename(filename: string): string {
        return this.getContentType(filename);
    }
}