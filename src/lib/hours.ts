const DAY_ALIASES: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const TIME_RANGE =
  /(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*(?:-|TO)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/gi;

const parseTimeToMinutes = (value: string): number | null => {
  const match = value
    .trim()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);

  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const period = match[3].toUpperCase();

  if (hours < 1 || hours > 12 || minutes > 59) {
    return null;
  }

  if (period === 'AM' && hours === 12) {
    hours = 0;
  } else if (period === 'PM' && hours !== 12) {
    hours += 12;
  }

  return hours * 60 + minutes;
};

const getDaysFromExpression = (expression: string): number[] => {
  const normalized = expression
    .trim()
    .replace(/\b(?:every day|daily|all days)\b/gi, 'Sun-Sat')
    .replace(/\bweekdays?\b/gi, 'Mon-Fri')
    .replace(/\bweekends?\b/gi, 'Sat-Sun');
  const days = new Set<number>();

  for (const segment of normalized.split('/')) {
    const match = segment
      .trim()
      .match(/^([a-z]+)\s*(?:-\s*([a-z]+))?$/i);

    if (!match) {
      continue;
    }

    const start = DAY_ALIASES[match[1].toLowerCase()];
    const end = match[2]
      ? DAY_ALIASES[match[2].toLowerCase()]
      : start;

    if (start === undefined || end === undefined) {
      continue;
    }

    let day = start;

    while (true) {
      days.add(day);

      if (day === end) {
        break;
      }

      day = (day + 1) % 7;

      if (days.size >= 7) {
        break;
      }
    }
  }

  return [...days];
};

const getScheduleLines = (hoursText: string): string[] => {
  const lines = hoursText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const donationLines = lines
    .map((line) => line.match(/^\s*donations?\s*:\s*(.*)$/i)?.[1])
    .filter((line): line is string => line !== undefined);

  return donationLines.length > 0 ? donationLines : lines;
};

export const isLikelyOpenNow = (
  hoursText: string | undefined,
  now = new Date(),
): boolean => {
  if (!hoursText?.trim()) {
    return false;
  }

  const scheduleLines = getScheduleLines(hoursText);

  if (
    scheduleLines.some((line) =>
      /\b(?:open\s*)?24\s*(?:hours?|\/\s*7)\b|\b24\/7\b/i.test(line),
    )
  ) {
    return true;
  }

  const schedules = scheduleLines
    .flatMap((line) => line.split(','))
    .map((schedule) =>
      schedule
        .trim()
        .replace(/[–—−]/g, '-')
        .replace(/\s*&\s*/g, ' ')
        .replace(/^[a-z][a-z &/-]*:\s*/i, ''),
    )
    .filter(Boolean);
  const currentDay = now.getDay();
  const previousDay = (currentDay + 6) % 7;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const schedule of schedules) {
    const firstRange = TIME_RANGE.exec(schedule);
    TIME_RANGE.lastIndex = 0;

    if (!firstRange) {
      continue;
    }

    const days = getDaysFromExpression(
      schedule.slice(0, firstRange.index),
    );

    if (days.length === 0) {
      continue;
    }

    const ranges = [...schedule.matchAll(TIME_RANGE)];
    TIME_RANGE.lastIndex = 0;

    for (const range of ranges) {
      const openTime = parseTimeToMinutes(range[1]);
      const closeTime = parseTimeToMinutes(range[2]);

      if (openTime === null || closeTime === null) {
        continue;
      }

      if (closeTime > openTime) {
        if (
          days.includes(currentDay) &&
          currentMinutes >= openTime &&
          currentMinutes < closeTime
        ) {
          return true;
        }

        continue;
      }

      if (
        (days.includes(currentDay) &&
          currentMinutes >= openTime) ||
        (days.includes(previousDay) &&
          currentMinutes < closeTime)
      ) {
        return true;
      }
    }
  }

  return false;
};
