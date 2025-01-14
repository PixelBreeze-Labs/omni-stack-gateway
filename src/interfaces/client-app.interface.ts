// src/interfaces/client-app.interface.ts
export interface ClientApp {
    id: string;
    name: string;
    type: 'wordpress' | 'react' | 'vue' | 'other';
    apiKey: string;
    domain: string[];
    configuredAt: Date;
    status: 'active' | 'inactive';
    // Add form configuration
    reportConfig: {
        form: {
            title: string;
            subtitle: string;
            nameInput: {
                placeholder: string;
                required: boolean;
            };
            messageInput: {
                placeholder: string;
                required: boolean;
            };
            submitButton: {
                text: string;
                backgroundColor: string;
                textColor: string;
                iconColor: string;
            };
        };
        email: {
            recipients: string[];
            fromName: string;
            fromEmail: string;
            subject: string;
            template?: string;
        };
    };
}