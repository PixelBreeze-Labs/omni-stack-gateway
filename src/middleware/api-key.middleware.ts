// src/middleware/api-key.middleware.ts
import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
    constructor(private configService: ConfigService) {}

    use(req: Request, res: Response, next: NextFunction) {
        const apiKey = req.headers['x-api-key'];
        const validApiKey = this.configService.get<string>('GATEWAY_API_KEY');

        if (!apiKey || apiKey !== validApiKey) {
            throw new UnauthorizedException('Invalid API1s key');
        }

        next();
    }
}