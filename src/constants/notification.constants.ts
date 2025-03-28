// src/constants/notification.constants.ts

/**
 * Define all notification types available in the system
 * Based on PHP implementation
 */
export const NOTIFICATION_TYPES = {
    // Cart related notifications
    CART_REMINDER: 'cart_reminder',

    // User account notifications
    BIRTHDAY: 'birthday',
    UNVERIFIED_USER: 'unverified_user',
    USER_CATEGORY_CHANGE: 'user_category_change',

    // Location-based notifications
    NEAR_USER: 'general_near_user_notification',
    NEAR_VENDOR: 'general_near_vendor_notification',

    // Promotion notifications
    PROMOTION: 'general_notification',
    PROMOTION_REMINDER: 'promotion_reminder',
    COUPON: 'coupon_notification',
    DISCOUNT: 'discount_notification',

    // Earning/referral notifications
    EARN_INVITATION: 'general_earn_notification',

    // General notification types
    GENERAL: 'general_notification',
    CASHBACK: 'general_cashback_notification',
    SCHEDULED: 'scheduled_notification',

    // Specific scheduled notifications
    NO_ORDER_30_DAYS: '30_no_order_notification',

    // Order related notifications
    ORDER_STATUS_CHANGE: 'order_status_change',

    // Friend related notifications
    FRIEND_REQUEST: 'friend_request',
    FRIEND_ACCEPT: 'friend_accept',

    // Chat related notifications
    CHAT_MESSAGE: 'chat_message',

    // Wallet/balance related notifications
    BALANCE_TRANSFER: 'balance_transfer_success'
};

/**
 * Define notification jobs/delivery methods
 * These correspond to the PHP job classes
 */
export const NOTIFICATION_DELIVERY_METHODS = {
    GENERAL_NOTIFICATION: 'general_notification',
    BIRTHDAY_NOTIFICATION: 'birthday_notification',
    USER_CATEGORY_NOTIFICATION: 'user_category_notification',
    FRIEND_REQUEST_NOTIFICATION: 'friend_request_notification',
    FRIEND_ACCEPT_NOTIFICATION: 'friend_accept_notification',
    ORDER_NOTIFICATION: 'order_notification',
    CHAT_NOTIFICATION: 'chat_notification',
    EARN_INVITATION_NOTIFICATION: 'earn_invitation_notification',
    BALANCE_TRANSFER_SUCCESS_NOTIFICATION: 'balance_transfer_success_notification'
};

/**
 * Map notification types to their delivery methods
 * Based on the PHP implementation
 */
export const NOTIFICATION_TYPE_TO_DELIVERY_METHOD = {
    [NOTIFICATION_TYPES.CART_REMINDER]: NOTIFICATION_DELIVERY_METHODS.GENERAL_NOTIFICATION,
    [NOTIFICATION_TYPES.BIRTHDAY]: NOTIFICATION_DELIVERY_METHODS.BIRTHDAY_NOTIFICATION,
    [NOTIFICATION_TYPES.UNVERIFIED_USER]: NOTIFICATION_DELIVERY_METHODS.GENERAL_NOTIFICATION,
    [NOTIFICATION_TYPES.USER_CATEGORY_CHANGE]: NOTIFICATION_DELIVERY_METHODS.USER_CATEGORY_NOTIFICATION,
    [NOTIFICATION_TYPES.NEAR_USER]: NOTIFICATION_DELIVERY_METHODS.GENERAL_NOTIFICATION,
    [NOTIFICATION_TYPES.NEAR_VENDOR]: NOTIFICATION_DELIVERY_METHODS.GENERAL_NOTIFICATION,
    [NOTIFICATION_TYPES.PROMOTION]: NOTIFICATION_DELIVERY_METHODS.GENERAL_NOTIFICATION,
    [NOTIFICATION_TYPES.PROMOTION_REMINDER]: NOTIFICATION_DELIVERY_METHODS.GENERAL_NOTIFICATION,
    [NOTIFICATION_TYPES.EARN_INVITATION]: NOTIFICATION_DELIVERY_METHODS.EARN_INVITATION_NOTIFICATION,
    [NOTIFICATION_TYPES.GENERAL]: NOTIFICATION_DELIVERY_METHODS.GENERAL_NOTIFICATION,
    [NOTIFICATION_TYPES.CASHBACK]: NOTIFICATION_DELIVERY_METHODS.GENERAL_NOTIFICATION,
    [NOTIFICATION_TYPES.SCHEDULED]: NOTIFICATION_DELIVERY_METHODS.GENERAL_NOTIFICATION,
    [NOTIFICATION_TYPES.NO_ORDER_30_DAYS]: NOTIFICATION_DELIVERY_METHODS.GENERAL_NOTIFICATION,
    [NOTIFICATION_TYPES.ORDER_STATUS_CHANGE]: NOTIFICATION_DELIVERY_METHODS.ORDER_NOTIFICATION,
    [NOTIFICATION_TYPES.FRIEND_REQUEST]: NOTIFICATION_DELIVERY_METHODS.FRIEND_REQUEST_NOTIFICATION,
    [NOTIFICATION_TYPES.FRIEND_ACCEPT]: NOTIFICATION_DELIVERY_METHODS.FRIEND_ACCEPT_NOTIFICATION,
    [NOTIFICATION_TYPES.CHAT_MESSAGE]: NOTIFICATION_DELIVERY_METHODS.CHAT_NOTIFICATION,
    [NOTIFICATION_TYPES.BALANCE_TRANSFER]: NOTIFICATION_DELIVERY_METHODS.BALANCE_TRANSFER_SUCCESS_NOTIFICATION
};