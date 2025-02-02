import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, SortOrder } from 'mongoose';
import { Member, MemberDocument } from '../schemas/member.schema';
import { CreateMemberDto, UpdateMemberDto, ListMemberDto } from '../dtos/member.dto';

interface PaginatedResponse<T> {
    items: T[];
    total: number;
    pages: number;
    page: number;
    limit: number;
}

@Injectable()
export class MemberService {
    constructor(@InjectModel(Member.name) private memberModel: Model<MemberDocument>) {}

    private generateMemberCode(): string {
        const randomNum = Math.floor(Math.random() * 10000000000);
        return randomNum.toString().padStart(13, '0');
    }

    private async ensureUniqueCode(): Promise<string> {
        let code: string;
        let existingMember: MemberDocument | null;

        do {
            code = this.generateMemberCode();
            existingMember = await this.memberModel.findOne({ code }).exec();
        } while (existingMember);

        return code;
    }

    async findAll(query: ListMemberDto): Promise<PaginatedResponse<Member>> {
        const {
            page = 1,
            limit = 10,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            search
        } = query;

        const skip = (page - 1) * limit;

        // Build filter
        const filter: any = {};
        if (search) {
            filter.$or = [
                { firstName: new RegExp(search, 'i') },
                { lastName: new RegExp(search, 'i') },
                { email: new RegExp(search, 'i') },
                { code: new RegExp(search, 'i') }
            ];
        }

        // Build sort object for mongoose
        const sortOptions: { [key: string]: SortOrder } = {
            [sortBy]: sortOrder as SortOrder
        };

        const [items, total] = await Promise.all([
            this.memberModel
                .find(filter)
                .sort(sortOptions)
                .skip(skip)
                .limit(limit)
                .lean()
                .exec(),
            this.memberModel.countDocuments(filter)
        ]);

        return {
            items,
            total,
            pages: Math.ceil(total / limit),
            page,
            limit
        };
    }

    async create(createMemberDto: CreateMemberDto): Promise<Member> {
        const code = await this.ensureUniqueCode();

        const member = new this.memberModel({
            ...createMemberDto,
            code,
            acceptedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        return (await member.save()).toObject();
    }

    async findOne(id: string): Promise<Member> {
        const member = await this.memberModel.findById(id).lean().exec();
        if (!member) {
            throw new NotFoundException('Member not found');
        }
        return member;
    }

    async findByCode(code: string): Promise<Member> {
        const member = await this.memberModel.findOne({ code }).lean().exec();
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
        )
            .lean()
            .exec();

        if (!member) {
            throw new NotFoundException('Member not found');
        }

        return member;
    }

    async remove(id: string): Promise<void> {
        const result = await this.memberModel.deleteOne({ _id: id }).exec();
        if (result.deletedCount === 0) {
            throw new NotFoundException('Member not found');
        }
    }
}