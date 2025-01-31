// services/trackmaster-admin.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class TrackmasterAdminService {
    constructor(private configService: ConfigService) {}

    private readonly baseUrl = this.configService.get<string>('trackmaster_admin.baseUrl');
    private readonly apiKey = this.configService.get<string>('trackmaster_admin.apiKey');

    async verifyAccess(data: { external_ids: string[], role: string }) {
        try {
            const response = await axios({
                method: 'POST',
                url: `${this.baseUrl}/verify-access`,
                data,
                headers: {
                    'x-api-key': this.apiKey,
                    'Content-Type': 'application/json',
                },
            });
            return response.data;
        } catch (error) {
            throw new HttpException(
                error.response?.data || 'Trackmaster Admin Service Error',
                error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}