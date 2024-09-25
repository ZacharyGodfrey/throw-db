import { writeFile } from '../lib/file.js'

// Helpers

const enums = {
  tool: {
    hatchet: 'hatchet',
    bigAxe: 'big axe'
  },
  target: {
    bullseye: 'bullseye',
    clutch: 'clutch'
  }
};

const reactPageState = (page, selector) => {
  return page.$eval(selector, (element) => {
    return element._reactRootContainer._internalRoot.current.memoizedState.element.props.store.getState();
  });
};

const isDesiredResponse = (method, status, url) => {
  return (response) => {
    return response.request().method() === method
      && response.status() === status
      && response.url() === url;
  };
};

const waitMilliseconds = (milliseconds) => {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
};

const round = (places, value) => {
  const factor = 10 ** places;

  return Math.round(value * factor) / factor;
};

// Retrieve Data

const fetchProfileImage = async (profileId) => {
  const url = `https://admin.axescores.com/pic/${profileId}`;
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  return base64;
};

const fetchPlayerData = async (page, profileId) => {
  await page.goto(`https://axescores.com/player/${profileId}`, { waitUntil: 'networkidle2' });
  await waitMilliseconds(1000);

  const state = await reactPageState(page, '#root');

  return state.player.playerData;
};

const fetchThrowData = async (page, profileId, matchId) => {
  const throws = [];
  const url = `https://axescores.com/player/${profileId}/${matchId}`;
  const apiUrl = `https://api.axescores.com/match/${matchId}`;

  const [apiResponse] = await Promise.all([
    page.waitForResponse(isDesiredResponse('GET', 200, apiUrl), { timeout: 2000 }),
    page.goto(url)
  ]);

  const rawMatch = await apiResponse.json();

  if (rawMatch.rounds.length > 4) {
    console.log(`Invalid round count: ${rawMatch.rounds.length}`);
    return throws;
  }

  if (rawMatch.players.find(x => x.id === profileId)?.forfeit === true) {
    console.log('Match is forfeit');
    return throws;
  }

  const opponentId = rawMatch.players.find(x => x.id !== profileId)?.id ?? 0;

  for (const { order: roundNumber, name, games } of rawMatch.rounds) {
    const game = games.find(x => x.player === profileId);

    if (!game || game.forfeit === true) {
      continue;
    }

    const isBigAxe = name === 'Tie Break';
    const { Axes: axes = [] } = game;

    for (const { order: throwNumber, score, clutchCalled: isClutch } of axes) {
      throws.push({
        profileId,
        opponentId,
        matchId,
        roundId: roundNumber,
        throwId: throwNumber,
        tool: isBigAxe ? enums.tool.bigAxe : enums.tool.hatchet,
        target: isClutch ? enums.target.clutch : enums.target.bullseye,
        score
      });
    }
  }

  return throws;
};

// Process Data

const buildStats = (throws) => {
  const result = {
    overall: {
      attempts: 0,
      totalScore: 0,
      scorePerAxe: 0
    },
    hatchet: {
      overall: {
        attempts: 0,
        totalScore: 0,
        scorePerAxe: 0
      },
      bullseye: {
        attempts: 0,
        totalScore: 0,
        scorePerAxe: 0,
        breakdown: {
          0: 0,
          1: 0,
          3: 0,
          5: 0
        }
      },
      clutch: {
        attempts: 0,
        totalScore: 0,
        scorePerAxe: 0,
        breakdown: {
          0: 0,
          5: 0,
          7: 0
        }
      }
    },
    bigAxe: {
      overall: {
        attempts: 0,
        totalScore: 0,
        scorePerAxe: 0
      },
      bullseye: {
        attempts: 0,
        totalScore: 0,
        scorePerAxe: 0,
        breakdown: {
          0: 0,
          1: 0,
          3: 0,
          5: 0
        }
      },
      clutch: {
        attempts: 0,
        totalScore: 0,
        scorePerAxe: 0,
        breakdown: {
          0: 0,
          5: 0,
          7: 0
        }
      }
    }
  };

  for (const { tool, target, score } of throws) {
    result.overall.attempts += 1;
    result.overall.totalScore += score;

    if (tool === enums.tool.hatchet) {
      result.hatchet.overall.attempts += 1;
      result.hatchet.overall.totalScore += score;

      if (target === enums.target.bullseye) {
        result.hatchet.bullseye.attempts += 1;
        result.hatchet.bullseye.totalScore += score;
        result.hatchet.bullseye.breakdown[score] += 1;
      } else if (target === enums.target.clutch) {
        result.hatchet.clutch.attempts += 1;
        result.hatchet.clutch.totalScore += score;
        result.hatchet.clutch.breakdown[score] += 1;
      }
    } else if (tool === enums.tool.bigAxe) {
      result.bigAxe.overall.attempts += 1;
      result.bigAxe.overall.totalScore += score;

      if (target === enums.target.bullseye) {
        result.bigAxe.bullseye.attempts += 1;
        result.bigAxe.bullseye.totalScore += score;
        result.bigAxe.bullseye.breakdown[score] += 1;
      } else if (target === enums.target.clutch) {
        result.bigAxe.clutch.attempts += 1;
        result.bigAxe.clutch.totalScore += score;
        result.bigAxe.clutch.breakdown[score] += 1;
      }
    }
  }

  result.overall.scorePerAxe = round(2, result.overall.totalScore / Math.max(1, result.overall.attempts));
  result.hatchet.overall.scorePerAxe = round(2, result.hatchet.overall.totalScore / Math.max(1, result.hatchet.overall.attempts));
  result.bigAxe.overall.scorePerAxe = round(2, result.bigAxe.overall.totalScore / Math.max(1, result.bigAxe.overall.attempts));

  result.hatchet.bullseye.scorePerAxe = round(2, result.hatchet.bullseye.totalScore / Math.max(1, result.hatchet.bullseye.attempts));

  result.hatchet.clutch.scorePerAxe = round(2, result.hatchet.clutch.totalScore / Math.max(1, result.hatchet.clutch.attempts));

  result.bigAxe.bullseye.scorePerAxe = round(2, result.bigAxe.bullseye.totalScore / Math.max(1, result.bigAxe.bullseye.attempts));

  result.bigAxe.clutch.scorePerAxe = round(2, result.bigAxe.clutch.totalScore / Math.max(1, result.bigAxe.clutch.attempts));

  return result;
};

