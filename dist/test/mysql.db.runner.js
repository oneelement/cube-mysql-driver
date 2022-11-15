"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDriver = void 0;
const MySqlDriver_1 = require("../src/MySqlDriver");
const createDriver = (c) => new MySqlDriver_1.MySqlDriver({
    host: c.getHost(),
    user: 'root',
    password: process.env.TEST_DB_PASSWORD || 'Test1test',
    port: c.getMappedPort(3306),
    database: 'mysql',
});
exports.createDriver = createDriver;
//# sourceMappingURL=mysql.db.runner.js.map