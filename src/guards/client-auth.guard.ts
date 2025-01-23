// src/guards/client-auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ClientService } from '../services/client.service';

@Injectable()
@Injectable()
export class ClientAuthGuard implements CanActivate {
    constructor(private clientService: ClientService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const apiKey = request.headers['client-x-api-key'];

        if (!apiKey) throw new UnauthorizedException('Client API key missing');

        const client = await this.clientService.findByApiKey(apiKey);
        if (!client) throw new UnauthorizedException('Invalid client API key');

        request.client = client; // Attach client to request
        return true;
    }
}