// src/services/order-cron.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from '../schemas/order.schema';
import { OrderService } from './order.service';

@Injectable()
export class OrderCronService {
    private readonly logger = new Logger(OrderCronService.name);

    constructor(
        @InjectModel(Order.name) private orderModel: Model<Order>,
        private orderService: OrderService
    ) {}

    /**
     * Send thank you emails for orders that are completed and haven't received a thank you email yet
     * Runs every hour
     */
    @Cron(CronExpression.EVERY_HOUR)
    async sendThankYouEmails() {
        this.logger.log('Running scheduled job: Send thank you emails for completed orders');

        try {
            // Find completed orders that:
            // 1. Are in paid status
            // 2. Haven't received a thank you email yet
            // 3. Have confirmation email sent

            const orders = await this.orderModel.find({
                status: 'PAID',
                'metadata.emailStatus.confirmationSent': true,
                'metadata.emailStatus.thankYouSent': { $ne: true },
                'metadata.emailStatus.thankYouScheduled': { $ne: true }
            }).limit(10); // Process in smaller batches since we're running every hour

            this.logger.log(`Found ${orders.length} orders that need thank you emails`);

            // Send thank you emails for these orders immediately
            for (const order of orders) {
                try {
                    await this.orderService.sendThankYouEmail(order._id);
                    this.logger.log(`Sent thank you email for order ${order.orderNumber}`);
                } catch (error) {
                    this.logger.error(`Error sending thank you for order ${order.orderNumber}: ${error.message}`);
                }
            }

            this.logger.log('Finished sending thank you emails');
        } catch (error) {
            this.logger.error(`Error in thank you email cron job: ${error.message}`);
        }
    }



}