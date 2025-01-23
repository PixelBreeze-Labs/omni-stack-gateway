import {Injectable, NotFoundException} from "@nestjs/common";
import {InjectModel} from "@nestjs/mongoose";
import {WarehouseLocation} from "../schemas/warehouse-location.schema";
import {Warehouse} from "../schemas/warehouse.schema";
import {Model} from "mongoose";
import {CreateLocationDto, UpdateLocationDto} from "../dtos/warehouse-location.dto";

@Injectable()
export class WarehouseLocationService {
    constructor(
        @InjectModel(WarehouseLocation.name) private locationModel: Model<WarehouseLocation>,
        @InjectModel(Warehouse.name) private warehouseModel: Model<Warehouse>
    ) {}

    async create(warehouseId: string, createDto: CreateLocationDto) {
        const warehouse = await this.warehouseModel.findById(warehouseId);
        if (!warehouse) throw new NotFoundException('Warehouse not found');

        return this.locationModel.create({
            ...createDto,
            warehouseId
        });
    }

    async findAll(warehouseId: string) {
        return this.locationModel.find({ warehouseId });
    }

    async findOne(id: string) {
        const location = await this.locationModel.findById(id);
        if (!location) throw new NotFoundException('Location not found');
        return location;
    }

    async update(id: string, updateDto: UpdateLocationDto) {
        const location = await this.locationModel
            .findByIdAndUpdate(id, updateDto, { new: true });
        if (!location) throw new NotFoundException('Location not found');
        return location;
    }

    async remove(id: string) {
        const location = await this.locationModel.findByIdAndDelete(id);
        if (!location) throw new NotFoundException('Location not found');
        return location;
    }
}