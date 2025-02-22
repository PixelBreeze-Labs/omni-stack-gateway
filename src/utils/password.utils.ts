// src/utils/password.utils.ts
export function generateRandomPassword(length = 12): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';

    // Ensure at least one of each required character type
    password += getRandomChar('ABCDEFGHIJKLMNOPQRSTUVWXYZ'); // uppercase
    password += getRandomChar('abcdefghijklmnopqrstuvwxyz'); // lowercase
    password += getRandomChar('0123456789'); // number
    password += getRandomChar('!@#$%^&*'); // special char

    // Fill the rest with random characters
    for (let i = password.length; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        password += charset[randomIndex];
    }

    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
}

function getRandomChar(charset: string): string {
    const randomIndex = Math.floor(Math.random() * charset.length);
    return charset[randomIndex];
}