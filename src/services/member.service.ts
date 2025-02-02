import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Member } from '../schemas/member.schema';
import { CreateMemberDto, UpdateMemberDto, ListMemberDto } from '../dtos/member.dto';

@Injectable()
export class MemberService {
    constructor(@InjectModel(Member.name) private memberModel: Model<Member>) {}

    private generateMemberCode(): string {
        const randomNum = Math.floor(Math.random() * 10000000000);
        const code = randomNum.toString().padStart(13, '0');
        return code;
    }

    private async ensureUniqueCode(): Promise<string> {
        let code: string;
        let existingMember: any;
        do {
            code = this.generateMemberCode();
            existingMember = await this.memberModel.findOne({ code }).exec();
        } while (existingMember);
        return code;
    }

    async findAll(query: ListMemberDto): Promise<{
        items: Member[];
        total: number;
        pages: number;
        page: number;
        limit: number
    }> {
        const {
            page = 1,
            limit = 10,
            search,
            status,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = query;

        // Build filter conditions
        const filter: any = {};

        // Handle search
        if (search) {
            filter.$or = [
                { firstName: new RegExp(search, 'i') },
                { lastName: new RegExp(search, 'i') },
                { email: new RegExp(search, 'i') },
                { code: new RegExp(search, 'i') }
            ];
        }

        // Handle status filter
        if (status) {
            switch (status.toUpperCase()) {
                case 'ACTIVE':
                    filter.acceptedAt = { $exists: true };
                    filter.isRejected = { $ne: true };
                    break;
                case 'PENDING':
                    filter.acceptedAt = { $exists: false };
                    filter.isRejected = { $ne: true };
                    break;
                case 'REJECTED':
                    filter.isRejected = true;
                    break;
            }
        }

        // Calculate skip value for pagination
        const skip = (page - 1) * limit;

        // Build sort object
        const sort = {
            [sortBy]: sortOrder === 'asc' ? 1 : -1
        };

        // Execute queries
        const [items, total] = await Promise.all([
            this.memberModel
                .find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .exec(),
            this.memberModel.countDocuments(filter)
        ]);

        // Calculate total pages
        const pages = Math.ceil(total / limit);

        return {
            items,
            total,
            pages,
            page,
            limit
        };
    }

    async create(createMemberDto: CreateMemberDto): Promise<Member> {
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

    async findOne(id: string): Promise<Member> {
        const member = await this.memberModel.findById(id).exec();
        if (!member) {
            throw new NotFoundException('Member not found');
        }
        return member;
    }

    async update(id: string, updateMemberDto: UpdateMemberDto): Promise<Member> {
        const member = await this.memberModel.findByIdAndUpdate(
            id,
            {
                ...updateMemberDto,
                updatedAt: new Date()
            },
            { new: true }
        ).exec();

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