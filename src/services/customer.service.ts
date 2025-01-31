import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer } from '../schemas/customer.schema';
import { CreateCustomerDto, ListCustomerDto, UpdateCustomerDto } from '../dtos/customer.dto';

@Injectable()
export class CustomerService {
    constructor(@InjectModel(Customer.name) private customerModel: Model<Customer>) {}

    async create(customerData: CreateCustomerDto) {
        return this.customerModel.create({
            ...customerData,
            isActive: true
        });
    }

    async findAll(query: ListCustomerDto & { clientIds: string[] }) {
        const { clientIds, search, limit = 10, page = 1, status, type } = query;
        const skip = (page - 1) * limit;

        const filters: any = { clientIds: { $in: clientIds } };

        if (search) {
            filters.$or = [
                { firstName: new RegExp(search, 'i') },
                { lastName: new RegExp(search, 'i') },
                { email: new RegExp(search, 'i') },
                { phone: new RegExp(search, 'i') }
            ];
        }

        if (status && status !== 'ALL') {
            filters.isActive = status === 'ACTIVE';
        }

        if (type && type !== 'ALL') {
            filters.type = type;
        }

        const total = await this.customerModel.countDocuments(filters);
        const customers = await this.customerModel.find(filters).skip(skip).limit(limit);

        return { items: customers, total, pages: Math.ceil(total / limit), page, limit };
    }

    async findOne(id: string, clientId: string) {
        const customer = await this.customerModel.findOne({ _id: id, clientIds: clientId });
        if (!customer) {
            throw new NotFoundException('Customer not found');
        }
        return customer;
    }

    async update(id: string, clientId: string, updateCustomerDto: UpdateCustomerDto) {
        const customer = await this.customerModel.findOneAndUpdate(
            { _id: id, clientIds: clientId },
            { $set: updateCustomerDto },
            { new: true }
        );

        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        return customer;
    }

    async remove(id: string, clientId: string) {
        const customer = await this.customerModel.findOne({ _id: id, clientIds: clientId });
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
        const customer = await this.customerModel.findOne({ _id: id, clientIds: clientId });
        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        await this.customerModel.findByIdAndDelete(id);
        return { message: 'Customer deleted successfully' };
    }
}
