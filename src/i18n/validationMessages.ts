import type { useTranslations } from 'next-intl';
import type { z } from 'zod';
import type { UiLocale } from './config';

type ValidationText = ReturnType<typeof useTranslations<'common'>>;

/** Per-parse messages preserve schema rules and avoid shared SSR locale state. */
export function createValidationErrorMap(
  translate: ValidationText,
  locale: UiLocale,
): z.core.$ZodErrorMap {
  let numbers: Intl.NumberFormat | undefined;
  const limit = (value: number | bigint) => {
    numbers ??= new Intl.NumberFormat(locale, { maximumFractionDigits: 20 });
    return numbers.format(value);
  };
  return (issue) => {
    switch (issue.code) {
      case 'invalid_type':
        return translate(
          issue.input === undefined || issue.input === null
            ? 'validationRequired'
            : 'validationInvalidValue',
        );
      case 'invalid_format':
        return translate(
          issue.format === 'email'
            ? 'validationEmail'
            : issue.format === 'url'
              ? 'validationUrl'
              : 'validationInvalidValue',
        );
      case 'too_small': {
        if (issue.origin === 'date') return translate('validationDateLater');
        if (issue.origin === 'file')
          return translate('validationFileMinimum', { limit: limit(issue.minimum) });
        if (typeof issue.minimum === 'number') {
          if (issue.origin === 'string')
            return translate(
              issue.exact ? 'validationExactCharacters' : 'validationMinCharacters',
              { count: issue.minimum },
            );
          if (issue.origin === 'array' || issue.origin === 'set')
            return translate(issue.exact ? 'validationExactItems' : 'validationMinItems', {
              count: issue.minimum,
            });
        }
        return translate(
          issue.inclusive === false ? 'validationGreaterThan' : 'validationMinimum',
          { limit: limit(issue.minimum) },
        );
      }
      case 'too_big': {
        if (issue.origin === 'date') return translate('validationDateEarlier');
        if (issue.origin === 'file')
          return translate('validationFileMaximum', { limit: limit(issue.maximum) });
        if (typeof issue.maximum === 'number') {
          if (issue.origin === 'string')
            return translate(
              issue.exact ? 'validationExactCharacters' : 'validationMaxCharacters',
              { count: issue.maximum },
            );
          if (issue.origin === 'array' || issue.origin === 'set')
            return translate(issue.exact ? 'validationExactItems' : 'validationMaxItems', {
              count: issue.maximum,
            });
        }
        return translate(issue.inclusive === false ? 'validationLessThan' : 'validationMaximum', {
          limit: limit(issue.maximum),
        });
      }
      case 'not_multiple_of':
        return translate('validationMultiple', { limit: limit(issue.divisor) });
      case 'invalid_value':
        return translate('validationOption');
      case 'unrecognized_keys':
        return translate('validationUnknownFields');
      default:
        return translate('validationInvalidValue');
    }
  };
}
