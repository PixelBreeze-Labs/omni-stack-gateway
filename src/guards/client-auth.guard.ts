// src/guards/client-auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ClientService } from '../services/client.service';
import { Reflector } from '@nestjs/core';

@Injectable()
export class ClientAuthGuard implements CanActivate {
    private readonly SNAPFOOD_API_KEY = 'sk_f37b183bf20e3bdf9c5ed0a7cc96428d57915bf132caaf96296a0be008cc2994';

    constructor(
        private clientService: ClientService,
        private reflector: Reflector
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const apiKey = request.headers['client-x-api-key'];

        if (!apiKey) {
            throw new UnauthorizedException('Client API key missing');
        }

        // Check if we're accessing a SnapFood controller route
        const handler = context.getHandler();
        const controller = context.getClass();
        const isSnapFoodRoute = this.reflector.get<boolean>('isSnapFood', controller);

        // If it's a SnapFood route, validate against the specific API key
        if (isSnapFoodRoute) {
            if (apiKey !== this.SNAPFOOD_API_KEY) {
                throw new UnauthorizedException('Invalid API key for SnapFood routes');
            }

            // Find client with this API key
            const client = await this.clientService.findByApiKey(apiKey);
            if (!client) {
                throw new UnauthorizedException('Client not found');
            }

            request.client = client;
            return true;
        }

        // For non-SnapFood routes, proceed with normal client validation
        const client = await this.clientService.findByApiKey(apiKey);
        if (!client) {
            throw new UnauthorizedException('Invalid client API key');
        }

        request.client = client;
        return true;
    }
}