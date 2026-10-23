"use strict";
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const MySQLStoreFactory = require("express-mysql-session");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");

const app = express();
const SITE_VERSION = "1.2.4";
const PLATFORM_ADMIN_EMAIL = (process.env.PLATFORM_ADMIN_EMAIL || "jamesonrb2013@gmail.com").trim().toLowerCase();
const port = Number(process.env.PORT || 8080);
const production = process.env.NODE_ENV === "production";
const cookieName = production ? "__Host-okg.sid" : "okg.sid";
app.set("trust proxy", 1);
app.disable("x-powered-by");

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) throw new Error("Set DB_HOST, DB_USER, DB_PASSWORD and DB_NAME.");

const dbConfig = {
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  waitForConnections: true, connectionLimit: 10, queueLimit: 0,
  ssl: process.env.DB_SSL === "true" ? { ca: fs.readFileSync(path.join(__dirname, "ca.pem"), "utf8"), rejectUnauthorized: true } : undefined
};
const pool = mysql.createPool(dbConfig);
const sessionPool = require("mysql2").createPool(dbConfig);
const MySQLStore = MySQLStoreFactory(session);
const store = new MySQLStore({
  clearExpired: true, checkExpirationInterval: 900000, expiration: 604800000,
  createDatabaseTable: true, schema: { tableName: "okg_sessions" }
}, sessionPool);

app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
    imgSrc: ["'self'", "data:", "https:"], connectSrc: ["'self'"],
    objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"], formAction: ["'self'"]
  } }, crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "20kb" }));
app.use(session({
  name: cookieName, secret: process.env.SESSION_SECRET, store,
  resave: false, saveUninitialized: false, rolling: true,
  cookie: { httpOnly: true, secure: production, sameSite: "lax", maxAge: 604800000, path: "/" }
}));

const pages = new Set(["index.html","blog.html","help.html","announcements.html","staff.html","login.html","dashboard.html","owner-setup.html","okg-manager.html"]);
app.get("/", (_req,res) => { res.set("Cache-Control","no-store"); res.sendFile(path.join(__dirname,"index.html")); });
app.get("/api/version", (_req,res) => res.set("Cache-Control","no-store").json({ name:"OneKidGaming Website", version:SITE_VERSION }));
app.get("/okg-manager.html", (_req,res,next) => {
  const page = path.join(__dirname,"okg-manager.html");
  if (!fs.existsSync(page)) return res.status(503).type("text/plain").send("OKG Manager page is missing from this deployment. Expected website version " + SITE_VERSION + ".");
  res.set("Cache-Control","no-store");
  res.sendFile(page, err => { if (err) next(err); });
});
app.get("/invite", (_req, res) => {
  const installUrl = "https://discord.com/oauth2/authorize?client_id=1540731259544666132&permissions=1494917180630&integration_type=0&scope=bot%20applications.commands";
  res.redirect(302, installUrl);
});
app.get("/:page", (req,res,next) => {
  if (!pages.has(req.params.page)) return next();
  res.set("Cache-Control","no-store");
  res.sendFile(path.join(__dirname,req.params.page), err => { if (err) next(err); });
});
app.get("/styles.css", (_req,res) => { res.set("Cache-Control","no-store"); res.sendFile(path.join(__dirname,"styles.css")); });
app.get("/script.js", (_req,res) => { res.set("Cache-Control","no-store"); res.sendFile(path.join(__dirname,"script.js")); });
app.get("/portal.js", (_req,res) => res.sendFile(path.join(__dirname,"portal.js")));
app.use("/assets", express.static(path.join(__dirname,"assets"), { dotfiles:"deny", index:false }));

