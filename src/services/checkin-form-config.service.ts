// src/services/checkin-form-config.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CheckinFormConfig } from '../schemas/checkin-form-config.schema';
import { Booking, BookingStatus } from '../schemas/booking.schema';
import { CheckinSubmission } from '../schemas/checkin-submission.schema';
import { CreateCheckinFormConfigDto, UpdateCheckinFormConfigDto, FormFieldDto, FormSectionDto } from '../dtos/checkin-form.dto';
import { nanoid } from 'nanoid';

interface FindAllOptions {
    page: number;
    limit: number;
    search?: string;
    propertyId?: string;
    bookingId?: string;
    isActive?: boolean;
    isPreArrival?: boolean;
}

@Injectable()
export class CheckinFormConfigService {
    private readonly logger = new Logger(CheckinFormConfigService.name);

    constructor(
        @InjectModel(CheckinFormConfig.name) private checkinFormConfigModel: Model<CheckinFormConfig>,
        @InjectModel(Booking.name) private bookingModel: Model<Booking>,
        @InjectModel(CheckinSubmission.name) private checkinSubmissionModel: Model<CheckinSubmission>
    ) {}

    /**
     * Generate a unique short code for a check-in form
     */
    private async generateUniqueShortCode(length: number = 8): Promise<string> {
        const shortCode = nanoid(length);

        // Check if this short code already exists
        const existingForm = await this.checkinFormConfigModel.findOne({ shortCode });

        // If it exists, recursively generate a new one
        if (existingForm) {
            return this.generateUniqueShortCode(length);
        }

        return shortCode;
    }

