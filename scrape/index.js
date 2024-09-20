import puppeteer from 'puppeteer';

import SEED_PROFILES from '../lib/profile-list.js';
import { database } from '../lib/database.js';
import {
  seedProfiles,
  recordProfileData,
  recordThrowData,
  recordOpponentData,
  recordJsonData
} from './app.js';

// Start Up

console.log('Starting up...');

const START = Date.now();
const RULESET = 'IATF Premier';

const db = database('data');
const browser = await puppeteer.launch();
const page = await browser.newPage();

// Seed profiles

console.log('Seeding profiles...');

seedProfiles(db, SEED_PROFILES);

console.log('Done.');

// Record profile data

console.log('Recording profile data...');

const profiles = db.rows(`
  SELECT profileId FROM profiles
  WHERE fetch = 1
`);

console.log(`Processing ${profiles.length} profiles...`);

await recordProfileData(db, page, profiles, RULESET);

console.log('Done.');

// Record throw data

console.log('Recording throw data...');

const newMatches = db.rows(`
  SELECT profileId, seasonId, weekId, matchId
  FROM matches
  WHERE processed = 0
`);

console.log(`Processing ${newMatches.length} new matches...`);

await recordThrowData(db, page, newMatches);

console.log('Done.');

// Record Opponents

console.log('Recording opponent data...');

await recordOpponentData(db, page);

console.log('Done.');

// Write JSON

console.log('Writing JSON files...');

recordJsonData(db);

console.log('Done.');

// Tear Down

console.log('Tearing down...');

await browser.close();

db.shrink();

console.log('Done.');
console.log(`Total Runtime: ${Date.now() - START}ms`);