import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { MINUTES_PER_DAY } from '../core/constants';
import { locale, t } from '../i18n';
import { formatDuration, formatMinuteOfDay } from './format';
import { Icon } from './primitives';
import { Text } from './Text';
import {
  cleanDigits,
  durationFromParts,
  durationToParts,
  fromTimeParts,
  toTimeParts,
  type TimeParts,
} from './timeParts';
import { color, font, radius, space } from './theme';

const STEP_MIN = 15;

type TextInputRef = React.ComponentRef<typeof TextInput>;

/**
 * A time of day with both ways to set it:
 *  - ‹ › buttons move it 15 minutes,
 *  - tapping the time lets you type any exact time (hours and minutes).
 * Valid typed values apply immediately; `onInvalid` lets the screen block saving.
 */
export function TimeField({
  value,
  onChange,
  label,
  testID,
  onInvalid,
}: {
  value: number;
  onChange: (minuteOfDay: number) => void;
  label: string;
  testID: string;
  onInvalid?: (bad: boolean) => void;
}) {
  const h24 = locale.uses24h;
  const [editing, setEditing] = useState(false);
  const [parts, setParts] = useState<TimeParts>(() => toTimeParts(value, h24));
  const [bad, setBad] = useState(false);
  const minuteRef = useRef<TextInputRef>(null);
  const emitted = useRef(value);

  // Value changed from outside (‹ › buttons, a template): show it in the fields.
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setParts(toTimeParts(value, h24));
      setBad(false);
      onInvalid?.(false);
    }
  }, [value, h24, onInvalid]);

  const update = (next: TimeParts) => {
    setParts(next);
    const v = fromTimeParts(next.h, next.m, next.pm, h24);
    setBad(v === null);
    onInvalid?.(v === null);
    if (v !== null && v !== value) {
      emitted.current = v;
      onChange(v);
    }
  };

  const shift = (delta: number) => onChange((value + delta + MINUTES_PER_DAY) % MINUTES_PER_DAY);
  const open = () => {
    setParts(toTimeParts(value, h24));
    setBad(false);
    setEditing(true);
  };
  const close = () => {
    if (bad) return;
    setEditing(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.row}>
        {editing ? (
          <View style={styles.editRow}>
            <NumberBox
              value={parts.h}
              onChange={(s) => {
                const h = cleanDigits(s);
                update({ ...parts, h });
                if (h.length === 2) minuteRef.current?.focus();
              }}
              label={`${label}, ${t('hour')}`}
              bad={bad}
              autoFocus
              testID={`${testID}-hour`}
            />
            <Text style={styles.colon}>:</Text>
            <NumberBox
              ref={minuteRef}
              value={parts.m}
              onChange={(s) => update({ ...parts, m: cleanDigits(s) })}
              label={`${label}, ${t('minute')}`}
              bad={bad}
              onSubmit={close}
              testID={`${testID}-minute`}
            />
            {!h24 ? (
              <Pressable
                onPress={() => update({ ...parts, pm: !parts.pm })}
                accessibilityRole="button"
                accessibilityLabel={t('toggle_ampm')}
                accessibilityValue={{ text: t(parts.pm ? 'pm' : 'am') }}
                style={styles.ampm}
                testID={`${testID}-ampm`}
              >
                <Text variant="label">{t(parts.pm ? 'pm' : 'am')}</Text>
              </Pressable>
            ) : null}
            <DoneButton onPress={close} disabled={bad} testID={`${testID}-done`} />
          </View>
        ) : (
          <>
            <StepButton icon="chevron-left" label={t('earlier', { label })} onPress={() => shift(-STEP_MIN)} testID={`${testID}-minus`} />
            <Pressable
              onPress={open}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${formatMinuteOfDay(value)}`}
              accessibilityHint={t('type_time_hint')}
              style={styles.display}
              testID={`${testID}-edit`}
            >
              <Text style={styles.timeValue} testID={`${testID}-value`}>
                {formatMinuteOfDay(value)}
              </Text>
              <Icon name="edit-2" size={13} tint={color.slate} />
            </Pressable>
            <StepButton icon="chevron-right" label={t('later', { label })} onPress={() => shift(STEP_MIN)} testID={`${testID}-plus`} />
          </>
        )}
      </View>
      {editing && bad ? (
        <Text variant="caption" tone="alert" style={styles.error} testID={`${testID}-error`}>
          {t('invalid_time')}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A focus length typed as hours and minutes, within [min, max].
 * The surrounding screen keeps its own 15-minute − / + buttons and presets.
 */
export function DurationField({
  value,
  onChange,
  min,
  max,
  testID,
  onInvalid,
}: {
  value: number;
  onChange: (ms: number) => void;
  min: number;
  max: number;
  testID: string;
  onInvalid?: (bad: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [parts, setParts] = useState(() => durationToParts(value));
  const [bad, setBad] = useState(false);
  const minuteRef = useRef<TextInputRef>(null);
  const emitted = useRef(value);

  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setParts(durationToParts(value));
      setBad(false);
      onInvalid?.(false);
    }
  }, [value, onInvalid]);

  const update = (next: { h: string; m: string }) => {
    setParts(next);
    const ms = durationFromParts(next.h, next.m);
    const ok = ms !== null && ms >= min && ms <= max;
    setBad(!ok);
    onInvalid?.(!ok);
    if (ok && ms !== value) {
      emitted.current = ms;
      onChange(ms);
    }
  };

  const open = () => {
    setParts(durationToParts(value));
    setBad(false);
    setEditing(true);
  };
  const close = () => {
    if (!bad) setEditing(false);
  };

  if (!editing) {
    return (
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={formatDuration(value)}
        accessibilityHint={t('type_duration_hint')}
        style={styles.durationDisplay}
        testID={`${testID}-edit`}
      >
        <Text variant="title" testID={`${testID}-value`}>
          {formatDuration(value)}
        </Text>
        <Icon name="edit-2" size={14} tint={color.slate} />
      </Pressable>
    );
  }

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={styles.editRow}>
        <NumberBox
          value={parts.h}
          onChange={(s) => {
            const h = cleanDigits(s);
            update({ ...parts, h });
            if (h.length === 2) minuteRef.current?.focus();
          }}
          label={t('hours')}
          bad={bad}
          autoFocus
          testID={`${testID}-hours`}
        />
        <Text variant="label" tone="slate">
          {t('unit_h')}
        </Text>
        <NumberBox
          ref={minuteRef}
          value={parts.m}
          onChange={(s) => update({ ...parts, m: cleanDigits(s) })}
          label={t('minute')}
          bad={bad}
          onSubmit={close}
          testID={`${testID}-minutes`}
        />
        <Text variant="label" tone="slate">
          {t('unit_min')}
        </Text>
        <DoneButton onPress={close} disabled={bad} testID={`${testID}-done`} />
      </View>
      {bad ? (
        <Text variant="caption" tone="alert" style={styles.error} testID={`${testID}-error`}>
          {t('err_duration_range', { min: formatDuration(min), max: formatDuration(max) })}
        </Text>
      ) : null}
    </View>
  );
}

function NumberBox({
  ref,
  value,
  onChange,
  label,
  bad,
  autoFocus,
  onSubmit,
  testID,
}: {
  ref?: React.Ref<TextInputRef>;
  value: string;
  onChange: (s: string) => void;
  label: string;
  bad: boolean;
  autoFocus?: boolean;
  onSubmit?: () => void;
  testID: string;
}) {
  return (
    <TextInput
      ref={ref}
      value={value}
      onChangeText={onChange}
      keyboardType="number-pad"
      inputMode="numeric"
      maxLength={2}
      autoFocus={autoFocus}
      selectTextOnFocus
      returnKeyType="done"
      onSubmitEditing={onSubmit}
      accessibilityLabel={label}
      style={[styles.box, bad && styles.boxBad]}
      testID={testID}
    />
  );
}

function DoneButton({ onPress, disabled, testID }: { onPress: () => void; disabled: boolean; testID: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={t('done')}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={[styles.done, disabled && { opacity: 0.4 }]}
      testID={testID}
    >
      <Icon name="check" size={20} tint={color.onInk} />
    </Pressable>
  );
}

function StepButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: 'chevron-left' | 'chevron-right';
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.stepBtn}>
      <Icon name={icon} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 64 },
  display: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  durationDisplay: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  timeValue: { textAlign: 'center', fontFamily: font.displaySemi, fontSize: 22, color: color.ink },
  editRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  colon: { fontFamily: font.displaySemi, fontSize: 22, color: color.ink },
  box: {
    width: 52,
    height: 48,
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: color.ink,
    backgroundColor: color.surface,
    textAlign: 'center',
    fontFamily: font.displaySemi,
    fontSize: 22,
    color: color.ink,
    padding: 0,
  },
  boxBad: { borderColor: color.alert, backgroundColor: color.alertTint },
  ampm: {
    minWidth: 48,
    height: 44,
    paddingHorizontal: space.sm,
    borderRadius: radius.control,
    backgroundColor: color.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.mist,
  },
  error: { marginTop: space.xs, textAlign: 'center' },
});
