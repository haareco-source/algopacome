import { StyleSheet, Switch, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { WEEK_ORDER, WEEKDAYS, type WeekHours } from '@/lib/business';

type HoursEditorProps = {
  week: WeekHours;
  onChange: (week: WeekHours) => void;
};

// Un horario por día. Si cierra antes de abrir (19:00 a 01:00), se entiende que cierra pasada la medianoche.
export function HoursEditor({ week, onChange }: HoursEditorProps) {
  const theme = useTheme();

  function update(weekday: number, day: WeekHours[number]) {
    const next = [...week];
    next[weekday] = day;
    onChange(next);
  }

  // Al abrir un día nuevo se copia el último horario cargado, que suele repetirse.
  function lastHours() {
    const filled = WEEK_ORDER.map((weekday) => week[weekday]).filter(Boolean);
    return filled[filled.length - 1] ?? { opens_at: '19:00', closes_at: '23:30' };
  }

  return (
    <View style={styles.container}>
      {WEEK_ORDER.map((weekday) => {
        const day = week[weekday];
        return (
          <View key={weekday} style={[styles.row, { borderColor: theme.border }]}>
            <Switch
              value={!!day}
              onValueChange={(open) => update(weekday, open ? { ...lastHours() } : null)}
              trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
              thumbColor="#FFFFFF"
            />
            <ThemedText type="defaultBold" style={styles.day}>
              {WEEKDAYS[weekday].slice(0, 3)}
            </ThemedText>
            {day ? (
              <View style={styles.times}>
                <TimeInput value={day.opens_at} onChange={(opens_at) => update(weekday, { ...day, opens_at })} />
                <ThemedText themeColor="textSecondary">a</ThemedText>
                <TimeInput value={day.closes_at} onChange={(closes_at) => update(weekday, { ...day, closes_at })} />
              </View>
            ) : (
              <ThemedText themeColor="textSecondary" style={styles.times}>
                Cerrado
              </ThemedText>
            )}
          </View>
        );
      })}
    </View>
  );
}

function TimeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const theme = useTheme();

  // Agrega los dos puntos solo: "1930" queda "19:30".
  function handleChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 4);
    onChange(digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);
  }

  return (
    <TextInput
      value={value}
      onChangeText={handleChange}
      keyboardType="number-pad"
      maxLength={5}
      placeholder="19:00"
      placeholderTextColor={theme.textSecondary}
      style={[styles.time, { color: theme.text, borderColor: theme.border }]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderBottomWidth: 1,
    paddingVertical: Spacing.two,
  },
  day: {
    width: 44,
  },
  times: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    textAlign: 'right',
  },
  time: {
    width: 72,
    minHeight: 40,
    borderWidth: 1.5,
    borderRadius: Radius.card,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 600,
  },
});
