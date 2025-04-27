// src/services/order-cron.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from '../schemas/order.schema';
import { OrderService } from './order.service';
import { CronJobHistory } from '../schemas/cron-job-history.schema';

@Injectable()
export class OrderCronService {
    private readonly logger = new Logger(OrderCronService.name);

    constructor(
        @InjectModel(Order.name) private orderModel: Model<Order>,
        @InjectModel(CronJobHistory.name) private cronJobHistoryModel: Model<CronJobHistory>,
        private orderService: OrderService
    ) {}

    /**
     * Send thank you emails for orders that are completed and haven't received a thank you email yet
     * Runs every 10 minutes
     */
    @Cron('*/10 * * * *')
    async sendThankYouEmails() {
        const startTime = new Date();
        this.logger.log(`[CRON START] Send thank you emails job started at ${startTime.toISOString()}`);
        
        // Create a record for this job execution
        const jobRecord = await this.cronJobHistoryModel.create({
            jobName: 'sendThankYouEmails',
            startTime,
            status: 'started'
        });
        
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
            }).limit(10); // Process in smaller batches

            this.logger.log(`Found ${orders.length} orders that need thank you emails`);

            // Send thank you emails for these orders immediately
            for (const order of orders) {
                try {
                    // Convert _id to string to fix the type error
                    await this.orderService.sendThankYouEmail(order._id.toString());
                    
                    // Mark the email as sent in the order record
                    await this.orderModel.findByIdAndUpdate(order._id, {
                        $set: {
                            'metadata.emailStatus.thankYouSent': true,
                            'metadata.emailStatus.thankYouSentAt': new Date(),
                            'metadata.emailStatus.thankYouSentByCronJob': true
                        }
                    });
                    
                    this.logger.log(`Sent thank you email for order ${order.orderNumber}`);
                } catch (error) {
                    this.logger.error(`Error sending thank you for order ${order.orderNumber}: ${error.message}`);
                }
            }

            // Update the job record on completion
            const endTime = new Date();
            const duration = (endTime.getTime() - startTime.getTime()) / 1000;
            
            await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
                endTime,
                duration,
                status: 'completed',
                details: { 
                    processedCount: orders.length,
                    ordersProcessed: orders.map(o => ({ id: o._id.toString(), orderNumber: o.orderNumber }))
                }
            });
            
            this.logger.log(`[CRON COMPLETE] Send thank you emails job completed at ${endTime.toISOString()}, duration: ${duration}s, processed: ${orders.length} orders`);
        } catch (error) {
            // Update the job record on failure
            const endTime = new Date();
            const duration = (endTime.getTime() - startTime.getTime()) / 1000;
            
            await this.cronJobHistoryModel.findByIdAndUpdate(jobRecord._id, {
                endTime,
                duration,
                status: 'failed',
                error: error.message
            });
            
            this.logger.error(`[CRON FAILED] Error in thank you email cron job: ${error.message}`);
        }
    }
}