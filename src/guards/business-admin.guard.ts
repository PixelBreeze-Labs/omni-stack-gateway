// src/guards/business-admin.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class BusinessAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const businessId = request.params.businessId;
    
    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }
    
    // Check if user is business admin or has appropriate role
    if (
      // From JWT token claim
      user.businessId === businessId && 
      (user.role === 'business_admin' || user.role === 'staff_owner')
    ) {
      return true;
    }
    
    throw new UnauthorizedException('User is not authorized to manage this business');
  }
}