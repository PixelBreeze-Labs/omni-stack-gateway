// src/services/snapfood-admin.service.ts
import {HttpException, HttpStatus, Injectable} from "@nestjs/common";
import {ConfigService} from "@nestjs/config";
import axios from "axios/index";

@Injectable()
export class SnapfoodAdminService {
    constructor(private configService: ConfigService) {}

    private readonly baseUrl = this.configService.get<string>('snapfood_admin.baseUrl');
    private readonly apiKey = this.configService.get<string>('snapfood_admin.apiKey');

    async forward(endpoint: string, method: string, data?: any) {
        try {
            const response = await axios({
                method,
                url: `${this.baseUrl}/${endpoint}`,
                data,
                headers: {
                    'x-api-key': `${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
            });
            return response.data;
        } catch (error) {
            throw new HttpException(
                error.response?.data || 'Snapfood Admin Service Error',
                error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}