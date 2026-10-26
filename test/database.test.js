import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTestDatabase} from '../fixtures/test-database.js';
import {initial} from '../backend/seed-data.js';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import pg from 'pg';
const exec=promisify(execFile);
test('migrations are repeatable and JSON import preserves all records without overwriting a populated database',async()=>{
 const database=await createTestDatabase({seed:false});const dir=await mkdtemp(join(tmpdir(),'meggs-import-'));const source=join(dir,'store.json');const fixture={...structuredClone(initial),subscribers:['fan@example.com'],enquiries:[{id:'imported',name:'Fan',email:'fan@example.com',message:'Hello',createdAt:new Date().toISOString()}]};await writeFile(source,JSON.stringify(fixture));const env={...process.env,DATABASE_URL:database.url,NODE_ENV:'test'};
 try{await exec(process.execPath,['scripts/database.js','migrate'],{env});await exec(process.execPath,['scripts/database.js','import',source],{env});const client=new pg.Client({connectionString:database.url});await client.connect();try{assert.equal(Number((await client.query('SELECT count(*) FROM products')).rows[0].count),6);assert.equal((await client.query('SELECT data FROM enquiries WHERE id=$1',['imported'])).rows[0].data.message,'Hello');await assert.rejects(exec(process.execPath,['scripts/database.js','import',source],{env}),error=>error.stderr.includes('empty database'));assert.deepEqual(JSON.parse(await readFile(source,'utf8')),fixture)}finally{await client.end()}}finally{await database.close();await rm(dir,{recursive:true,force:true})}
});
