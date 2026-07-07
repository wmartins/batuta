import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { VStack } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useState } from "react";

import type {
  WorkspaceFormErrors,
  WorkspaceInput,
} from "~/validation/workspace";

type WorkspaceFormProps = {
  defaultValues?: WorkspaceInput;
  errors?: WorkspaceFormErrors;
  isSubmitting: boolean;
  submitLabel: string;
};

export function WorkspaceForm({
  defaultValues = { name: "", slug: "" },
  errors,
  isSubmitting,
  submitLabel,
}: WorkspaceFormProps) {
  const [name, setName] = useState(defaultValues.name);
  const [slug, setSlug] = useState(defaultValues.slug);

  return (
    <VStack gap={4}>
      {errors?.form ? (
        <Banner status="error" title="Could not save workspace">
          {errors.form}
        </Banner>
      ) : null}
      <FormLayout>
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
        <TextInput
          htmlName="slug"
          isRequired
          label="URL slug"
          description="Lowercase letters, numbers, and hyphens. Used in /w/your-slug."
          value={slug}
          onChange={setSlug}
          status={
            errors?.slug ? { type: "error", message: errors.slug } : undefined
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
