import { index, integer, sqliteTable, text } from "void/schema-d1";
export const polls = sqliteTable(
  "polls",
  {
    ownerId: text("owner_id"),
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    slots: text("slots").notNull(),
    slotEnds: text("slot_ends"),
    status: text("status").notNull(),
    selectedSlot: text("selected_slot"),
    revision: integer("revision").notNull(),
    adminHash: text("admin_hash").notNull(),
    createKey: text("create_key").notNull().unique(),
    payloadHash: text("payload_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("polls_owner_created_id").on(table.ownerId, table.createdAt, table.id)],
);
export const responses = sqliteTable("responses", {
  id: text("id").primaryKey(),
  pollId: text("poll_id")
    .notNull()
    .references(() => polls.id),
  name: text("name").notNull(),
  comment: text("comment").notNull(),
  answers: text("answers").notNull(),
  editHash: text("edit_hash").notNull(),
  revision: integer("revision").notNull(),
  requestKey: text("request_key").notNull().unique(),
  payloadHash: text("payload_hash").notNull(),
});
