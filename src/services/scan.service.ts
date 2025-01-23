// scan.service.ts
import {ScanProductDto} from "../dtos/scan.dto";
import {Model} from "mongoose";
import {ScanLog} from "../schemas/scan-log.schema";
import {Product} from "../schemas/product.schema";
import {InjectModel} from "@nestjs/mongoose";
import {Injectable, NotFoundException} from "@nestjs/common";

@Injectable()
export class ScanService {
    constructor(
        @InjectModel(Product.name) private productModel: Model<Product>,
        @InjectModel(ScanLog.name) private scanLogModel: Model<ScanLog>
    ) {}

    async findByBarcode(barcode: string, clientId: string): Promise<Product | null> {
        return this.productModel.findOne({ barcode, clientId }).exec();
    }

    async processProductScan(scanDto: ScanProductDto, clientId: string): Promise<Product> {
        const session = await this.productModel.db.startSession();
        session.startTransaction();

        try {
            let product = await this.findByBarcode(scanDto.barcode, clientId);
            const isNewProduct = !product;

            if (!product && scanDto.name) {
                const newProduct = await this.productModel.create({
                    barcode: scanDto.barcode,
                    name: scanDto.name,
                    code: scanDto.barcode,
                    clientId,
                    lastScannedWarehouse: scanDto.warehouseId,
                    locationCode: scanDto.locationCode,
                    lastScannedAt: new Date()
                });
                product = await newProduct.save();
            }

            if (!product) {
                throw new NotFoundException('Product not found');
            }

            await this.scanLogModel.create({
                productId: product.id,
                warehouseId: scanDto.warehouseId,
                clientId,
                quantity: scanDto.quantity,
                locationCode: scanDto.locationCode,
                action: isNewProduct ? 'create' : 'update'
            });

            await session.commitTransaction();
            return product;
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }
}