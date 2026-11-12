import { alternativeIndex, type WeekHeadline } from '../core/insights';
import type { ScheduleInvalid } from '../core/schedule';
import { MAX_SCHEDULE_NAME } from '../core/constants';
import type { TemplateKey } from '../core/templates';
import type { Surface } from '../core/types';
import { t, tn, type Messages } from '../i18n';

/** Translated text for values the core layer returns as codes. */

export const surfaceName = (s: Surface): string => t(`surface_${s}` as keyof Messages);
export const surfaceShort = (s: Surface): string => t(`short_${s}` as keyof Messages);
export const surfaceDetail = (s: Surface): string => t(`surf_detail_${s}` as keyof Messages);

export const templateName = (k: TemplateKey): string => t(`tpl_${k}_name` as keyof Messages);
export const templateWhy = (k: TemplateKey): string => t(`tpl_${k}_why` as keyof Messages);

export const alternativeText = (seed: number): string => t(`alt_${alternativeIndex(seed)}` as keyof Messages);

export function headlineText(h: WeekHeadline): string {
  switch (h.kind) {
    case 'empty':
      return t('week_empty');
    case 'better':
      return tn('week_better', h.days);
    case 'most':
      return t('week_most', { n: h.days });
    case 'some':
      return tn('week_some', h.days);
    case 'caught':
      return t('week_caught');
  }
}

export function validationText(code: ScheduleInvalid): string {
  switch (code) {
    case 'name':
      return t('invalid_name', { n: MAX_SCHEDULE_NAME });
    case 'days':
      return t('invalid_days');
    case 'same':
      return t('invalid_same');
    case 'short':
      return t('invalid_short');
    default:
      return t('invalid_other');
  }
}
