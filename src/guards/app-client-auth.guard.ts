// src/guards/app-client-auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AppClientService } from '../services/app-client.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AppClientAuthGuard implements CanActivate {
  constructor(
    private appClientService: AppClientService,
    private jwtService: JwtService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['authorization']?.replace('Bearer ', '');
    
    if (!token) {
      throw new UnauthorizedException('Authentication token required');
    }
    
    // Decode JWT to get client info
    const decoded = this.jwtService.verify(token);
    const userId = decoded.sub;
    const clientId = decoded.clientId;
    const appClientId = decoded.appClientId;
    
    // Find app client record
    const appClient = await this.appClientService.findById(appClientId);
    if (!appClient || !appClient.is_active) {
      throw new UnauthorizedException('Client account not found or inactive');
    }
    
    // Attach to request
    request.user = { userId, clientId, appClientId, role: 'app_client' };
    request.appClient = appClient;
    
    return true;
  }
}