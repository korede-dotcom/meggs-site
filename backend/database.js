import {Sequelize,DataTypes,Op} from 'sequelize';
import {createHash} from 'node:crypto';
try{process.loadEnvFile?.()}catch(error){if(error.code!=='ENOENT')throw error}
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required. Configure .env and run npm run db:migrate.');
export const sequelize=new Sequelize(process.env.DATABASE_URL,{
 dialect:'postgres',logging:false,
 pool:{max:Number(process.env.DB_POOL_MAX||10),min:0,acquire:30000,idle:10000},
 dialectOptions:process.env.DB_SSL==='true'?{ssl:{require:true,rejectUnauthorized:true,...(process.env.DB_SSL_CA?{ca:process.env.DB_SSL_CA.replace(/\\n/g,'\n')}:{})}}:{},
 define:{timestamps:false,freezeTableName:true}
});
const id={type:DataTypes.STRING(100),primaryKey:true};
const data={type:DataTypes.JSONB,allowNull:false};
export const models={
 products:sequelize.define('products',{id,name:{type:DataTypes.STRING(500),allowNull:false},brand:{type:DataTypes.STRING(30),allowNull:false},price:{type:DataTypes.DECIMAL(14,2),allowNull:false,validate:{min:0}},stock:{type:DataTypes.INTEGER,allowNull:false,validate:{min:0}},data}),
 orders:sequelize.define('orders',{id,email:{type:DataTypes.STRING(500),allowNull:false},status:{type:DataTypes.STRING(80),allowNull:false},total:{type:DataTypes.DECIMAL(14,2),allowNull:false},paymentReference:{type:DataTypes.STRING(100),unique:true},checkoutKey:{type:DataTypes.STRING(100),unique:true},createdAt:{type:DataTypes.DATE,allowNull:false},data}),
 projects:sequelize.define('projects',{id,data}),
 enquiries:sequelize.define('enquiries',{id,createdAt:{type:DataTypes.DATE,allowNull:false},data}),
 content:sequelize.define('site_content',{id:{type:DataTypes.STRING(100),primaryKey:true},data}),
 subscribers:sequelize.define('subscribers',{email:{type:DataTypes.STRING(500),primaryKey:true}})
};
export const Session=sequelize.define('admin_sessions',{tokenHash:{type:DataTypes.STRING(64),primaryKey:true},expiresAt:{type:DataTypes.DATE,allowNull:false}});
const Migration=sequelize.define('schema_migrations',{id:{type:DataTypes.STRING,primaryKey:true}});
export async function migrate(){await sequelize.authenticate();await Migration.sync();await sequelize.transaction(async transaction=>{
 await sequelize.query('SELECT pg_advisory_xact_lock(73210401)',{transaction});
 if(!await Migration.findByPk('001-initial-schema',{transaction})){
  for(const model of [...Object.values(models),Session])await model.sync({transaction});
  await sequelize.query('ALTER TABLE products ADD CONSTRAINT products_stock_nonnegative CHECK (stock >= 0), ADD CONSTRAINT products_price_nonnegative CHECK (price >= 0)',{transaction});
  await sequelize.query('CREATE INDEX orders_email_idx ON orders (email)',{transaction});
  await sequelize.query('CREATE INDEX admin_sessions_expiry_idx ON admin_sessions ("expiresAt")',{transaction});
  await Migration.create({id:'001-initial-schema'},{transaction});
 }
});}
export async function connect(){await sequelize.authenticate();if(process.env.NODE_ENV!=='production')await migrate();else if(!await Migration.findByPk('001-initial-schema'))throw Error('Database migration required: npm run db:migrate');}
const hash=token=>createHash('sha256').update(token).digest('hex');
export const sessions={
 async has(token,transaction){return Boolean(token&&await Session.findOne({where:{tokenHash:hash(token),expiresAt:{[Op.gt]:new Date()}},transaction}))},
 async add(token,transaction){await Session.destroy({where:{expiresAt:{[Op.lt]:new Date()}},transaction});await Session.create({tokenHash:hash(token),expiresAt:new Date(Date.now()+86400000)},{transaction})},
 async delete(token,transaction){if(token)await Session.destroy({where:{tokenHash:hash(token)},transaction})}
};
async function load(transaction){
 const records={};for(const [key,model] of Object.entries(models))records[key]=await model.findAll({transaction,order:key==='orders'||key==='enquiries'?[['createdAt','DESC']]:key==='subscribers'?[['email','ASC']]:[['id','ASC']]});
 return {products:records.products.map(r=>({...r.data,name:r.name,brand:r.brand,price:Number(r.price),stock:r.stock})),orders:records.orders.map(r=>r.data),projects:records.projects.map(r=>r.data),enquiries:records.enquiries.map(r=>r.data),content:Object.fromEntries(records.content.map(r=>[r.id,r.data])),subscribers:records.subscribers.map(r=>r.email)};
}
function rowsFor(key,db){if(key==='content')return Object.entries(db.content).map(([id,data])=>({id,data}));if(key==='subscribers')return [...new Set(db.subscribers.map(email=>email.toLowerCase()))].map(email=>({email}));return db[key].map(data=>key==='products'?{id:data.id,name:data.name,brand:data.brand,price:data.price,stock:data.stock,data}:key==='orders'?{id:data.id,email:data.email,status:data.status,total:data.total,paymentReference:data.paymentReference||null,checkoutKey:data.checkoutKey||null,createdAt:data.createdAt,data}:key==='enquiries'?{id:data.id,createdAt:data.createdAt,data}:{id:data.id,data});}
async function save(db,before,transaction){for(const [key,model] of Object.entries(models)){
 const pk=key==='subscribers'?'email':'id';const rows=rowsFor(key,db),oldRows=rowsFor(key,before);const previous=new Map(oldRows.map(r=>[r[pk],JSON.stringify(r)]));
 for(const row of rows)if(previous.get(row[pk])!==JSON.stringify(row))await model.upsert(row,{transaction});
 const remaining=new Set(rows.map(r=>r[pk]));const removed=oldRows.filter(r=>!remaining.has(r[pk])).map(r=>r[pk]);if(removed.length)await model.destroy({where:{[pk]:{[Op.in]:removed}},transaction});
}}
// Serialize mutations across Node processes so stock, payment idempotency and content
// changes are committed atomically. PostgreSQL releases the lock on rollback/crash.
export async function withStore(callback){return sequelize.transaction(async transaction=>{
 await sequelize.query('SELECT pg_advisory_xact_lock(73210402)',{transaction});
 const db=await load(transaction);const before=structuredClone(db);
 const result=await callback({db,persist:async()=>{},sessionStore:Object.fromEntries(Object.entries(sessions).map(([key,fn])=>[key,token=>fn(token,transaction)]))});
 await save(db,before,transaction);return result;
});}
export async function importStore(input){return withStore(async({db})=>{
 if(db.products.length||db.orders.length||db.projects.length||db.enquiries.length||db.subscribers.length||Object.keys(db.content).length)throw Error('Import requires an empty database; existing records were not changed.');
 for(const key of Object.keys(models)){const value=input[key];if(key==='content'?(value&&typeof value==='object'&&!Array.isArray(value)):Array.isArray(value))db[key]=structuredClone(value);else throw Error('Invalid or missing store field: '+key)}
});}