    /**
     * Create a new check-in form configuration
     */
    async create(clientId: string, createDto: CreateCheckinFormConfigDto): Promise<CheckinFormConfig> {
        try {
            // Generate a unique short code
            const shortCode = await this.generateUniqueShortCode();

            // If booking ID is provided, validate it
            if (createDto.bookingId) {
                const booking = await this.bookingModel.findOne({
                    _id: createDto.bookingId,
                    clientId
                });

                if (!booking) {
                    throw new NotFoundException(`Booking with ID ${createDto.bookingId} not found`);
                }

                // If booking is cancelled, don't allow creating a form for it
                if (booking.status === BookingStatus.CANCELLED) {
                    throw new BadRequestException('Cannot create a check-in form for a cancelled booking');
                }

                // If property ID is not provided, use the one from the booking
                if (!createDto.propertyId) {
                    createDto.propertyId = booking.propertyId;
                }
            }

            // Create the form config
            const newFormConfig = new this.checkinFormConfigModel({
                ...createDto,
                clientId,
                shortCode,
                isActive: createDto.isActive !== undefined ? createDto.isActive : true,
                isPreArrival: createDto.isPreArrival || false,
                requiresAuthentication: createDto.requiresAuthentication || false,
                views: 0
            });

            return newFormConfig.save();
        } catch (error) {
            this.logger.error(`Error creating check-in form config: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Update an existing check-in form configuration
     */
    async update(clientId: string, shortCode: string, updateDto: UpdateCheckinFormConfigDto): Promise<CheckinFormConfig> {
        try {
            const formConfig = await this.checkinFormConfigModel.findOne({
                shortCode,
                clientId
            });

            if (!formConfig) {
                throw new NotFoundException(`Check-in form config with short code ${shortCode} not found`);
            }

            // If booking ID is being updated, validate it
            if (updateDto.bookingId && updateDto.bookingId !== formConfig.bookingId?.toString()) {
                const booking = await this.bookingModel.findOne({
                    _id: updateDto.bookingId,
                    clientId
                });

                if (!booking) {
                    throw new NotFoundException(`Booking with ID ${updateDto.bookingId} not found`);
                }

                // If booking is cancelled, don't allow associating a form with it
                if (booking.status === BookingStatus.CANCELLED) {
                    throw new BadRequestException('Cannot associate a check-in form with a cancelled booking');
                }
            }

            // Update fields if provided
            if (updateDto.name !== undefined) formConfig.name = updateDto.name;
            if (updateDto.propertyId !== undefined) formConfig.propertyId = updateDto.propertyId;
            if (updateDto.bookingId !== undefined) formConfig.bookingId = updateDto.bookingId;
            if (updateDto.formConfig !== undefined) formConfig.formConfig = updateDto.formConfig;
            if (updateDto.isActive !== undefined) formConfig.isActive = updateDto.isActive;
            if (updateDto.isPreArrival !== undefined) formConfig.isPreArrival = updateDto.isPreArrival;
            if (updateDto.requiresAuthentication !== undefined) formConfig.requiresAuthentication = updateDto.requiresAuthentication;
            if (updateDto.expiresAt !== undefined) formConfig.expiresAt = updateDto.expiresAt;
            if (updateDto.metadata !== undefined) formConfig.metadata = updateDto.metadata;

            return formConfig.save();
        } catch (error) {
            this.logger.error(`Error updating check-in form config: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Find a check-in form config by its short code
     */
    async findByShortCode(shortCode: string): Promise<CheckinFormConfig> {
        try {
            const formConfig = await this.checkinFormConfigModel.findOne({ shortCode })
                .populate('propertyId', 'name type')
                .populate('bookingId', 'confirmationCode checkInDate checkOutDate guestCount')
                .lean();

            if (!formConfig) {
                throw new NotFoundException(`Check-in form config with short code ${shortCode} not found`);
            }

            // Check if form has expired
            if (formConfig.expiresAt && formConfig.expiresAt < new Date()) {
                throw new BadRequestException('This check-in form has expired');
            }

            // Check if form is active
            if (!formConfig.isActive) {
                throw new BadRequestException('This check-in form is no longer active');
            }

            return formConfig;
        } catch (error) {
            this.logger.error(`Error finding check-in form config: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Find a check-in form config by ID
     */
    async findById(clientId: string, id: string): Promise<CheckinFormConfig> {
        try {
            const formConfig = await this.checkinFormConfigModel.findOne({
                _id: id,
                clientId
            })
                .populate('propertyId', 'name type')
                .populate('bookingId', 'confirmationCode checkInDate checkOutDate guestCount')
                .lean();

            if (!formConfig) {
                throw new NotFoundException(`Check-in form config with ID ${id} not found`);
            }

            // Get submission count
            const submissionCount = await this.checkinSubmissionModel.countDocuments({
                formConfigId: id,
                clientId
            });

            // Add submission count to the response
            return {
                ...formConfig,
                metadata: {
                    ...formConfig.metadata,
                    submissionCount
                }
            };
        } catch (error) {
            this.logger.error(`Error finding check-in form config: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Find check-in form configs for a booking
     */
    async findByBookingId(clientId: string, bookingId: string): Promise<CheckinFormConfig[]> {
        try {
            const formConfigs = await this.checkinFormConfigModel.find({
                clientId,
                bookingId,
                isActive: true
            }).lean();

            return formConfigs;
        } catch (error) {
            this.logger.error(`Error finding check-in form configs by booking: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * List all check-in form configs with filtering and pagination
     */
    async findAll(clientId: string, options: FindAllOptions) {
        try {
            const { page, limit, search, propertyId, bookingId, isActive, isPreArrival } = options;
            const skip = (page - 1) * limit;

            // Build the filter
            const filter: any = { clientId };

            // Add property filter if provided
            if (propertyId) {
                filter.propertyId = propertyId;
            }

            // Add booking filter if provided
            if (bookingId) {
                filter.bookingId = bookingId;
            }

            // Add active status filter if provided
            if (isActive !== undefined) {
                filter.isActive = isActive;
            }

            // Add pre-arrival filter if provided
            if (isPreArrival !== undefined) {
                filter.isPreArrival = isPreArrival;
            }

            // Add search filter if provided
            if (search) {
                filter.name = { $regex: search, $options: 'i' };
            }

            // Execute the query with pagination
            const [formConfigs, total] = await Promise.all([
                this.checkinFormConfigModel
                    .find(filter)
                    .populate('propertyId', 'name type')
                    .populate('bookingId', 'confirmationCode checkInDate checkOutDate')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                this.checkinFormConfigModel.countDocuments(filter)
            ]);

            // Get submission counts for all forms
            const formIds = formConfigs.map(form => form._id);
            const submissionCounts = await this.checkinSubmissionModel.aggregate([
                { $match: { clientId } },
                { $lookup: {
                        from: 'checkinformconfigs',
                        localField: 'formConfigId',
                        foreignField: '_id',
                        as: 'form'
                    }
                },
                { $unwind: '$form' },
                { $group: {
                        _id: '$formConfigId',
                        count: { $sum: 1 }
                    }
                }
            ]);


            // Create a map of formId -> submission count
            const submissionCountMap = {};
            submissionCounts.forEach(stat => {
                submissionCountMap[stat._id.toString()] = stat.count;
            });

            for (const form of formConfigs) {
                const count = await this.checkinSubmissionModel.countDocuments({
                    formConfigId: form._id
                });

                form.metadata = form.metadata || {};
                form.metadata.submissionCount = count;
            }

            // // Add submission counts to each form
            // const formsWithCounts = formConfigs.map(form => {
            //     return {
            //         ...form,
            //         metadata: {
            //             ...form.metadata,
            //             submissionCount: submissionCountMap[form._id.toString()] || 0
            //         }
            //     };
            // });

            // Calculate pagination metadata
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPrevPage = page > 1;

            // Generate metrics data
            const metrics = await this.getMetrics(clientId);

            return {
                data: formConfigs,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                    hasNextPage,
                    hasPrevPage
                },
                metrics
            };
        } catch (error) {
            this.logger.error(`Error finding check-in form configs: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Get metrics for check-in forms
     */
    private async getMetrics(clientId: string) {
        try {
            // Get basic counts
            const [totalForms, activeForms, lastMonthTotal, totalViews, lastMonthViews] = await Promise.all([
                this.checkinFormConfigModel.countDocuments({ clientId }),
                this.checkinFormConfigModel.countDocuments({ clientId, isActive: true }),
                this.checkinFormConfigModel.countDocuments({
                    clientId,
                    createdAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 1)) }
                }),
                this.checkinFormConfigModel.aggregate([
                    { $match: { clientId } },
                    { $group: { _id: null, totalViews: { $sum: "$views" } } }
                ]),
                this.checkinFormConfigModel.aggregate([
                    {
                        $match: {
                            clientId,
                            updatedAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 1)) }
                        }
                    },
                    { $group: { _id: null, totalViews: { $sum: "$views" } } }
                ])
            ]);

            // Get total submissions and submissions from last month
            const [totalSubmissions, lastMonthSubmissions] = await Promise.all([
                this.checkinSubmissionModel.countDocuments({ clientId }),
                this.checkinSubmissionModel.countDocuments({
                    clientId,
                    createdAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 1)) }
                })
            ]);

            // Calculate metrics with previous period comparison
            const previousMonthTotal = totalForms - lastMonthTotal;
            const formsTrend = previousMonthTotal === 0
                ? 100
                : Math.round((lastMonthTotal / previousMonthTotal - 1) * 100);

            const currentViews = totalViews.length > 0 ? totalViews[0].totalViews : 0;
            const lastMonthViewsCount = lastMonthViews.length > 0 ? lastMonthViews[0].totalViews : 0;
            const viewsTrend = lastMonthViewsCount === 0
                ? 0
                : Math.round((currentViews / lastMonthViewsCount - 1) * 100);

            const previousMonthSubmissions = totalSubmissions - lastMonthSubmissions;
            const submissionsTrend = previousMonthSubmissions === 0
                ? 0
                : Math.round((lastMonthSubmissions / previousMonthSubmissions - 1) * 100);

            // Corrected submission rate calculation
            const submissionRate = currentViews === 0 ? 0 : Math.round((totalSubmissions / currentViews) * 100);

            return {
                totalForms,
                activeForms,
                views: currentViews || 0,
                submissions: totalSubmissions || 0,
                submissionRate: submissionRate || 0,
                trends: {
                    forms: {
                        value: lastMonthTotal,
                        percentage: formsTrend
                    },
                    views: {
                        value: lastMonthViewsCount,
                        percentage: viewsTrend
                    },
                    submissions: {
                        value: lastMonthSubmissions,
                        percentage: submissionsTrend
                    }
                }
            };
        } catch (error) {
            this.logger.error(`Error generating form metrics: ${error.message}`, error.stack);
            // Return default metrics if there's an error
            return {
                totalForms: 0,
                activeForms: 0,
                views: 0,
                submissions: 0,
                submissionRate: 0,
                trends: {
                    forms: { value: 0, percentage: 0 },
                    views: { value: 0, percentage: 0 },
                    submissions: { value: 0, percentage: 0 }
                }
            };
        }
    }

