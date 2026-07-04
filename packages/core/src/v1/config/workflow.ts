export * as ConfigWorkflowV1 from "./workflow"

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

export const Info = Schema.Struct({
  description: Schema.optional(Schema.String),
  steps: Schema.Array(Step),
})
export type Info = Schema.Schema.Type<typeof Info>
