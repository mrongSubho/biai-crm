// @ts-ignore
import { DatabaseSync } from 'node:sqlite';
// @ts-ignore
import fs from 'node:fs';
// @ts-ignore
import path from 'node:path';

export function createTestD1Database() {
  const db = new DatabaseSync(':memory:');
  const dir = (import.meta as any).dirname || '.';

  const mig1Path = path.resolve(dir, '../migrations/0001_core_crm_schema.sql');
  const mig2Path = path.resolve(dir, '../migrations/0002_seed_knowledge_and_sample_enquiries.sql');
  const mig3Path = path.resolve(dir, '../migrations/0003_identity_control_plane.sql');
  const mig4Path = path.resolve(dir, '../migrations/0004_durable_outbound_delivery.sql');
  const mig5Path = path.resolve(dir, '../migrations/0005_delivery_provider_response.sql');
  const mig6Path = path.resolve(dir, '../migrations/0006_account_admin_and_messaging.sql');

  const mig1 = fs.readFileSync(mig1Path, 'utf8');
  const mig2 = fs.readFileSync(mig2Path, 'utf8');
  const mig3 = fs.readFileSync(mig3Path, 'utf8');
  const mig4 = fs.readFileSync(mig4Path, 'utf8');
  const mig5 = fs.readFileSync(mig5Path, 'utf8');
  const mig6 = fs.readFileSync(mig6Path, 'utf8');

  db.exec(mig1);
  db.exec(mig2);
  db.exec(mig3);
  db.exec(mig4);
  db.exec(mig5);
  db.exec(mig6);
  db.exec(`
    UPDATE users
    SET password_hash = '$pbkdf2-sha256$i=100000$Y3JtcmVwLXNhbHQtMTIzNA==$tpsQBWQ19YFqOYx+rUDqxSOEnNjsknRmHVvl1FcdBlk=',
        status = 'ACTIVE',
        failed_login_count = 0,
        locked_until = NULL
    WHERE id = 'usr_rep_1';
  `);

  return {
    rawDb: db,
    prepare(sql: string) {
      let boundParams: any[] = [];
      return {
        bind(...params: any[]) {
          boundParams = params;
          return this;
        },
        async first<T = any>(col?: string): Promise<T | null> {
          const stmt = db.prepare(sql);
          const row = stmt.get(...boundParams) as any;
          if (!row) return null;
          if (col) return row[col];
          return row as T;
        },
        async all<T = any>(): Promise<{ results: T[]; success: boolean; meta: any }> {
          const stmt = db.prepare(sql);
          const results = stmt.all(...boundParams) as T[];
          return { results, success: true, meta: {} };
        },
        async run(): Promise<{ success: boolean; meta: any }> {
          const stmt = db.prepare(sql);
          const info = stmt.run(...boundParams);
          return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
        }
      };
    },
    async batch(stmts: any[]): Promise<any[]> {
      const res = [];
      db.exec('BEGIN TRANSACTION;');
      try {
        for (const s of stmts) {
          res.push(await s.run());
        }
        db.exec('COMMIT;');
        return res;
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    },
    async exec(sql: string): Promise<any> {
      db.exec(sql);
    }
  };
}
