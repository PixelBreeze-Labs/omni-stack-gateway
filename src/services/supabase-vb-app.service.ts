// src/services/supabase-vb-app.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseVbAppService {
    private readonly supabase: SupabaseClient;
    private readonly logger = new Logger(SupabaseVbAppService.name);

    constructor(private configService: ConfigService) {
        const supabaseUrl = this.configService.get<string>('SUPABASE_VB_APPS_URL');
        const supabaseKey = this.configService.get<string>('SUPABASE_VB_APPS_SERVICE_KEY');

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase configuration is missing');
        }

        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    /**
     * Create a new user in Supabase
     * @param email User's email
     * @param password User's password
     * @param metadata Additional user metadata
     * @returns Supabase user ID or null if creation failed
     */
    async createUser(
        email: string,
        password: string,
        metadata: Record<string, any> = {}
    ): Promise<string | null> {
        try {
            const { data, error } = await this.supabase.auth.admin.createUser({
                email,
                password,
                email_confirm: true, // Auto-confirm email
                user_metadata: metadata
            });

            if (error) {
                this.logger.error(`Error creating Supabase user: ${error.message}`);
                return null;
            }

            return data.user.id;
        } catch (error) {
            this.logger.error(`Exception creating Supabase user: ${error.message}`);
            return null;
        }
    }

}