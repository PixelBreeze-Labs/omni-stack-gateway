import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import { CheckinSubmission, SubmissionStatus } from '../schemas/checkin-submission.schema';
import { CheckinFormConfig } from '../schemas/checkin-form-config.schema';
import { Guest } from '../schemas/guest.schema';
import { SubmitCheckinFormDto, UpdateSubmissionStatusDto, ListCheckinSubmissionsDto } from '../dtos/checkin-form.dto';
import { CommunicationsService } from './communications.service';
import { format } from 'date-fns';
import { SupabaseService } from './supabase.service';

@Injectable()
export class CheckinSubmissionService {
    private readonly logger = new Logger(CheckinSubmissionService.name);

    constructor(
        @InjectModel(CheckinSubmission.name) private checkinSubmissionModel: Model<CheckinSubmission>,
        @InjectModel(CheckinFormConfig.name) private checkinFormConfigModel: Model<CheckinFormConfig>,
        @InjectModel(Guest.name) private guestModel: Model<Guest>,
        private readonly communicationsService: CommunicationsService,
        private readonly supabaseService: SupabaseService
    ) {}

    /**
     * Submit a check-in form
     */
    async submit(
        shortCode: string,
        submitDto: SubmitCheckinFormDto,
        files: Express.Multer.File[] = []
    ): Promise<CheckinSubmission> {
        try {
            // Find the form config
            const formConfig = await this.checkinFormConfigModel.findOne({ shortCode })
                .populate('propertyId')
                .populate('bookingId')
                .exec();

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

            // Check if guest exists - but don't create if not found
            let guestId = submitDto.guestId;
            let isExistingGuest = false;

            if (!guestId) {
                // Look for existing guest with this email
                const existingGuest = await this.guestModel.findOne({
                    email: submitDto.email,
                    clientId: formConfig.clientId
                }).exec();

                if (existingGuest) {
                    guestId = existingGuest._id.toString();
                    isExistingGuest = true;

                    // Optionally update guest info if needed
                    const firstName = (existingGuest as any).firstName;
                    const lastName = (existingGuest as any).lastName;
                    const phoneNumber = (existingGuest as any).phoneNumber;

                    if (firstName !== submitDto.firstName ||
                        lastName !== submitDto.lastName ||
                        phoneNumber !== submitDto.phoneNumber) {

                        (existingGuest as any).firstName = submitDto.firstName;
                        (existingGuest as any).lastName = submitDto.lastName;
                        if (submitDto.phoneNumber) (existingGuest as any).phoneNumber = submitDto.phoneNumber;

                        await existingGuest.save();
                    }
                }
            } else {
                isExistingGuest = false;
            }

            let propertyId = null;
            if (formConfig.propertyId) {
                propertyId = typeof formConfig.propertyId === 'object' && formConfig.propertyId !== null
                    ? (formConfig.propertyId as any)._id
                    : formConfig.propertyId;
            }

            let bookingId = null;
            if (formConfig.bookingId) {
                bookingId = typeof formConfig.bookingId === 'object' && formConfig.bookingId !== null
                    ? (formConfig.bookingId as any)._id
                    : formConfig.bookingId;
            }

            // Process file uploads
            const attachmentUrls: string[] = [];
            const fileInfo: { name: string, type: string, url: string, isIdDocument: boolean }[] = [];

            // Process uploaded files
            if (files && files.length > 0) {
                for (const file of files) {
                    const filename = `${Date.now()}-${file.originalname}`;

                    // Determine if this is an ID document based on form data or filename patterns
                    const isIdDocument =
                        file.originalname.toLowerCase().includes('id') ||
                        file.originalname.toLowerCase().includes('passport') ||
                        (submitDto.formData && submitDto.formData.documentType === 'id');

                    // Upload to the appropriate path
                    const url = await this.supabaseService.uploadCheckinFile(
                        file.buffer,
                        filename,
                        isIdDocument ? 'id-documents' : 'attachments'
                    );

                    attachmentUrls.push(url);

                    fileInfo.push({
                        name: file.originalname,
                        type: file.mimetype,
                        url: url,
                        isIdDocument: isIdDocument
                    });

                    // If this is an ID document, also store it in formData for easier reference
                    if (isIdDocument) {
                        if (!submitDto.formData) submitDto.formData = {};
                        submitDto.formData.idDocumentUrl = url;
                    }
                }
            }

            // Add any pre-existing attachment URLs from the DTO
            if (submitDto.attachmentUrls && submitDto.attachmentUrls.length > 0) {
                attachmentUrls.push(...submitDto.attachmentUrls);

                // Add to fileInfo array
                submitDto.attachmentUrls.forEach(url => {
                    const filename = url.split('/').pop() || 'file';
                    const isIdDocument = url.includes('id-documents');
                    const mimeType = this.getMimeTypeFromUrl(url);

                    fileInfo.push({
                        name: filename,
                        type: mimeType,
                        url: url,
                        isIdDocument: isIdDocument
                    });
                });
            }

            // Create submission using propertyId and bookingId from the form config
            const submission = new this.checkinSubmissionModel({
                formConfigId: formConfig?._id,
                clientId: formConfig?.clientId,
                propertyId: propertyId,
                bookingId: bookingId,
                guestId: guestId,
                formData: submitDto.formData || {},
                firstName: submitDto.firstName,
                lastName: submitDto.lastName,
                email: submitDto.email,
                phoneNumber: submitDto.phoneNumber,
                status: SubmissionStatus.PENDING,
                needsParkingSpot: submitDto.needsParkingSpot || false,
                expectedArrivalTime: submitDto.expectedArrivalTime,
                specialRequests: submitDto.specialRequests || [],
                attachmentUrls: attachmentUrls, // Include uploaded file URLs
                metadata: {
                    ...submitDto.metadata || {},
                    fileInfo: fileInfo // Store detailed file info in metadata
                }
            });

            // Save the submission
            const savedSubmission = await submission.save();

            // Send email notification
            await this.sendSubmissionNotification(
                savedSubmission,
                formConfig,
                isExistingGuest,
                fileInfo
            );

            return savedSubmission;
        } catch (error) {
            this.logger.error(`Error submitting check-in form: ${error.message}`, error.stack);
            throw error;
        }
    }
    /**
     * Get form details by short code (ADMIN)
     */
    async getFormDetails(shortCode: string, clientId: string): Promise<CheckinFormConfig> {
        try {
            const formConfig = await this.checkinFormConfigModel.findOne({
                shortCode,
                clientId
            })
                .populate('propertyId')
                .populate('bookingId')
                .lean();

            if (!formConfig) {
                throw new NotFoundException(`Check-in form config with short code ${shortCode} not found`);
            }

            // Check if form is active
            if (!formConfig.isActive) {
                throw new BadRequestException('This check-in form is no longer active');
            }

            // Check if form has expired
            if (formConfig.expiresAt && formConfig.expiresAt < new Date()) {
                throw new BadRequestException('This check-in form has expired');
            }

            return formConfig;
        } catch (error) {
            this.logger.error(`Error getting form details: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Get form details by short code with full property and booking data (public)
     */
    async getFormDetailsPublic(shortCode: string, clientId: string): Promise<CheckinFormConfig> {
        try {
            // Find the form config with client ID check for security
            const formConfig = await this.checkinFormConfigModel.findOne({
                shortCode,
                clientId
            })
                .populate({
                    path: 'propertyId',
                    select: 'name type address amenities photos'
                })
                .populate({
                    path: 'bookingId',
                    select: 'confirmationCode checkInDate checkOutDate guestCount'
                });

            if (!formConfig) {
                throw new NotFoundException(`Check-in form config with short code ${shortCode} not found`);
            }

            // Check if form is active
            if (!formConfig.isActive) {
                throw new BadRequestException('This check-in form is no longer active');
            }

            // Check if form has expired
            if (formConfig.expiresAt && formConfig.expiresAt < new Date()) {
                throw new BadRequestException('This check-in form has expired');
            }

            // Increment view count
            formConfig.views += 1;
            formConfig.lastViewed = new Date();
            await formConfig.save();

            return formConfig.toObject();
        } catch (error) {
            this.logger.error(`Error getting public form details: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Send notification email about a new check-in submission
     */
    private async sendSubmissionNotification(
        submission: CheckinSubmission,
        formConfig: any,
        isExistingGuest: boolean,
        fileInfo?: { name: string, type: string, url: string, isIdDocument: boolean }[]
    ): Promise<void> {
        try {
            // Prepare data for email template
            const property = formConfig.propertyId ? {
                name: formConfig.propertyId.name,
                type: formConfig.propertyId.type
            } : null;

            const booking = formConfig.bookingId ? {
                confirmationCode: formConfig.bookingId.confirmationCode,
                checkInDate: formConfig.bookingId.checkInDate,
                checkOutDate: formConfig.bookingId.checkOutDate,
                guestCount: formConfig.bookingId.guestCount
            } : null;

            // Format dates for the email
            const formatDate = (date) => {
                if (!date) return '';
                return format(new Date(date), 'MMM dd, yyyy');
            };

            // Check if there are any attachments
            const hasAttachments = submission.attachmentUrls && submission.attachmentUrls.length > 0;

            // Use the fileInfo if provided, otherwise generate from attachmentUrls
            const attachments = fileInfo || (hasAttachments ? submission.attachmentUrls.map(url => {
                const filename = url.split('/').pop() || 'file';
                const isIdDocument = url.includes('id-documents') ||
                    (submission.formData && url === submission.formData.idDocumentUrl);

                return {
                    url,
                    name: filename,
                    type: this.getMimeTypeFromUrl(url),
                    isIdDocument
                };
            }) : []);

            // Generate dashboard URL
            const dashboardUrl = `https://admin.venueboost.io`;

            // Prepare email content
            const emailData = {
                firstName: submission.firstName,
                lastName: submission.lastName,
                email: submission.email,
                phoneNumber: submission.phoneNumber,
                isExistingGuest,
                hasBooking: !!booking,
                booking,
                hasProperty: !!property,
                property,
                formData: submission.formData,
                needsParkingSpot: submission.needsParkingSpot,
                expectedArrivalTime: submission.expectedArrivalTime,
                specialRequests: submission.specialRequests,
                hasAttachments,
                attachments,
                dashboardUrl,
                formatDate
            };

            // Get recipient email from form config or use default
            const recipient = formConfig.receiptEmail || 'contact@metrosuites.al';

            // Send the email
            await this.communicationsService.sendCommunication({
                type: 'EMAIL',
                recipient: recipient,
                subject: `New Check-in Form: ${submission.firstName} ${submission.lastName}`,
                message: '', // Will be replaced by template content
                metadata: emailData,
                template: 'metrosuites-checkin-form'
            });

        } catch (error) {
            this.logger.error(`Error sending check-in notification email: ${error.message}`, error.stack);
            // Don't throw - we don't want to fail the submission if email fails
        }
    }

    /**
     * Helper method to guess MIME type from URL or filename
     */
    private getMimeTypeFromUrl(url: string): string {
        const extension = url.split('.').pop()?.toLowerCase();

        switch (extension) {
            case 'jpg':
            case 'jpeg':
                return 'image/jpeg';
            case 'png':
                return 'image/png';
            case 'pdf':
                return 'application/pdf';
            case 'doc':
                return 'application/msword';
            case 'docx':
                return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            default:
                return 'application/octet-stream';
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
            if (formConfigId) match.formConfigId = new Types.ObjectId(formConfigId);
            if (propertyId) match.propertyId = new Types.ObjectId(propertyId);
            if (bookingId) match.bookingId = new Types.ObjectId(bookingId);

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