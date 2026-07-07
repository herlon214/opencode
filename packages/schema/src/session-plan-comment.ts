export * as SessionPlanComment from "./session-plan-comment"

import { Schema } from "effect"
import { define, inventory } from "./event"
import { SessionID } from "./session-id"
import { ascending } from "./identifier"
import { NonNegativeInt, statics } from "./schema"

export const ID = Schema.String.check(Schema.isStartsWith("plc")).pipe(
  Schema.brand("PlanCommentID"),
  statics((schema) => ({
    create: () => schema.make("plc_" + ascending()),
    ascending: (id?: string) => (id === undefined ? schema.make("plc_" + ascending()) : schema.make(id)),
  })),
)
export type ID = typeof ID.Type

export const Info = Schema.Struct({
  id: ID,
  sessionID: SessionID,
  line: NonNegativeInt.annotate({ description: "Line number in the plan file (0-indexed)" }),
  text: Schema.String.annotate({ description: "The comment text" }),
  author: Schema.String.pipe(Schema.optional).annotate({ description: "Optional author name" }),
  created: NonNegativeInt.annotate({ description: "Creation timestamp (ms)" }),
}).annotate({ identifier: "PlanComment" })
export interface Info extends Schema.Schema.Type<typeof Info> {}

const Added = define({
  type: "plan_comment.added",
  schema: Info.fields,
})
const Removed = define({
  type: "plan_comment.removed",
  schema: {
    sessionID: SessionID,
    commentID: ID,
  },
})
const Cleared = define({
  type: "plan_comment.cleared",
  schema: {
    sessionID: SessionID,
  },
})
export const Event = { Added, Removed, Cleared, Definitions: inventory(Added, Removed, Cleared) }