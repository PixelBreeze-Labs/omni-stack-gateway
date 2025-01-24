// src/services/supabase.service.ts
import { Injectable } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

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
}