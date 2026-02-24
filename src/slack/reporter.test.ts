import { describe, it, expect } from 'vitest';
import { isEightAmInTimezone, formatSlackMessage } from './reporter';

describe('isEightAmInTimezone', () => {
  it('returns true when local hour is 8', () => {
    // Create a Date that is 8am UTC
    const eightAmUtc = new Date('2026-02-24T08:00:00.000Z');
    expect(isEightAmInTimezone('UTC', eightAmUtc)).toBe(true);
  });

  it('returns false when local hour is not 8', () => {
    const nineAmUtc = new Date('2026-02-24T09:00:00.000Z');
    expect(isEightAmInTimezone('UTC', nineAmUtc)).toBe(false);
  });

  it('accounts for timezone offset (America/New_York UTC-5 in winter)', () => {
    // 13:00 UTC = 08:00 EST (UTC-5)
    const onepmUtc = new Date('2026-02-24T13:00:00.000Z');
    expect(isEightAmInTimezone('America/New_York', onepmUtc)).toBe(true);
    expect(isEightAmInTimezone('UTC', onepmUtc)).toBe(false);
  });

  it('returns false for invalid timezone', () => {
    const now = new Date();
    expect(isEightAmInTimezone('Not/ATimezone', now)).toBe(false);
  });
});

describe('formatSlackMessage', () => {
  it('formats a message with all stats', () => {
    const msg = formatSlackMessage({ totalCost: 2.47, activeUsers: 12, blockedEvents: 3 }, 'Feb 24, 2026');
    expect(msg).toContain('$2.47');
    expect(msg).toContain('12');
    expect(msg).toContain('3');
    expect(msg).toContain('Feb 24, 2026');
  });

  it('shows <$0.01 for very small costs', () => {
    const msg = formatSlackMessage({ totalCost: 0.001, activeUsers: 1, blockedEvents: 0 }, 'Feb 24, 2026');
    expect(msg).toContain('<$0.01');
  });

  it('shows $0.00 for zero cost', () => {
    const msg = formatSlackMessage({ totalCost: 0, activeUsers: 0, blockedEvents: 0 }, 'Feb 24, 2026');
    expect(msg).toContain('$0.00');
  });
});
