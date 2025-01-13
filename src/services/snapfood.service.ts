// src/services/snapfood.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SnapfoodService {
    constructor(private configService: ConfigService) {}

    private readonly baseUrl = this.configService.get<string>('snapfood.baseUrl');
    private readonly apiKey = this.configService.get<string>('snapfood.apiKey');

    async forward(endpoint: string, method: string, data?: any) {
        try {
            const response = await axios({
                method,
                url: `${this.baseUrl}/${endpoint}`,
                data,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
            });
            return response.data;
        } catch (error) {
            throw new HttpException(
                error.response?.data || 'SnapFood Service Error',
                error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}
