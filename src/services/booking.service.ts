import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Booking, BookingStatus, PaymentMethod } from '../schemas/booking.schema';
import { Property } from '../schemas/property.schema';
import { Guest } from '../schemas/guest.schema';
import { VenueBoostService } from './venueboost.service';
import { Client } from '../schemas/client.schema';

interface FindAllOptions {
    page: number;
    limit: number;
    search?: string;
    status?: BookingStatus;
    propertyId?: string;
    fromDate?: Date;
    toDate?: Date;
}

@Injectable()
export class BookingService {
    private readonly logger = new Logger(BookingService.name);

    constructor(
        @InjectModel(Booking.name) private bookingModel: Model<Booking>,
        @InjectModel(Property.name) private propertyModel: Model<Property>,
        @InjectModel(Guest.name) private guestModel: Model<Guest>,
        @InjectModel(Client.name) private clientModel: Model<Client>,
        private readonly venueBoostService: VenueBoostService
    ) {}

    /**
     * Find all bookings with filtering and pagination
     *
     * @param clientId The MongoDB ID of the client
     * @param options Filter and pagination options
     * @returns Paginated bookings list
     */
    async findAll(clientId: string, options: FindAllOptions) {
        try {
            const { page, limit, search, status, propertyId, fromDate, toDate } = options;
            const skip = (page - 1) * limit;

            // Build the filter
            const filter: any = { clientId };

            // Add status filter if provided
            if (status) {
                filter.status = status;
            }

            // Add property filter if provided
            if (propertyId) {
                filter.propertyId = propertyId;
            }

            // Add date range filter if provided
            if (fromDate || toDate) {
                filter.$and = [];
                if (fromDate) {
                    filter.$and.push({ checkInDate: { $gte: fromDate } });
                }
                if (toDate) {
                    filter.$and.push({ checkOutDate: { $lte: toDate } });
                }
            }

            // Add search filter if provided
            if (search) {
                filter.$or = [
                    { confirmationCode: { $regex: search, $options: 'i' } },
                ];
            }

            // Execute the query with pagination
            const [bookings, total] = await Promise.all([
                this.bookingModel
                    .find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                this.bookingModel.countDocuments(filter)
            ]);

            // Calculate pagination metadata
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPrevPage = page > 1;

            return {
                data: bookings,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                    hasNextPage,
                    hasPrevPage
                }
            };
        } catch (error) {
            this.logger.error(`Error finding bookings: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Find a booking by ID
     *
     * @param clientId The MongoDB ID of the client
     * @param id The booking ID
     * @returns The booking if found
     */
    async findById(clientId: string, id: string) {
        const booking = await this.bookingModel.findOne({
            _id: id,
            clientId
        }).lean();

        if (!booking) {
            throw new NotFoundException('Booking not found');
        }

        return { data: booking };
    }

    /**
     * Sync bookings from VenueBoost for a client
     *
     * @param clientId The MongoDB ID of the client
     * @returns Result of the sync operation
     */
    async syncBookingsFromVenueBoost(clientId: string): Promise<{
        success: boolean;
        message: string;
        created: number;
        updated: number;
        unchanged: number;
        errors: number;
    }> {
        try {
            // Get the client
            const client = await this.clientModel.findById(clientId);
            if (!client) {
                throw new NotFoundException('Client not found');
            }

            // Get bookings from VenueBoost
            const response = await this.venueBoostService.listBookings(clientId);
            const bookings = response.data || [];

            // Tracking stats
            let created = 0, updated = 0, unchanged = 0, errors = 0;

            // Process each booking
            for (const vbBooking of bookings) {
                try {
                    // Find the corresponding property in our system using external ID
                    const property = await this.propertyModel.findOne({
                        'externalIds.venueboostId': vbBooking.rental_unit_id.toString()
                    });

                    if (!property) {
                        throw new Error(`Property not found for rental_unit_id: ${vbBooking.rental_unit_id}`);
                        this.logger.warn(`Property not found for rental_unit_id: ${vbBooking.rental_unit_id}`);
                        errors++;
                        continue;
                    }

                    // Find the corresponding guest in our system using external ID
                    const guest = await this.guestModel.findOne({
                        'externalIds.venueBoostId': vbBooking.guest_id
                    });

                    if (!guest) {
                        throw new Error(`Guest not found for guest_id: ${vbBooking.guest_id}`);

                        this.logger.warn(`Guest not found for guest_id: ${vbBooking.guest_id}`);
                        errors++;
                        continue;
                    }

                    // Check if the booking already exists in our system
                    const existingBooking = await this.bookingModel.findOne({
                        'externalIds.venueboostId': vbBooking.id.toString()
                    });

                    // Map status from VenueBoost to our enum
                    const bookingStatus = this.mapVenueBoostStatusToBookingStatus(vbBooking.status);

                    // Map payment method
                    const paymentMethod = vbBooking.paid_with === 'card' ? PaymentMethod.CARD : PaymentMethod.CASH;

                    if (existingBooking) {
                        // Booking exists - check if it needs to be updated
                        let needsUpdate = false;

                        if (existingBooking.status !== bookingStatus) {
                            existingBooking.status = bookingStatus;
                            needsUpdate = true;
                        }

                        if (existingBooking.totalAmount !== vbBooking.total_amount) {
                            existingBooking.totalAmount = vbBooking.total_amount;
                            needsUpdate = true;
                        }

                        if (existingBooking.discountAmount !== vbBooking.discount_price) {
                            existingBooking.discountAmount = vbBooking.discount_price;
                            needsUpdate = true;
                        }

                        if (existingBooking.paymentMethod !== paymentMethod) {
                            existingBooking.paymentMethod = paymentMethod;
                            needsUpdate = true;
                        }

                        if (existingBooking.prepaymentAmount !== vbBooking.prepayment_amount) {
                            existingBooking.prepaymentAmount = vbBooking.prepayment_amount;
                            needsUpdate = true;
                        }

                        // Update metadata if needed
                        if (!existingBooking.metadata) {
                            existingBooking.metadata = new Map<string, any>();
                        }

                        if (existingBooking.metadata.get('guestName') !== vbBooking.guest?.name) {
                            existingBooking.metadata.set('guestName', vbBooking.guest?.name || '');
                            needsUpdate = true;
                        }

                        if (existingBooking.metadata.get('guestEmail') !== vbBooking.guest?.email) {
                            existingBooking.metadata.set('guestEmail', vbBooking.guest?.email || '');
                            needsUpdate = true;
                        }

                        if (existingBooking.metadata.get('propertyName') !== vbBooking.rental_unit?.name) {
                            existingBooking.metadata.set('propertyName', vbBooking.rental_unit?.name || '');
                            needsUpdate = true;
                        }

                        if (needsUpdate) {
                            await existingBooking.save();
                            updated++;
                        } else {
                            unchanged++;
                        }

                        // Check if we need to update the external ID in VenueBoost
                        // We do this by checking if the omnistackId is not in vbBooking.external_ids
                        const vbExternalIds = vbBooking.external_ids || {};
                        if (!vbExternalIds.omniStackId || vbExternalIds.omniStackId !== existingBooking._id.toString()) {
                            // Send our ID to VenueBoost
                            await this.venueBoostService.updateBookingExternalId(
                                clientId,
                                vbBooking.id.toString(),
                                existingBooking._id.toString()
                            );
                        }
                    } else {
                        // Booking doesn't exist - create it
                        const checkInDate = new Date(vbBooking.check_in_date);
                        const checkOutDate = new Date(vbBooking.check_out_date);

                        const newBooking = await this.bookingModel.create({
                            clientId: clientId,
                            propertyId: property._id,
                            guestId: guest._id,
                            guestCount: vbBooking.guest_nr,
                            checkInDate: checkInDate,
                            checkOutDate: checkOutDate,
                            totalAmount: vbBooking.total_amount,
                            discountAmount: vbBooking.discount_price,
                            subtotal: vbBooking.subtotal,
                            status: bookingStatus,
                            paymentMethod: paymentMethod,
                            prepaymentAmount: vbBooking.prepayment_amount,
                            stripePaymentId: vbBooking.stripe_payment_id,
                            confirmationCode: vbBooking.confirmation_code || this.generateConfirmationCode(),
                            externalIds: {
                                venueboostId: vbBooking.id.toString()
                            },
                            metadata: new Map([
                                ['guestName', vbBooking.guest?.name || ''],
                                ['guestEmail', vbBooking.guest?.email || ''],
                                ['propertyName', vbBooking.rental_unit?.name || ''],
                                ['createdAt', vbBooking.created_at]
                            ])
                        });

                        // Send our ID to VenueBoost
                        await this.venueBoostService.updateBookingExternalId(
                            clientId,
                            vbBooking.id.toString(),
                            newBooking._id.toString()
                        );

                        created++;
                    }
                } catch (error) {
                    throw new Error(`Failed to process booking ${vbBooking.id}: ${error.message}`);

                    this.logger.error(`Error processing booking ${vbBooking.id}: ${error.message}`);
                    errors++;
                }
            }

            return {
                success: true,
                message: `Sync completed: ${created} created, ${updated} updated, ${unchanged} unchanged, ${errors} errors`,
                created,
                updated,
                unchanged,
                errors
            };
        } catch (error) {
            this.logger.error(`Error syncing bookings from VenueBoost: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Map VenueBoost status to BookingStatus enum
     */
    private mapVenueBoostStatusToBookingStatus(vbStatus: string): BookingStatus {
        switch (vbStatus?.toLowerCase()) {
            case 'pending':
                return BookingStatus.PENDING;
            case 'processing':
                return BookingStatus.PROCESSING;
            case 'confirmed':
                return BookingStatus.CONFIRMED;
            case 'cancelled':
                return BookingStatus.CANCELLED;
            case 'completed':
                return BookingStatus.COMPLETED;
            default:
                return BookingStatus.PENDING;
        }
    }

    /**
     * Generate a unique confirmation code
     */
    private generateConfirmationCode(length = 12): string {
        const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let code = '';
        for (let i = 0; i < length; i++) {
            code += characters[Math.floor(Math.random() * characters.length)];
        }
        return code;
    }
}