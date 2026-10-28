import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ALL_DAYS, MAX_SCHEDULE_NAME, MINUTES_PER_DAY, WEEKDAYS } from '../../core/constants';
import { newId, realEnv } from '../../core/env';
import { minutesUntilEnd, validateSchedule, windowLength } from '../../core/schedule';
import type { Schedule } from '../../core/types';
import { useController, useUnscroll } from '../../state/provider';
import { Button } from '../../ui/Button';
import { DAY_LETTERS, DAY_NAMES, formatDuration, formatMinuteOfDay, formatUntil } from '../../ui/format';
import { Chip, Icon, Notice, Screen } from '../../ui/primitives';
import { Text } from '../../ui/Text';
import { color, font, radius, space } from '../../ui/theme';

const STEP = 15;

export default function ScheduleEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, now } = useUnscroll();
  const ctrl = useController();
  const existing = state.policy.schedules.find((s) => s.id === id);
  const isNew = id === 'new' || !existing;
  const initial: Schedule = useMemo(
    () => existing ?? { id: newId(), name: 'Study block', days: WEEKDAYS, startMin: 9 * 60, endMin: 13 * 60 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );
  const [draft, setDraft] = useState<Schedule>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const running = !isNew && existing ? minutesUntilEnd(existing, realEnv.toLocal(now)) >= 0 : false;
  const pending = existing ? state.pending.find((p) => p.scheduleId === existing.id) : undefined;
  const validation = validateSchedule(draft);

  const save = async () => {
    setError(null);
    if (!validation.ok) return setError(validation.reason);
    setBusy(true);
    const r = isNew ? await ctrl.addSchedule(draft) : await ctrl.updateSchedule(draft);
    setBusy(false);
    if (!r.ok) {
      setError(
        r.error === 'locked'
          ? 'This schedule is running. You can loosen it after it ends.'
          : r.error === 'too-many'
            ? 'You can have up to 20 schedules.'
            : 'Check the days and times, then try again.',
      );
      return;
    }
    router.back();
  };

  const remove = async () => {
    if (!existing) return;
    setBusy(true);
    const r = await ctrl.deleteSchedule(existing.id);
    setBusy(false);
    if (!r.ok) setError(r.error === 'locked' ? 'This schedule is running. Remove it after it ends.' : 'Could not remove it.');
    else router.back();
  };

  const toggleDay = (d: number) => setDraft((s) => ({ ...s, days: s.days ^ (1 << d) }));
  const len = windowLength(draft);

  return (
    <Screen
      edges={['top', 'bottom']}
      testID="screen-schedule"
      footer={
        <Button
          label={isNew ? 'Add schedule' : 'Save changes'}
          onPress={save}
          busy={busy}
          disabled={!validation.ok}
          testID="save-schedule"
        />
      }
    >
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
          <Icon name="x" size={24} />
        </Pressable>
      </View>
      <Text variant="title" accessibilityRole="header">
        {isNew ? 'New schedule' : 'Edit schedule'}
      </Text>

      {running ? (
        <View style={{ marginTop: space.lg }}>
          <Notice
            tone="pending"
            icon="lock"
            title="This schedule is running"
            body="You can add time now. Anything that shortens it can be set after it ends."
            testID="schedule-running"
          />
        </View>
      ) : null}
      {pending ? (
        <View style={{ marginTop: space.lg }}>
          <Notice
            tone="pending"
            icon="clock"
            title={pending.kind === 'schedule-delete' ? 'Removal is waiting' : 'A change is waiting'}
            body={`Takes effect ${formatUntil(pending.effectiveAt, now)}. Cancel it in Settings.`}
          />
        </View>
      ) : null}

      <Text variant="label" tone="slate" style={styles.label} nativeID="name-label">
        Name
      </Text>
      <TextInput
        testID="schedule-name"
        accessibilityLabelledBy="name-label"
        accessibilityLabel="Schedule name"
        value={draft.name}
        maxLength={MAX_SCHEDULE_NAME}
        onChangeText={(name) => setDraft((s) => ({ ...s, name }))}
        style={styles.input}
        placeholder="Study block"
        placeholderTextColor={color.slate}
        autoCorrect={false}
      />

      <Text variant="label" tone="slate" style={styles.label}>
        Days
      </Text>
      <View style={styles.days}>
        {DAY_LETTERS.map((l, d) => {
          const on = ((draft.days >> d) & 1) === 1;
          return (
            <Pressable
              key={d}
              testID={`day-${d}`}
              onPress={() => toggleDay(d)}
              accessibilityRole="checkbox"
              accessibilityLabel={DAY_NAMES[d]}
              accessibilityState={{ checked: on }}
              aria-checked={on}
              style={[styles.day, on && styles.dayOn]}
            >
              <Text variant="bodyStrong" style={{ color: on ? color.onInk : color.ink }}>
                {l}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
        <Chip label="Weekdays" selected={draft.days === WEEKDAYS} onPress={() => setDraft((s) => ({ ...s, days: WEEKDAYS }))} />
        <Chip label="Every day" selected={draft.days === ALL_DAYS} onPress={() => setDraft((s) => ({ ...s, days: ALL_DAYS }))} />
      </View>

      <Text variant="label" tone="slate" style={styles.label}>
        Hours
      </Text>
      <View style={styles.timeGroup}>
        <TimeRow label="Starts" value={draft.startMin} onChange={(startMin) => setDraft((s) => ({ ...s, startMin }))} testID="start" />
        <View style={styles.hair} />
        <TimeRow label="Ends" value={draft.endMin} onChange={(endMin) => setDraft((s) => ({ ...s, endMin }))} testID="end" />
      </View>
      <Text variant="caption" tone="slate" style={{ marginTop: space.sm, marginLeft: space.xs }} testID="schedule-summary">
        {validation.ok
          ? `${formatDuration(len * 60_000)} of focus${draft.endMin <= draft.startMin ? ', ending the next morning' : ''}.`
          : validation.reason}
      </Text>

      {error ? (
        <View style={{ marginTop: space.lg }}>
          <Notice tone="alert" icon="x-circle" title={error} testID="schedule-error" />
        </View>
      ) : null}

      {!isNew && !pending ? (
        <View style={{ marginTop: space.xxl }}>
          <Button
            kind="secondary"
            label="Remove schedule"
            onPress={remove}
            disabled={running || busy}
            testID="remove-schedule"
            accessibilityHint="Removal takes effect after 24 hours"
          />
          <Text variant="caption" tone="slate" style={{ marginTop: space.sm, textAlign: 'center' }}>
            Removing a schedule takes effect after 24 hours.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

function TimeRow({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  testID: string;
}) {
  const shift = (delta: number) => onChange((value + delta + MINUTES_PER_DAY) % MINUTES_PER_DAY);
  return (
    <View style={styles.timeRow}>
      <Text variant="bodyStrong" style={{ width: 64 }}>
        {label}
      </Text>
      <Pressable
        testID={`${testID}-minus`}
        accessibilityRole="button"
        accessibilityLabel={`${label} 15 minutes earlier`}
        onPress={() => shift(-STEP)}
        style={styles.timeBtn}
      >
        <Icon name="chevron-left" />
      </Pressable>
      <Text style={styles.timeValue} testID={`${testID}-value`} accessibilityLabel={`${label} ${formatMinuteOfDay(value)}`}>
        {formatMinuteOfDay(value)}
      </Text>
      <Pressable
        testID={`${testID}-plus`}
        accessibilityRole="button"
        accessibilityLabel={`${label} 15 minutes later`}
        onPress={() => shift(STEP)}
        style={styles.timeBtn}
      >
        <Icon name="chevron-right" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: space.lg, paddingBottom: space.xl, alignItems: 'flex-start' },
  label: { marginTop: space.xl, marginBottom: space.sm, marginLeft: space.xs },
  input: {
    backgroundColor: color.surface,
    borderRadius: radius.control,
    paddingHorizontal: space.lg,
    minHeight: 52,
    fontFamily: font.body,
    fontSize: 16,
    color: color.ink,
  },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOn: { backgroundColor: color.ink, borderColor: color.ink },
  timeGroup: { backgroundColor: color.surface, borderRadius: radius.group, paddingHorizontal: space.lg },
  hair: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  timeRow: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: space.sm },
  timeBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.mist,
  },
  timeValue: { flex: 1, textAlign: 'center', fontFamily: font.displaySemi, fontSize: 22, color: color.ink },
});
