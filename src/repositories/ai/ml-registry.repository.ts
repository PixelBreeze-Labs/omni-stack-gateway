// src/repositories/ai/ml-registry.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';   
import { MLRegistry } from '../../schemas/ai/ml-registry.schema';
import { CreateMLRegistryDto, UpdateMLRegistryDto } from '../../dtos/ai/ml-registry.dto';

@Injectable()
export class MLRegistryRepository {
  constructor(
    @InjectModel(MLRegistry.name) private mlRegistryModel: Model<MLRegistry>
  ) {}

  async create(createDto: CreateMLRegistryDto): Promise<MLRegistry> {
    const newModel = new this.mlRegistryModel(createDto);
    return newModel.save();
  }

  async findAll(filters: any = {}): Promise<MLRegistry[]> {
    return this.mlRegistryModel.find(filters).exec();
  }

  async findById(id: string): Promise<MLRegistry> {
    return this.mlRegistryModel.findById(id).exec();
  }

  async findByNameAndStatus(modelName: string, status: string): Promise<MLRegistry> {
    return this.mlRegistryModel.findOne({ modelName, status }).exec();
  }

  async update(id: string, updateDto: UpdateMLRegistryDto): Promise<MLRegistry> {
    return this.mlRegistryModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .exec();
  }

  async updateModelStatus(modelName: string, status: string): Promise<void> {
    // Deactivate previous active models with the same name
    if (status === 'active') {
      await this.mlRegistryModel.updateMany(
        { modelName, status: 'active' },
        { status: 'archived' }
      ).exec();
    }
  }

  async remove(id: string): Promise<MLRegistry> {
    return this.mlRegistryModel.findByIdAndDelete(id).exec();
  }

  async getActiveModel(modelName: string): Promise<MLRegistry> {
    return this.mlRegistryModel.findOne({ modelName, status: 'active' }).exec();
  }
}