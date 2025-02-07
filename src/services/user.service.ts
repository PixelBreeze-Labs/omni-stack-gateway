import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../schemas/user.schema';
import { CreateUserDto } from '../dtos/user.dto';
import * as bcrypt from 'bcrypt';
import { Store } from "../schemas/store.schema";

@Injectable()
export class UserService {
    constructor(
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(Store.name) private storeModel: Model<Store>
) {}

    async create(createUserDto: CreateUserDto & { client_ids: string[] }) {
        const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
        const user = new this.userModel({
            ...createUserDto,
            password: hashedPassword
        });
        return user.save();
    }

    async findByClientId(clientId: string) {
        return this.userModel.find({
            client_ids: clientId
        }).select('-password');
    }

    async findById(id: string) {
        return this.userModel.findById(id).select('-password').exec();
    }

    async findByEmail(email: string) {
        return this.userModel.findOne({ email }).exec();
    }

    async delete(id: string) {
        // First, remove user ID from any stores that reference it
        await this.storeModel.updateMany(
            { userIds: id },
            { $pull: { userIds: id } }
        );

        // Then delete the user
        return this.userModel.findByIdAndDelete(id).exec();
    }
}