import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export async function createTestDatabase({seed=true}={}){
 const base=process.env.TEST_DATABASE_URL;
 if(!base)throw Error('Set TEST_DATABASE_URL to an isolated PostgreSQL server (the user needs CREATE DATABASE permission).');
 const client=new pg.Client({connectionString:base});await client.connect();const name='meggs_test_'+randomBytes(8).toString('hex');
 await client.query(`CREATE DATABASE "${name}"`);await client.end();
 const url=new URL(base);url.pathname='/'+name;
 try{await exec(process.execPath,['scripts/database.js',seed?'seed':'migrate'],{env:{...process.env,DATABASE_URL:url.href,NODE_ENV:'test'}})}catch(error){throw Error('Test database seed failed: '+error.stderr)}
 return {url:url.href,async close(){const connection=new pg.Client({connectionString:base});await connection.connect();await connection.query(`DROP DATABASE "${name}" WITH (FORCE)`);await connection.end()}};
}
