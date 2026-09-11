import { describe, expect, it } from 'vitest';
import { greetingByHour } from './greeting.utils';

describe('greetingByHour', () => {
    it('uses the morning greeting before noon', () => {
        expect(greetingByHour(11)).toBe('Good morning');
    });

    it('uses the afternoon greeting from noon', () => {
        expect(greetingByHour(12)).toBe('Good afternoon');
        expect(greetingByHour(17)).toBe('Good afternoon');
    });

    it('uses the evening greeting from 18:00', () => {
        expect(greetingByHour(18)).toBe('Good evening');
    });
});
