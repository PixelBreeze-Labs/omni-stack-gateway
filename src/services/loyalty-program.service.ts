// src/services/loyalty-program.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Client } from '../schemas/client.schema';
import { Model } from 'mongoose';
import { UpdateLoyaltyProgramDto } from '../dtos/loyalty-program.dto';

@Injectable()
export class LoyaltyProgramService {
    constructor(@InjectModel(Client.name) private clientModel: Model<Client>) {}

    async updateLoyaltyProgram(
        clientId: string,
        updateDto: UpdateLoyaltyProgramDto,
    ): Promise<Client> {
        const client = await this.clientModel.findById(clientId).exec();
        if (!client) {
            throw new NotFoundException('Client not found');
        }
        // Merge the provided fields into the existing loyalty program
        client.loyaltyProgram = { ...client.loyaltyProgram, ...updateDto };
        return client.save();
    }

    async disableLoyaltyProgram(clientId: string): Promise<Client> {
        const client = await this.clientModel.findById(clientId).exec();
        if (!client) {
            throw new NotFoundException('Client not found');
        }
        // Remove or reset the loyalty program configuration.
        client.loyaltyProgram = {} as any;
        return client.save();
    }
}
