

CREATE TABLE users_ds (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    nickname TEXT,
);


CREATE TABLE servers_ds (
    id SERIAL PRIMARY KEY,
    server_name TEXT NOT NULL

    members_count INTEGER NOT NULL DEFAULT 0
);

CREATE TYPE action_type AS ENUM ('join', 'leave');

CREATE_TABLE join_and_leave_members_log (
    id SERIAL PRIMARY KEY,
    server_ds_id TEXT NOT NULL,
    user_ds_id SERIAL NOT NULL,
    action action_type NOT NULL,
    action_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (server_ds_id) REFERENCES servers_ds(id) ON DELETE CASCADE,
    FOREIGN KEY (user_ds_id) REFERENCES users_ds(id) ON DELETE CASCADE
)


CREATE TABLE members (
    server_ds_id TEXT NOT NULL,
    user_ds_id SERIAL ,

    nickname TEXT NOT NULL,

    last_join_date DATE,
    Last_leave_date DATE,
    isJoined BOOLEAN NOT NULL DEFAULT TRUE,

    PRIMARY KEY (server_ds_id, user_ds_id),
    FOREIGN KEY (server_ds_id) REFERENCES servers_ds(id) ON DELETE CASCADE,
    FOREIGN KEY (user_ds_id) REFERENCES users_ds(id) ON DELETE CASCADE

);

