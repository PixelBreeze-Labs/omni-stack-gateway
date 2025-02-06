// controllers/webhook.controller.ts
import {
    Controller,
    Post,
    Param,
    Headers,
    Body,
    UnauthorizedException,
    Logger
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client } from '../schemas/client.schema';
import { Order } from '../schemas/order.schema';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
    private readonly logger = new Logger(WebhookController.name);

    constructor(
        @InjectModel(Client.name) private clientModel: Model<Client>,
        @InjectModel(Order.name) private orderModel: Model<Order>
    ) {}

    @Post('orders/:venueShortCode')
    @ApiOperation({ summary: 'Process new order from e-commerce' })
    @ApiResponse({ status: 200, description: 'Order processed successfully' })
    async handleNewOrder(
        @Param('venueShortCode') venueShortCode: string,
        @Headers('webhook-api-key') webhookApiKey: string,
        @Body() orderData: any
    ) {
        try {
            // Find client and validate webhook key
            const client = await this.clientModel.findOne({
                'venueBoostConnection.venueShortCode': venueShortCode,
                'venueBoostConnection.webhookApiKey': webhookApiKey,
                'venueBoostConnection.status': 'connected'
            });

            if (!client) {
                throw new UnauthorizedException('Invalid venue or webhook key');
            }

            // Transform order data
            const order = {
                clientId: client._id,
                orderNumber: orderData.order_number,
                customerId: orderData.customer_id,
                subtotal: orderData.subtotal,
                total: orderData.total_amount,
                discount: orderData.discount || 0,
                currency: orderData.currency || 'ALL',
                exchangeRate: orderData.exchange_rate_all || 1,

                status: this.mapOrderStatus(orderData.status),
                paymentMethod: this.mapPaymentMethod(orderData.payment_method_id),

                payment: {
                    status: orderData.payment_status,
                    transactionId: orderData.stripe_payment_id,
                    paymentProviderResponse: orderData.payment_metadata
                },

                source: {
                    type: orderData.source_type || 'regular_checkout', // or quick_checkout
                    platform: orderData.source_platform,
                    url: orderData.source_url,
                    externalOrderId: orderData.id.toString(),
                    externalCustomerId: orderData.customer_id.toString()
                },

                items: orderData.order_products.map(product => ({
                    externalProductId: product.product_id.toString(),
                    name: product.product_name,
                    quantity: product.product_quantity,
                    price: product.product_total_price / product.product_quantity,
                    total: product.product_total_price
                })),

                metadata: {
                    originalOrder: orderData,
                    shippingInfo: {
                        name: orderData.shipping_name,
                        surname: orderData.shipping_surname,
                        address: orderData.shipping_address,
                        city: orderData.shipping_city,
                        state: orderData.shipping_state,
                        postal: orderData.shipping_postal_code,
                        phone: orderData.shipping_phone_no,
                        email: orderData.shipping_email
                    },
                    billingInfo: {
                        name: orderData.billing_name,
                        surname: orderData.billing_surname,
                        address: orderData.billing_address,
                        city: orderData.billing_city,
                        state: orderData.billing_state,
                        postal: orderData.billing_postal_code,
                        phone: orderData.billing_phone_no,
                        email: orderData.billing_email
                    }
                }
            };

            // Save the order
            const savedOrder = await this.orderModel.create(order);

            this.logger.log(`Order processed successfully: ${savedOrder._id}`);

            return {
                success: true,
                orderId: savedOrder._id,
                message: 'Order processed successfully'
            };

        } catch (error) {
            this.logger.error(`Failed to process order: ${error.message}`, error.stack);
            throw error;
        }
    }

    private mapOrderStatus(ecommerceStatus: string): string {
        const statusMap = {
            'new': 'PENDING',
            'completed': 'PAID',
            'refunded': 'REFUNDED',
            'cancelled': 'CANCELLED',
            'partially_refunded': 'PARTIALLY_REFUNDED'
        };
        return statusMap[ecommerceStatus] || 'PENDING';
    }

    private mapPaymentMethod(methodId: number): string {
        const methodMap = {
            1: 'CARD',
            2: 'CASH',
            3: 'BANK_TRANSFER',
            4: 'STRIPE',
            5: 'BKT'
        };
        return methodMap[methodId] || 'UNKNOWN';
    }
}