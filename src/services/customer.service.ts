// src/services/customer.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer } from '../schemas/customer.schema';
import { CreateCustomerDto, ListCustomerDto, UpdateCustomerDto } from '../dtos/customer.dto';

@Injectable()
export class CustomerService {
    constructor(
        @InjectModel(Customer.name) private customerModel: Model<Customer>
    ) {}

    async create(customerData: CreateCustomerDto & { clientId: string }) {
        return this.customerModel.create({
            ...customerData,
            isActive: true
        });
    }

    async findAll(query: ListCustomerDto & { clientId: string }) {
        const { clientId, search, limit = 10, page = 1, status, type } = query;
        const skip = (page - 1) * limit;

        const filters: any = { clientId };

        if (search) {
            filters.$or = [
                { firstName: new RegExp(search, 'i') },
                { lastName: new RegExp(search, 'i') },
                { email: new RegExp(search, 'i') },
                { phone: new RegExp(search, 'i') }
            ];
        }

        if (status && status !== 'ALL') {
            if (status === 'ACTIVE') filters.isActive = true;
            if (status === 'INACTIVE') filters.isActive = false;
        }

        if (type && type !== 'ALL') {
            filters.type = type;
        }

        const total = await this.customerModel.countDocuments(filters);
        const totalPages = Math.ceil(total / limit);

        const customers = await this.customerModel
            .find(filters)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        return {
            items: customers,
            total,
            pages: totalPages,
            page,
            limit
        };
    }

    async findOne(id: string, clientId: string) {
        const customer = await this.customerModel.findOne({ _id: id, clientId });
        if (!customer) {
            throw new NotFoundException('Customer not found');
        }
        return customer;
    }

    async update(id: string, clientId: string, updateCustomerDto: UpdateCustomerDto) {
        const customer = await this.customerModel.findOneAndUpdate(
            { _id: id, clientId },
            { $set: updateCustomerDto },
            { new: true }
        );

        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        return customer;
    }

    async remove(id: string, clientId: string) {
        const customer = await this.customerModel.findOne({ _id: id, clientId });
        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        await this.customerModel.findByIdAndUpdate(
            id,
            { $set: { isActive: false } },
            { new: true }
        );

        return { message: 'Customer deactivated successfully' };
    }

    async hardDelete(id: string, clientId: string) {
        const customer = await this.customerModel.findOne({ _id: id, clientId });
        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        await this.customerModel.findByIdAndDelete(id);
        return { message: 'Customer deleted successfully' };
    }
}
