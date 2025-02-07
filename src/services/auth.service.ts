// services/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from './user.service';
import { TrackmasterAdminService } from './trackmaster-admin.service';
import * as bcrypt from 'bcrypt';
import {SalesAssociateLoginDto} from "../dtos/user.dto";

@Injectable()
export class AuthService {
    constructor(
        private userService: UserService,
        private jwtService: JwtService,
        private trackmasterAdminService: TrackmasterAdminService
    ) {}

    async salesAssociateLogin(loginDto: SalesAssociateLoginDto) {
        const userDoc = await this.userService.findByEmail(loginDto.email);
        const user = await userDoc.populate('primaryStoreId');

        if (!user) throw new UnauthorizedException('Invalid credentials');

        const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
        if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

        const verificationResult = await this.trackmasterAdminService.verifyAccess({
            external_ids: user.external_ids,
            role: 'SALES_ASSOCIATE'
        });

        if (!verificationResult.hasAccess) {
            throw new UnauthorizedException('No access to sales associate app');
        }

        const token = this.jwtService.sign({
            sub: user.id,
            email: user.email,
            permissions: verificationResult.permissions,
            store: user.primaryStoreId,
            clientId: verificationResult.staff.clientId
        });

        return {
            token,
            user: {
                id: user.id,
                name: user.name,
                surname: user.surname,
                email: user.email,
                permissions: verificationResult.permissions,
                store: user.primaryStoreId
            }
        };
    }
}