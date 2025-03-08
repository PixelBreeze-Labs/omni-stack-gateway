import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    UseGuards,
    Req,
    Query,
    DefaultValuePipe,
    ParseIntPipe,
    BadRequestException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { BookingService } from '../services/booking.service';
import { ClientAuthGuard } from '../guards/client-auth.guard';
import { Client } from '../schemas/client.schema';
import { BookingStatus } from '../schemas/booking.schema';

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller('bookings')
@UseGuards(ClientAuthGuard)
export class BookingController {
    constructor(
        private readonly bookingService: BookingService
    ) {}

    /**
     * Get all bookings with filtering and pagination
     */
    @Get()
    @ApiOperation({ summary: 'Get all bookings with filtering and pagination' })
    @ApiResponse({
        status: 200,
        description: 'Returns a list of bookings'
    })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'search', required: false, type: String })
    @ApiQuery({ name: 'status', required: false, enum: BookingStatus })
    @ApiQuery({ name: 'propertyId', required: false, type: String })
    @ApiQuery({ name: 'fromDate', required: false, type: String, description: 'Format: YYYY-MM-DD' })
    @ApiQuery({ name: 'toDate', required: false, type: String, description: 'Format: YYYY-MM-DD' })
    async getBookings(
        @Req() req: Request & { client: Client },
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
        @Query('status') status?: BookingStatus,
        @Query('propertyId') propertyId?: string,
        @Query('fromDate') fromDateStr?: string,
        @Query('toDate') toDateStr?: string
    ) {
        // Parse date strings manually
        let fromDate: Date | undefined;
        let toDate: Date | undefined;

        if (fromDateStr) {
            fromDate = this.parseDate(fromDateStr);
        }

        if (toDateStr) {
            toDate = this.parseDate(toDateStr);
        }

        return this.bookingService.findAll(req.client.id, {
            page,
            limit,
            search,
            status,
            propertyId,
            fromDate,
            toDate
        });
    }

    /**
     * Get a booking by ID
     */
    @Get(':id')
    @ApiOperation({ summary: 'Get a booking by ID' })
    @ApiResponse({
        status: 200,
        description: 'Returns a booking by ID'
    })
    async getBookingById(
        @Req() req: Request & { client: Client },
        @Param('id') id: string
    ) {
        return this.bookingService.findById(req.client.id, id);
    }

    /**
     * Sync bookings from VenueBoost
     */
    @Post('sync')
    @ApiOperation({ summary: 'Sync bookings from VenueBoost' })
    @ApiResponse({
        status: 200,
        description: 'Bookings synced successfully'
    })
    async syncBookings(@Req() req: Request & { client: Client }) {
        return this.bookingService.syncBookingsFromVenueBoost(req.client.id);
    }

    /**
     * Helper method to parse date strings
     */
    private parseDate(dateStr: string): Date {
        try {
            // Try to create a date from the string (expecting YYYY-MM-DD format)
            const date = new Date(dateStr);

            // Check if the date is valid
            if (isNaN(date.getTime())) {
                throw new BadRequestException(`Invalid date format: ${dateStr}. Expected format: YYYY-MM-DD`);
            }

            return date;
        } catch (error) {
            throw new BadRequestException(`Invalid date format: ${dateStr}. Expected format: YYYY-MM-DD`);
        }
    }
}