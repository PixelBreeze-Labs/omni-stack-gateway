// src/tracking/dtos/campaign.dto.ts
export class CampaignParamsDto {
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    utmContent?: string;
    utmTerm?: string;
}

export class AddToCartEventDto {
    productId: string;
    quantity: number;
    price: number;
    currency: string;
    campaignParams: CampaignParamsDto;
}

export class PurchaseEventDto {
    orderId: string;
    total: number;
    currency: string;
    campaignParams: CampaignParamsDto;
}