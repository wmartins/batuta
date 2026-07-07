import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { VStack } from "@astryxdesign/core/Stack";
import { useState } from "react";

import type { QuotaFormErrors, QuotaFormValues } from "~/validation/quota";

type Option = { id: string; key: string; name: string };

type QuotaFormProps = {
  defaultValues?: QuotaFormValues;
  errors?: QuotaFormErrors;
  isSubmitting: boolean;
  metrics: Option[];
  scopes: Option[];
  submitLabel: string;
};

const unitOptions = [
  { value: "minute", label: "Minute" },
  { value: "hour", label: "Hour" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
];

export function QuotaForm({
  defaultValues = {
    metricId: "",
    scopeId: "",
    quotaLimit: "",
    windowAmount: "1",
    windowUnit: "day",
  },
  errors,
  isSubmitting,
  metrics,
  scopes,
  submitLabel,
}: QuotaFormProps) {
  const [metricId, setMetricId] = useState(defaultValues.metricId);
  const [scopeId, setScopeId] = useState(defaultValues.scopeId);
  const [quotaLimit, setQuotaLimit] = useState<number | null>(() => {
    const value = Number(defaultValues.quotaLimit);
    return Number.isFinite(value) && defaultValues.quotaLimit !== ""
      ? value
      : null;
  });
  const [windowAmount, setWindowAmount] = useState<number | null>(() => {
    const value = Number(defaultValues.windowAmount);
    return Number.isFinite(value) ? value : null;
  });
  const [windowUnit, setWindowUnit] = useState(defaultValues.windowUnit);

  const metricOptions = metrics.map((metric) => ({
    value: metric.id,
    label: `${metric.name} (${metric.key})`,
  }));
  const scopeOptions = scopes.map((scope) => ({
    value: scope.id,
    label: `${scope.name} (${scope.key})`,
  }));

  return (
    <VStack gap={4}>
      {errors?.form ? (
        <Banner status="error" title="Could not save quota">
          {errors.form}
        </Banner>
      ) : null}
      <FormLayout>
        <Selector
          label="Metric"
          isRequired
          options={metricOptions}
          value={metricId}
          onChange={setMetricId}
          placeholder="Choose a metric"
          status={
            errors?.metricId
              ? { type: "error", message: errors.metricId }
              : undefined
          }
        />
        <Selector
          label="Scope"
          isRequired
          options={scopeOptions}
          value={scopeId}
          onChange={setScopeId}
          placeholder="Choose a scope"
          status={
            errors?.scopeId
              ? { type: "error", message: errors.scopeId }
              : undefined
          }
        />
        <noscript>
          <label>
            Metric
            <select name="metricId" defaultValue={metricId} required>
              <option value="">Choose a metric</option>
              {metricOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Scope
            <select name="scopeId" defaultValue={scopeId} required>
              <option value="">Choose a scope</option>
              {scopeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </noscript>
        <input type="hidden" name="metricId" value={metricId} />
        <input type="hidden" name="scopeId" value={scopeId} />
        <NumberInput
          htmlName="quotaLimit"
          isRequired
          label="Limit"
          min={0}
          value={quotaLimit}
          onChange={setQuotaLimit}
          status={
            errors?.quotaLimit
              ? { type: "error", message: errors.quotaLimit }
              : undefined
          }
        />
        <NumberInput
          htmlName="windowAmount"
          isIntegerOnly
          isRequired
          label="Window amount"
          min={1}
          value={windowAmount}
          onChange={setWindowAmount}
          status={
            errors?.windowAmount
              ? { type: "error", message: errors.windowAmount }
              : undefined
          }
        />
        <Selector
          label="Window unit"
          isRequired
          options={unitOptions}
          value={windowUnit}
          onChange={setWindowUnit}
          status={
            errors?.windowUnit
              ? { type: "error", message: errors.windowUnit }
              : undefined
          }
        />
        <noscript>
          <label>
            Window unit
            <select name="windowUnit" defaultValue={windowUnit} required>
              {unitOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </noscript>
        <input type="hidden" name="windowUnit" value={windowUnit} />
        <Button
          type="submit"
          variant="primary"
          label={submitLabel}
          isLoading={isSubmitting}
        />
      </FormLayout>
    </VStack>
  );
}
