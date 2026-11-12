import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ALL_DAYS, MAX_SCHEDULES, MAX_SCHEDULE_NAME, MINUTES_PER_DAY, WEEKDAYS } from '../../core/constants';
import { scheduleFromTemplate, templateByKey, TEMPLATES } from '../../core/templates';
import { newId, realEnv } from '../../core/env';
import { minutesUntilEnd, validateSchedule, windowLength } from '../../core/schedule';
import type { Schedule } from '../../core/types';
import { useController, useUnscroll } from '../../state/provider';
import { Button } from '../../ui/Button';
import { t } from '../../i18n';
import { templateName, templateWhy, validationText } from '../../ui/copy';
import { dayLetters, dayNames, formatDuration, formatMinuteOfDay, formatUntil } from '../../ui/format';
import { Chip, Icon, Notice, Screen } from '../../ui/primitives';
import { Text } from '../../ui/Text';
import { color, font, radius, space } from '../../ui/theme';

const STEP = 15;

export default function ScheduleEditor() {
  const { id, template } = useLocalSearchParams<{ id: string; template?: string }>();
  const { state, now } = useUnscroll();
  const ctrl = useController();
  const existing = state.policy.schedules.find((s) => s.id === id);
  const isNew = id === 'new' || !existing;
  const initial: Schedule = useMemo(
    () => {
      if (existing) return existing;
      const tpl = templateByKey(template) ?? TEMPLATES[2];
      return scheduleFromTemplate(tpl, newId(), templateName(tpl.key));
    },
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
    if (!validation.ok) return setError(validationText(validation.code));
    setBusy(true);
    const r = isNew ? await ctrl.addSchedule(draft) : await ctrl.updateSchedule(draft);
    setBusy(false);
    if (!r.ok) {
      setError(
        r.error === 'locked'
          ? t('err_running_loosen')
          : r.error === 'too-many'
            ? t('err_too_many', { n: MAX_SCHEDULES })
            : t('err_check'),
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
    if (!r.ok) setError(r.error === 'locked' ? t('err_running_remove') : t('err_remove'));
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
          label={isNew ? t('add_schedule') : t('save_changes')}
          onPress={save}
          busy={busy}
          disabled={!validation.ok}
          testID="save-schedule"
        />
      }
    >
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('close')} hitSlop={12}>
          <Icon name="x" size={24} />
        </Pressable>
      </View>
      <Text variant="title" accessibilityRole="header">
        {isNew ? t('sched_new') : t('sched_edit')}
      </Text>

      {running ? (
        <View style={{ marginTop: space.lg }}>
          <Notice
            tone="pending"
            icon="lock"
            title={t('running_title')}
            body={t('running_body')}
            testID="schedule-running"
          />
        </View>
      ) : null}
      {pending ? (
        <View style={{ marginTop: space.lg }}>
          <Notice
            tone="pending"
            icon="clock"
            title={pending.kind === 'schedule-delete' ? t('pending_removal_title') : t('pending_change_title')}
            body={t('pending_body', { when: formatUntil(pending.effectiveAt, now) })}
          />
        </View>
      ) : null}

      {isNew ? (
        <>
          <Text variant="label" tone="slate" style={styles.label}>
            {t('start_from')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {TEMPLATES.map((tpl) => (
              <Chip
                key={tpl.key}
                label={templateName(tpl.key)}
                testID={`template-${tpl.key}`}
                selected={
                  draft.name === templateName(tpl.key) &&
                  draft.startMin === tpl.startMin &&
                  draft.endMin === tpl.endMin &&
                  draft.days === tpl.days
                }
                onPress={() => setDraft((s) => scheduleFromTemplate(tpl, s.id, templateName(tpl.key)))}
              />
            ))}
          </View>
          {(() => {
            const tpl = TEMPLATES.find((x) => templateName(x.key) === draft.name);
            return tpl ? (
              <Text variant="caption" tone="slate" style={{ marginTop: space.sm, marginLeft: space.xs }} testID="template-why">
                {templateWhy(tpl.key)}
              </Text>
            ) : null;
          })()}
        </>
      ) : null}

      <Text variant="label" tone="slate" style={styles.label} nativeID="name-label">
        {t('name')}
      </Text>
      <TextInput
        testID="schedule-name"
        accessibilityLabelledBy="name-label"
        accessibilityLabel={t('schedule_name')}
        value={draft.name}
        maxLength={MAX_SCHEDULE_NAME}
        onChangeText={(name) => setDraft((s) => ({ ...s, name }))}
        style={styles.input}
        placeholder={t('tpl_study_name')}
        placeholderTextColor={color.slate}
        autoCorrect={false}
      />

      <Text variant="label" tone="slate" style={styles.label}>
        {t('days')}
      </Text>
      <View style={styles.days}>
        {dayLetters().map((l, d) => {
          const on = ((draft.days >> d) & 1) === 1;
          return (
            <Pressable
              key={d}
              testID={`day-${d}`}
              onPress={() => toggleDay(d)}
              accessibilityRole="checkbox"
              accessibilityLabel={dayNames()[d]}
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
        <Chip label={t('days_weekdays')} selected={draft.days === WEEKDAYS} onPress={() => setDraft((s) => ({ ...s, days: WEEKDAYS }))} />
        <Chip label={t('days_every')} selected={draft.days === ALL_DAYS} onPress={() => setDraft((s) => ({ ...s, days: ALL_DAYS }))} />
      </View>

      <Text variant="label" tone="slate" style={styles.label}>
        {t('hours')}
      </Text>
      <View style={styles.timeGroup}>
        <TimeRow label={t('starts')} value={draft.startMin} onChange={(startMin) => setDraft((s) => ({ ...s, startMin }))} testID="start" />
        <View style={styles.hair} />
        <TimeRow label={t('ends')} value={draft.endMin} onChange={(endMin) => setDraft((s) => ({ ...s, endMin }))} testID="end" />
      </View>
      <Text variant="caption" tone="slate" style={{ marginTop: space.sm, marginLeft: space.xs }} testID="schedule-summary">
        {validation.ok
          ? t(draft.endMin <= draft.startMin ? 'summary_overnight' : 'summary', { d: formatDuration(len * 60_000) })
          : validationText(validation.code)}
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
            label={t('remove_schedule')}
            onPress={remove}
            disabled={running || busy}
            testID="remove-schedule"
            accessibilityHint={t('remove_hint')}
          />
          <Text variant="caption" tone="slate" style={{ marginTop: space.sm, textAlign: 'center' }}>
            {t('remove_note')}
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
        accessibilityLabel={t('earlier', { label })}
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
        accessibilityLabel={t('later', { label })}
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
