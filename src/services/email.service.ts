// src/services/email.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Report } from '../interfaces/report.interface';
import { ClientApp } from '../interfaces/client-app.interface';
import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';

@Injectable()
export class EmailService {
    private readonly apiKey: string;
    private readonly apiUrl = 'https://api.resend.com/emails';

    constructor(private configService: ConfigService) {
        this.apiKey = this.configService.get<string>('RESEND_API_KEY');
    }

    /**
     * Sends a simple report notification email.
     */
    /**
     * Sends a simple report notification email.
     */
    async sendReportNotification(report: Report, clientApp: ClientApp): Promise<void> {
        const { reportConfig } = clientApp;
        const { email } = reportConfig;

        // Generate file attachments HTML if files exist
        let filesHtml = '';
        if (report.content.files && report.content.files.length > 0) {
            filesHtml = `
                <h3>Attached Files:</h3>
                <ul>
                    ${report.content.files.map(file => `
                        <li>
                            <a href="${file.url}" target="_blank">${file.name}</a> 
                            (${file.type}, ${this.formatFileSize(file.size)})
                        </li>
                    `).join('')}
                </ul>
            `;
        }

        const emailBody = `
            <h2>New Report Submitted</h2>
            <p>A new report has been submitted from ${clientApp.name}</p>

            <h3>Report Details:</h3>
            <p><strong>Timestamp:</strong> ${report.metadata.timestamp}</p>
            ${report.content.name ? `<p><strong>Submitted by:</strong> ${report.content.name}</p>` : ''}

            <h3>Message:</h3>
            <p>${report.content.message}</p>

            ${filesHtml}

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
                    html: emailBody,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                },
            );
            console.log('Email sent successfully:', response.data);
        } catch (error) {
            console.error('Failed to send email:', error.response?.data || error.message);
            throw new InternalServerErrorException(
                `Failed to send email: ${error.response?.data?.message || error.message}`,
            );
        }
    }

    private formatFileSize(bytes: number): string {
        if (!bytes) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Sends an email using a specific HTML template.
     *
     * @param fromName - Sender's display name.
     * @param fromEmail - Sender's email address.
     * @param to - Recipient email address or an array of addresses.
     * @param subject - Email subject.
     * @param templatePath - Relative path to the HTML template file (e.g., "templates/metroshop/welcome-email-template.html").
     * @param templateData - An object containing values to replace in the template.
     */
    async sendTemplateEmail(
        fromName: string,
        fromEmail: string,
        to: string | string[],
        subject: string,
        templatePath: string,
        templateData: Record<string, any>,
    ): Promise<void> {
        try {
            // Construct the absolute path to the template file.
            const fullTemplatePath = path.join(process.cwd(), 'src', templatePath);

            // Read and compile the template using Handlebars.
            const templateSource = fs.readFileSync(fullTemplatePath, 'utf-8');
            const template = handlebars.compile(templateSource);
            const htmlContent = template(templateData);

            // Send the email using Resend's API.
            const response = await axios.post(
                this.apiUrl,
                {
                    from: `${fromName} <${fromEmail}>`,
                    to,
                    subject,
                    html: htmlContent,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                },
            );
            console.log('Template email sent successfully:', response.data);
        } catch (error) {
            console.error('Failed to send template email:', error.response?.data || error.message);
            throw new InternalServerErrorException(
                `Failed to send template email: ${error.response?.data?.message || error.message}`,
            );
        }
    }
}
