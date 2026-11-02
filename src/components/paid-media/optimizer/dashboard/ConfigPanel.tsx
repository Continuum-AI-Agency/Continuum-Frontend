'use client';

// The pilot config editor: goals and budget per month, the active offers and the Plan's
// actions. Validation is the contract's own schema (React Hook Form + Zod), and the save is
// a PUT of the whole config; a 403 or a server refusal is said in words, never swallowed.
// Rendered only for roles that may edit (useCanEditEasyfitConfig).

import {
  type EasyfitPilotConfig,
  easyfitOfertasConfigSchema,
  easyfitOfferClassSchema,
  easyfitPilotoConfigSchema,
  easyfitPlanItemSchema,
  easyfitPlanTagSchema,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useId } from 'react';
import { type FieldPath, type UseFormRegister, useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { isEasyfitForbidden } from '@/lib/api/easyfit.client';
import { formatMonth } from './dashboardFormat';
import { useDashboardCopy } from './i18n/useDashboardLocale';
import { Block } from './parts/layout';
import { useSaveEasyfitConfig } from './useEasyfitDashboardData';

const editableConfigSchema = z.object({
  meses: easyfitPilotoConfigSchema.shape.piloto.shape.meses,
  activas: easyfitOfertasConfigSchema.shape.activas,
  plan: z.array(easyfitPlanItemSchema),
});
type EditableConfig = z.infer<typeof editableConfigSchema>;
const PLAN_TAGS = easyfitPlanTagSchema.options;
const OFFER_CLASSES = easyfitOfferClassSchema.options;

const MONTH_FIELDS = [
  ['presupuesto', 'budget'],
  ['piso', 'floor'],
  ['objetivo', 'goal'],
  ['altas_meta_obj', 'metaGoal'],
  ['costo_alta_obj', 'costGoal'],
  ['costo_alta_meta_obj', 'metaCostGoal'],
] as const;

function editable(config: EasyfitPilotConfig): EditableConfig {
  return {
    meses: config.piloto.piloto.meses,
    activas: config.ofertas.activas,
    plan: config.plan,
  };
}

function merged(config: EasyfitPilotConfig, values: EditableConfig): EasyfitPilotConfig {
  return {
    ...config,
    piloto: { ...config.piloto, piloto: { ...config.piloto.piloto, meses: values.meses } },
    ofertas: { ...config.ofertas, activas: values.activas },
    plan: values.plan,
  };
}

function NumberField({
  label,
  name,
  register,
  invalid,
}: {
  label: string;
  name: FieldPath<EditableConfig>;
  register: UseFormRegister<EditableConfig>;
  invalid: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <Input
        aria-invalid={invalid}
        className="h-8 font-mono tabular-nums"
        id={id}
        inputMode="numeric"
        type="number"
        {...register(name, { valueAsNumber: true })}
      />
    </div>
  );
}

function TextField({
  label,
  name,
  register,
  invalid,
  multiline,
}: {
  label: string;
  name: FieldPath<EditableConfig>;
  register: UseFormRegister<EditableConfig>;
  invalid: boolean;
  multiline?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <Textarea aria-invalid={invalid} id={id} rows={2} {...register(name)} />
      ) : (
        <Input aria-invalid={invalid} className="h-8" id={id} {...register(name)} />
      )}
    </div>
  );
}

