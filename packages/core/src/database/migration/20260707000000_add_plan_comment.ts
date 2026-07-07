import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260707000000_add_plan_comment",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`plan_comment\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`line\` integer NOT NULL,
          \`text\` text NOT NULL,
          \`author\` text,
          \`created\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_plan_comment_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`plan_comment_session_idx\` ON \`plan_comment\` (\`session_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration