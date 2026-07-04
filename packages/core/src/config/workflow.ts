export * as ConfigWorkflow from "./workflow"

import { Schema } from "effect"

export const Step = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("prompt"),
    text: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("command"),
    command: Schema.String,
  }),
])
export type Step = Schema.Schema.Type<typeof Step>

export class Info extends Schema.Class<Info>("ConfigV2.Workflow")({
  description: Schema.String.pipe(Schema.optional),
  steps: Schema.Array(Step),
}) {}
