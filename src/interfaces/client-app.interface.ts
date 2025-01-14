// src/interfaces/client-app.interface.ts
export interface ClientApp {
    id: string;
    name: string;
    type: 'wordpress' | 'react' | 'vue' | 'other';
    apiKey: string;
    domain: string[];
    configuredAt: Date;
    status: 'active' | 'inactive';
}