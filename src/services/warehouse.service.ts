import {Injectable, NotFoundException} from "@nestjs/common";
import {InjectModel} from "@nestjs/mongoose";
import {WarehouseLocation} from "../schemas/warehouse-location.schema";
import {Warehouse} from "../schemas/warehouse.schema";
import {Model} from "mongoose";
import {CreateLocationDto} from "../dtos/warehouse-location.dto";
import {CreateWarehouseDto, UpdateWarehouseDto} from "../dtos/warehouse.dto";

@Injectable()
export class WarehouseService {
    constructor(
        @InjectModel(Warehouse.name) private warehouseModel: Model<Warehouse>,
        @InjectModel(WarehouseLocation.name) private locationModel: Model<WarehouseLocation>
    ) {}

    async create(createDto: CreateWarehouseDto) {
        return this.warehouseModel.create(createDto);
    }

    async findAll(clientId: string) {
        return this.warehouseModel.find({ clientId });
    }

    async findOne(id: string) {
        const warehouse = await this.warehouseModel.findById(id);
        if (!warehouse) throw new NotFoundException('Warehouse not found');
        return warehouse;
    }

    async update(id: string, updateDto: UpdateWarehouseDto) {
        const warehouse = await this.warehouseModel
            .findByIdAndUpdate(id, updateDto, { new: true });
        if (!warehouse) throw new NotFoundException('Warehouse not found');
        return warehouse;
    }

    async addLocation(warehouseId: string, locationDto: CreateLocationDto) {
        const location = await this.locationModel.create({
            ...locationDto,
            warehouseId
        });
        return location;
    }

    async getLocations(warehouseId: string) {
        return this.locationModel.find({ warehouseId });
    }
}