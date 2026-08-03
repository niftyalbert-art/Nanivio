import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Chat wallpaper catalog — admin-manageable.
 * A wallpaper is either:
 *  - css-only (gradient/texture): `css` holds the full CSS background shorthand
 *  - image-based: `imageFile` (built-in file under the web app's /wallpapers/)
 *    or `imagePath` (admin-uploaded file on the API server), with `css`
 *    optionally holding a base color shown while the image loads.
 */
export const chatWallpapersTable = pgTable("chat_wallpapers", {
  slug: text("slug").primaryKey(),
  label: text("label").notNull(),
  css: text("css"),
  imageFile: text("image_file"),
  imagePath: text("image_path"),
  official: boolean("official").notNull().default(false),
  sort: integer("sort").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
