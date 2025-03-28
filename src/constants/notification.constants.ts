// src/constants/notification.constants.ts

/**
 * Define notification types available in the system
 * Based on PHP implementation
 */
export const NOTIFICATION_TYPES = {
    // Notification types based on purpose/content
    CART_REMINDER: 'cart_reminder',
    BIRTHDAY: 'birthday',
    UNVERIFIED_USER: 'unverified_user',
};

/**
 * Define notification delivery methods/jobs
 * These correspond to the PHP job classes
 */
export const NOTIFICATION_DELIVERY_METHODS = {
    GENERAL_NOTIFICATION: 'general_notification',
    BIRTHDAY_NOTIFICATION: 'birthday_notification',
};

/**
 * Map notification types to their delivery methods
 * Based on the PHP implementation
 */
export const NOTIFICATION_TYPE_TO_DELIVERY_METHOD = {
    [NOTIFICATION_TYPES.CART_REMINDER]: NOTIFICATION_DELIVERY_METHODS.GENERAL_NOTIFICATION,
    [NOTIFICATION_TYPES.BIRTHDAY]: NOTIFICATION_DELIVERY_METHODS.BIRTHDAY_NOTIFICATION,
    [NOTIFICATION_TYPES.UNVERIFIED_USER]: NOTIFICATION_DELIVERY_METHODS.GENERAL_NOTIFICATION,
};