import { BookmarkRequest } from "./BookmarkRequest";
import { Env } from "./Env";
import { DurableObject } from "cloudflare:workers";

export enum bookmarkResponse {
    unableToCreateUser = -1,
    duplicateUserBookmark = -2,
    unableToCreateBookmark = -3,
    created = 1
}

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

    async bookmark(auth0UserId: string, bookmarkRequest: BookmarkRequest): Promise<bookmarkResponse> {
        // this.sql.exec(`DELETE FROM bookmarks`);
        // this.sql.exec(`DELETE FROM users`);

        let user = this.getUserId(auth0UserId);
        if (!user) {
            this.sql.exec(`INSERT INTO users VALUES (NULL, ?)`, auth0UserId);
            user = this.getUserId(auth0UserId);
        }
        if (!user) {
            return bookmarkResponse.unableToCreateUser;
        }
        try {
            this.sql.exec(`INSERT INTO bookmarks VALUES (NULL, ?, ?)`, user.id, bookmarkRequest.episodeId);
        } catch (error: any) {
            if (error.message.indexOf("UNIQUE constraint failed: bookmarks.user_id, bookmarks.episode_id: SQLITE_CONSTRAINT") >= 0) {
                return bookmarkResponse.duplicateUserBookmark;
            } else {
                return bookmarkResponse.unableToCreateBookmark;
            }
        }
        return bookmarkResponse.created;
    }

    private getUserId(userId: string): Record<string, SqlStorageValue> | undefined {
        let cursor = this.sql.exec(
            `SELECT id FROM users WHERE subject = ?`,
            userId
        );
        let user = cursor.toArray()[0];
        return user;
    }
}

