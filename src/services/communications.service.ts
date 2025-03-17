// src/services/communications.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from './email.service';
import * as twilio from 'twilio';

// Interfaces
export interface SendCommunicationParams {
    type: 'EMAIL' | 'SMS';
    recipient: string;
    subject?: string;
    message: string;
    metadata?: Record<string, any>;
    template?: string;
}

export interface CommunicationResponse {
    success: boolean;
    deliveryId: string;
    provider: string;
    status: string;
}

@Injectable()
export class CommunicationsService {
    private readonly logger = new Logger(CommunicationsService.name);
    private twilioClient: twilio.Twilio;

    constructor(
        private emailService: EmailService
    ) {
        // Initialize Twilio client
        this.twilioClient = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );
    }

    /**
     * Send a communication (email or SMS) to a recipient
     */
    async sendCommunication(params: SendCommunicationParams): Promise<CommunicationResponse> {
        const { type, recipient, subject, message, metadata, template } = params;

        try {
            if (type === 'EMAIL') {
                return await this.sendEmail(recipient, subject, message, metadata, template);
            } else if (type === 'SMS') {
                return await this.sendSMS(recipient, message, metadata);
            } else {
                throw new Error(`Unsupported communication type: ${type}`);
            }
        } catch (error) {
            this.logger.error(`Failed to send ${type} communication: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Send an email using the email service
     */
    private async sendEmail(
        recipient: string,
        subject: string,
        message: string,
        metadata?: Record<string, any>,
        template?: string
    ): Promise<CommunicationResponse> {
        try {
            // Determine which template to use based on the template parameter
            let templatePath = 'templates/email/default.html';

            if (template === 'metrosuites-staff') {
                templatePath = 'templates/metrosuites/staff-communication.html';
            }

            // Send the email
            await this.emailService.sendTemplateEmail(
                'Metrosuites',
                'metrosuites@omnistackhub.xyz',
                recipient,
                subject,
                templatePath,
                {
                    subject,
                    message,
                    ...metadata
                }
            );

            // Generate a unique ID for the delivery since we don't have messageId
            const uniqueId = `email_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

            // Return the response
            return {
                success: true,
                deliveryId: uniqueId,
                provider: 'email',
                status: 'delivered'
            };
        } catch (error) {
            this.logger.error(`Failed to send email: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Send an SMS using Twilio
     */
    private async sendSMS(
        recipient: string,
        message: string,
        metadata?: Record<string, any>
    ): Promise<CommunicationResponse> {
        try {
            // Format phone number if needed (ensure it's in E.164 format)
            const formattedPhone = this.formatPhoneNumber(recipient);

            // Send the SMS via Twilio
            const result = await this.twilioClient.messages.create({
                body: message,
                from: process.env.TWILIO_NUMBER,
                to: formattedPhone
            });

            // Return the response
            return {
                success: true,
                deliveryId: result.sid,
                provider: 'twilio',
                status: result.status
            };
        } catch (error) {
            this.logger.error(`Failed to send SMS: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Format phone number to E.164 format (required by Twilio)
     * This is a basic implementation - in production, you might want to use a library like libphonenumber-js
     */
    private formatPhoneNumber(phone: string): string {
        // Strip out any non-digit characters
        const digits = phone.replace(/\D/g, '');

        // If it doesn't start with a +, add +1 (US) or appropriate country code
        if (!phone.startsWith('+')) {
            // This assumes US numbers - adjust as needed for international support
            return `+${digits.length === 10 ? '1' + digits : digits}`;
        }

        return phone;
    }
}