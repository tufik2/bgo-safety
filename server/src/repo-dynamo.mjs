// DynamoDB storage (single table). Key layout:
//   USERS            / USER#<id>                      user profile (+ properties: ['*'] or ['BGO1042', …])
//   LOGIN#email#<e>  / LOGIN                          → userId   (sign-in lookup)
//   LOGIN#phone#<p>  / LOGIN                          → userId
//   PROPERTIES       / PROP#<number>                  property
//   CODE#<ident>     / CODE                           pending access code (ttl)
//   RATE#<ident>     / <window>                       code-request counter (ttl)
//   PROP#<number>    / SURVEY#<checklistId>#<period>  survey incl. all answers (versioned as a whole)
//   TEMP#<kind>#<id> / TEMP                           short-lived SSO state / one-time ticket (ttl)
//   PROP#<number>    / INC#<id>                       incident report
//   PROP#<number>    / COUNTER#<prefix>#<year>        report numbering
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { epoch } from './util.mjs';

export function createDynamoRepo(tableName) {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  const T = tableName;
  const strip = (it) => { if (!it) return null; const { pk, sk, ttl, ...rest } = it; return rest; };
  const isCond = (e) => e && e.name === 'ConditionalCheckFailedException';

  async function queryAll(params) {
    const out = [];
    let ExclusiveStartKey;
    do {
      const r = await db.send(new QueryCommand({ TableName: T, ...params, ExclusiveStartKey }));
      out.push(...(r.Items || []));
      ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
  }
  const get = async (pk, sk) => (await db.send(new GetCommand({ TableName: T, Key: { pk, sk } }))).Item || null;
  const prefix = (pk, p) => queryAll({ KeyConditionExpression: 'pk = :pk AND begins_with(sk, :p)', ExpressionAttributeValues: { ':pk': pk, ':p': p } });

  async function batchPut(items) {
    for (let i = 0; i < items.length; i += 25) {
      let req = { [T]: items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })) };
      for (let n = 0; n < 6 && req && Object.keys(req).length; n++) {
        const r = await db.send(new BatchWriteCommand({ RequestItems: req }));
        req = r.UnprocessedItems && Object.keys(r.UnprocessedItems).length ? r.UnprocessedItems : null;
        if (req) await new Promise((res) => setTimeout(res, 100 * 2 ** n));
      }
    }
  }

  return {
    /* ---------- users ---------- */
    async listUsers() { return (await prefix('USERS', 'USER#')).map(strip); },
    async getUser(id) { return strip(await get('USERS', `USER#${id}`)); },
    async getUserByLogin(type, value) {
      const l = await get(`LOGIN#${type}#${value}`, 'LOGIN');
      return l ? this.getUser(l.userId) : null;
    },
    async countUsers() {
      const r = await db.send(new QueryCommand({ TableName: T, KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': 'USERS' }, Limit: 1, Select: 'COUNT' }));
      return r.Count || 0;
    },
    async putUser(user) {
      const prev = await this.getUser(user.id);
      for (const [t, k] of [['email', 'email'], ['phone', 'phone']]) {
        if (prev && prev[k] && prev[k] !== user[k]) await db.send(new DeleteCommand({ TableName: T, Key: { pk: `LOGIN#${t}#${prev[k]}`, sk: 'LOGIN' } }));
      }
      const items = [{ pk: 'USERS', sk: `USER#${user.id}`, ...user }];
      if (user.email) items.push({ pk: `LOGIN#email#${user.email}`, sk: 'LOGIN', userId: user.id });
      if (user.phone) items.push({ pk: `LOGIN#phone#${user.phone}`, sk: 'LOGIN', userId: user.id });
      await batchPut(items);
      return user;
    },
    async putUsers(users) { for (const u of users) await this.putUser(u); },

    /* ---------- properties ---------- */
    async listProperties() { return (await prefix('PROPERTIES', 'PROP#')).map(strip); },
    async getProperty(p) { return strip(await get('PROPERTIES', `PROP#${p}`)); },
    async putProperties(list) { await batchPut(list.map((p) => ({ pk: 'PROPERTIES', sk: `PROP#${p.propertyNumber}`, ...p }))); },

    /* ---------- access codes + rate limit ---------- */
    async getCode(ident) { const it = await get(`CODE#${ident}`, 'CODE'); return it && it.ttl > epoch() ? strip(it) : null; },
    async putCode(ident, rec, ttlSeconds) { await db.send(new PutCommand({ TableName: T, Item: { pk: `CODE#${ident}`, sk: 'CODE', ...rec, ttl: epoch() + ttlSeconds + 60 } })); },
    async deleteCode(ident) { await db.send(new DeleteCommand({ TableName: T, Key: { pk: `CODE#${ident}`, sk: 'CODE' } })); },
    async bumpAttempts(ident) {
      const r = await db.send(new UpdateCommand({ TableName: T, Key: { pk: `CODE#${ident}`, sk: 'CODE' }, UpdateExpression: 'ADD #a :one', ExpressionAttributeNames: { '#a': 'attempts' }, ExpressionAttributeValues: { ':one': 1 }, ReturnValues: 'UPDATED_NEW' }));
      return r.Attributes.attempts;
    },
    async hit(ident, windowSec) {
      const w = Math.floor(epoch() / windowSec);
      const r = await db.send(new UpdateCommand({ TableName: T, Key: { pk: `RATE#${ident}`, sk: String(w) }, UpdateExpression: 'ADD #n :one SET #t = :ttl', ExpressionAttributeNames: { '#n': 'n', '#t': 'ttl' }, ExpressionAttributeValues: { ':one': 1, ':ttl': (w + 2) * windowSec }, ReturnValues: 'UPDATED_NEW' }));
      return r.Attributes.n;
    },

    /* ---------- surveys + answers ---------- */
    async listSurveys(p) { return (await prefix(`PROP#${p}`, 'SURVEY#')).map(strip); },
    async getSurvey(p, checklistId, period) { return strip(await get(`PROP#${p}`, `SURVEY#${checklistId}#${period}`)); },
    async createSurvey(s) {
      try {
        await db.send(new PutCommand({ TableName: T, Item: { pk: `PROP#${s.propertyNumber}`, sk: `SURVEY#${s.checklistId}#${s.period}`, ...s }, ConditionExpression: 'attribute_not_exists(pk)' }));
        return true;
      } catch (e) { if (isCond(e)) return false; throw e; }
    },
    async updateSurvey(s, expectVersion) {
      try {
        await db.send(new PutCommand({ TableName: T, Item: { pk: `PROP#${s.propertyNumber}`, sk: `SURVEY#${s.checklistId}#${s.period}`, ...s }, ConditionExpression: '#ver = :v', ExpressionAttributeNames: { '#ver': 'version' }, ExpressionAttributeValues: { ':v': expectVersion } }));
        return true;
      } catch (e) { if (isCond(e)) return false; throw e; }
    },
    async deleteSurvey(s) {
      await db.send(new DeleteCommand({ TableName: T, Key: { pk: `PROP#${s.propertyNumber}`, sk: `SURVEY#${s.checklistId}#${s.period}` } }));
    },

    /* ---------- one-time markers (e.g. "lists loaded") ---------- */
    async getMeta(name) { return strip(await get('META', name)); },
    // -> true if this call created the marker (so only one container does the work)
    async claimMeta(name, rec) {
      try { await db.send(new PutCommand({ TableName: T, Item: { pk: 'META', sk: name, ...rec }, ConditionExpression: 'attribute_not_exists(pk)' })); return true; }
      catch (e) { if (isCond(e)) return false; throw e; }
    },
    async putMeta(name, rec) { await db.send(new PutCommand({ TableName: T, Item: { pk: 'META', sk: name, ...rec } })); },

    /* ---------- short-lived records (SSO state, tickets) ---------- */
    async putTemp(kind, id, rec, ttlSeconds) { await db.send(new PutCommand({ TableName: T, Item: { pk: `TEMP#${kind}#${id}`, sk: 'TEMP', ...rec, ttl: epoch() + ttlSeconds } })); },
    async takeTemp(kind, id) {
      const r = await db.send(new DeleteCommand({ TableName: T, Key: { pk: `TEMP#${kind}#${id}`, sk: 'TEMP' }, ReturnValues: 'ALL_OLD' }));
      const it = r.Attributes;
      return it && it.ttl > epoch() ? strip(it) : null;
    },

    /* ---------- incidents ---------- */
    async listIncidents(p) { return (await prefix(`PROP#${p}`, 'INC#')).map(strip); },
    async getIncident(p, id) { return strip(await get(`PROP#${p}`, `INC#${id}`)); },
    async putIncident(inc, expectVersion) {
      try {
        await db.send(new PutCommand({
          TableName: T, Item: { pk: `PROP#${inc.propertyNumber}`, sk: `INC#${inc.id}`, ...inc },
          ...(expectVersion ? { ConditionExpression: '#ver = :v', ExpressionAttributeNames: { '#ver': 'version' }, ExpressionAttributeValues: { ':v': expectVersion } } : { ConditionExpression: 'attribute_not_exists(pk)' }),
        }));
        return true;
      } catch (e) { if (isCond(e)) return false; throw e; }
    },
    async deleteIncident(p, id) { await db.send(new DeleteCommand({ TableName: T, Key: { pk: `PROP#${p}`, sk: `INC#${id}` } })); },
    async nextNumber(p, pre, year) {
      const r = await db.send(new UpdateCommand({ TableName: T, Key: { pk: `PROP#${p}`, sk: `COUNTER#${pre}#${year}` }, UpdateExpression: 'ADD #n :one', ExpressionAttributeNames: { '#n': 'n' }, ExpressionAttributeValues: { ':one': 1 }, ReturnValues: 'UPDATED_NEW' }));
      return r.Attributes.n;
    },
  };
}
