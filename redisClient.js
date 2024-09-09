const Redis = require('ioredis');
const { promisify } = require('util');
const properties = require('./properties.json');

const redisClient = new Redis(properties.redis);

const getAsync = promisify(redisClient.get).bind(redisClient);
const setAsync = promisify(redisClient.set).bind(redisClient);
const deleteAsWhole = promisify(redisClient.del).bind(redisClient);
const setAdd = promisify(redisClient.sadd).bind(redisClient);
const setRemove = promisify(redisClient.srem).bind(redisClient);
const sismember = promisify(redisClient.sismember).bind(redisClient);
const hsetAdd = promisify(redisClient.hset).bind(redisClient);
const hsetDelete = promisify(redisClient.hdel).bind(redisClient);
const hsetGet = promisify(redisClient.hget).bind(redisClient);
const hsetGetKeys = promisify(redisClient.hkeys).bind(redisClient);
const hsetCount = promisify(redisClient.hlen).bind(redisClient);
const hsetMassGet = promisify(redisClient.hmget).bind(redisClient);
const hsetMassSet = promisify(redisClient.hmset).bind(redisClient);
const flush = promisify(redisClient.flushdb).bind(redisClient);
const hgetAll = promisify(redisClient.hgetall).bind(redisClient);


const lockTable = async (table, timeout = 10000) => {
    return new Promise(async (resolve, reject) => {
        try {
            const lockValue = Date.now() + timeout + 1;
            const locked = await redisClient.set(`${table}LOCK`, lockValue, 'NX', 'PX', timeout);
            if (locked) {
                resolve(locked)
            } else {
                setTimeout(() => lockTable(table, timeout)
                    .then(res => resolve(res))
                    .catch(err => reject(err)), 100)
            }
        } catch (err) {
            reject(err);
        }
    })
}

const releaseTable = async (table) => {
    try {
        await redisClient.del(`${table}LOCK`);
        return true;
    } catch (err) {
        throw err;
    }
}


module.exports = { flush, hgetAll, redisClient, getAsync, setAsync, setAdd, sismember, hsetAdd, hsetGetKeys, hsetDelete, setRemove, deleteAsWhole, hsetGet, hsetCount, hsetMassGet, lockTable, releaseTable, hsetMassSet };