    /**
     * Soft delete a check-in form config by setting isActive to false
     */
    async softDelete(clientId: string, shortCode: string): Promise<{ success: boolean }> {
        try {
            const formConfig = await this.checkinFormConfigModel.findOne({
                shortCode,
                clientId
            });

            if (!formConfig) {
                throw new NotFoundException(`Check-in form config with short code ${shortCode} not found`);
            }

            // Soft delete by marking as inactive
            formConfig.isActive = false;
            await formConfig.save();

            return { success: true };
        } catch (error) {
            this.logger.error(`Error soft deleting check-in form config: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Hard delete a check-in form config (admin only)
     */
    async hardDelete(clientId: string, shortCode: string): Promise<{ success: boolean }> {
        try {
            const result = await this.checkinFormConfigModel.deleteOne({
                shortCode,
                clientId
            });

            if (result.deletedCount === 0) {
                throw new NotFoundException(`Check-in form config with short code ${shortCode} not found`);
            }

            return { success: true };
        } catch (error) {
            this.logger.error(`Error hard deleting check-in form config: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Create a default form configuration for a booking
     */
    async createDefaultFormForBooking(booking: Booking): Promise<CheckinFormConfig> {
        try {
            // Generate a form name using booking confirmation code
            const formName = `Check-in Form for Booking #${booking.confirmationCode}`;

            // Set expiration to the check-out date
            const expiresAt = new Date(booking.checkOutDate);

            // Create a default form configuration with standard fields
            const defaultFormConfig = {
                fields: this.getDefaultFormFields(),
                sections: this.getDefaultFormSections(),
                languages: ['en'],
                defaultLanguage: 'en',
                submitButtonText: { en: 'Submit Check-in Information' }
            };

            // Create the form
            return this.create(booking.clientId.toString(), {
                name: formName,
                propertyId: booking.propertyId.toString(),
                bookingId: booking._id.toString(),
                formConfig: defaultFormConfig,
                isActive: true,
                isPreArrival: true,
                expiresAt,
                metadata: {
                    autoGenerated: true,
                    bookingConfirmationCode: booking.confirmationCode
                }
            });
        } catch (error) {
            this.logger.error(`Error creating default form for booking: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Get default form fields
     */
    private getDefaultFormFields(): FormFieldDto[] {
        return [
            {
                name: 'firstName',
                type: 'text',
                label: { en: 'First Name' },
                placeholder: { en: 'Enter your first name' },
                required: true
            },
            {
                name: 'lastName',
                type: 'text',
                label: { en: 'Last Name' },
                placeholder: { en: 'Enter your last name' },
                required: true
            },
            {
                name: 'email',
                type: 'email',
                label: { en: 'Email Address' },
                placeholder: { en: 'Enter your email address' },
                required: true
            },
            {
                name: 'phoneNumber',
                type: 'tel',
                label: { en: 'Phone Number' },
                placeholder: { en: 'Enter your phone number' },
                required: true
            },
            {
                name: 'idType',
                type: 'select',
                label: { en: 'ID Type' },
                required: true,
                options: [
                    { value: 'passport', label: { en: 'Passport' } },
                    { value: 'drivers_license', label: { en: 'Driver\'s License' } },
                    { value: 'id_card', label: { en: 'ID Card' } },
                    { value: 'other', label: { en: 'Other' } }
                ]
            },
            {
                name: 'addressLine1',
                type: 'text',
                label: { en: 'Address Line 1' },
                placeholder: { en: 'Enter your street address' },
                required: true
            },
            {
                name: 'addressLine2',
                type: 'text',
                label: { en: 'Address Line 2' },
                placeholder: { en: 'Apartment, suite, etc. (optional)' },
                required: false
            },
            {
                name: 'city',
                type: 'text',
                label: { en: 'City' },
                placeholder: { en: 'Enter your city' },
                required: true
            },
            {
                name: 'state',
                type: 'text',
                label: { en: 'State/Province' },
                placeholder: { en: 'Enter your state or province' },
                required: true
            },
            {
                name: 'postalCode',
                type: 'text',
                label: { en: 'Postal Code' },
                placeholder: { en: 'Enter your postal code' },
                required: true
            },
            {
                name: 'country',
                type: 'text',
                label: { en: 'Country' },
                placeholder: { en: 'Enter your country' },
                required: true
            },
            {
                name: 'needsParkingSpot',
                type: 'radio',
                label: { en: 'Do you need a parking spot?' },
                required: true,
                options: [
                    { value: 'true', label: { en: 'Yes' } },
                    { value: 'false', label: { en: 'No' } }
                ]
            },
            {
                name: 'vehicleMakeModel',
                type: 'text',
                label: { en: 'Vehicle Make and Model' },
                placeholder: { en: 'E.g. Toyota Camry' },
                required: false,
                validation: "yup.string().when('needsParkingSpot', { is: true, then: yup.string().required('Vehicle make and model required when parking is needed') })"
            },
            {
                name: 'vehicleLicensePlate',
                type: 'text',
                label: { en: 'Vehicle License Plate' },
                placeholder: { en: 'Enter license plate number' },
                required: false,
                validation: "yup.string().when('needsParkingSpot', { is: true, then: yup.string().required('License plate required when parking is needed') })"
            },
            {
                name: 'vehicleColor',
                type: 'text',
                label: { en: 'Vehicle Color' },
                placeholder: { en: 'E.g. Blue' },
                required: false,
                validation: "yup.string().when('needsParkingSpot', { is: true, then: yup.string().required('Vehicle color required when parking is needed') })"
            },
            {
                name: 'expectedArrivalTime',
                type: 'text',
                label: { en: 'Expected Arrival Time' },
                placeholder: { en: 'E.g. 3:00 PM' },
                required: true
            },
            {
                name: 'specialRequests',
                type: 'text',
                label: { en: 'Special Requests' },
                placeholder: { en: 'Any special requests or notes (optional)' },
                required: false
            }
        ];
    }

    /**
     * Get default form sections
     */
    private getDefaultFormSections(): FormSectionDto[] {
        return [
            {
                name: 'personalInfo',
                title: { en: 'Personal Information' },
                fields: ['firstName', 'lastName', 'email', 'phoneNumber', 'idType']
            },
            {
                name: 'address',
                title: { en: 'Address Information' },
                fields: ['addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country']
            },
            {
                name: 'vehicle',
                title: { en: 'Vehicle Information' },
                fields: ['needsParkingSpot', 'vehicleMakeModel', 'vehicleLicensePlate', 'vehicleColor']
            },
            {
                name: 'arrival',
                title: { en: 'Arrival Information' },
                fields: ['expectedArrivalTime', 'specialRequests']
            }
        ];
    }
}