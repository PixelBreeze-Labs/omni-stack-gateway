// src/services/member.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Member } from '../schemas/member.schema';
import { CreateMemberDto, UpdateMemberDto } from '../dtos/member.dto';

@Injectable()
export class MemberService {
    constructor(@InjectModel(Member.name) private memberModel: Model<Member>) {}

    private generateMemberCode(): string {
        // Generate a random number between 0 and 9999999999 (10 digits)
        const randomNum = Math.floor(Math.random() * 10000000000);

        // Convert to string and pad with zeros to 13 digits
        const code = randomNum.toString().padStart(13, '0');

        return code;
    }

    private async ensureUniqueCode(): Promise<string> {
        let code: string;
        let existingMember: any;

        // Keep generating codes until we find a unique one
        do {
            code = this.generateMemberCode();
            existingMember = await this.memberModel.findOne({ code }).exec();
        } while (existingMember);

        return code;
    }

    async create(createMemberDto: CreateMemberDto): Promise<Member> {
        // Generate unique code if not provided
        if (!createMemberDto.code) {
            createMemberDto.code = await this.ensureUniqueCode();
        }

        const member = new this.memberModel({
            ...createMemberDto,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        return member.save();
    }


    async findAll(): Promise<Member[]> {
        return this.memberModel.find().exec();
    }

    async findOne(id: string): Promise<Member> {
        const member = await this.memberModel.findById(id).exec();
        if (!member) {
            throw new NotFoundException('Member not found');
        }
        return member;
    }

    async update(id: string, updateMemberDto: UpdateMemberDto): Promise<Member> {
        const member = await this.memberModel.findByIdAndUpdate(id, updateMemberDto, { new: true }).exec();
        if (!member) {
            throw new NotFoundException('Member not found');
        }
        return member;
    }

    async remove(id: string): Promise<void> {
        const res = await this.memberModel.deleteOne({ _id: id }).exec();
        if (res.deletedCount === 0) {
            throw new NotFoundException('Member not found');
        }
    }
}
