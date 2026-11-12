'use client';

import {
  type PresentationCommand,
  type PresentationDocument,
  type PresentationObject,
  presentationChartDataSchema,
  presentationCropSchema,
  presentationImageDataSchema,
  presentationTableDataSchema,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Unlock } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useValidationErrorMap } from '@/i18n/validation';
import { readPresentationImage } from './presentationImageFile';

const editSchema = z.object({
  text: z.string().max(100_000),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  rotation: z.number().finite(),
  fontFamily: z.string().max(200),
  fontSize: z.number().positive(),
  cropLeft: z.number().min(0).max(100),
  cropTop: z.number().min(0).max(100),
  cropRight: z.number().min(0).max(100),
  cropBottom: z.number().min(0).max(100),
  color: z.string().max(100),
  fill: z.string().max(100),
  bold: z.boolean(),
  italic: z.boolean(),
  cells: z.array(z.array(z.string())),
  chartType: z.enum(['bar', 'column', 'line', 'pie', 'area', 'scatter', 'doughnut']),
  categories: z.string(),
  series: z.array(z.object({ name: z.string(), values: z.string() })),
});
const fieldSchema = z.object({
  name: z.string().trim().min(1).max(200),
  property: z.string(),
  locked: z.boolean(),
  required: z.boolean(),
});

function objectFieldKind(
  object: PresentationObject,
): 'text' | 'image' | 'color' | 'table' | 'chart' {
  return ['text', 'image', 'table', 'chart'].includes(object.kind)
    ? (object.kind as 'text' | 'image' | 'table' | 'chart')
    : 'color';
}

