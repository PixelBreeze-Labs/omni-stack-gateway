// src/services/email.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Report } from '../interfaces/report.interface';
import { ClientApp } from '../interfaces/client-app.interface';

@Injectable()
export class EmailService {
    private readonly apiKey: string;
    private readonly apiUrl = 'https://api.resend.com/emails';

    constructor(private configService: ConfigService) {
        this.apiKey = this.configService.get<string>('RESEND_API_KEY');
    }

    async sendReportNotification(report: Report, clientApp: ClientApp): Promise<void> {
        const { reportConfig } = clientApp;
        const { email } = reportConfig;

        const emailBody = `
            <h2>New Report Submitted</h2>
            <p>A new report has been submitted from ${clientApp.name}</p>

            <h3>Report Details:</h3>
            <p><strong>Timestamp:</strong> ${report.metadata.timestamp}</p>
            ${report.content.name ? `<p><strong>Submitted by:</strong> ${report.content.name}</p>` : ''}

            <h3>Message:</h3>
            <p>${report.content.message}</p>

            <hr>
            <p><small>This is an automated message.</small></p>
        `;

        try {
            const response = await axios.post(
                this.apiUrl,
                {
                    from: `${email.fromName} <${email.fromEmail}>`,
                    to: email.recipients,
                    subject: email.subject,
                    html: emailBody
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('Email sent successfully:', response.data);
        } catch (error) {
            console.error('Failed to send email:', error.response?.data || error.message);
            throw new InternalServerErrorException(
                `Failed to send email: ${error.response?.data?.message || error.message}`
            );
        }
    }
}