import { pgTable, serial, integer, timestamp, unique, text } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const contactsTable = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    contactUserId: integer("contact_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    contactName: text("contact_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("contacts_user_contact_unique").on(t.userId, t.contactUserId)],
);

export type Contact = typeof contactsTable.$inferSelect;
