// services/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from './user.service';
import { TrackmasterAdminService } from './trackmaster-admin.service';
import * as bcrypt from 'bcrypt';
import { SalesAssociateLoginDto } from "../dtos/user.dto";

@Injectable()
export class AuthService {
    constructor(
        private userService: UserService,
        private jwtService: JwtService,
        private trackmasterAdminService: TrackmasterAdminService
    ) {}

    async salesAssociateLogin(loginDto: SalesAssociateLoginDto) {
        // Find user and populate store data
        const user = await this.userService.findByEmailForStore(loginDto.email)
            .populate({
                path: 'primaryStoreId',
                populate: {
                    path: 'address'
                }
            });

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const verificationResult = await this.trackmasterAdminService.verifyAccess({
            external_ids: user.external_ids,
            role: 'SALES_ASSOCIATE'
        });

        if (!verificationResult.hasAccess) {
            throw new UnauthorizedException('No access to sales associate app');
        }

        // Transform store data
        const store = user.primaryStoreId ? {
            id: user.primaryStoreId._id,
            name: user.primaryStoreId.name,
            code: user.primaryStoreId.code,
            address: user.primaryStoreId.address,
            clientId: user.primaryStoreId.clientId,
            externalIds: user.primaryStoreId.externalIds,
            metadata: user.primaryStoreId.metadata
        } : null;

        const token = this.jwtService.sign({
            sub: user.id,
            email: user.email,
            permissions: verificationResult.permissions,
            store: store,
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
                store: store,
                external_ids: user.external_ids,
                client_ids: user.client_ids,
                metadata: user.metadata,
                storeIds: user.storeIds
            }
        };
    }
}