// src/guards/api-key-auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ClientApiKeyService } from '../services/client-api-key.service';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
    constructor(private clientApiKeyService: ClientApiKeyService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const apiKey = request.headers['client-app-x-api-key'];

        if (!apiKey) {
            throw new UnauthorizedException('API key is missing');
        }

        const isValid = await this.clientApiKeyService.validateClientAppApiKey(apiKey);
        if (!isValid) {
            throw new UnauthorizedException('Invalid API key');
        }

        return true;
    }
}
