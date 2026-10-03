import os
from functools import cache

import psycopg

import lecture_worker.env  # noqa: F401


@cache
def conn() -> psycopg.Connection:
    return psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)


def update_lecture(lecture_id: str, **fields) -> None:
    sets = ", ".join(f"{k} = %s" for k in fields)  # keys are code-supplied column names, never user input
    conn().execute(f"update lectures set {sets} where id = %s", [*fields.values(), lecture_id])
