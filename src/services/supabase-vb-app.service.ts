import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
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
     * @returns Supabase user ID
     * @throws HttpException if user creation fails
     */
    async createUser(
        email: string,
        password: string,
        metadata: Record<string, any> = {}
    ): Promise<string> {
        try {
            const { data, error } = await this.supabase.auth.admin.createUser({
                email,
                password,
                email_confirm: true, // Auto-confirm email
                user_metadata: metadata
            });

            if (error) {
                this.logger.error(`Error creating Supabase user: ${error.message}`);
                throw new HttpException(`Supabase error: ${error.message}`, HttpStatus.BAD_REQUEST);
            }

            if (!data || !data.user || !data.user.id) {
                this.logger.error('Supabase returned empty user data');
                throw new HttpException('Invalid response from Supabase', HttpStatus.INTERNAL_SERVER_ERROR);
            }

            return data.user.id;
        } catch (error) {
            // If the error is already an HttpException, rethrow it
            if (error instanceof HttpException) {
                throw error;
            }

            this.logger.error(`Exception creating Supabase user: ${error.message}`);
            throw new HttpException(
                `Failed to create Supabase user: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
}