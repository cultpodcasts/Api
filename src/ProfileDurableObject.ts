import { addBookmarkResponse } from "./addBookmarkResponse";
import { BookmarkRequest } from "./BookmarkRequest";
import { deleteBookmarkResponse } from "./deleteBookmarkResponse";
import { Env } from "./Env";
import { DurableObject } from "cloudflare:workers";
import { getBookmarksResponse } from "./getBookmarksResponse";

export class ProfileDurableObject extends DurableObject {
    users: string = `CREATE TABLE IF NOT EXISTS users(
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        subject UNIQUE ON CONFLICT ABORT
    );`;

    users_index: string = `CREATE INDEX IF NOT EXISTS users_id_index ON users(
        id
    );`;

    bookmarks: string = `CREATE TABLE IF NOT EXISTS bookmarks(
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     REFERENCES users (id),
        episode_id  TEXT,
        CONSTRAINT bookmarks_episode_user_unique UNIQUE (
            user_id,
            episode_id
        )
        ON CONFLICT ABORT
    );`;

    bookmarks_index: string = `CREATE INDEX IF NOT EXISTS bookmarks_user_id_index ON bookmarks(
        user_id
    );`;

    sql: SqlStorage;
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        this.sql = ctx.storage.sql;

        this.sql.exec(this.users);
        this.sql.exec(this.users_index);
        this.sql.exec(this.bookmarks);
        this.sql.exec(this.bookmarks_index);
    }

    async getBookmarks(auth0UserId: string): Promise<getBookmarksResponse | string[]> {
        let user = this.getUserId(auth0UserId);
        if (!user) {
            return getBookmarksResponse.userNotFound;
        }
        try {
            let userBookmarks = this.getUserBookmarks(parseInt(user.id!.toString()));
            return userBookmarks;
        } catch (error) {
            return getBookmarksResponse.errorRetrievingBookmarks;
        }
    }

    async addBookmark(auth0UserId: string, bookmarkRequest: BookmarkRequest): Promise<addBookmarkResponse> {
        let user = this.getUserId(auth0UserId);
        if (!user) {
            this.sql.exec(
                `INSERT INTO users VALUES (NULL, ?)`,
                auth0UserId);
            user = this.getUserId(auth0UserId);
        }
        if (!user) {
            return addBookmarkResponse.unableToCreateUser;
        }
        try {
            this.sql.exec(
                `INSERT INTO bookmarks VALUES (NULL, ?, ?)`,
                user.id,
                bookmarkRequest.episodeId.toLowerCase());
        } catch (error: any) {
            if (error.message.indexOf("UNIQUE constraint failed: bookmarks.user_id, bookmarks.episode_id: SQLITE_CONSTRAINT") >= 0) {
                return addBookmarkResponse.duplicateUserBookmark;
            } else {
                return addBookmarkResponse.unableToCreateBookmark;
            }
        }
        return addBookmarkResponse.created;
    }

    async deleteBookmark(auth0UserId: string, bookmarkRequest: BookmarkRequest): Promise<deleteBookmarkResponse> {
        let user = this.getUserId(auth0UserId);
        if (!user) {
            return deleteBookmarkResponse.userNotFound;
        }
        try {
            this.sql.exec(
                `DELETE FROM bookmarks WHERE user_id = ? AND episode_id = ?`,
                user.id,
                bookmarkRequest.episodeId.toLowerCase());
        } catch (error: any) {
            return deleteBookmarkResponse.unableToDeleteBookmark;
        }
        return deleteBookmarkResponse.deleted;
    }

    private getUserId(userId: string): Record<string, SqlStorageValue> | undefined {
        let cursor = this.sql.exec(
            `SELECT id FROM users WHERE subject = ?`,
            userId
        );
        let user = cursor.toArray()[0];
        return user;
    }

    private getUserBookmarks(userId: number): string[] {
        let bookmarks = [];
        let cursor = this.sql.exec(
            `SELECT episode_id FROM bookmarks WHERE user_id = ?`,
            userId);
        for (let row of cursor) {
            if (row.episode_id) {
                bookmarks.push(row.episode_id.toString());
            }
        }
        return bookmarks;
    }
}

