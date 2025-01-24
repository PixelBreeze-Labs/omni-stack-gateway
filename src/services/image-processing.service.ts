// src/services/image-processing.service.ts
import { Injectable } from '@nestjs/common';
import axios from 'axios';
const sharp = require('sharp');
import { SupabaseService } from './supabase.service';

@Injectable()
export class ImageProcessingService {
    constructor(private supabaseService: SupabaseService) {}

    async processAndUpload(imageUrl: string): Promise<{ path: string }> {  // Return object with path
        const image = await this.downloadImage(imageUrl);
        const processed = await this.processImage(image);
        const path = `products/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        const uploadedPath = await this.supabaseService.uploadFile(processed, path);
        return { path: uploadedPath };
    }

    private async downloadImage(url: string): Promise<Buffer> {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data);
    }

    private async processImage(buffer: Buffer): Promise<Buffer> {
        return sharp(buffer)
            .resize(800, 800, { fit: 'inside' })
            .jpeg({ quality: 80 })
            .toBuffer();
    }
}