/** Returns the English greeting for the supplied local hour. */
export function greetingByHour(hour: number): string {
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

/** Returns the greeting for the visitor's current local time. */
export function currentGreeting(): string {
    return greetingByHour(new Date().getHours());
}