// Workflow Steps

export const seedProfiles = (db, profileIds) => {
  for (const profileId of profileIds) {
    db.run(`
      INSERT INTO profiles (profileId, fetch)
      VALUES (:profileId, 1)
      ON CONFLICT (profileId) DO UPDATE
      SET fetch = 1
    `, { profileId });
  }
};

export const recordProfileData = async (db, page, profiles, ruleset) => {
  for (const { profileId } of profiles) {
    try {
      console.log(`Profile ${profileId}`);

      const playerData = await fetchPlayerData(page, profileId);
      const { name, leagues } = playerData;

      db.run(`
        UPDATE profiles
        SET name = :name
        WHERE profileId = :profileId
      `, { profileId, name });

      for (const { id: seasonId, seasonWeeks, performanceName, ...season } of leagues) {
        if (performanceName !== ruleset) {
          continue;
        }

        console.log(`Season ${seasonId}`);

        const name = `${season.name.trim()} ${season.shortName.trim()}`;
        const year = parseInt(season.date.split('-')[0]);

        db.run(`
          INSERT INTO seasons (seasonId, name, year)
          VALUES (:seasonId, :name, :year)
          ON CONFLICT (seasonId) DO UPDATE
          SET name = :name, year = :year
        `, { seasonId, name, year });

        for (const { week: weekId, matches } of seasonWeeks) {
          console.log(`Week ${weekId}`);

          for (const { id: matchId } of matches) {
            console.log(`Match ${matchId}`);

            db.run(`
              INSERT INTO matches (profileId, seasonId, weekId, matchId)
              VALUES (:profileId, :seasonId, :weekId, :matchId)
              ON CONFLICT (profileId, matchId) DO UPDATE
              SET weekId = :weekId
            `, { profileId, seasonId, weekId, matchId });

            db.run(`
              UPDATE throws
              SET weekId = :weekId
              WHERE profileId = :profileId AND matchId = :matchId
            `, { profileId, matchId, weekId });
          }
        }
      }
    } catch (error) {
      console.log(`Failed to get data for profile ${profileId}`);
      console.error(error);
    }
  }
};

export const recordThrowData = async (db, page, newMatches) => {
  for (const { profileId, seasonId, weekId, matchId } of newMatches) {
    try {
      console.log(`Match ${matchId}`);

      const throws = await fetchThrowData(page, profileId, matchId);

      if (throws.length < 1) {
        continue;
      }

      const { opponentId } = throws[0];

      console.table(throws);

      for (const row of throws) {
        db.insert('throws', { ...row, seasonId, weekId });
      }

      db.run(`
        UPDATE matches
        SET processed = 1, opponentId = :opponentId
        WHERE profileId = :profileId AND matchId = :matchId
      `, { profileId, opponentId, matchId });
    } catch (error) {
      console.log(`Failed to get throw data for match ${matchId}`);
      console.error(error);
    }
  }
};

