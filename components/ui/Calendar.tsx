import React, { useEffect, useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isBefore,
  isSameDay,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";
import { Text } from "./Text";
import { color, radius, space, opacity, borderWidth } from "@/theme";

export interface CalendarProps {
  /** Currently selected day, or null. */
  value: Date | null;
  onChange: (date: Date) => void;
  /**
   * Days before this are not selectable. Omit for no floor at all — an edit
   * screen needs to reach dates in the past to correct an event that already
   * happened, and this grid is the only date input on that form.
   */
  minDate?: Date;
}

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * Design-system month grid. Custom rather than a native date picker because
 * the app runs on iOS, Android, and web, and a native control renders
 * inconsistently across those — this one behaves identically everywhere.
 * All date maths goes through date-fns; nothing here hand-rolls calendar
 * arithmetic.
 */
export function Calendar({ value, onChange, minDate }: CalendarProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(value ?? minDate ?? new Date()));

  // A selection made outside the grid (a quick-pick chip, or a prefilled
  // edit) should still bring the right month into view. Navigating with the
  // prev/next arrows never touches `value`, so it can't fight this effect.
  useEffect(() => {
    if (value) setVisibleMonth(startOfMonth(value));
  }, [value ? value.getTime() : null]);

  const floor = minDate ? startOfDay(minDate) : null;
  const monthStart = startOfMonth(visibleMonth);
  const monthEnd = endOfMonth(visibleMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = getDay(monthStart);
  const trailingBlanks = (7 - ((leadingBlanks + days.length) % 7)) % 7;

  return (
    <View>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => setVisibleMonth((m) => subMonths(m, 1))}
          hitSlop={8}
          style={styles.navButton}
        >
          <Ionicons name="chevron-back" size={20} color={color.icon.default} />
        </Pressable>
        <Text role="h2">{format(visibleMonth, "MMMM yyyy")}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => setVisibleMonth((m) => addMonths(m, 1))}
          hitSlop={8}
          style={styles.navButton}
        >
          <Ionicons name="chevron-forward" size={20} color={color.icon.default} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <View key={i} style={styles.cell}>
            <Text role="caption" tone="tertiary">
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <View key={`lead-${i}`} style={styles.cell} />
        ))}
        {days.map((day) => {
          const selected = !!value && isSameDay(day, value);
          const isToday = isSameDay(day, new Date());
          const disabled = !!floor && isBefore(startOfDay(day), floor);
          return (
            <View key={day.toISOString()} style={styles.cell}>
              <Pressable
                testID="calendar-day"
                accessibilityRole="button"
                accessibilityLabel={format(day, "EEEE, MMMM d, yyyy")}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => onChange(day)}
                style={[
                  styles.day,
                  selected && styles.daySelected,
                  isToday && !selected && styles.dayToday,
                  disabled && styles.dayDisabled,
                ]}
              >
                <Text role="body" tone={selected ? "inverse" : "primary"}>
                  {format(day, "d")}
                </Text>
              </Pressable>
            </View>
          );
        })}
        {Array.from({ length: trailingBlanks }, (_, i) => (
          <View key={`trail-${i}`} style={styles.cell} />
        ))}
      </View>
    </View>
  );
}

const CELL_SIZE = space[9];

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navButton: { padding: space[2] },
  weekRow: { flexDirection: "row", flexWrap: "wrap" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, alignItems: "center", justifyContent: "center", paddingVertical: space[1] },
  day: {
    width: "100%",
    maxWidth: CELL_SIZE,
    aspectRatio: 1,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  daySelected: { backgroundColor: color.bg.brand },
  dayToday: { borderWidth: borderWidth.thin, borderColor: color.border.brand },
  dayDisabled: { opacity: opacity.disabled },
});
