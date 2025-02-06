// src/services/order.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from '../schemas/order.schema';
import { ListOrderDto, UpdateOrderStatusDto } from '../dtos/order.dto';

@Injectable()
export class OrderService {
    constructor(
        @InjectModel(Order.name) private orderModel: Model<Order>
    ) {}

    async findAll(query: ListOrderDto & { clientId: string }) {
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
}