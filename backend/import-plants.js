const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "data", "plantory.db");
const jsonPath = path.join(__dirname, "data", "plants.json");

function normalizeName(name) {
    return name.trim().toLocaleLowerCase("ru");
}

function loadAndValidatePlants() {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

    if (!data || !Array.isArray(data.plants)) {
        throw new Error('В JSON ожидается массив "plants".');
    }

    const plants = data.plants;
    const ids = new Set();
    const names = new Set();

    for (const plant of plants) {
        if (plant.id === undefined || plant.id === null || String(plant.id).trim() === "") {
            throw new Error("У одного из растений отсутствует id.");
        }

        const id = String(plant.id);

        if (ids.has(id)) {
            throw new Error(`Повторяется id растения: ${id}`);
        }
        ids.add(id);

        if (typeof plant.name !== "string" || !plant.name.trim()) {
            throw new Error(`У растения с id ${id} отсутствует название.`);
        }

        const normalizedName = normalizeName(plant.name);

        if (names.has(normalizedName)) {
            throw new Error(`Повторяется название растения: "${plant.name}".`);
        }
        names.add(normalizedName);

        for (const type of [
            "compatible",
            "incompatible",
            "synonyms",
            "growingTips"
        ]) {
            if (plant[type] !== undefined && !Array.isArray(plant[type])) {
                throw new Error(
                    `У растения "${plant.name}" поле "${type}" должно быть массивом.`
                );
            }
        }

        for (const synonym of plant.synonyms || []) {
            if (typeof synonym !== "string" || !synonym.trim()) {
                throw new Error(
                    `У растения "${plant.name}" есть пустой или некорректный синоним.`
                );
            }
        }

        for (const tip of plant.growingTips || []) {
            if (typeof tip !== "string" || !tip.trim()) {
                throw new Error(
                    `У растения "${plant.name}" есть пустой или некорректный совет.`
                );
            }
        }
    }


    for (const plant of plants) {
        const ownName = normalizeName(plant.name);
        const seen = new Set();

        for (const type of ["compatible", "incompatible"]) {
            for (const relation of plant[type] || []) {
                if (
                    !relation ||
                    typeof relation.name !== "string" ||
                    !relation.name.trim()
                ) {
                    throw new Error(
                        `У растения "${plant.name}" есть связь без названия.`
                    );
                }

                const relatedName = normalizeName(relation.name);

                if (relatedName === ownName) {
                    throw new Error(
                        `Растение "${plant.name}" не может ссылаться на себя.`
                    );
                }

                if (seen.has(`${type}:${relatedName}`)) {
                    throw new Error(
                        `Повтор связи "${plant.name}" → "${relation.name}" (${type}).`
                    );
                }
                seen.add(`${type}:${relatedName}`);

            }
        }

        const compatible = new Set(
            (plant.compatible || []).map(item => normalizeName(item.name))
        );

        for (const relation of plant.incompatible || []) {
            if (compatible.has(normalizeName(relation.name))) {
                throw new Error(
                    `"${relation.name}" у растения "${plant.name}" ` +
                    "указано и как совместимое, и как несовместимое."
                );
            }
        }
    }

    return plants;
}

async function importPlants() {
    const plants = loadAndValidatePlants();
    const db = new Database(dbPath);
    const backupPath = path.join(
        __dirname,
        "data",
        `plantory-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.db`
    );

    try {
        db.pragma("foreign_keys = ON");

        try {
            await db.backup(backupPath);
            console.log(`Резервная копия создана: ${backupPath}`);
        } catch (error) {
            throw new Error(
                `Не удалось создать резервную копию: ${error.message}`
            );
        }

        const importTransaction = db.transaction(() => {

            const findByName = db.prepare(
                "SELECT id, name FROM plants WHERE name = ? COLLATE NOCASE"
            );

            const upsertPlant = db.prepare(`
                INSERT INTO plants (id, name, scientific_name, description, image)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    scientific_name = excluded.scientific_name,
                    description = excluded.description,
                    image = excluded.image
            `);

            const deleteSynonyms = db.prepare(
                "DELETE FROM plant_synonyms WHERE plant_id = ?"
            );
            const deleteTips = db.prepare(
                "DELETE FROM plant_tips WHERE plant_id = ?"
            );
            const deleteRelationships = db.prepare(
                "DELETE FROM plant_relationships WHERE plant_id = ?"
            );

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
                (plant_id, related_plant_name, related_plant_id,
                 relationship_type, reason, verified)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            for (const plant of plants) {
                const id = String(plant.id);
                const duplicateName = findByName.get(plant.name.trim());

                if (duplicateName && String(duplicateName.id) !== id) {
                    throw new Error(
                        `Название "${plant.name}" уже используется растением ` +
                        `с id ${duplicateName.id}.`
                    );
                }

                upsertPlant.run(
                    id,
                    plant.name.trim(),
                    plant.scientificName || "",
                    plant.description || "",
                    plant.image || ""
                );
            }

            for (const plant of plants) {
                const id = String(plant.id);

                deleteSynonyms.run(id);
                deleteTips.run(id);
                deleteRelationships.run(id);

                for (const synonym of plant.synonyms || []) {
                    insertSynonym.run(id, synonym);
                }

                for (const tip of plant.growingTips || []) {
                    insertTip.run(id, tip);
                }

                for (const type of ["compatible", "incompatible"]) {
                    for (const relation of plant[type] || []) {
                        const relatedPlant = findByName.get(relation.name.trim());

                        if (!relatedPlant) {
                            throw new Error(
                                `Не найдено растение "${relation.name}", ` +
                                `связанное с "${plant.name}". Добавь его в JSON.`
                            );
                        }

                        insertRelationship.run(
                            id,
                            relation.name.trim(),
                            String(relatedPlant.id),
                            type,
                            relation.reason || "",
                            relation.verified ? 1 : 0
                        );
                    }
                }
            }
        });

        importTransaction();

        console.log(`Импорт завершён. Обработано растений: ${plants.length}`);
        console.log("Растения, отсутствующие в JSON, не удалялись.");
    } finally {
        db.close();
    }
}

importPlants().catch(error => {
    console.error("Импорт отменён:", error.message);
    process.exitCode = 1;
});