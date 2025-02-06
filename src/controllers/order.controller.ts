// src/controllers/order.controller.ts
import { Controller, Get, Param, Put, Body, Query, UseGuards, Req, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { OrderService } from '../services/order.service';
import { ListOrderDto, UpdateOrderStatusDto, AddOrderNoteDto } from '../dtos/order.dto';
import { Client } from '../schemas/client.schema';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(ClientAuthGuard)
export class OrderController {
    constructor(private orderService: OrderService) {}

    @ApiOperation({ summary: 'Get all orders with filters and pagination' })
    @ApiQuery({ type: ListOrderDto })
    @ApiResponse({
        status: 200,
        description: 'Return filtered and paginated orders',
        schema: {
            properties: {
                items: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            orderNumber: { type: 'string' },
                            total: { type: 'number' },
                            status: { type: 'string' },
                            createdAt: { type: 'string' }
                        }
                    }
                },
                total: { type: 'number' },
                pages: { type: 'number' },
                page: { type: 'number' },
                limit: { type: 'number' }
            }
        }
    })
    @Get()
    async findAll(
        @Query() query: ListOrderDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.orderService.findAll({
            ...query,
            clientId: req.client.id
        });
    }

    @ApiOperation({ summary: 'Get order by id' })
    @ApiParam({ name: 'id', description: 'Order ID' })
    @ApiResponse({ status: 200, description: 'Return order details' })
    @Get(':id')
    async findOne(
        @Param('id') id: string,
        @Req() req: Request & { client: Client }
    ) {
        return this.orderService.findOne(id, req.client.id);
    }

    @ApiOperation({ summary: 'Update order status' })
    @ApiParam({ name: 'id', description: 'Order ID' })
    @ApiBody({ type: UpdateOrderStatusDto })
    @ApiResponse({ status: 200, description: 'Order status updated successfully' })
    @Put(':id/status')
    async updateStatus(
        @Param('id') id: string,
        @Body() updateStatusDto: UpdateOrderStatusDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.orderService.updateStatus(id, req.client.id, updateStatusDto);
    }

    @ApiOperation({ summary: 'Add note to order' })
    @ApiParam({ name: 'id', description: 'Order ID' })
    @ApiBody({ type: AddOrderNoteDto })
    @ApiResponse({ status: 200, description: 'Note added successfully' })
    @Post(':id/notes')
    async addNote(
        @Param('id') id: string,
        @Body() addNoteDto: AddOrderNoteDto,
        @Req() req: Request & { client: Client }
    ) {
        return this.orderService.addNote(id, req.client.id, addNoteDto.note);
    }

    @ApiOperation({ summary: 'Create new order - Not Supported' })
    @ApiResponse({ status: 405, description: 'Orders can only be created through integrations' })
    @Post()
    async create() {
        return {
            statusCode: 405,
            message: 'Orders can only be created through integrations. Direct creation is not supported.'
        };
    }
}