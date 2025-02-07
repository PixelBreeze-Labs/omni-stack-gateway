// services/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from './user.service';
// import { TrackmasterAdminService } from './trackmaster-admin.service';
// import * as bcrypt from 'bcrypt';
import { SalesAssociateLoginDto } from "../dtos/user.dto";
// import { User } from "../schemas/user.schema";
import { Store } from "../schemas/store.schema";
import { Model} from 'mongoose';
import {InjectModel} from "@nestjs/mongoose";

@Injectable()
export class AuthService {
    constructor(
        private userService: UserService,
        private jwtService: JwtService,
        @InjectModel(Store.name) private storeModel: Model<Store>
    ) {}

    async salesAssociateLogin(loginDto: SalesAssociateLoginDto) {
        // Find user first
        const user = await this.userService.findByEmailForStore(loginDto.email);

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // If user has storeIds, get the first store
        let store = null;
        if (user.storeIds && user.storeIds.length > 0) {
            const firstStore = await this.storeModel.findById(user.storeIds[0])
                .populate('address')
                .exec();

            if (firstStore) {
                store = {
                    id: firstStore._id,
                    name: firstStore.name,
                    code: firstStore.code,
                    address: firstStore.address,
                    clientId: firstStore.clientId,
                    externalIds: firstStore.externalIds,
                    metadata: firstStore.metadata
                };
            }
        }

        // Rest of your code...
        const token = this.jwtService.sign({
            sub: user.id,
            email: user.email,
            // permissions: verificationResult.permissions,
            store: store,
            clientId: store.clientId
        });

        return {
            token,
            user: {
                id: user.id,
                name: user.name,
                surname: user.surname,
                email: user.email,
                // permissions: verificationResult.permissions,
                store: store,
                external_ids: user.external_ids,
                client_ids: user.client_ids,
                metadata: user.metadata,
                storeIds: user.storeIds
            }
        };
    }
}