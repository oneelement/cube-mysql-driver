"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_shared_1 = require("@cubejs-backend/testing-shared");
const mysql_db_runner_1 = require("./mysql.db.runner");
describe('MySqlDriver Pool', () => {
    jest.setTimeout(2 * 60 * 1000);
    test('database pool error', async () => {
        const poolErrorContainer = await testing_shared_1.MysqlDBRunner.startContainer({});
        let databasePoolErrorLogged = false;
        const poolErrorDriver = mysql_db_runner_1.createDriver(poolErrorContainer);
        poolErrorDriver.setLogger((msg, event) => {
            if (msg === 'Database Pool Error') {
                databasePoolErrorLogged = true;
            }
            console.log(`${msg}: ${JSON.stringify(event)}`);
        });
        try {
            await poolErrorDriver.createSchemaIfNotExists('test');
            await poolErrorDriver.query('DROP SCHEMA test', []);
            await poolErrorDriver.createSchemaIfNotExists('test');
            await poolErrorDriver.query('SELECT 1', []);
            await poolErrorContainer.stop();
            try {
                await poolErrorDriver.query('SELECT 1', []);
                throw new Error('Pool must throw an exception');
            }
            catch (e) {
                console.log(e);
                expect(e.toString()).toContain('ResourceRequest timed out');
            }
            expect(databasePoolErrorLogged).toBe(true);
        }
        finally {
            await poolErrorDriver.release();
        }
    });
});
//# sourceMappingURL=MySqlDriverPool.disabled.js.map