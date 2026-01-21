declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: typeof Database;
  }

  export interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export interface ParamsObject {
    [key: string]: any;
  }

  export interface ParamsCallback {
    (obj: ParamsObject): void;
  }

  export interface Statement {
    bind(params?: any[] | ParamsObject): boolean;
    step(): boolean;
    getAsObject(params?: ParamsObject): any;
    get(params?: any[]): any[];
    run(params?: any[] | ParamsObject): void;
    free(): boolean;
    reset(): void;
  }

  export class Database {
    constructor(data?: ArrayLike<number>);
    run(sql: string, params?: any[] | ParamsObject): Database;
    exec(sql: string, params?: any[] | ParamsObject): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export interface SqlJsConfig {
    locateFile?: (filename: string) => string;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
