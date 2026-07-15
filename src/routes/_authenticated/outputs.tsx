import { createFileRoute } from "@tanstack/react-router";
import { FormPage } from "./inputs";

export const Route = createFileRoute("/_authenticated/outputs")({
  component: () => <FormPage kind="output" />,
});
