"use strict";
/**
 * @copyright Cube Dev, Inc.
 * @license Apache-2.0
 * @fileoverview The `MySqlDriver` and related types declaration.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MySqlDriver = void 0;
const shared_1 = require("@cubejs-backend/shared");
const mysql_1 = __importDefault(require("mysql"));
const generic_pool_1 = __importDefault(require("generic-pool"));
const util_1 = require("util");
const base_driver_1 = require("@cubejs-backend/base-driver");
const GenericTypeToMySql = {
    string: 'varchar(255) CHARACTER SET utf8mb4',
    text: 'varchar(255) CHARACTER SET utf8mb4',
    decimal: 'decimal(38,10)',
};
/**
 * MySQL Native types -> SQL type
 * @link https://github.com/mysqljs/mysql/blob/master/lib/protocol/constants/types.js#L9
 */
const MySqlNativeToMySqlType = {
    [0 /* DECIMAL */]: 'decimal',
    [246 /* NEWDECIMAL */]: 'decimal',
    [1 /* TINY */]: 'tinyint',
    [2 /* SHORT */]: 'smallint',
    [3 /* LONG */]: 'int',
    [9 /* INT24 */]: 'mediumint',
    [8 /* LONGLONG */]: 'bigint',
    [14 /* NEWDATE */]: 'datetime',
    [17 /* TIMESTAMP2 */]: 'timestamp',
    [18 /* DATETIME2 */]: 'datetime',
    [19 /* TIME2 */]: 'time',
    [249 /* TINY_BLOB */]: 'tinytext',
    [250 /* MEDIUM_BLOB */]: 'mediumtext',
    [251 /* LONG_BLOB */]: 'longtext',
    [252 /* BLOB */]: 'text',
    [253 /* VAR_STRING */]: 'varchar',
    [254 /* STRING */]: 'varchar',
};
const MySqlToGenericType = {
    mediumtext: 'text',
    longtext: 'text',
    mediumint: 'int',
    smallint: 'int',
    bigint: 'int',
    tinyint: 'int',
    'mediumint unsigned': 'int',
    'smallint unsigned': 'int',
    'bigint unsigned': 'int',
    'tinyint unsigned': 'int',
};
/**
 * MySQL driver class.
 */
