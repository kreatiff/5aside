declare module "pg" {
  export interface QueryResultRow {
    [column: string]: unknown;
  }

  export interface QueryResult<R extends QueryResultRow = QueryResultRow> {
    rows: R[];
    rowCount: number;
  }

  export interface PoolClient {
    query<R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<R>>;
    release(): void;
  }

  export interface PoolConfig {
    connectionString?: string;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    connect(): Promise<PoolClient>;
    query<R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<R>>;
    end(): Promise<void>;
  }
}
