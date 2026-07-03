/**
 * /lib/db.js
 * Vector Platform — Supabase Database utility
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// Use service role key if available for admin tasks, fallback to anon
const supabaseKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail gracefully or log if keys are missing in the runtime environment
if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠️ Supabase URL or Key is missing in environment variables.");
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

/**
 * Read all records from a Supabase table.
 * @param {string} tableName
 * @returns {Promise<Array>} Array of records
 */
export async function readDB(tableName) {
  const { data, error } = await supabase.from(tableName).select('*');
  if (error) throw new Error(`readDB(${tableName}): ${error.message}`);
  return data || [];
}

/**
 * Write an entire array back to Supabase via Upsert.
 * @param {string} tableName
 * @param {Array} dataArray
 */
export async function writeDB(tableName, dataArray) {
  if (!dataArray || dataArray.length === 0) return;
  const { error } = await supabase.from(tableName).upsert(dataArray);
  if (error) throw new Error(`writeDB(${tableName}): ${error.message}`);
}

/**
 * Find a single record by its `id` field.
 * @param {string} tableName
 * @param {string} id
 * @returns {Promise<Object|null>} The matching record or null
 */
export async function findById(tableName, id) {
  const { data, error } = await supabase.from(tableName).select('*').eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null; // No rows found
    throw new Error(`findById(${tableName}): ${error.message}`);
  }
  return data || null;
}

/**
 * Insert a new record.
 * @param {string} tableName
 * @param {Object} record - Must already have an `id` field
 * @returns {Promise<Object>} The inserted record
 */
export async function insertRecord(tableName, record) {
  const { data, error } = await supabase.from(tableName).insert(record).select().single();
  if (error) throw new Error(`insertRecord(${tableName}): ${error.message}`);
  return data;
}

/**
 * Update the record with matching `id`.
 * @param {string} tableName
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<Object>} The updated record
 */
export async function updateRecord(tableName, id, updates) {
  const { data, error } = await supabase.from(tableName).update(updates).eq('id', id).select().single();
  if (error) throw new Error(`updateRecord(${tableName}): ${error.message}`);
  return data;
}

/**
 * Remove the record with the given id.
 * @param {string} tableName
 * @param {string} id
 * @returns {Promise<boolean>} true if deleted, false if error
 */
export async function deleteRecord(tableName, id) {
  const { error } = await supabase.from(tableName).delete().eq('id', id);
  if (error) throw new Error(`deleteRecord(${tableName}): ${error.message}`);
  return true;
}

/**
 * Convenience: return all records matching a predicate (in-memory filter).
 * @param {string} tableName
 * @param {Function} predicate
 * @returns {Promise<Array>}
 */
export async function findWhere(tableName, predicate) {
  const records = await readDB(tableName);
  return records.filter(predicate);
}

/**
 * Upsert: insert if no record with that id exists, else update.
 * @param {string} tableName
 * @param {Object} record - Must have an `id` field
 * @returns {Promise<Object>}
 */
export async function upsertRecord(tableName, record) {
  const { data, error } = await supabase.from(tableName).upsert(record).select().single();
  if (error) throw new Error(`upsertRecord(${tableName}): ${error.message}`);
  return data;
}
