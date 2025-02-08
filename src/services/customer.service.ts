// src/services/customer.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer } from '../schemas/customer.schema';
import { CreateCustomerDto, ListCustomerDto, UpdateCustomerDto } from '../dtos/customer.dto';

@Injectable()
export class CustomerService {
    constructor(@InjectModel(Customer.name) private customerModel: Model<Customer>) {}

    async create(customerData: CreateCustomerDto & { clientId: string }) {
        // Extract address from customerData if it exists
        const { address, metadata = {}, ...restCustomerData } = customerData;

        // Merge address into metadata if address exists
        const updatedMetadata = address
            ? { ...metadata, address }
            : metadata;

        return this.customerModel.create({
            ...restCustomerData,
            clientIds: [customerData.clientId],
            metadata: updatedMetadata,
            isActive: true
        });
    }


    async findAll(query: ListCustomerDto & { clientIds: string[] }) {
        const { clientIds, search, limit = 10, page = 1, status, type } = query;
        const skip = (page - 1) * limit;

        // Get all connected client IDs
        const connectedClientIds = new Set<string>();
        for (const clientId of clientIds) {
            // Get the client's venueShortCode
            const client = await this.clientModel.findById(clientId);
            if (client?.venueBoostConnection?.venueShortCode) {
                // Find all clients connected to the same venue
                const connectedClients = await this.clientModel.find({
                    'venueBoostConnection.venueShortCode': client.venueBoostConnection.venueShortCode,
                    'venueBoostConnection.status': 'connected'
                });

                // Add their IDs to our set
                connectedClients.forEach(cc => connectedClientIds.add(cc._id.toString()));
            }
        }

        // Combine original clientIds with connected client IDs
        const allClientIds = [...new Set([...clientIds, ...connectedClientIds])];

        // Build filters
        const filters: any = { clientIds: { $in: allClientIds } };

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
        const customers = await this.customerModel.find(filters)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        return {
            items: customers,
            total,
            pages: Math.ceil(total / limit),
            page,
            limit,
            // Include information about which clients' customers are included
            includedClientIds: allClientIds
        };
    }


    async findOne(id: string, clientId: string) {
        // Use $in operator for clientIds matching
        const customer = await this.customerModel.findOne({ _id: id, clientIds: { $in: [clientId] } });
        if (!customer) {
            throw new NotFoundException('Customer not found');
        }
        return customer;
    }

    async findByEmail(email: string, clientId: string): Promise<Customer | null> {
        return this.customerModel.findOne({
            email: email,
            clientIds: { $in: [clientId] },
            isActive: true
        });
    }

    async update(id: string, clientId: string, updateCustomerDto: UpdateCustomerDto) {
        const customer = await this.customerModel.findOneAndUpdate(
            { _id: id, clientIds: { $in: [clientId] } },
            { $set: updateCustomerDto },
            { new: true }
        );

        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        return customer;
    }

    async remove(id: string, clientId: string) {
        const customer = await this.customerModel.findOne({ _id: id, clientIds: { $in: [clientId] } });
        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        await this.customerModel.findByIdAndUpdate(
            id,
            { $set: { isActive: false, status: 'INACTIVE' } },
            { new: true }
        );

        return { message: 'Customer deactivated successfully' };
    }

    async hardDelete(id: string, clientId: string) {
        const customer = await this.customerModel.findOne({ _id: id, clientIds: { $in: [clientId] } });
        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        await this.customerModel.findByIdAndDelete(id);
        return { message: 'Customer deleted successfully' };
    }

    async partialUpdate(id: string, clientId: string, updateCustomerDto: Partial<UpdateCustomerDto>): Promise<Customer> {
        const customer = await this.customerModel.findOneAndUpdate(
            { _id: id, clientIds: clientId },
            { $set: updateCustomerDto },
            { new: true }
        );

        if (!customer) {
            throw new NotFoundException(`Customer with ID ${id} not found for this client`);
        }

        return customer;
    }
}
