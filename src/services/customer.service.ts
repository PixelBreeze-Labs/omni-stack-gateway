import {forwardRef, Inject, Injectable, NotFoundException} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer } from '../schemas/customer.schema';
import { Client } from '../schemas/client.schema';
import { CreateCustomerDto, ListCustomerDto, UpdateCustomerDto } from '../dtos/customer.dto';
import { UserService } from "./user.service";
import * as crypto from 'crypto';
import {CustomerListResponse, CustomerMetrics, CustomerResponse} from "../types/customer.types";
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

    private async getConnectedClientIds(clientIds: string[]): Promise<string[]> {
        const connectedClientIds = new Set<string>(clientIds);

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

        return Array.from(connectedClientIds);
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
        const allClientIds = await this.getConnectedClientIds(clientIds);

        // Calculate metrics with all client IDs
        const metrics = await this.calculateMetrics(allClientIds);

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
                options: { allowEmptyPaths: true },
                populate: {
                    path: 'walletId',
                    select: 'balance',
                    options: { allowEmptyPaths: true }
                }
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const transformedCustomers: CustomerResponse[] = customers.map(customer => {
            const cleanCustomer = customer.toObject();
            const user = cleanCustomer.userId as any;

            return {
                _id: cleanCustomer._id.toString(),
                firstName: cleanCustomer.firstName,
                lastName: cleanCustomer.lastName,
                email: cleanCustomer.email,
                phone: cleanCustomer.phone || '',
                status: cleanCustomer.status,
                type: cleanCustomer.type,
                avatar: cleanCustomer.avatar,
                isActive: cleanCustomer.isActive,
                source: (user?.registrationSource?.toLowerCase() || 'manual') as RegistrationSource,
                userId: user?._id?.toString() || null,
                points: user?.points || 0,
                totalSpend: user?.totalSpend || 0,
                // Updated: use property access to fetch membership tier
                membershipTier: (user?.clientTiers && user.clientTiers[cleanCustomer.clientIds[0]]) || 'NONE',
                walletBalance: user?.walletId?.balance || 0,
                registrationDate: user?.createdAt || cleanCustomer.createdAt,
                lastActive: cleanCustomer.updatedAt,
                createdAt: cleanCustomer.createdAt,
                updatedAt: cleanCustomer.updatedAt,
                clientIds: cleanCustomer.clientIds,
                external_ids: cleanCustomer.external_ids || {},
                metadata: cleanCustomer.metadata || {},
                addressId: cleanCustomer.addressId?.toString()
            }
        });


        return {
            items: transformedCustomers,
            total,
            pages: Math.ceil(total / limit),
            page,
            limit,
            includedClientIds: allClientIds,
            metrics
        };
    }

    async calculateMetrics(clientIds: string[]): Promise<CustomerMetrics> {
        const allClientIds = await this.getConnectedClientIds(clientIds);

        const now = new Date();
        const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const currentMonthCustomers = await this.customerModel.find({
            clientIds: { $in: allClientIds },
            createdAt: { $lt: now, $gte: firstDayThisMonth }
        });

        const lastMonthCustomers = await this.customerModel.find({
            clientIds: { $in: allClientIds },
            createdAt: { $lt: firstDayThisMonth, $gte: firstDayLastMonth }
        });

        const totalCustomers = await this.customerModel.countDocuments({
            clientIds: { $in: allClientIds }
        });

        const activeCustomers = await this.customerModel.countDocuments({
            clientIds: { $in: allClientIds },
            isActive: true
        });

        const lastMonthActiveCustomers = await this.customerModel.countDocuments({
            clientIds: { $in: allClientIds },
            isActive: true,
            updatedAt: { $lt: firstDayThisMonth, $gte: firstDayLastMonth }
        });

        const customers = await this.customerModel.find({
            clientIds: { $in: allClientIds }
        }).populate('userId', 'totalSpend');

        const totalSpend = customers.reduce((sum, customer) => {
            return sum + ((customer.userId as any)?.totalSpend || 0);
        }, 0);

        const lastMonthTotalSpend = lastMonthCustomers.reduce((sum, customer) => {
            return sum + ((customer.userId as any)?.totalSpend || 0);
        }, 0);

        const avgOrderValue = totalSpend / (customers.length || 1);
        const lastMonthAvgOrderValue = lastMonthTotalSpend / (lastMonthCustomers.length || 1);

        const customerGrowth = currentMonthCustomers.length;
        const customerGrowthPercentage = CustomerService.calculateGrowthPercentage(
            currentMonthCustomers.length,
            lastMonthCustomers.length
        );

        const activeGrowthPercentage = CustomerService.calculateGrowthPercentage(
            activeCustomers,
            lastMonthActiveCustomers
        );

        const orderValueGrowthPercentage = CustomerService.calculateGrowthPercentage(
            avgOrderValue,
            lastMonthAvgOrderValue
        );

        return {
            totalCustomers,
            activeCustomers,
            averageOrderValue: Math.round(avgOrderValue * 100) / 100,
            customerGrowth,
            trends: {
                customers: {
                    value: currentMonthCustomers.length,
                    percentage: Number(customerGrowthPercentage)
                },
                active: {
                    value: activeCustomers,
                    percentage: Number(activeGrowthPercentage)
                },
                orderValue: {
                    value: Math.round(avgOrderValue * 100) / 100,
                    percentage: Number(orderValueGrowthPercentage)
                },
                growth: {
                    value: customerGrowth,
                    percentage: Number(customerGrowthPercentage)
                }
            }
        };
    }

    private static calculateGrowthPercentage(current: number, previous: number): number {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
    }

    async findOne(id: string, clientId: string) {
        const allClientIds = await this.getConnectedClientIds([clientId]);

        const customer = await this.customerModel.findOne({
            _id: id,
            clientIds: { $in: allClientIds }
        });

        if (!customer) {
            throw new NotFoundException('Customer not found');
        }
        return customer;
    }

    async findByEmail(email: string, clientId: string): Promise<Customer | null> {
        const allClientIds = await this.getConnectedClientIds([clientId]);

        return this.customerModel.findOne({
            email: email,
            clientIds: { $in: allClientIds },
            isActive: true
        });
    }

    async update(id: string, clientId: string, updateCustomerDto: UpdateCustomerDto) {
        const allClientIds = await this.getConnectedClientIds([clientId]);

        const customer = await this.customerModel.findOneAndUpdate(
            { _id: id, clientIds: { $in: allClientIds } },
            { $set: updateCustomerDto },
            { new: true }
        );

        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        return customer;
    }

    async remove(id: string, clientId: string) {
        const allClientIds = await this.getConnectedClientIds([clientId]);

        const customer = await this.customerModel.findOne({
            _id: id,
            clientIds: { $in: allClientIds }
        });

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
        const allClientIds = await this.getConnectedClientIds([clientId]);

        const customer = await this.customerModel.findOne({
            _id: id,
            clientIds: { $in: allClientIds }
        });

        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        await this.customerModel.findByIdAndDelete(id);
        return { message: 'Customer deleted successfully' };
    }

    async partialUpdate(id: string, clientId: string, updateCustomerDto: Partial<UpdateCustomerDto>): Promise<Customer> {
        const allClientIds = await this.getConnectedClientIds([clientId]);

        const customer = await this.customerModel.findOneAndUpdate(
            { _id: id, clientIds: { $in: allClientIds } },
            { $set: updateCustomerDto },
            { new: true }
        );

        if (!customer) {
            throw new NotFoundException(`Customer with ID ${id} not found for this client`);
        }

        return customer;
    }
}