export function PresentationInspector({
  document,
  slideId,
  object,
  busy,
  onCommands,
  onError,
  insideGroup = false,
}: {
  insideGroup?: boolean;
  document: PresentationDocument;
  slideId: string;
  object: PresentationObject;
  busy: boolean;
  onCommands: (commands: PresentationCommand[]) => Promise<boolean>;
  onError: (message: string) => void;
}) {
  const validationErrorMap = useValidationErrorMap();

  const translateUi = useUiTranslations('forge');

  const imageInput = useRef<HTMLInputElement>(null);
  const table = presentationTableDataSchema.safeParse(object.data);
  const chart = presentationChartDataSchema.safeParse(object.data);
  const image = presentationImageDataSchema.safeParse(object.data);
  const field = document.fields.find(
    (item) => item.slideId === slideId && item.objectId === object.id,
  );
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema, { error: validationErrorMap }),
    defaultValues: {
      text: object.text ?? '',
      ...object.bounds,
      cropLeft: image.success ? (image.data.crop?.left ?? 0) * 100 : 0,
      cropTop: image.success ? (image.data.crop?.top ?? 0) * 100 : 0,
      cropRight: image.success ? (image.data.crop?.right ?? 0) * 100 : 0,
      cropBottom: image.success ? (image.data.crop?.bottom ?? 0) * 100 : 0,
      fontFamily: object.style?.fontFamily ?? '',
      fontSize: object.style?.fontSize ?? 18,
      color: object.style?.color ?? '#111111',
      fill: object.style?.fill ?? '#ffffff',
      bold: object.style?.bold ?? false,
      italic: object.style?.italic ?? false,
      cells: table.success ? table.data.cells : [],
      chartType: chart.success ? chart.data.chartType : 'bar',
      categories: chart.success ? chart.data.categories.join(', ') : '',
      series: chart.success
        ? chart.data.series.map((item) => ({ name: item.name, values: item.values.join(', ') }))
        : [],
    },
  });
  const dirtyFields = form.formState.dirtyFields;
  const fields = useForm<z.infer<typeof fieldSchema>>({
    resolver: zodResolver(fieldSchema, { error: validationErrorMap }),
    defaultValues: {
      name: field?.name ?? object.name ?? '',
      property: field?.property ?? '',
      locked: field?.locked ?? false,
      required: field?.required ?? false,
    },
  });
  const target = { slideId, objectId: object.id };
  const locked = object.locked === true;
  const fieldLocked = (property: string) =>
    document.fields.some(
      (item) =>
        item.slideId === slideId &&
        item.objectId === object.id &&
        item.locked &&
        (!item.property || item.property === property),
    );
  const prefix = `object-${object.id}`;
  const editableText =
    object.kind === 'text' || (object.kind === 'shape' && object.text !== undefined);
  const update = form.handleSubmit(async (values) => {
    const commands: PresentationCommand[] = [];
    const bounds = {
      x: values.x,
      y: values.y,
      width: values.width,
      height: values.height,
      rotation: values.rotation,
    };
    if (JSON.stringify(bounds) !== JSON.stringify(object.bounds))
      commands.push({ type: 'object.transform', ...target, bounds });
    if (editableText && values.text !== (object.text ?? ''))
      commands.push({ type: 'object.text', ...target, text: values.text });
    const style: NonNullable<PresentationObject['style']> = {};
    if (editableText)
      for (const property of ['fontFamily', 'fontSize', 'color', 'bold', 'italic'] as const) {
        if (dirtyFields[property]) Object.assign(style, { [property]: values[property] });
      }
    if (object.kind === 'shape' && dirtyFields.fill) style.fill = values.fill;
    if (Object.keys(style).length) commands.push({ type: 'object.style', ...target, style });
    if (table.success && JSON.stringify(values.cells) !== JSON.stringify(table.data.cells))
      commands.push({
        type: 'table.data',
        ...target,
        data: { ...table.data, cells: values.cells },
      });
    if (chart.success) {
      const data = {
        chartType: values.chartType,
        categories: values.categories.split(',').map((value) => value.trim()),
        series: values.series.map((item) => ({
          name: item.name,
          values: item.values.split(',').map((value) => Number(value.trim())),
        })),
      };
      if (
        data.series.some(
          (series) =>
            series.values.length !== data.categories.length ||
            series.values.some((value) => !Number.isFinite(value)),
        )
      )
        return onError('Each chart series needs one numeric value for every category.');
      if (JSON.stringify(data) !== JSON.stringify(chart.data))
        commands.push({ type: 'chart.data', ...target, data });
    }
    if (
      image.success &&
      ['cropLeft', 'cropTop', 'cropRight', 'cropBottom'].some(
        (property) => dirtyFields[property as keyof typeof values],
      )
    ) {
      const crop = presentationCropSchema.safeParse({
        left: values.cropLeft / 100,
        top: values.cropTop / 100,
        right: values.cropRight / 100,
        bottom: values.cropBottom / 100,
      });
      if (!crop.success)
        return onError('The crop must keep some of the image visible. Reduce opposing margins.');
      commands.push({ type: 'object.crop', ...target, crop: crop.data });
    }
    if (commands.length) await onCommands(commands);
  });

  const replaceImage = async (file: File) => {
    try {
      const data = await readPresentationImage(file);
      await onCommands([{ type: 'object.image', ...target, data }]);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'The image could not be replaced.');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-medium">{object.name || object.kind}</h3>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void onCommands([{ type: 'lock.set', ...target, locked: !locked }])}
        >
          {locked ? <Unlock data-icon="inline-start" /> : <Lock data-icon="inline-start" />}
          {locked ? translateUi('unlock_4ac709aa') : translateUi('lock_db44b8db')}
        </Button>
      </div>
      {locked ? (
        <p className="text-xs text-muted-foreground">
          {' '}
          {translateUi('this_object_is_locked_unlock_it_to__adfc2184')}{' '}
        </p>
      ) : null}
      <form onSubmit={update}>
        <FieldGroup>
          {editableText ? (
            <Field>
              <FieldLabel htmlFor={`${prefix}-text`}>{translateUi('text_71988c4d')}</FieldLabel>
              <Textarea
                id={`${prefix}-text`}
                disabled={busy || locked || fieldLocked('text')}
                rows={4}
                {...form.register('text')}
              />
            </Field>
          ) : null}
          {object.kind === 'image' ? (
            <Field>
              <FieldLabel htmlFor={`${prefix}-image`}>{translateUi('image_1aa4cb0b')}</FieldLabel>
              <input
                id={`${prefix}-image`}
                ref={imageInput}
                className="sr-only"
                type="file"
                aria-label={translateUi('replacement_image_da1013f1')}
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                disabled={busy || locked || fieldLocked('data')}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void replaceImage(file);
                  event.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy || locked || fieldLocked('data')}
                onClick={() => imageInput.current?.click()}
              >
                {' '}
                {translateUi('replace_image_fcedcb5e')}{' '}
              </Button>
            </Field>
          ) : null}
          {image.success ? (
            <div className="grid grid-cols-2 gap-3">
              {(['cropLeft', 'cropTop', 'cropRight', 'cropBottom'] as const).map((name) => (
                <Field key={name}>
                  <FieldLabel htmlFor={`${prefix}-${name}`}>
                    {' '}
                    {translateUi('crop_98caf7c4')} {name.slice(4).toLowerCase()} (%)
                  </FieldLabel>
                  <Input
                    id={`${prefix}-${name}`}
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    disabled={busy || locked || fieldLocked('crop')}
                    {...form.register(name, { valueAsNumber: true })}
                  />
                </Field>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            {(['x', 'y', 'width', 'height', 'rotation'] as const).map((name) => (
              <Field key={name}>
                <FieldLabel htmlFor={`${prefix}-${name}`}>
                  {name === 'x'
                    ? insideGroup
                      ? translateUi('left_inside_group_f119801c')
                      : translateUi('left_58eb9032')
                    : name === 'y'
                      ? insideGroup
                        ? translateUi('top_inside_group_986442f0')
                        : translateUi('top_d5cdfcf7')
                      : name[0].toUpperCase() + name.slice(1)}
                </FieldLabel>
                <Input
                  id={`${prefix}-${name}`}
                  type="number"
                  step="any"
                  disabled={busy || locked || fieldLocked('bounds')}
                  {...form.register(name, { valueAsNumber: true })}
                />
                <FieldError errors={[form.formState.errors[name]]} />
              </Field>
            ))}
          </div>
          {editableText ? (
            <>
              <Field>
                <FieldLabel htmlFor={`${prefix}-font`}>
                  {translateUi('typeface_3a8c1076')}
                </FieldLabel>
                <Input
                  id={`${prefix}-font`}
                  disabled={busy || locked || fieldLocked('style') || fieldLocked('fontFamily')}
                  {...form.register('fontFamily')}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor={`${prefix}-font-size`}>
                    {translateUi('size_1af85190')}
                  </FieldLabel>
                  <Input
                    id={`${prefix}-font-size`}
                    type="number"
                    min="1"
                    step="any"
                    disabled={busy || locked || fieldLocked('style') || fieldLocked('fontSize')}
                    {...form.register('fontSize', { valueAsNumber: true })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-color`}>
                    {translateUi('color_6b73191a')}
                  </FieldLabel>
                  <Input
                    id={`${prefix}-color`}
                    disabled={busy || locked || fieldLocked('style') || fieldLocked('color')}
                    {...form.register('color')}
                  />
                </Field>
              </div>
              <div className="flex gap-4">
                {(['bold', 'italic'] as const).map((name) => (
                  <Field key={name} orientation="horizontal">
                    <Checkbox
                      id={`${prefix}-${name}`}
                      checked={form.watch(name)}
                      disabled={busy || locked || fieldLocked('style') || fieldLocked(name)}
                      onCheckedChange={(value) =>
                        form.setValue(name, value === true, { shouldDirty: true })
                      }
                    />
                    <FieldLabel htmlFor={`${prefix}-${name}`}>
                      {name[0].toUpperCase() + name.slice(1)}
                    </FieldLabel>
                  </Field>
                ))}
              </div>
            </>
          ) : null}
          {object.kind === 'shape' ? (
            <Field>
              <FieldLabel htmlFor={`${prefix}-fill`}>{translateUi('fill_033955d4')}</FieldLabel>
              <Input
                id={`${prefix}-fill`}
                disabled={busy || locked || fieldLocked('style') || fieldLocked('fill')}
                {...form.register('fill')}
              />
            </Field>
          ) : null}
          {table.success ? (
            <Field>
              <FieldLabel>{translateUi('table_cells_01402d6d')}</FieldLabel>
              <div className="overflow-auto">
                <table className="w-full border-collapse">
                  <tbody>
                    {table.data.cells.map((row, rowIndex) => (
                      <tr key={`row-${rowIndex}`}>
                        {row.map((_cell, columnIndex) => (
                          <td key={`cell-${columnIndex}`} className="p-0.5">
                            <Input
                              aria-label={translateUi('row_value0_column_value1_73d9b4a9', {
                                value0: String(rowIndex + 1),
                                value1: String(columnIndex + 1),
                              })}
                              disabled={busy || locked || fieldLocked('data')}
                              {...form.register(`cells.${rowIndex}.${columnIndex}`)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Field>
          ) : null}
          {chart.success ? (
            <>
              <Field>
                <FieldLabel htmlFor={`${prefix}-chart-type`}>
                  {translateUi('chart_type_30e43125')}
                </FieldLabel>
                <Select
                  value={form.watch('chartType')}
                  onValueChange={(value) => form.setValue('chartType', value)}
                  disabled={busy || locked || fieldLocked('data')}
                >
                  <SelectTrigger id={`${prefix}-chart-type`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(['bar', 'column', 'line', 'pie'] as const).map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {kind[0].toUpperCase() + kind.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${prefix}-categories`}>
                  {' '}
                  {translateUi('categories_separated_by_commas_f6b4ca54')}{' '}
                </FieldLabel>
                <Input
                  id={`${prefix}-categories`}
                  disabled={busy || locked || fieldLocked('data')}
                  {...form.register('categories')}
                />
              </Field>
              {chart.data.series.map((_series, index) => (
                <FieldGroup key={`series-${index}`}>
                  <Field>
                    <FieldLabel htmlFor={`${prefix}-series-${index}`}>
                      {' '}
                      {translateUi('series_a8295e08')} {index + 1} {translateUi(
                        'name_82a3537f',
                      )}{' '}
                    </FieldLabel>
                    <Input
                      id={`${prefix}-series-${index}`}
                      disabled={busy || locked || fieldLocked('data')}
                      {...form.register(`series.${index}.name`)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${prefix}-values-${index}`}>
                      {' '}
                      {translateUi('values_separated_by_commas_ae23403e')}{' '}
                    </FieldLabel>
                    <Input
                      id={`${prefix}-values-${index}`}
                      disabled={busy || locked || fieldLocked('data')}
                      {...form.register(`series.${index}.values`)}
                    />
                  </Field>
                </FieldGroup>
              ))}
            </>
          ) : null}
          <Button type="submit" disabled={busy || locked}>
            {' '}
            {translateUi('apply_changes_85045ccc')}{' '}
          </Button>
        </FieldGroup>
      </form>
      <Separator />
      <form
        onSubmit={fields.handleSubmit(async (values) => {
          await onCommands([
            {
              type: 'field.define',
              field: {
                id: field?.id ?? crypto.randomUUID(),
                name: values.name,
                ...target,
                kind: values.property === 'text' ? 'text' : objectFieldKind(object),
                locked: values.locked,
                required: values.required,
                ...(values.property ? { property: values.property } : {}),
              },
            },
          ]);
        })}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${prefix}-field`}>
              {translateUi('reusable_field_name_4244e7ae')}
            </FieldLabel>
            <Input id={`${prefix}-field`} disabled={busy} {...fields.register('name')} />
            <FieldError errors={[fields.formState.errors.name]} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefix}-property`}>
              {translateUi('protected_property_516e7602')}
            </FieldLabel>
            <Select
              value={fields.watch('property') || 'all'}
              onValueChange={(value) => fields.setValue('property', value === 'all' ? '' : value)}
            >
              <SelectTrigger id={`${prefix}-property`}>
                <SelectValue
                  items={{
                    all: 'Entire object',
                    text: translateUi('text_71988c4d'),
                    bounds: 'Position and size',
                    style: 'Style',
                    data: 'Data and image',
                  }}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{translateUi('entire_object_66174dec')}</SelectItem>
                  <SelectItem value="text">{translateUi('text_71988c4d')}</SelectItem>
                  <SelectItem value="bounds">
                    {translateUi('position_and_size_274bbcde')}
                  </SelectItem>
                  <SelectItem value="style">{translateUi('style_7e744141')}</SelectItem>
                  <SelectItem value="data">{translateUi('data_and_image_7bdf4e56')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id={`${prefix}-field-lock`}
              checked={fields.watch('locked')}
              disabled={busy}
              onCheckedChange={(value) => fields.setValue('locked', value === true)}
            />
            <FieldLabel htmlFor={`${prefix}-field-lock`}>
              {' '}
              {translateUi('lock_this_property_for_people_and_a_16d4522a')}{' '}
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id={`${prefix}-field-required`}
              checked={fields.watch('required')}
              disabled={busy}
              onCheckedChange={(value) => fields.setValue('required', value === true)}
            />
            <FieldLabel htmlFor={`${prefix}-field-required`}>
              {translateUi('require_a_value_2af1b2df')}
            </FieldLabel>
          </Field>
          <Button type="submit" variant="outline" disabled={busy}>
            {field ? translateUi('update_field_69be9513') : translateUi('define_field_59add31e')}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
