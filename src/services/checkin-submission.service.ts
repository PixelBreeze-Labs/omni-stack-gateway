// src/services/checkin-submission.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CheckinSubmission, SubmissionStatus } from '../schemas/checkin-submission.schema';
import { CheckinFormConfig } from '../schemas/checkin-form-config.schema';
import { Guest } from '../schemas/guest.schema';
import { SubmitCheckinFormDto, UpdateSubmissionStatusDto, ListCheckinSubmissionsDto } from '../dtos/checkin-form.dto';

@Injectable()
export class CheckinSubmissionService {
    private readonly logger = new Logger(CheckinSubmissionService.name);

    constructor(
        @InjectModel(CheckinSubmission.name) private checkinSubmissionModel: Model<CheckinSubmission>,
        @InjectModel(CheckinFormConfig.name) private checkinFormConfigModel: Model<CheckinFormConfig>,
        @InjectModel(Guest.name) private guestModel: Model<Guest>
    ) {}

    /**
     * Submit a check-in form
     */
    async submit(shortCode: string, submitDto: SubmitCheckinFormDto): Promise<CheckinSubmission> {
        try {
            // Find the form config
            const formConfig = await this.checkinFormConfigModel.findOne({ shortCode }).exec();

            if (!formConfig) {
                throw new NotFoundException(`Check-in form config with short code ${shortCode} not found`);
            }

            if (!formConfig.isActive) {
                throw new BadRequestException('This check-in form is no longer active');
            }

            // Check if form has expired
            if (formConfig.expiresAt && formConfig.expiresAt < new Date()) {
                throw new BadRequestException('This check-in form has expired');
            }

            // Find or create guest based on the email
            let guestId = submitDto.guestId;

            if (!guestId) {
                // Look for existing guest with this email
                const existingGuest = await this.guestModel.findOne({
                    email: submitDto.email,
                    clientId: formConfig.clientId
                }).exec();

                if (existingGuest) {
                    guestId = existingGuest._id;

                    // Optionally update guest info if needed
                    if (existingGuest.firstName !== submitDto.firstName ||
                        existingGuest.lastName !== submitDto.lastName ||
                        existingGuest.phoneNumber !== submitDto.phoneNumber) {

                        existingGuest.firstName = submitDto.firstName;
                        existingGuest.lastName = submitDto.lastName;
                        if (submitDto.phoneNumber) existingGuest.phoneNumber = submitDto.phoneNumber;

                        await existingGuest.save();
                    }
                } else {
                    // Create a new guest
                    const newGuest = new this.guestModel({
                        firstName: submitDto.firstName,
                        lastName: submitDto.lastName,
                        email: submitDto.email,
                        phoneNumber: submitDto.phoneNumber,
                        clientId: formConfig.clientId
                    });

                    const savedGuest = await newGuest.save();
                    guestId = savedGuest._id;
                }
            }

            // Create submission using propertyId and bookingId from the form config
            const submission = new this.checkinSubmissionModel({
                formConfigId: formConfig._id,
                clientId: formConfig.clientId,
                propertyId: formConfig.propertyId, // Use propertyId from the form config
                bookingId: formConfig.bookingId, // Use bookingId from the form config
                guestId: guestId,
                formData: submitDto.formData,
                firstName: submitDto.firstName,
                lastName: submitDto.lastName,
                email: submitDto.email,
                phoneNumber: submitDto.phoneNumber,
                status: SubmissionStatus.PENDING,
                needsParkingSpot: submitDto.needsParkingSpot || false,
                expectedArrivalTime: submitDto.expectedArrivalTime,
                specialRequests: submitDto.specialRequests || [],
                attachmentUrls: submitDto.attachmentUrls || [],
                metadata: submitDto.metadata || {}
            });

            return submission.save();
        } catch (error) {
            this.logger.error(`Error submitting check-in form: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Update submission status
     */
    async updateStatus(
        clientId: string,
        submissionId: string,
        updateDto: UpdateSubmissionStatusDto
    ): Promise<CheckinSubmission> {
        try {
            const submission = await this.checkinSubmissionModel.findOne({
                _id: submissionId,
                clientId
            });

            if (!submission) {
                throw new NotFoundException(`Submission with ID ${submissionId} not found`);
            }

            // Update status
            submission.status = updateDto.status;

            // Update verification data if provided
            if (updateDto.verificationData) {
                submission.verificationData = updateDto.verificationData;
            }

            // Update verifiedBy if provided
            if (updateDto.verifiedBy) {
                submission.verifiedBy = updateDto.verifiedBy;
            }

            // Set verification date if status is verified
            if (updateDto.status === SubmissionStatus.VERIFIED) {
                submission.verifiedAt = new Date();
            }

            return submission.save();
        } catch (error) {
            this.logger.error(`Error updating submission status: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Find a submission by ID
     */
    async findById(clientId: string, submissionId: string): Promise<CheckinSubmission> {
        try {
            const submission = await this.checkinSubmissionModel.findOne({
                _id: submissionId,
                clientId
            })
                .populate('formConfigId')
                .populate('propertyId', 'name type')
                .populate('bookingId', 'confirmationCode checkInDate checkOutDate')
                .populate('guestId', 'firstName lastName email')
                .lean();

            if (!submission) {
                throw new NotFoundException(`Submission with ID ${submissionId} not found`);
            }

            return submission;
        } catch (error) {
            this.logger.error(`Error finding submission: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * List submissions with filtering and pagination
     */
    async findAll(clientId: string, options: ListCheckinSubmissionsDto) {
        try {
            const { formConfigId, propertyId, guestId, bookingId, email, status, needsParkingSpot, page = 1, limit = 10 } = options;
            const skip = (page - 1) * limit;

            // Build the filter
            const filter: any = { clientId };

            // Add form config filter if provided
            if (formConfigId) {
                filter.formConfigId = formConfigId;
            }

            // Add property filter if provided
            if (propertyId) {
                filter.propertyId = propertyId;
            }

            // Add guest filter if provided
            if (guestId) {
                filter.guestId = guestId;
            }

            // Add booking filter if provided
            if (bookingId) {
                filter.bookingId = bookingId;
            }

            // Add email filter if provided
            if (email) {
                filter.email = email;
            }

            // Add status filter if provided
            if (status) {
                filter.status = status;
            }

            // Add parking filter if provided
            if (needsParkingSpot !== undefined) {
                filter.needsParkingSpot = needsParkingSpot;
            }

            // Execute the query with pagination
            const [submissions, total] = await Promise.all([
                this.checkinSubmissionModel
                    .find(filter)
                    .populate('formConfigId', 'name shortCode')
                    .populate('propertyId', 'name type')
                    .populate('bookingId', 'confirmationCode checkInDate checkOutDate')
                    .populate('guestId', 'firstName lastName email')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                this.checkinSubmissionModel.countDocuments(filter)
            ]);

            // Calculate pagination metadata
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPrevPage = page > 1;

            return {
                data: submissions,
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
            this.logger.error(`Error finding submissions: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Find submissions for a booking
     */
    async findByBookingId(clientId: string, bookingId: string): Promise<CheckinSubmission[]> {
        try {
            const submissions = await this.checkinSubmissionModel
                .find({
                    clientId,
                    bookingId
                })
                .populate('formConfigId', 'name shortCode')
                .populate('guestId', 'firstName lastName email')
                .sort({ createdAt: -1 })
                .lean();

            return submissions;
        } catch (error) {
            this.logger.error(`Error finding submissions by booking: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Delete a submission
     */
    async delete(clientId: string, submissionId: string): Promise<{ success: boolean }> {
        try {
            const result = await this.checkinSubmissionModel.deleteOne({
                _id: submissionId,
                clientId
            });

            if (result.deletedCount === 0) {
                throw new NotFoundException(`Submission with ID ${submissionId} not found`);
            }

            return { success: true };
        } catch (error) {
            this.logger.error(`Error deleting submission: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Get submission stats
     */
    async getStats(clientId: string, params: { formConfigId?: string, propertyId?: string, bookingId?: string }) {
        try {
            const { formConfigId, propertyId, bookingId } = params;

            // Build match stage
            const match: any = { clientId };
            if (formConfigId) match.formConfigId = formConfigId;
            if (propertyId) match.propertyId = propertyId;
            if (bookingId) match.bookingId = bookingId;

            const stats = await this.checkinSubmissionModel.aggregate([
                { $match: match },
                { $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]);

            // Convert to a more friendly format
            const result = {
                total: 0,
                pending: 0,
                completed: 0,
                verified: 0,
                rejected: 0,
                needParking: 0
            };

            stats.forEach(item => {
                result[item._id.toLowerCase()] = item.count;
                result.total += item.count;
            });

            // Count parking needs
            const parkingCount = await this.checkinSubmissionModel.countDocuments({
                ...match,
                needsParkingSpot: true
            });

            result.needParking = parkingCount;

            return { stats: result };
        } catch (error) {
            this.logger.error(`Error getting submission stats: ${error.message}`, error.stack);
            throw error;
        }
    }
}