function SelectField({
  label,
  name,
  register,
  options,
}: {
  label: string;
  name: FieldPath<EditableConfig>;
  register: UseFormRegister<EditableConfig>;
  options: readonly { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <select
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
        id={id}
        {...register(name)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ConfigPanel({
  brandId,
  config,
  onClose,
}: {
  brandId: string;
  config: EasyfitPilotConfig;
  onClose: () => void;
}) {
  const { locale, t } = useDashboardCopy();
  const save = useSaveEasyfitConfig(brandId);
  const form = useForm<EditableConfig>({
    resolver: zodResolver(editableConfigSchema),
    defaultValues: editable(config),
  });
  const { register, formState } = form;
  const errors = formState.errors;
  const offers = useFieldArray({ control: form.control, name: 'activas' });
  const plan = useFieldArray({ control: form.control, name: 'plan' });
  const months = form.getValues('meses');

  const submit = form.handleSubmit((values) => {
    save.mutate(merged(config, values), { onSuccess: onClose });
  });

  const saveMessage = save.isError
    ? isEasyfitForbidden(save.error)
      ? t.config.forbidden
      : t.config.saveError
    : null;

  return (
    <Block subtitle={t.config.description} testId="easyfit-config-panel" title={t.config.title}>
      <form className="space-y-5" noValidate onSubmit={submit}>
        <fieldset className="space-y-3">
          {months.map((month, index) => (
            <fieldset className="space-y-2" key={month.mes}>
              <legend className="text-sm font-semibold">
                {formatMonth(month.mes, locale, { long: true, withYear: true })}
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {MONTH_FIELDS.map(([field, labelKey]) => (
                  <NumberField
                    invalid={Boolean(errors.meses?.[index]?.[field])}
                    key={field}
                    label={t.config[labelKey]}
                    name={`meses.${index}.${field}`}
                    register={register}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">{t.config.offersTitle}</legend>
          {offers.fields.map((field, index) => (
            <div
              className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_8rem_12rem_1fr_auto]"
              key={field.id}
            >
              <TextField
                invalid={Boolean(errors.activas?.[index]?.oferta)}
                label={t.config.offerName}
                name={`activas.${index}.oferta`}
                register={register}
              />
              <TextField
                invalid={Boolean(errors.activas?.[index]?.mes)}
                label={t.config.offerMonth}
                name={`activas.${index}.mes`}
                register={register}
              />
              <SelectField
                label={t.config.offerClass}
                name={`activas.${index}.clase`}
                options={OFFER_CLASSES.map((value) => ({
                  value,
                  label: t.ofertas.offerClass[value],
                }))}
                register={register}
              />
              <TextField
                invalid={Boolean(errors.activas?.[index]?.vigencia)}
                label={t.config.offerValidity}
                name={`activas.${index}.vigencia`}
                register={register}
              />
              <Button onClick={() => offers.remove(index)} size="sm" type="button" variant="ghost">
                {t.config.removeOffer}
              </Button>
            </div>
          ))}
          <Button
            onClick={() =>
              offers.append({
                mes: months[0]?.mes ?? '',
                oferta: '',
                clase: 'daypass_dias_gratis',
                vigencia: '',
                copies: [],
              })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            {t.config.addOffer}
          </Button>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">{t.config.planTitle}</legend>
          {plan.fields.map((field, index) => (
            <div
              className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_2fr_10rem_auto]"
              key={field.id}
            >
              <TextField
                invalid={Boolean(errors.plan?.[index]?.titulo)}
                label={t.config.planTitleField}
                name={`plan.${index}.titulo`}
                register={register}
              />
              <TextField
                invalid={Boolean(errors.plan?.[index]?.cuerpo)}
                label={t.config.planBody}
                multiline
                name={`plan.${index}.cuerpo`}
                register={register}
              />
              <SelectField
                label={t.config.planCategory}
                name={`plan.${index}.etiqueta`}
                options={PLAN_TAGS.map((value) => ({
                  value,
                  label: t.plan.category[value],
                }))}
                register={register}
              />
              <Button onClick={() => plan.remove(index)} size="sm" type="button" variant="ghost">
                {t.config.removeAction}
              </Button>
            </div>
          ))}
          <Button
            onClick={() => plan.append({ titulo: '', cuerpo: '', etiqueta: PLAN_TAGS[0] })}
            size="sm"
            type="button"
            variant="outline"
          >
            {t.config.addAction}
          </Button>
        </fieldset>

        {Object.keys(errors).length > 0 ? (
          <p className="text-xs text-destructive" role="alert">
            {t.config.invalid}
          </p>
        ) : null}
        {saveMessage ? (
          <p className="text-xs text-destructive" role="alert">
            {saveMessage}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            {t.config.cancel}
          </Button>
          <Button disabled={save.isPending} size="sm" type="submit">
            {save.isPending ? t.config.saving : t.config.save}
          </Button>
        </div>
      </form>
    </Block>
  );
}
