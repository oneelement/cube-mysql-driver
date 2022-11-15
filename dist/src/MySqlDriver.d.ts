/**
 * @copyright Cube Dev, Inc.
 * @license Apache-2.0
 * @fileoverview The `MySqlDriver` and related types declaration.
 */
import mysql, { Connection, ConnectionConfig, QueryOptions } from 'mysql';
import genericPool from 'generic-pool';
import { BaseDriver, GenericDataBaseType, DriverInterface, StreamOptions, DownloadQueryResultsOptions, TableStructure, DownloadTableData, IndexesSQL, DownloadTableMemoryData } from '@cubejs-backend/base-driver';
export interface MySqlDriverConfiguration extends ConnectionConfig {
    readOnly?: boolean;
    loadPreAggregationWithoutMetaLock?: boolean;
    storeTimezone?: string;
    pool?: any;
}
interface MySQLConnection extends Connection {
    execute: (options: string | QueryOptions, values?: any) => Promise<any>;
}
/**
 * MySQL driver class.
 */
export declare class MySqlDriver extends BaseDriver implements DriverInterface {
    /**
     * Returns default concurrency value.
     */
    static getDefaultConcurrency(): number;
    protected readonly config: MySqlDriverConfiguration;
    protected readonly pool: genericPool.Pool<MySQLConnection>;
    /**
     * Class constructor.
     */
    constructor(config?: MySqlDriverConfiguration & {
        dataSource?: string;
        maxPoolSize?: number;
    });
    readOnly(): boolean;
    protected withConnection(fn: (conn: MySQLConnection) => Promise<any>): any;
    testConnection(): Promise<any>;
    query(query: string, values: unknown[]): Promise<any>;
    protected setTimeZone(conn: MySQLConnection): Promise<any>;
    release(): Promise<void>;
    informationSchemaQuery(): string;
    quoteIdentifier(identifier: string): string;
    fromGenericType(columnType: GenericDataBaseType): string;
    loadPreAggregationIntoTable(preAggregationTableName: string, loadSql: any, params: any, tx: any): any;
    stream(query: string, values: unknown[], { highWaterMark }: StreamOptions): Promise<{
        rowStream: any;
        types: {
            name: string;
            type: string;
        }[];
        release: () => Promise<void>;
    }>;
    protected mapFieldsToGenericTypes(fields: mysql.FieldInfo[]): {
        name: string;
        type: string;
    }[];
    downloadQueryResults(query: string, values: unknown[], options: DownloadQueryResultsOptions): Promise<any>;
    toColumnValue(value: any, genericType: GenericDataBaseType): string | boolean;
    protected isDownloadTableDataRow(tableData: DownloadTableData): tableData is DownloadTableMemoryData;
    uploadTableWithIndexes(table: string, columns: TableStructure, tableData: DownloadTableData, indexesSql: IndexesSQL): Promise<void>;
    toGenericType(columnType: string): string;
}
export {};
//# sourceMappingURL=MySqlDriver.d.ts.map