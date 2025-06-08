// src/services/app-client.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppClient } from '../schemas/app-client.schema';

@Injectable()
export class AppClientService {
 constructor(
   @InjectModel(AppClient.name) private appClientModel: Model<AppClient>
 ) {}

 async findById(appClientId: string): Promise<AppClient | null> {
   return await this.appClientModel
     .findById(appClientId)
     .where({ is_active: true })
     .exec();
 }
}