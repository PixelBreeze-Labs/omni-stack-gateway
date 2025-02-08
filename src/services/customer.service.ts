// src/services/customer.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer } from '../schemas/customer.schema';
import { Client } from '../schemas/client.schema';
import { CreateCustomerDto, ListCustomerDto, UpdateCustomerDto } from '../dtos/customer.dto';
import { UserService } from "./user.service";
import * as crypto from 'crypto';

@Injectable()
export class CustomerService {
    constructor(
        @InjectModel(Customer.name) private customerModel: Model<Customer>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        private userService: UserService
    ) {}

    private generateRandomPassword(): string {
        return crypto.randomBytes(12).toString('hex');
    }

    async create(customerData: CreateCustomerDto & { clientId: string }) {
        // Extract address from customerData if it exists
        const { address, metadata = {}, ...restCustomerData } = customerData;

        // Merge address into metadata if address exists
        const updatedMetadata = address
            ? { ...metadata, address }
            : metadata;

        // Create the customer
        const customer = await this.customerModel.create({
            ...restCustomerData,
            clientIds: [customerData.clientId],
            metadata: updatedMetadata,
            isActive: true
        });

        // If registration method is manual, create a user
        if (customerData.registrationSource === 'manual') {
            try {
                // Generate random password
                const randomPassword = this.generateRandomPassword();

                // Create user with the customer's information
                const user = await this.userService.create({
                    name: customerData.firstName,
                    surname: customerData.lastName,
                    email: customerData.email,
                    password: randomPassword,
                    registrationSource: 'MANUAL',
                    external_ids: customerData.external_ids || {},
                    client_ids: [customerData.clientId],
                    points: 0,
                    metadata: {
                        customerId: customer._id.toString()
                    }
                });

                // Update customer with user ID
                await this.customerModel.findByIdAndUpdate(
                    customer._id,
                    {
                        userId: user._id,
                        $set: { 'metadata.userCreated': true }
                    },
                    { new: true }
                );

                return await this.customerModel.findById(customer._id);
            } catch (error) {
                // If user creation fails, still return the customer but log the error
                console.error('Failed to create user for customer:', error);
                return customer;
            }
        }

        return customer;
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

        // Populate user data to get registration source
        const customers = await this.customerModel.find(filters)
            .populate('userId', 'registrationSource')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Transform customers to include source
        const transformedCustomers = customers.map(customer => {
            const customerObj = customer.toObject();
            return {
                ...customerObj,
                source: customerObj.userId ? customerObj.userId.registrationSource : 'manual',
                // Remove userId details if you don't want to expose them
                userId: customerObj.userId ? customerObj.userId._id : null
            };
        });

        return {
            items: transformedCustomers,
            total,
            pages: Math.ceil(total / limit),
            page,
            limit,
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
