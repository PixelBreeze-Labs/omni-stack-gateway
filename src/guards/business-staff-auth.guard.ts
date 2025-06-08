// src/guards/business-staff-auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { BusinessService } from '../services/business.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class BusinessStaffAuthGuard implements CanActivate {
  constructor(
    private businessService: BusinessService,
    private jwtService: JwtService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['authorization']?.replace('Bearer ', '');
    
    if (!token) {
      throw new UnauthorizedException('Authentication token required');
    }
    
    // Decode JWT to get user info
    const decoded = this.jwtService.verify(token);
    const userId = decoded.sub;
    const businessId = decoded.businessId;
    const role = decoded.role;
    
    // Find employee record
    const employee = await this.businessService.findEmployeeByUserId(userId);
    if (!employee) {
      throw new UnauthorizedException('Employee record not found');
    }
    
    // Verify business is active
    const business = await this.businessService.findById(businessId);
    if (!business || !business.isActive) {
      throw new UnauthorizedException('Business account is inactive');
    }
    
    // Attach to request
    request.user = { userId, businessId, role, employeeId: employee._id };
    request.business = business;
    request.employee = employee;
    
    return true;
  }
}