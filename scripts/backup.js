'use strict';
const {DatabaseSync}=require('node:sqlite');const path=require('node:path');
const file=process.argv[2];if(!file)throw new Error('Usage: node --env-file-if-exists=.env scripts/backup.js /backup/new-file.sqlite');
const source=process.env.DB_PATH||'data/bookings.sqlite';if(!require('node:fs').existsSync(source))throw new Error('Database file does not exist');const db=new DatabaseSync(source);db.prepare('VACUUM INTO ?').run(path.resolve(file));db.close();console.log('Consistent SQLite backup created');
