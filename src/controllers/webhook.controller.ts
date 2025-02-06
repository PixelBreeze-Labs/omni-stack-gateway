import {
    Controller,
    Post,
    Param,
    Headers,
    Body,
    UnauthorizedException,
    Logger,
    BadRequestException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client } from '../schemas/client.schema';
import { Order } from '../schemas/order.schema';
import { CustomerService } from '../services/customer.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
    private readonly logger = new Logger(WebhookController.name);

    constructor(
        @InjectModel(Client.name) private clientModel: Model<Client>,
        @InjectModel(Order.name) private orderModel: Model<Order>,
        private readonly customerService: CustomerService
    ) {}

    @Post('orders/:venueShortCode')
    @ApiOperation({ summary: 'Process new order from e-commerce' })
    @ApiResponse({ status: 200, description: 'Order processed successfully' })
    async handleNewOrder(
        @Param('venueShortCode') venueShortCode: string,
        @Headers('webhook-api-key') webhookApiKey: string,
        @Headers('x-api-key') apiKey: string,
        @Body() orderData: any
    ) {
        try {
            // Validate required fields
            this.validateOrderData(orderData);

            // Find client and validate webhook key
            const client = await this.clientModel.findOne({
                venueShortCode: venueShortCode,
                webhookApiKey: webhookApiKey,
                'venueBoostConnection.status': 'connected'
            });

            if (!client) {
                throw new UnauthorizedException('Invalid venue or webhook key');
            }

            // Try to find existing customer by email
            let customerId = null;
            const customerEmail = orderData.customer_email || orderData.billing_email;

            if (customerEmail) {
                try {
                    const existingCustomer = await this.customerService.findByEmail(
                        customerEmail,
                        client._id.toString()
                    );

                    if (existingCustomer) {
                        customerId = existingCustomer._id;
                        this.logger.log(`Found existing customer with ID: ${customerId}`);
                    }
                } catch (error) {
                    this.logger.warn(`Failed to lookup customer by email: ${error.message}`);
                }
            }

            // Transform order data
            const order = {
                clientId: client._id,
                orderNumber: orderData.order_number,
                customerId: customerId, // Attach customer ID if found
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
                    type: orderData.source_type || 'regular_checkout',
                    platform: orderData.source_platform || 'bybest.shop',
                    url: orderData.source_url,
                    externalOrderId: orderData.id.toString(),
                    externalCustomerId: orderData.customer_id?.toString(),
                    externalCustomerEmail: customerEmail
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

            this.logger.log(`Order processed successfully: ${savedOrder._id}, Customer ID: ${customerId || 'Not found'}`);

            return {
                success: true,
                orderId: savedOrder._id,
                message: 'Order processed successfully',
                customerMatched: !!customerId
            };

        } catch (error) {
            this.logger.error(`Failed to process order: ${error.message}`, error.stack);
            if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
                throw error;
            }
            throw new BadRequestException(`Failed to process order: ${error.message}`);
        }
    }

    private validateOrderData(orderData: any) {
        const requiredFields = [
            'order_number',
            'subtotal',
            'total_amount',
            'status',
            'payment_method_id',
            'order_products'
        ];

        const missingFields = requiredFields.filter(field => !orderData[field]);
        if (missingFields.length > 0) {
            throw new BadRequestException(`Missing required fields: ${missingFields.join(', ')}`);
        }

        if (!Array.isArray(orderData.order_products) || orderData.order_products.length === 0) {
            throw new BadRequestException('Order must contain at least one product');
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