class MySqlDriver extends base_driver_1.BaseDriver {
    /**
     * Class constructor.
     */
    constructor(config = {}) {
        super();
        const dataSource = config.dataSource ||
            shared_1.assertDataSource('default');
        const { pool, ...restConfig } = config;
        this.config = {
            host: shared_1.getEnv('dbHost', { dataSource }),
            database: shared_1.getEnv('dbName', { dataSource }),
            port: shared_1.getEnv('dbPort', { dataSource }),
            user: shared_1.getEnv('dbUser', { dataSource }),
            password: shared_1.getEnv('dbPass', { dataSource }),
            socketPath: shared_1.getEnv('dbSocketPath', { dataSource }),
            timezone: 'Z',
            ssl: this.getSslOptions(dataSource),
            dateStrings: true,
            readOnly: true,
            ...restConfig,
        };
        this.pool = generic_pool_1.default.createPool({
            create: async () => {
                const conn = mysql_1.default.createConnection(this.config);
                const connect = util_1.promisify(conn.connect.bind(conn));
                console.log('********** create connection *************');
                // conn.query("SET SESSION sql_mode = 'ANSI_QUOTES'")
                if (conn.on) {
                    conn.on('connection', () => {
                        console.log('ON CONNECTION');
                    });
                    conn.on('error', () => {
                        conn.destroy();
                    });
                }
                conn.execute = util_1.promisify(conn.query.bind(conn));
                await connect();
                return conn;
            },
            validate: async (connection) => {
                try {
                    await connection.execute('SELECT 1');
                }
                catch (e) {
                    this.databasePoolError(e);
                    return false;
                }
                return true;
            },
            destroy: (connection) => util_1.promisify(connection.end.bind(connection))(),
        }, {
            min: 0,
            max: config.maxPoolSize ||
                shared_1.getEnv('dbMaxPoolSize', { dataSource }) ||
                8,
            evictionRunIntervalMillis: 10000,
            softIdleTimeoutMillis: 30000,
            idleTimeoutMillis: 30000,
            testOnBorrow: true,
            acquireTimeoutMillis: 20000,
            ...pool
        });
    }
    /**
     * Returns default concurrency value.
     */
    static getDefaultConcurrency() {
        return 2;
    }
    readOnly() {
        return !!this.config.readOnly;
    }
    withConnection(fn) {
        const self = this;
        const connectionPromise = this.pool.acquire();
        let cancelled = false;
        const cancelObj = {};
        const promise = connectionPromise.then(async (conn) => {
            const [{ connectionId }] = await conn.execute('select connection_id() as connectionId');
            cancelObj.cancel = async () => {
                cancelled = true;
                await self.withConnection(async (processConnection) => {
                    await processConnection.execute(`KILL ${connectionId}`);
                });
            };
            return fn(conn)
                .then(res => this.pool.release(conn).then(() => {
                if (cancelled) {
                    throw new Error('Query cancelled');
                }
                return res;
            }))
                .catch((err) => this.pool.release(conn).then(() => {
                if (cancelled) {
                    throw new Error('Query cancelled');
                }
                throw err;
            }));
        });
        promise.cancel = () => cancelObj.cancel();
        return promise;
    }
    async testConnection() {
        // eslint-disable-next-line no-underscore-dangle
        const conn = await this.pool._factory.create();
        try {
            return await conn.execute('SELECT 1');
        }
        finally {
            // eslint-disable-next-line no-underscore-dangle
            await this.pool._factory.destroy(conn);
        }
    }
    async query(query, values) {
        return this.withConnection(async (conn) => {
            await this.setTimeZone(conn);
            return conn.execute(query, values);
        });
    }
    setTimeZone(conn) {
        return conn.execute(`SET time_zone = '${this.config.storeTimezone || '+00:00'}'`, []);
    }
    async release() {
        await this.pool.drain();
        await this.pool.clear();
    }
    informationSchemaQuery() {
        return `${super.informationSchemaQuery()} AND columns.table_schema = '${this.config.database}'`;
    }
    quoteIdentifier(identifier) {
        return `\`${identifier}\``;
    }
    fromGenericType(columnType) {
        return GenericTypeToMySql[columnType] || super.fromGenericType(columnType);
    }
    loadPreAggregationIntoTable(preAggregationTableName, loadSql, params, tx) {
        if (this.config.loadPreAggregationWithoutMetaLock) {
            return this.cancelCombinator(async (saveCancelFn) => {
                await saveCancelFn(this.query(`${loadSql} LIMIT 0`, params));
                await saveCancelFn(this.query(loadSql.replace(/^CREATE TABLE (\S+) AS/i, 'INSERT INTO $1'), params));
            });
        }
        return super.loadPreAggregationIntoTable(preAggregationTableName, loadSql, params, tx);
    }
    async stream(query, values, { highWaterMark }) {
        // eslint-disable-next-line no-underscore-dangle
        const conn = await this.pool._factory.create();
        try {
            await this.setTimeZone(conn);
            const [rowStream, fields] = await (new Promise((resolve, reject) => {
                const stream = conn.query(query, values).stream({ highWaterMark });
                stream.on('fields', (f) => {
                    resolve([stream, f]);
                });
                stream.on('error', (e) => {
                    reject(e);
                });
            }));
            return {
                rowStream,
                types: this.mapFieldsToGenericTypes(fields),
                release: async () => {
                    // eslint-disable-next-line no-underscore-dangle
                    await this.pool._factory.destroy(conn);
                }
            };
        }
        catch (e) {
            // eslint-disable-next-line no-underscore-dangle
            await this.pool._factory.destroy(conn);
            throw e;
        }
    }
    mapFieldsToGenericTypes(fields) {
        return fields.map((field) => {
            // @ts-ignore
            let dbType = mysql_1.default.Types[field.type];
            if (field.type in MySqlNativeToMySqlType) {
                // @ts-ignore
                dbType = MySqlNativeToMySqlType[field.type];
            }
            return {
                name: field.name,
                type: this.toGenericType(dbType)
            };
        });
    }
    async downloadQueryResults(query, values, options) {
        if ((options || {}).streamImport) {
            return this.stream(query, values, options);
        }
        return this.withConnection(async (conn) => {
            await this.setTimeZone(conn);
            return new Promise((resolve, reject) => {
                conn.query(query, values, (err, rows, fields) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve({
                            rows,
                            types: this.mapFieldsToGenericTypes(fields),
                        });
                    }
                });
            });
        });
    }
    toColumnValue(value, genericType) {
        if (genericType === 'timestamp' && typeof value === 'string') {
            return value && value.replace('Z', '');
        }
        if (genericType === 'boolean' && typeof value === 'string') {
            if (value.toLowerCase() === 'true') {
                return true;
            }
            if (value.toLowerCase() === 'false') {
                return false;
            }
        }
        return super.toColumnValue(value, genericType);
    }
    isDownloadTableDataRow(tableData) {
        return tableData.rows !== undefined;
    }
    async uploadTableWithIndexes(table, columns, tableData, indexesSql) {
        if (!this.isDownloadTableDataRow(tableData)) {
            throw new Error(`${this.constructor} driver supports only rows upload`);
        }
        await this.createTable(table, columns);
        try {
            const batchSize = 1000; // TODO make dynamic?
            for (let j = 0; j < Math.ceil(tableData.rows.length / batchSize); j++) {
                const currentBatchSize = Math.min(tableData.rows.length - j * batchSize, batchSize);
                const indexArray = Array.from({ length: currentBatchSize }, (v, i) => i);
                const valueParamPlaceholders = indexArray.map(i => `(${columns.map((c, paramIndex) => this.param(paramIndex + i * columns.length)).join(', ')})`).join(', ');
                const params = indexArray.map(i => columns
                    .map(c => this.toColumnValue(tableData.rows[i + j * batchSize][c.name], c.type)))
                    .reduce((a, b) => a.concat(b), []);
                await this.query(`INSERT INTO ${table}
        (${columns.map(c => this.quoteIdentifier(c.name)).join(', ')})
        VALUES ${valueParamPlaceholders}`, params);
            }
            for (let i = 0; i < indexesSql.length; i++) {
                const [query, p] = indexesSql[i].sql;
                await this.query(query, p);
            }
        }
        catch (e) {
            await this.dropTable(table);
            throw e;
        }
    }
    toGenericType(columnType) {
        return MySqlToGenericType[columnType.toLowerCase()] ||
            MySqlToGenericType[columnType.toLowerCase().split('(')[0]] ||
            super.toGenericType(columnType);
    }
}
exports.MySqlDriver = MySqlDriver;
//# sourceMappingURL=MySqlDriver.js.map