export const recordOpponentData = async (db, page) => {
  const opponents = db.rows(`
    SELECT DISTINCT opponentId FROM matches
    WHERE opponentId > 0 AND opponentId NOT IN (
      SELECT profileId FROM profiles
      WHERE fetch = 1
    )
  `);

  console.log(`Found ${opponents.length} opponents...`);

  for (const { opponentId: profileId } of opponents) {
    try {
      console.log(`Opponent ${profileId}`);

      const playerData = await fetchPlayerData(page, profileId);
      const { name } = playerData;

      db.run(`
        INSERT INTO profiles (profileId, name)
        VALUES (:profileId, :name)
        ON CONFLICT (profileId) DO UPDATE
        SET name = :name
      `, { profileId, name });
    } catch (error) {
      console.log(`Failed to get opponent data for profile ${profileId}`);
      console.error(error);
    }
  }
};

export const recordImageData = async (db) => {
  const profiles = db.rows(`
    SELECT profileId
    FROM profiles
  `);

  for (const { profileId } of profiles) {
    try {
      console.log(`Profile ${profileId}`);

      const image = await fetchProfileImage(profileId);

      db.run(`
        INSERT INTO images (profileId, image)
        VALUES (:profileId, :image)
        ON CONFLICT (profileId) DO UPDATE
        SET image = :image
      `, { profileId, image });
    } catch (error) {
      console.log(`Failed to get image data for ${profileId}`);
      console.error(error);
    }
  }
};

export const recordJsonData = (db) => {
  const profiles = db.rows(`
    SELECT profileId, name
    FROM profiles
    WHERE fetch = 1
  `);

  for (const { profileId, name } of profiles) {
    const career = {
      profileId,
      name,
      stats: null,
      seasons: []
    };

    career.stats = buildStats(db.rows(`
      SELECT tool, target, score
      FROM throws
      WHERE profileId = :profileId
      ORDER BY seasonId ASC, weekId ASC, matchId ASC, roundId ASC, throwId ASC
    `, { profileId }));

    const seasons = db.rows(`
      SELECT seasonId, name, year
      FROM seasons
      WHERE seasonId IN (
        SELECT DISTINCT seasonId
        FROM matches
        WHERE profileId = :profileId
      )
      ORDER BY seasonId ASC
    `, { profileId });

    for (const { seasonId, name, year } of seasons) {
      const season = {
        seasonId,
        name,
        year,
        stats: null,
        weeks: []
      };

      season.stats = buildStats(db.rows(`
        SELECT tool, target, score
        FROM throws
        WHERE profileId = :profileId AND seasonId = :seasonId
        ORDER BY weekId ASC, matchId ASC, roundId ASC, throwId ASC
      `, { profileId, seasonId }));

      const weeks = db.rows(`
        SELECT DISTINCT weekId
        FROM matches
        WHERE profileId = :profileId AND seasonId = :seasonId
        ORDER BY weekId ASC
      `, { profileId, seasonId });

      for (const { weekId } of weeks) {
        const week = {
          weekId,
          stats: null,
          matches: []
        };

        week.stats = buildStats(db.rows(`
          SELECT tool, target, score
          FROM throws
          WHERE profileId = :profileId AND seasonId = :seasonId AND weekId = :weekId
          ORDER BY matchId ASC, roundId ASC, throwId ASC
        `, { profileId, seasonId, weekId }));

        const matches = db.rows(`
          SELECT matchId, opponentId
          FROM matches
          WHERE profileId = :profileId AND seasonId = :seasonId AND weekId = :weekId
          ORDER BY matchId ASC
        `, { profileId, seasonId, weekId });

        for (const { matchId, opponentId } of matches) {
          const match = {
            matchId,
            opponentId,
            stats: null,
            rounds: []
          };

          match.stats = buildStats(db.rows(`
            SELECT tool, target, score
            FROM throws
            WHERE profileId = :profileId AND matchId = :matchId
            ORDER BY roundId ASC, throwId ASC
          `, { profileId, matchId }));

          const rounds = db.rows(`
            SELECT DISTINCT roundId
            FROM throws
            WHERE profileId = :profileId AND matchId = :matchId
            ORDER BY roundId ASC
          `, { profileId, matchId });

          for (const { roundId } of rounds) {
            const round = {
              roundId,
              stats: null,
              throws: []
            };

            round.throws = db.rows(`
              SELECT throwId, tool, target, score
              FROM throws
              WHERE profileId = :profileId AND matchId = :matchId AND roundId = :roundId
              ORDER BY throwId ASC
            `, { profileId, matchId, roundId });

            round.stats = buildStats(round.throws);

            match.rounds.push(round);
          }

          week.matches.push(match);
        }

        season.weeks.push(week);
      }

      writeFile(`data/profiles/${profileId}/s/${seasonId}.json`, JSON.stringify(season, null, 2));

      delete season.weeks;

      career.seasons.push(season);
    }

    writeFile(`data/profiles/${profileId}.json`, JSON.stringify(career, null, 2));
  }
};