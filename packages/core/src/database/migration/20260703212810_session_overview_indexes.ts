import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260703212810_session_overview_indexes",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(
        `CREATE INDEX \`session_directory_time_created_idx\` ON \`session\` (\`directory\`,\`time_created\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_directory_time_updated_idx\` ON \`session\` (\`directory\`,\`time_updated\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_project_directory_parent_time_updated_idx\` ON \`session\` (\`project_id\`,\`directory\`,\`parent_id\`,\`time_updated\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
