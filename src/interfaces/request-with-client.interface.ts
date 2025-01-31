// src/interfaces/request-with-client.interface.ts
import { Request } from 'express';
import { Client } from '../schemas/client.schema';

export interface RequestWithClient extends Request {
    client: Client;
}