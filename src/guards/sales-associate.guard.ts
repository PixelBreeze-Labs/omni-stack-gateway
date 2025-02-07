// guards/sales-associate.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TrackmasterAdminService } from '../services/trackmaster-admin.service';
import { UserService } from '../services/user.service';

interface JWTPayload {
    sub: string;
    email: string;
    permissions: any;
    clientId: string;
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
        const token = request.headers.authorization?.split(' ')[1];
        if (!token) throw new UnauthorizedException('Bearer token missing');

        try {
            const payload = await this.jwtService.verifyAsync(token);
            const user = await this.userService.findById(payload.sub);

            request.user = user;
            return true;
        } catch (error) {
            console.error('Guard Error:', error);
            throw new UnauthorizedException(error);
        }
    }
}