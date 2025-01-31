// src/decorators/get-client.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetClient = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        return request.client;
    },
);