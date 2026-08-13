import { DayOfWeek } from '../../../generated/prisma/client';

const BUSINESS_TIME_ZONE = 'Europe/Istanbul';

const dayOfWeekByUtcDay: Record<number, DayOfWeek> = {
  0: DayOfWeek.SUNDAY,
  1: DayOfWeek.MONDAY,
  2: DayOfWeek.TUESDAY,
  3: DayOfWeek.WEDNESDAY,
  4: DayOfWeek.THURSDAY,
  5: DayOfWeek.FRIDAY,
  6: DayOfWeek.SATURDAY,
};

export interface BusinessDate {
  value: string;
  date: Date;
  dayOfWeek: DayOfWeek;
}

export function parseBusinessDate(value: string): BusinessDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    value,
    date,
    dayOfWeek: dayOfWeekByUtcDay[date.getUTCDay()],
  };
}

export function currentIstanbulBusinessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;

  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function businessDateValue(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function previousBusinessDate(date: BusinessDate): Date {
  return new Date(
    Date.UTC(
      date.date.getUTCFullYear(),
      date.date.getUTCMonth(),
      date.date.getUTCDate() - 1,
    ),
  );
}

export { BUSINESS_TIME_ZONE };
