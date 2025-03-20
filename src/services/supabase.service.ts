// src/services/supabase.service.ts
import { Injectable } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { FileAttachment } from '../interfaces/report.interface';

@Injectable()
export class SupabaseService {
    private supabase;

    constructor(private configService: ConfigService) {
        this.supabase = createClient(
            this.configService.get('SUPABASE_URL'),
            this.configService.get('SUPABASE_KEY')
        );
    }

    // Existing methods unchanged

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

    /**
     * Upload file specifically for reports
     */
    async uploadReportFile(buffer: Buffer, filename: string, contentType: string, reportId: string): Promise<string> {
        const timestamp = Date.now();
        const path = `reports/${reportId}/${timestamp}_${filename}`;

        const { data, error } = await this.supabase
            .storage
            .from('products') // Using existing bucket
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

    /**
     * Process all files for a report
     */
    async uploadReportFiles(reportId: string, files: FileAttachment[]): Promise<FileAttachment[]> {
        const processedFiles: FileAttachment[] = [];

        for (const file of files) {
            if (!file.content) continue;

            try {
                // Decode base64 content to buffer
                const fileBuffer = Buffer.from(file.content, 'base64');

                // Upload file using the report-specific method
                const publicUrl = await this.uploadReportFile(
                    fileBuffer,
                    file.name,
                    file.type,
                    reportId
                );

                // Add the uploaded file to processed files
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

    // New methods for community reports with different names

    /**
     * Uploads an image for community reports
     */
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

    /**
     * Uploads an audio file for community reports
     */
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

    /**
     * Delete a community report file
     */
    async deleteCommunityFile(path: string): Promise<void> {
        const { error } = await this.supabase
            .storage
            .from('products')
            .remove([path]);

        if (error) throw error;
    }

    // Check-in submission file uploads

    /**
     * Uploads a file for check-in submissions
     * @param file File buffer to upload
     * @param filename Original filename
     * @param subpath Optional subdirectory (e.g., 'id-documents' or 'attachments')
     */
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

    /**
     * Delete a check-in submission file
     */
    async deleteCheckinFile(path: string): Promise<void> {
        const { error } = await this.supabase
            .storage
            .from('products')
            .remove([path]);

        if (error) throw error;
    }

    /**
     * Helper method to determine content type based on file extension
     */
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
}