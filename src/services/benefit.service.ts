// src/services/benefit.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Benefit } from '../schemas/benefit.schema';
import { CreateBenefitDto, UpdateBenefitDto } from '../dtos/benefit.dto';
import {Client} from '../schemas/client.schema';

@Injectable()
export class BenefitService {
    constructor(
        @InjectModel(Benefit.name) private benefitModel: Model<Benefit>,
        @InjectModel(Client.name) private clientModel: Model<Client>
    ) {}

    async findAll(clientId: string, tier?: string): Promise<Benefit[]> {
        const query: any = { clientId };
        if (tier) {
            query.applicableTiers = tier;
        }
        return this.benefitModel.find(query).sort({ createdAt: -1 });
    }

    async create(createBenefitDto: CreateBenefitDto, clientId: string): Promise<Benefit> {
        const benefit = new this.benefitModel({
            ...createBenefitDto,
            clientId
        });
        return benefit.save();
    }

    async update(id: string, updateBenefitDto: UpdateBenefitDto, clientId: string): Promise<Benefit> {
        const benefit = await this.benefitModel.findOneAndUpdate(
            { _id: id, clientId },
            { $set: updateBenefitDto },
            { new: true }
        );

        if (!benefit) {
            throw new NotFoundException('Benefit not found');
        }

        return benefit;
    }

    async toggleActive(id: string, isActive: boolean, clientId: string): Promise<Benefit> {
        const benefit = await this.benefitModel.findOneAndUpdate(
            { _id: id, clientId },
            { $set: { isActive } },
            { new: true }
        );

        if (!benefit) {
            throw new NotFoundException('Benefit not found');
        }

        return benefit;
    }

    async assignToTier(id: string, tierId: string, clientId: string): Promise<Benefit> {
        const benefit = await this.benefitModel.findOneAndUpdate(
            { _id: id, clientId },
            { $addToSet: { applicableTiers: tierId } },
            { new: true }
        );

        if (!benefit) {
            throw new NotFoundException('Benefit not found');
        }

        return benefit;
    }

    async removeFromTier(id: string, tierId: string, clientId: string): Promise<Benefit> {
        const benefit = await this.benefitModel.findOneAndUpdate(
            { _id: id, clientId },
            { $pull: { applicableTiers: tierId } },
            { new: true }
        );

        if (!benefit) {
            throw new NotFoundException('Benefit not found');
        }

        return benefit;
    }
}