// src/services/customer.service.ts
import {forwardRef, Inject, Injectable, NotFoundException} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer } from '../schemas/customer.schema';
import { Client } from '../schemas/client.schema';
import { CreateCustomerDto, ListCustomerDto, UpdateCustomerDto } from '../dtos/customer.dto';
import { UserService } from "./user.service";
import * as crypto from 'crypto';
import {CustomerListResponse, CustomerResponse} from "../types/customer.types";
import {RegistrationSource} from "../schemas/user.schema";

@Injectable()
export class CustomerService {
    constructor(
        @InjectModel(Customer.name) private customerModel: Model<Customer>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        @Inject(forwardRef(() => UserService))
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
                const randomPassword = this.generateRandomPassword();

                const user = await this.userService.create({
                    name: customerData.firstName,
                    surname: customerData.lastName,
                    email: customerData.email,
                    password: randomPassword,
                    registrationSource: RegistrationSource.MANUAL,
                    external_ids: customerData.external_ids || {},
                    client_ids: [customerData.clientId],
                    points: 0,
                    metadata: {
                        customerId: customer._id.toString()
                    }
                });

                await this.customerModel.findByIdAndUpdate(
                    customer._id,
                    {
                        userId: user._id,
                        $set: { 'metadata.userCreated': true }
                    },
                    { new: true }
                );

                return await this.customerModel.findById(customer._id)
                    .populate('userId');
            } catch (error) {
                console.error('Failed to create user for customer:', error);
                return customer;
            }
        }

        return customer;
    }

    async findAll(query: ListCustomerDto & { clientIds: string[] }): Promise<CustomerListResponse> {
        const { clientIds, search, limit = 10, page = 1, status, type } = query;
        const skip = (page - 1) * limit;

        // Get all connected client IDs
        const connectedClientIds = new Set<string>();
        for (const clientId of clientIds) {
            const client = await this.clientModel.findById(clientId);
            if (client?.venueBoostConnection?.venueShortCode) {
                const connectedClients = await this.clientModel.find({
                    'venueBoostConnection.venueShortCode': client.venueBoostConnection.venueShortCode,
                    'venueBoostConnection.status': 'connected'
                });
                connectedClients.forEach(cc => connectedClientIds.add(cc._id.toString()));
            }
        }

        const allClientIds = [...new Set([...clientIds, ...connectedClientIds])];
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
            .populate({
                path: 'userId',
                select: 'registrationSource points totalSpend clientTiers createdAt walletId',
                populate: {
                    path: 'walletId',
                    select: 'balance'
                }
            })
            .sort({ createdAt: -1 })
            .lean()
            .skip(skip)
            .limit(limit);

        const transformedCustomers: CustomerResponse[] = customers.map(customer => {
            const user = customer.userId as any;

            return {
                ...customer,
                _id: customer._id.toString(),
                source: user?.registrationSource?.toLowerCase() || 'manual',
                userId: user?._id?.toString() || null,
                points: user?.points || 0,
                totalSpend: user?.totalSpend || 0,
                membershipTier: user?.clientTiers?.get(customer.clientIds[0]) || 'NONE',
                walletBalance: user?.walletId?.balance || 0,
                registrationDate: user?.createdAt || customer.createdAt,
                lastActive: customer.updatedAt,
                createdAt: customer.createdAt,
                updatedAt: customer.updatedAt
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
