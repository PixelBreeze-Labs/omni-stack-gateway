// src/services/order.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from '../schemas/order.schema';
import { ListOrderDto, UpdateOrderStatusDto, CreateOrderDto } from '../dtos/order.dto';
import { EmailService } from './email.service';
import { SchedulerRegistry } from '@nestjs/schedule';

@Injectable()
export class OrderService {
    private readonly logger = new Logger(OrderService.name);

    constructor(
        @InjectModel(Order.name) private orderModel: Model<Order>,
        private emailService: EmailService,
        private schedulerRegistry: SchedulerRegistry
    ) {}

    async findAll(query: ListOrderDto & { clientId: string }) {
        // Previous implementation remains the same
        const {
            clientId,
            search,
            limit = 10,
            page = 1,
            status,
            dateFrom,
            dateTo
        } = query;
        const skip = (page - 1) * limit;

        // Build filters
        const filters: any = { clientId };

        // Add status filter
        if (status) {
            filters.status = status;
        }

        // Add date range filters
        if (dateFrom || dateTo) {
            filters.createdAt = {};
            if (dateFrom) {
                filters.createdAt.$gte = new Date(dateFrom);
            }
            if (dateTo) {
                filters.createdAt.$lte = new Date(dateTo);
            }
        }

        // Add search filter
        if (search) {
            filters.$or = [
                { orderNumber: new RegExp(search, 'i') },
                { 'source.platform': new RegExp(search, 'i') },
                { 'customer.name': new RegExp(search, 'i') }
            ];
        }

        // Get total count for pagination
        const total = await this.orderModel.countDocuments(filters);
        const totalPages = Math.ceil(total / limit);

        // Get paginated orders
        const orders = await this.orderModel
            .find(filters)
            .populate('customerId', 'name email')  // Populate customer details
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        return {
            items: orders.map(order => ({
                ...order.toObject(),
                id: order._id
            })),
            total,
            pages: totalPages,
            page,
            limit
        };
    }

    async findOne(id: string, clientId: string) {
        // Previous implementation remains the same
        const order = await this.orderModel
            .findOne({ _id: id, clientId })
            .populate('customerId', 'name email')
            .populate('items.productId', 'name code');

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        return {
            ...order.toObject(),
            id: order._id
        };
    }

    async updateStatus(id: string, clientId: string, updateStatusDto: UpdateOrderStatusDto) {
        // Previous implementation remains the same
        const order = await this.orderModel.findOne({ _id: id, clientId });
        if (!order) {
            throw new NotFoundException('Order not found');
        }

        const updatedOrder = await this.orderModel.findByIdAndUpdate(
            id,
            {
                $set: {
                    status: updateStatusDto.status
                },
                $push: {
                    'metadata.statusHistory': {
                        status: updateStatusDto.status,
                        date: new Date(),
                        note: updateStatusDto.note
                    }
                }
            },
            { new: true }
        );

        return {
            ...updatedOrder.toObject(),
            id: updatedOrder._id
        };
    }

    async addNote(id: string, clientId: string, note: string) {
        // Previous implementation remains the same
        const order = await this.orderModel.findOne({ _id: id, clientId });
        if (!order) {
            throw new NotFoundException('Order not found');
        }

        const updatedOrder = await this.orderModel.findByIdAndUpdate(
            id,
            {
                $push: {
                    'metadata.notes': {
                        text: note,
                        date: new Date()
                    }
                }
            },
            { new: true }
        );

        return {
            ...updatedOrder.toObject(),
            id: updatedOrder._id
        };
    }

    async sendThankYouEmail(orderId: string) {
        try {
            // Get the latest order data
            const order = await this.orderModel
                .findById(orderId)
                .populate('customerId', 'name email');

            if (!order) {
                throw new Error('Order not found');
            }

            // Extract customer information from order
            const customerEmail = order.source?.externalCustomerEmail ||
                (order.customerId && order.customerId.email);

            if (!customerEmail) {
                throw new Error('No customer email available for this order');
            }

            const customerName = (order.customerId && order.customerId.name) ||
                'Valued Customer';

            // Send the thank you email using the existing template
            await this.emailService.sendTemplateEmail(
                'MetroShop',
                'metroshop@omnistackhub.xyz',
                customerEmail,
                'Faleminderit për blerjen në MetroShop!',
                'templates/metroshop/post-purchase-thank-you-template.html',
                {
                    customerName: customerName,
                    year: new Date().getFullYear()
                }
            );

            // Update order metadata to track email sent
            await this.orderModel.findByIdAndUpdate(
                orderId,
                {
                    $set: {
                        'metadata.emailStatus.thankYouSent': true,
                        'metadata.emailStatus.thankYouSentDate': new Date()
                    }
                }
            );

            return { success: true };
        } catch (error) {
            this.logger.error(`Failed to send thank you email: ${error.message}`);
            return { success: false, message: error.message };
        }
    }
}