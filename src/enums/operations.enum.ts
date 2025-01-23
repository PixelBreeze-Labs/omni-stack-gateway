export enum OperationType {
    PURCHASE = 'PURCHASE',
    SALE = 'SALE',
    TRANSFER = 'TRANSFER',
    ADJUSTMENT = 'ADJUSTMENT',
    RETURN = 'RETURN',
    COUNT = 'COUNT'
}

export enum OperationStatus {
    DRAFT = 'DRAFT',
    PENDING = 'PENDING',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED'
}