// src/services/benefit.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Benefit } from '../schemas/benefit.schema';
import { CreateBenefitDto, UpdateBenefitDto } from '../dtos/benefit.dto';

@Injectable()
export class BenefitService {
    constructor(
        @InjectModel(Benefit.name) private benefitModel: Model<Benefit>
    ) {}

    async findAll(clientId: string): Promise<Benefit[]> {
        return this.benefitModel.find({ clientId }).sort({ createdAt: -1 });
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
}