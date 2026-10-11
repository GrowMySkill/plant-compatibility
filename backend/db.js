const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "data", "plantory.db");
const jsonPath = path.join(__dirname, "data", "plants.json");

const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

db.exec(`
    CREATE TABLE IF NOT EXISTS plants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        scientific_name TEXT,
        description TEXT,
        image TEXT
    );

    CREATE TABLE IF NOT EXISTS plant_synonyms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plant_id TEXT NOT NULL,
        synonym TEXT NOT NULL,
        FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS plant_tips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plant_id TEXT NOT NULL,
        tip TEXT NOT NULL,
        FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS plant_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plant_id TEXT NOT NULL,
        related_plant_name TEXT NOT NULL,
        related_plant_id TEXT,
relationship_type TEXT NOT NULL CHECK (relationship_type IN ('compatible', 'incompatible')),
reason TEXT,
        verified INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE,
        FOREIGN KEY (related_plant_id) REFERENCES plants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_plant_synonyms_plant_id
    ON plant_synonyms(plant_id);

    CREATE INDEX IF NOT EXISTS idx_plant_tips_plant_id
    ON plant_tips(plant_id);

    CREATE INDEX IF NOT EXISTS idx_plant_relationships_plant_id
    ON plant_relationships(plant_id);

CREATE INDEX IF NOT EXISTS idx_plants_name
ON plants(name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_plants_scientific_name
ON plants(scientific_name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_plant_synonyms_synonym
ON plant_synonyms(synonym COLLATE NOCASE);

`);

function initializeDatabase() {
    const count = db.prepare("SELECT COUNT(*) AS count FROM plants").get().count;

    if (count > 0) {
        return;
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

    const insert = db.transaction(() => {
        const insertPlant = db.prepare(`
            INSERT INTO plants (id, name, scientific_name, description, image)
            VALUES (?, ?, ?, ?, ?)
        `);

        const insertSynonym = db.prepare(`
            INSERT INTO plant_synonyms (plant_id, synonym)
            VALUES (?, ?)
        `);

        const insertTip = db.prepare(`
            INSERT INTO plant_tips (plant_id, tip)
            VALUES (?, ?)
        `);


        const insertRelationship = db.prepare(`
    INSERT INTO plant_relationships
    (
        plant_id,
        related_plant_name,
        related_plant_id,
        relationship_type,
        reason,
        verified
    )
    VALUES (?, ?, ?, ?, ?, ?)
`);

        for (const plant of data.plants) {
            const id = String(plant.id);

            insertPlant.run(
                id,
                plant.name,
                plant.scientificName || "",
                plant.description || "",
                plant.image || ""
            );
        }

        const findPlantId = db.prepare(`
    SELECT id
    FROM plants
    WHERE name = ? COLLATE NOCASE
`);

        for (const plant of data.plants) {
            const id = String(plant.id);

            for (const synonym of plant.synonyms || []) {
                insertSynonym.run(id, synonym);
            }

            for (const tip of plant.growingTips || []) {
                insertTip.run(id, tip);
            }

            for (const relation of plant.compatible || []) {
                const relatedPlant = findPlantId.get(relation.name);

                if (!relatedPlant) {
                    throw new Error(
                        `Не найдено растение "${relation.name}", связанное с "${plant.name}"`
                    );
                }

                insertRelationship.run(
                    id,
                    relation.name,
                    String(relatedPlant.id),
                    "compatible",
                    relation.reason || "",
                    relation.verified ? 1 : 0
                );
            }

            for (const relation of plant.incompatible || []) {
                const relatedPlant = findPlantId.get(relation.name);

                if (!relatedPlant) {
                    throw new Error(
                        `Не найдено растение "${relation.name}", связанное с "${plant.name}"`
                    );
                }

                insertRelationship.run(
                    id,
                    relation.name,
                    String(relatedPlant.id),
                    "incompatible",
                    relation.reason || "",
                    relation.verified ? 1 : 0
                );
            }
        }
    });

    insert();
    console.log(`База данных заполнена. Растений: ${data.plants.length}`);
}

try {
    initializeDatabase();
} catch (error) {
    db.close();
    throw error;
}

module.exports = db;