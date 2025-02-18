// src/decorators/snapfood.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IsSnapFood = () => SetMetadata('isSnapFood', true);