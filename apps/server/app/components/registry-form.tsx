import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { VStack } from "@astryxdesign/core/Stack";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useState } from "react";

import type { RegistryFormErrors } from "~/validation/registry";

export type RegistryFormValues = {
  key: string;
  name: string;
  description: string | null;
};

type RegistryFormProps = {
  defaultValues?: RegistryFormValues;
  errors?: RegistryFormErrors;
  isEditing?: boolean;
  isSubmitting: boolean;
  kind: "metric" | "scope";
  submitLabel: string;
};

export function RegistryForm({
  defaultValues = { key: "", name: "", description: "" },
  errors,
  isEditing = false,
  isSubmitting,
  kind,
  submitLabel,
}: RegistryFormProps) {
  const [key, setKey] = useState(defaultValues.key);
  const [name, setName] = useState(defaultValues.name);
  const [description, setDescription] = useState(
    defaultValues.description ?? "",
  );

  return (
    <VStack gap={4}>
      {errors?.form ? (
        <Banner status="error" title={`Could not save ${kind}`}>
          {errors.form}
        </Banner>
      ) : null}
      <FormLayout>
        <TextInput
          htmlName="key"
          isRequired
          label="Machine key"
          description={
            isEditing
              ? "Machine keys are immutable after creation."
              : "Used by applications when referring to this configuration."
          }
          value={key}
          onChange={setKey}
          isDisabled={isEditing}
          disabledMessage={
            isEditing ? "Machine keys cannot be changed." : undefined
          }
          status={
            errors?.key ? { type: "error", message: errors.key } : undefined
          }
        />
        <TextInput
          htmlName="name"
          isRequired
          label="Display name"
          value={name}
          onChange={setName}
          status={
            errors?.name ? { type: "error", message: errors.name } : undefined
          }
        />
        <TextArea
          htmlName="description"
          isOptional
          label="Description"
          maxLength={500}
          rows={4}
          value={description}
          onChange={setDescription}
          status={
            errors?.description
              ? { type: "error", message: errors.description }
              : undefined
          }
        />
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
