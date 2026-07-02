import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260702000000_add_session_goal",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session\` ADD COLUMN \`goal_objective\` text;`)
      yield* tx.run(`ALTER TABLE \`session\` ADD COLUMN \`goal_status\` text;`)
      yield* tx.run(`ALTER TABLE \`session\` ADD COLUMN \`goal_tokens_used\` integer NOT NULL DEFAULT 0;`)
      yield* tx.run(`ALTER TABLE \`session\` ADD COLUMN \`goal_time_used\` integer NOT NULL DEFAULT 0;`)
    })
  },
} satisfies DatabaseMigration.Migration
