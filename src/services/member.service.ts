// src/services/member.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Member } from '../schemas/member.schema';
import { CreateMemberDto, UpdateMemberDto } from '../dtos/member.dto';

@Injectable()
export class MemberService {
    constructor(@InjectModel(Member.name) private memberModel: Model<Member>) {}

    async create(createMemberDto: CreateMemberDto): Promise<Member> {
        const member = new this.memberModel(createMemberDto);
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
