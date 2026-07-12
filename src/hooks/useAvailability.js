import { useMemo } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import { isWithinInterval, parse, addDays, isBefore } from 'date-fns';

export function useAvailability() {
  const { alwaysAvailable, startTime, endTime } = useSettingsStore();

  const isAvailable = useMemo(() => {
    if (alwaysAvailable) return true;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const start = parse(startTime, 'HH:mm', today);
    let end = parse(endTime, 'HH:mm', today);

    // If end time is before start time, it spans midnight
    if (isBefore(end, start)) {
      end = addDays(end, 1);
    }

    return isWithinInterval(now, { start, end });
  }, [alwaysAvailable, startTime, endTime]);

  return { isAvailable };
}
