// src/guards/business-admin.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { BusinessService } from '../services/business.service';

@Injectable()
export class BusinessAuthGuard implements CanActivate {
  constructor(private businessService: BusinessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['business-x-api-key'];
    const businessId = request.query.businessId || request.params.businessId || request.body.businessId;
    
    // Validate API key and business ID
    if (!apiKey || !businessId) {
      throw new UnauthorizedException('Business API key and business ID required');
    }
    
    const business = await this.businessService.findByIdAndApiKey(businessId, apiKey);
    if (!business) {
      throw new UnauthorizedException('Invalid API key for this business');
    }
    
    // Check if business is active
    if (!business.isActive || business.isDeleted) {
      throw new UnauthorizedException('Business account is inactive');
    }
    
    // Attach business to request for controllers to use
    request.business = business;
    request.businessId = businessId;
    
    return true;
  }
}