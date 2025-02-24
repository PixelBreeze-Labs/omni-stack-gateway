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
}