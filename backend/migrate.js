const fs = require("fs");
const path = require("path");
const db = require("./db");

const jsonPath = path.join(__dirname, "data", "plants.json");
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const plants = data.plants;

const migrate = db.transaction(() => {
    db.prepare("DELETE FROM plant_relationships").run();
    db.prepare("DELETE FROM plant_tips").run();
    db.prepare("DELETE FROM plant_synonyms").run();
    db.prepare("DELETE FROM plants").run();

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
        (plant_id, related_plant_name, relationship_type, reason, verified)
        VALUES (?, ?, ?, ?, ?)
    `);

    for (const plant of plants) {
        insertPlant.run(
            String(plant.id),
            plant.name,
            plant.scientificName || "",
            plant.description || "",
            plant.image || ""
        );

        for (const synonym of plant.synonyms || []) {
            insertSynonym.run(String(plant.id), synonym);
        }

        for (const tip of plant.growingTips || []) {
            insertTip.run(String(plant.id), tip);
        }

        for (const relation of plant.compatible || []) {
            insertRelationship.run(
                String(plant.id),
                relation.name,
                "compatible",
                relation.reason || "",
                relation.verified ? 1 : 0
            );
        }

        for (const relation of plant.incompatible || []) {
            insertRelationship.run(
                String(plant.id),
                relation.name,
                "incompatible",
                relation.reason || "",
                relation.verified ? 1 : 0
            );
        }
    }
});

try {
    migrate();

    console.log(`Перенесено растений: ${plants.length}`);
    console.log("Синонимов:", db.prepare("SELECT COUNT(*) AS count FROM plant_synonyms").get().count);
    console.log("Советов:", db.prepare("SELECT COUNT(*) AS count FROM plant_tips").get().count);
    console.log("Связей:", db.prepare("SELECT COUNT(*) AS count FROM plant_relationships").get().count);
} catch (error) {
    console.error("Ошибка миграции:", error.message);
    process.exitCode = 1;
} finally {
    db.close();
}