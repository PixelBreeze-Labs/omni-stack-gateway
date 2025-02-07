// guards/sales-associate.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TrackmasterAdminService } from '../services/trackmaster-admin.service';
import { UserService } from '../services/user.service';

interface JWTPayload {
    sub: string;
    email: string;
    iat: number;
    exp: number;
}

@Injectable()
export class SalesAssociateGuard implements CanActivate {
    constructor(
        private jwtService: JwtService,
        private trackmasterAdminService: TrackmasterAdminService,
        private userService: UserService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedException('Bearer token missing');
        }

        const token = authHeader.split(' ')[1];

        try {
            // First verify JWT token
            const payload = await this.jwtService.verifyAsync<JWTPayload>(token);

            // Get user from database
            const user = await this.userService.findById(payload.sub);
            if (!user) {
                throw new UnauthorizedException('User not found');
            }

            // Verify with Trackmaster Admin
            const verificationResult = await this.trackmasterAdminService.verifyAccess({
                external_ids: user.external_ids.staffId,
                role: 'SALES_ASSOCIATE'
            });

            if (!verificationResult.hasAccess) {
                throw new UnauthorizedException('Insufficient permissions');
            }

            // Attach verified data to request
            request.user = {
                ...user,
                permissions: verificationResult.permissions
            };

            // Cache verification result if needed
            request.verificationResult = verificationResult;

            return true;
        } catch (error) {
            if (error.name === 'JsonWebTokenError') {
                throw new UnauthorizedException('Invalid token');
            }
            if (error.name === 'TokenExpiredError') {
                throw new UnauthorizedException('Token expired');
            }
            console.error('Sales Associate Guard Error:', error);
            throw new UnauthorizedException('Authentication failed');
        }
    }
}