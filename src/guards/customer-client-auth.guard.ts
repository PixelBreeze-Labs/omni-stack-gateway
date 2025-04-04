// guards/customer-client-auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { CustomerService } from '../services/customer.service';
import { UserService } from '../services/user.service';

@Injectable()
export class CustomerClientAuthGuard implements CanActivate {
    constructor(
        private customerService: CustomerService,
        private userService: UserService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const user = request.user; // Set by SalesAssociateGuard
        const customerId = request.params.customerId; // From URL parameter

        if (!user || !customerId) {
            throw new UnauthorizedException('Authentication required');
        }

        // Try to find customer using the first matching client ID
        let customer = null;
        for (const clientId of user.client_ids) {
            try {
                customer = await this.customerService.findOne(customerId, clientId);
                if (customer) break;
            } catch (err) {
                continue; // Try next client ID if this one fails
            }
        }

        if (!customer) {
            throw new UnauthorizedException('Customer not found');
        }

        // Check if user has access to at least one of customer's clients
        const hasCommonClient = customer.clientIds.some(clientId =>
            user.client_ids.includes(clientId.toString())
        );

        if (!hasCommonClient) {
            throw new UnauthorizedException('Access denied to customer data');
        }

        // Attach customer to request for later use
        request.customer = customer;
        return true;
    }
}