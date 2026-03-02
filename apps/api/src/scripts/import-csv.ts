import fs from 'fs/promises';
import path from 'path';
import { pool } from '../db/pool.js';
const query = pool.query.bind(pool);

function parseCSV(content: string): string[][] {
  const lines = content.split('\n');
  return lines.map(line => {
    const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
    return line.split(regex).map(val => val.replace(/^"|"$/g, '').trim());
  }).filter(row => row.length > 1);
}

function parseDate(ddmmyyyy: string) {
  const parts = ddmmyyyy.split('/');
  const d = parts[0] || '01';
  const m = parts[1] || '01';
  const y = parts[2] || '2000';
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

async function main() {
  console.log("Starting CSV import...");
  
  // 1. Clear existing data
  console.log("Clearing database...");
  await query(`TRUNCATE players, games, bank_transactions CASCADE`);

  // 2. Load players
  console.log("Importing players...");
  const playersPath = path.resolve(process.cwd(), '../../csv_imports/Players.csv');
  const playersContent = await fs.readFile(playersPath, 'utf-8');
  const playersRows = parseCSV(playersContent).slice(1);
  
  const playerMap = new Map<string, string>();
  for (const row of playersRows) {
    const displayName = row[0] || '';
    const aliases = row[1] || '';
    
    const pRes = await query(`INSERT INTO players (display_name, active) VALUES ($1, true) RETURNING id`, [displayName]);
    const playerId = String(pRes.rows[0]!.id);
    playerMap.set(displayName, playerId);
    
    const aliasList = [displayName];
    if (aliases) {
      aliasList.push(...aliases.split(',').map(a => a.trim()));
    }
    
    const lastName = String(displayName).split(' ').pop();
    if (lastName) aliasList.push(lastName);

    for (const alias of aliasList) {
      if (!alias) continue;
      const normalized = alias.replace(/[^a-z0-9]/gi, '').toLowerCase();
      await query(`
        INSERT INTO player_aliases (player_id, source, alias_raw, alias_normalized)
        VALUES ($1, 'legacy', $2, $3)
        ON CONFLICT (player_id, source, alias_normalized) DO NOTHING
      `, [playerId, alias, normalized]);
    }
  }

  // 3. Load attendance
  console.log("Importing attendance...");
  const attPath = path.resolve(process.cwd(), '../../csv_imports/Raw Attendance.csv');
  const attContent = await fs.readFile(attPath, 'utf-8');
  const attRows = parseCSV(attContent).slice(1);
  
  const gamesByDate = new Map<string, { fee: number, players: {name: string, cost: number}[] }>();
  for (const row of attRows) {
    const name = row[0] || '';
    const dateStr = row[4] || '';
    const cost = parseFloat(row[5] || '0');
    if (!name || !dateStr) continue;
    
    const isoDate = parseDate(dateStr);
    if (!gamesByDate.has(isoDate)) {
      gamesByDate.set(isoDate, { fee: cost * 100, players: [] });
    }
    gamesByDate.get(isoDate)!.players.push({ name, cost: cost * 100 });
  }

  for (const [date, gameData] of gamesByDate.entries()) {
    const maxFee = Math.max(...gameData.players.map(p => p.cost));
    const gameRes = await query(`
      INSERT INTO games (game_date, fee_cents, source, status)
      VALUES ($1, $2, 'legacy', 'completed')
      RETURNING id
    `, [date, maxFee || 1000]);
    const gameId = String(gameRes.rows[0]!.id);
    
    for (const p of gameData.players) {
      let pId = playerMap.get(p.name);
      if (!pId) {
        console.warn(`[Auto-Create] Missing player ${p.name} from attendance. Creating as inactive.`);
        const pRes = await query(`INSERT INTO players (display_name, active) VALUES ($1, false) RETURNING id`, [p.name]);
        pId = String(pRes.rows[0]!.id);
        playerMap.set(p.name, pId);
        
        const aliasList = [p.name];
        const lastName = String(p.name).split(' ').pop();
        if (lastName && lastName !== p.name) aliasList.push(lastName);
        for (const alias of aliasList) {
          const norm = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
          try {
            await query(`INSERT INTO player_aliases (player_id, alias, alias_normalized) VALUES ($1, $2, $3)`, [pId, alias, norm]);
          } catch (e) {
            // ignore dupes
          }
        }
      }
      
      const attRes = await query(`
        INSERT INTO attendance (game_id, player_id, source_status, chargeable, source_ref)
        VALUES ($1, $2, 'legacy', true, 'import')
        RETURNING id
      `, [gameId, pId]);
      
      await query(`
        INSERT INTO ledger_entries (player_id, type, amount_cents, game_id, attendance_id, created_at)
        VALUES ($1, 'charge', $2, $3, $4, $5)
      `, [pId, p.cost, gameId, attRes.rows[0]!.id, `${date} 00:00:00Z`]);
      
      await query(`
        UPDATE players SET current_balance_cents = current_balance_cents + $1 WHERE id = $2
      `, [p.cost, pId]); // Charge INCREASES the balance owed
    }
  }

  // 4. Load payments
  console.log("Importing payments...");
  const payPath = path.resolve(process.cwd(), '../../csv_imports/Raw Payments.csv');
  const payContent = await fs.readFile(payPath, 'utf-8');
  const payRows = parseCSV(payContent).slice(1);
  
  // load all aliases into memory for matching
  const aliasesRes = await query(`SELECT player_id, alias_normalized FROM player_aliases`);
  const allAliases = aliasesRes.rows;

  // Track bank txn IDs to avoid conflicts (some rows lack unique ID)
  const usedTxnIds = new Set<string>();

  for (let i = 0; i < payRows.length; i++) {
    const row = payRows[i];
    if (!row) continue;
    const dateStr = row[0] || '';
    if (!dateStr || dateStr.split('/').length !== 3) continue;
    const isoDate = parseDate(dateStr);
    const desc = row[1] || '';
    const amount = parseFloat(row[2] || '0');
    if (isNaN(amount) || amount <= 0) continue;
    
    let extId = String(row[3] || row[4] || `legacy-${isoDate}-${i}`);
    if (usedTxnIds.has(extId)) {
      extId = extId + '-' + i;
    }
    usedTxnIds.add(extId);
    
    let bTxnId;
    try {
      const bRes = await query(`
        INSERT INTO bank_transactions (external_txn_id, posted_at_utc, amount_cents, description_raw, source_ref, created_at)
        VALUES ($1, $2, $3, $4, 'legacy', $5)
        RETURNING id
      `, [extId, `${isoDate} 00:00:00Z`, amount * 100, desc, `${isoDate} 00:00:00Z`]);
      bTxnId = String(bRes.rows[0]!.id);
    } catch (e) {
      console.warn("Skip dup bank txn:", extId);
      continue;
    }

    // Matching logic
    const normalizedDesc = String(desc).replace(/[^a-z0-9]/gi, '').toLowerCase();
    let matchedPlayerId = null;
    let maxLen = 0;
    
    for (const al of allAliases) {
      if (typeof al.alias_normalized === 'string' && normalizedDesc.includes(al.alias_normalized) && al.alias_normalized.length > maxLen) {
        // Must be at least 4 letters to avoid matching tiny noise like 'alan' in 'balance' if any
        if (al.alias_normalized.length > 3) {
          matchedPlayerId = al.player_id;
          maxLen = al.alias_normalized.length;
        }
      }
    }
    
    if (matchedPlayerId) {
      const amountCents = amount * 100;
      await query(`
        INSERT INTO ledger_entries (player_id, type, amount_cents, bank_transaction_id, created_at)
        VALUES ($1, 'payment', $2, $3, $4)
      `, [matchedPlayerId, amountCents, bTxnId, `${isoDate} 00:00:00Z`]);
      
      await query(`
        UPDATE players SET current_balance_cents = current_balance_cents - $1 WHERE id = $2
      `, [amountCents, matchedPlayerId]); // Payment DECREASES balance owed
    } else {
      // Add to reconciliation queue
      await query(`
        INSERT INTO reconciliation_queue (item_type, source_record_id, payload, reason)
        VALUES ('bank_transaction', $1, $2, 'No legacy player matched')
      `, [bTxnId, JSON.stringify({ dateStr, desc, amount })]);
    }
  }

  console.log("Done.");
  process.exit(0);
}

main().catch(console.error);