const authLimit = rateLimit({ windowMs: 900000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });
const signupLimit = rateLimit({ windowMs: 3600000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false });
function text(v,n=120){return typeof v==="string"?v.trim().slice(0,n):"";}
function emailOk(v){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)&&v.length<=254;}
function passwordOk(v){return typeof v==="string"&&v.length>=12&&v.length<=128;}
function safeUser(u){return{id:u.id,username:u.username,email:u.email,role:u.role,createdAt:u.created_at};}
function wrap(fn){return(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);}
app.use("/api", (req,res,next) => {
  const origin=req.get("origin");
  if(!origin)return next();
  let expected;
  try {
    const configuredOrigin=process.env.PUBLIC_ORIGIN;
    const normalizedOrigin=configuredOrigin
      ? (configuredOrigin.includes("://") ? configuredOrigin : "https://" + configuredOrigin)
      : req.protocol + "://" + req.get("host");
    expected=new URL(normalizedOrigin).origin;
  } catch { return res.status(403).json({error:"Request origin could not be verified."}); }
  if(origin!==expected)return res.status(403).json({error:"Request origin could not be verified."});
  next();
});
const signedIn=wrap(async(req,res,next)=>{
  if(!req.session.userId)return res.status(401).json({error:"Please sign in to continue."});
  const [rows]=await pool.execute("SELECT id,username,email,role,created_at FROM okg_users WHERE id=? LIMIT 1",[req.session.userId]);
  if(!rows.length){req.session.destroy(()=>{});return res.status(401).json({error:"Session expired. Sign in again."});}
  req.user=rows[0];next();
});
const roles=(...allowed)=>(req,res,next)=>req.user&&allowed.includes(req.user.role)?next():res.status(403).json({error:"You do not have permission to do that."});
async function audit(actor,action,target=null,details={}) {
  await pool.execute("INSERT INTO okg_audit_logs(actor_id,action,target_id,details_json) VALUES(?,?,?,?)",[actor,action,target,JSON.stringify(details).slice(0,4000)]);
}
async function initDb(){
  await pool.query(`CREATE TABLE IF NOT EXISTS okg_users(
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,username VARCHAR(24) NOT NULL UNIQUE,email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,role ENUM('member','staff','owner') NOT NULL DEFAULT 'member',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_role(role)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS okg_audit_logs(
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,actor_id BIGINT UNSIGNED NULL,action VARCHAR(80) NOT NULL,target_id BIGINT UNSIGNED NULL,
    details_json JSON NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX idx_audit_created(created_at),
    FOREIGN KEY(actor_id) REFERENCES okg_users(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS okg_support_tickets(
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id BIGINT UNSIGNED NULL,email VARCHAR(254) NOT NULL,
    subject VARCHAR(160) NOT NULL,message TEXT NOT NULL,status ENUM('open','in_progress','closed') NOT NULL DEFAULT 'open',
    assigned_to BIGINT UNSIGNED NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX idx_ticket_status(status,created_at),
    FOREIGN KEY(user_id) REFERENCES okg_users(id) ON DELETE SET NULL,FOREIGN KEY(assigned_to) REFERENCES okg_users(id) ON DELETE SET NULL)
    ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS okg_announcements(
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,title VARCHAR(180) NOT NULL,body TEXT NOT NULL,
    status ENUM('draft','published') NOT NULL DEFAULT 'draft',author_id BIGINT UNSIGNED NULL,published_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_announcement_status(status,published_at),FOREIGN KEY(author_id) REFERENCES okg_users(id) ON DELETE SET NULL)
    ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
app.get("/api/health",wrap(async(_req,res)=>{await pool.query("SELECT 1");res.json({ok:true,database:"connected"});}));
app.post("/api/auth/register",signupLimit,wrap(async(req,res)=>{
  const username=text(req.body.username,24),email=text(req.body.email,254).toLowerCase(),password=req.body.password;
  if(!/^[A-Za-z0-9_-]{3,24}$/.test(username))return res.status(400).json({error:"Username must be 3–24 letters, numbers, underscores or hyphens."});
  if(!emailOk(email))return res.status(400).json({error:"Enter a valid email address."});
  if(!passwordOk(password))return res.status(400).json({error:"Password must be 12–128 characters."});
  const [existing]=await pool.execute("SELECT id FROM okg_users WHERE email=? OR username=? LIMIT 1",[email,username]);
  if(existing.length)return res.status(409).json({error:"That email or username is already registered."});
  const hash=await bcrypt.hash(password,12);
  const [created]=await pool.execute("INSERT INTO okg_users(username,email,password_hash) VALUES(?,?,?)",[username,email,hash]);
  await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
  req.session.userId=created.insertId;
  await new Promise((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));
  await audit(created.insertId,"account.registered",created.insertId);
  const [rows]=await pool.execute("SELECT id,username,email,role,created_at FROM okg_users WHERE id=?",[created.insertId]);
  res.status(201).json({user:safeUser(rows[0])});
}));
app.post("/api/auth/login",authLimit,wrap(async(req,res)=>{
  const email=text(req.body.email,254).toLowerCase(),password=req.body.password;
  if(!email||typeof password!=="string")return res.status(400).json({error:"Enter your email and password."});
  const [rows]=await pool.execute("SELECT * FROM okg_users WHERE email=? LIMIT 1",[email]);
  if(!rows.length||!(await bcrypt.compare(password,rows[0].password_hash)))return res.status(401).json({error:"Email or password was incorrect."});
  await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
  req.session.userId=rows[0].id;
  await new Promise((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));
  await audit(rows[0].id,"account.login");
  res.json({user:safeUser(rows[0])});
}));
app.post("/api/auth/logout",signedIn,wrap(async(req,res)=>{
  await audit(req.user.id,"account.logout");
  await new Promise(resolve=>req.session.destroy(()=>resolve()));
  res.clearCookie(cookieName,{path:"/",httpOnly:true,sameSite:"lax",secure:production});
  res.json({ok:true});
}));
app.get("/api/auth/me",signedIn,(req,res)=>res.json({user:safeUser(req.user)}));
app.post("/api/setup/owner",authLimit,wrap(async(req,res)=>{
  const token=process.env.OWNER_BOOTSTRAP_TOKEN;
  if(!token||token.length<32)return res.status(404).json({error:"Owner setup is disabled."});
  const provided=typeof req.body.setupToken==="string"?req.body.setupToken:"",a=Buffer.from(provided),b=Buffer.from(token);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(403).json({error:"Owner setup token is incorrect."});
  const username=text(req.body.username,24),email=text(req.body.email,254).toLowerCase(),password=req.body.password;
  if(email!==PLATFORM_ADMIN_EMAIL)return res.status(403).json({error:"Owner setup is restricted to the configured platform admin email."});
  if(!/^[A-Za-z0-9_-]{3,24}$/.test(username)||!emailOk(email)||!passwordOk(password))return res.status(400).json({error:"Enter a valid username, the configured platform admin email, and a password of at least 12 characters."});
  const [matches]=await pool.execute("SELECT id,username,email,role FROM okg_users WHERE email=? OR username=? LIMIT 2",[email,username]);
  const emailUser=matches.find(user=>user.email===email);
  const usernameUser=matches.find(user=>user.username===username);
  if(usernameUser&&(!emailUser||usernameUser.id!==emailUser.id))return res.status(409).json({error:"That username is already registered to another email."});
  const hash=await bcrypt.hash(password,12);
  let userId;
  let action;
  if(emailUser){
    await pool.execute("UPDATE okg_users SET username=?,password_hash=?,role='owner' WHERE id=?",[username,hash,emailUser.id]);
    userId=emailUser.id;
    action="owner.platform_admin_recovered";
  }else{
    const [created]=await pool.execute("INSERT INTO okg_users(username,email,password_hash,role) VALUES(?,?,?,'owner')",[username,email,hash]);
    userId=created.insertId;
    action="owner.platform_admin_created";
  }
  await audit(userId,action,userId,{email:PLATFORM_ADMIN_EMAIL});
  await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
  req.session.userId=userId;
  await new Promise((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));
  const [rows]=await pool.execute("SELECT id,username,email,role,created_at FROM okg_users WHERE id=?",[userId]);
  res.status(201).json({user:safeUser(rows[0]),message:"Platform admin account is ready. Remove OWNER_BOOTSTRAP_TOKEN from the service environment now."});
}));
app.get("/api/announcements",wrap(async(_req,res)=>{
  const [rows]=await pool.execute("SELECT id,title,body,published_at FROM okg_announcements WHERE status='published' ORDER BY published_at DESC LIMIT 50");
  res.json({announcements:rows});
}));
app.post("/api/support/tickets",authLimit,wrap(async(req,res)=>{
  const email=text(req.body.email,254).toLowerCase(),subject=text(req.body.subject,160),message=text(req.body.message,5000);
  if(!emailOk(email)||subject.length<4||message.length<10)return res.status(400).json({error:"Enter a valid email, subject of at least 4 characters, and message of at least 10 characters."});
  const [result]=await pool.execute("INSERT INTO okg_support_tickets(user_id,email,subject,message) VALUES(?,?,?,?)",[req.session.userId||null,email,subject,message]);
  res.status(201).json({ok:true,ticketId:result.insertId,message:"Your support request has been saved."});
}));
app.get("/api/dashboard/summary",signedIn,wrap(async(req,res)=>{
  const [counts]=await pool.execute("SELECT COUNT(*) AS total,SUM(status='open') AS open FROM okg_support_tickets WHERE user_id=?",[req.user.id]);
  const [[ann]]=await pool.query("SELECT COUNT(*) AS total FROM okg_announcements WHERE status='published'");
  const data={user:safeUser(req.user),member:{mySupportRequests:Number(counts[0].total||0),openSupportRequests:Number(counts[0].open||0),publishedAnnouncements:Number(ann.total||0)}};
  if(["staff","owner"].includes(req.user.role)){
    const [tickets]=await pool.execute("SELECT id,email,subject,status,assigned_to,created_at FROM okg_support_tickets ORDER BY FIELD(status,'open','in_progress','closed'),created_at DESC LIMIT 50");
    data.staff={openTickets:tickets.filter(t=>t.status==="open").length,tickets};
  }
  if(req.user.role==="owner"){
    const [[users]]=await pool.query("SELECT COUNT(*) AS total FROM okg_users");
    const [[staff]]=await pool.query("SELECT COUNT(*) AS total FROM okg_users WHERE role='staff'");
    const [[logs]]=await pool.query("SELECT COUNT(*) AS total FROM okg_audit_logs WHERE created_at>=NOW()-INTERVAL 7 DAY");
    data.owner={totalUsers:Number(users.total),staffMembers:Number(staff.total),auditEventsLast7Days:Number(logs.total)};
    const [allUsers]=await pool.execute("SELECT id,username,email,role,created_at FROM okg_users ORDER BY created_at DESC LIMIT 100");
    data.owner.users=allUsers.map(safeUser);
    const [auditRows]=await pool.execute("SELECT id,actor_id,action,target_id,created_at FROM okg_audit_logs ORDER BY created_at DESC LIMIT 25");
    data.owner.recentAudit=auditRows;
  }
  res.json(data);
}));
app.patch("/api/owner/users/:id/role",signedIn,roles("owner"),wrap(async(req,res)=>{
  const id=Number(req.params.id),role=req.body.role;
  if(!Number.isSafeInteger(id)||id<1||!["member","staff"].includes(role))return res.status(400).json({error:"Choose a valid user and member or staff role. Owner cannot be assigned here."});
  const [target]=await pool.execute("SELECT id,role FROM okg_users WHERE id=? LIMIT 1",[id]);
  if(!target.length)return res.status(404).json({error:"User not found."});
  if(target[0].role==="owner")return res.status(403).json({error:"Owner role cannot be changed through this endpoint."});
  await pool.execute("UPDATE okg_users SET role=? WHERE id=?",[role,id]);
  await audit(req.user.id,"user.role_changed",id,{role});res.json({ok:true});
}));
app.get("/api/staff/tickets",signedIn,roles("staff","owner"),wrap(async(_req,res)=>{
  const [tickets]=await pool.execute("SELECT id,user_id,email,subject,message,status,assigned_to,created_at,updated_at FROM okg_support_tickets ORDER BY FIELD(status,'open','in_progress','closed'),created_at DESC LIMIT 100");
  res.json({tickets});
}));
app.patch("/api/staff/tickets/:id",signedIn,roles("staff","owner"),wrap(async(req,res)=>{
  const id=Number(req.params.id),status=req.body.status;
  if(!Number.isSafeInteger(id)||id<1||!["open","in_progress","closed"].includes(status))return res.status(400).json({error:"Choose a valid ticket and status."});
  const [updated]=await pool.execute("UPDATE okg_support_tickets SET status=?,assigned_to=? WHERE id=?",[status,req.user.id,id]);
  if(!updated.affectedRows)return res.status(404).json({error:"Support request not found."});
  await audit(req.user.id,"support.ticket_updated",id,{status});res.json({ok:true});
}));
app.post("/api/staff/announcements",signedIn,roles("staff","owner"),wrap(async(req,res)=>{
  const title=text(req.body.title,180),body=text(req.body.body,10000),publish=req.user.role==="owner"&&req.body.status==="published";
  if(title.length<4||body.length<10)return res.status(400).json({error:"Title must be at least 4 characters and body at least 10 characters."});
  const [created]=await pool.execute("INSERT INTO okg_announcements(title,body,status,author_id,published_at) VALUES(?,?,?,?,?)",[title,body,publish?"published":"draft",req.user.id,publish?new Date():null]);
  await audit(req.user.id,publish?"announcement.published":"announcement.drafted",created.insertId);
  res.status(201).json({ok:true,id:created.insertId,status:publish?"published":"draft"});
}));
app.use("/api",(_req,res)=>res.status(404).json({error:"API endpoint not found."}));
app.use((err,_req,res,_next)=>{
  if(err&&err.code==="ER_DUP_ENTRY")return res.status(409).json({error:"That email or username is already in use."});
  console.error("Request failed:",err&&(err.stack||err.message||err));
  res.status(500).json({error:"Something went wrong. Please try again shortly."});
});
async function start(){
  await initDb();
  await new Promise((resolve,reject)=>{const server=app.listen(port,"0.0.0.0",resolve);server.once("error",reject);});
  console.log("OKG portal server listening on "+port);
}
start().catch(err=>{console.error("Could not start OKG portal:",err.message);process.exit(1);});
process.on("SIGTERM",async()=>{await store.close();await new Promise(resolve=>sessionPool.end(resolve));await pool.end();process.exit(0);});
