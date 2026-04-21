declare module "better-sqlite3" {
  export interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  export interface Statement<Result = unknown> {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): Result | undefined;
    all(...params: unknown[]): Result[];
  }

  export interface Database {
    pragma(statement: string): unknown;
    exec(sql: string): this;
    prepare<Result = unknown>(sql: string): Statement<Result>;
    transaction<T extends (...args: any[]) => any>(fn: T): T;
    close(): void;
  }

  interface DatabaseConstructor {
    new (filename: string, options?: unknown): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
