// guards/sales-associate.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { TrackmasterAdminService } from '../services/trackmaster-admin.service';
import { UserService } from '../services/user.service';

@Injectable()
export class SalesAssociateGuard implements CanActivate {
    constructor(
        private trackmasterAdminService: TrackmasterAdminService,
        private userService: UserService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const token = request.headers['authorization']?.split(' ')[1];

        if (!token) {
            throw new UnauthorizedException('Token missing');
        }

        // Get user from database
        const user = await this.userService.findByToken(token);
        if (!user) {
            throw new UnauthorizedException('Invalid token');
        }

        // Verify with Trackmaster Admin
        try {
            const verificationResult = await this.trackmasterAdminService.verifyAccess({
                external_ids: user.external_ids,
                role: 'SALES_ASSOCIATE'
            });

            if (!verificationResult.hasAccess) {
                throw new UnauthorizedException('Insufficient permissions');
            }

            request.user = user;
            request.salesPermissions = verificationResult.permissions;
            return true;
        } catch (error) {
            throw new UnauthorizedException('Failed to verify access');
        }
    }
}