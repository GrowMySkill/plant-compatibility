
const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "data", "plantory.db");
const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

try {
    const columns = db.prepare(`
        PRAGMA table_info(plant_relationships)
    `).all();

    if (!columns.some(column => column.name === "related_plant_id")) {
        db.exec(`
            ALTER TABLE plant_relationships
            ADD COLUMN related_plant_id TEXT
            REFERENCES plants(id)
        `);
    }

    const relationships = db.prepare(`
        SELECT id, related_plant_name
        FROM plant_relationships
    `).all();

    const findPlant = db.prepare(`
        SELECT id
        FROM plants
        WHERE name = ? COLLATE NOCASE
    `);

    const updateRelationship = db.prepare(`
        UPDATE plant_relationships
        SET related_plant_id = ?
        WHERE id = ?
    `);

    const migrate = db.transaction(() => {
        for (const relationship of relationships) {
            const plant = findPlant.get(relationship.related_plant_name);

            if (!plant) {
                throw new Error(
                    `Не найдено растение: ${relationship.related_plant_name} ` +
                    `(связь ID ${relationship.id})`
                );
            }

            updateRelationship.run(String(plant.id), relationship.id);
        }
    });

    migrate();

    const remaining = db.prepare(`
        SELECT COUNT(*) AS count
        FROM plant_relationships
        WHERE related_plant_id IS NULL
    `).get().count;

    if (remaining > 0) {
        throw new Error(`Остались связи без ID: ${remaining}`);
    }

    console.log("Миграция связей завершена.");
    console.log("Обработано связей:", relationships.length);
} catch (error) {
    console.error("Ошибка миграции:", error.message);
    process.exitCode = 1;
} finally {
    db.close();
}
