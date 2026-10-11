const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const jsonPath = path.join(
    __dirname,
    "backend",
    "data",
    "plants.json"
);

const db = new Database(
    path.join(__dirname, "backend", "data", "plantory.db"),
    { readonly: true }
);

let hasErrors = false;

function report(title, issues) {
    console.log(`\n=== ${title} ===`);

    if (issues.length === 0) {
        console.log("Проблем не найдено.");
        return;
    }

    hasErrors = true;

    for (const issue of issues) {
        console.log(`- ${issue}`);
    }
}

// 1. Связи в базе без существующего растения
const missingIds = db.prepare(`
    SELECT plant_id, related_plant_name, related_plant_id
    FROM plant_relationships
    WHERE related_plant_id IS NULL
       OR related_plant_id NOT IN (SELECT id FROM plants)
`).all();

report(
    "Связи без ID или без растения",
    missingIds.map(
        r => `${r.plant_id} → ${r.related_plant_name} (ID: ${r.related_plant_id})`
    )
);

// 2. Повторяющиеся связи в базе
const duplicateRelations = db.prepare(`
    SELECT plant_id, related_plant_id, relationship_type, COUNT(*) AS count
    FROM plant_relationships
    GROUP BY plant_id, related_plant_id, relationship_type
    HAVING COUNT(*) > 1
`).all();

report(
    "Повторяющиеся связи",
    duplicateRelations.map(
        r => `plant_id=${r.plant_id}, related_plant_id=${r.related_plant_id}, тип=${r.relationship_type}, количество=${r.count}`
    )
);

// 3. Противоречивые связи в базе
const conflictingRelations = db.prepare(`
    SELECT DISTINCT a.plant_id, a.related_plant_id
    FROM plant_relationships a
    JOIN plant_relationships b
      ON a.plant_id = b.plant_id
     AND a.related_plant_id = b.related_plant_id
    WHERE a.relationship_type = 'compatible'
      AND b.relationship_type = 'incompatible'
`).all();

report(
    "Противоречивые связи",
    conflictingRelations.map(
        r => `${r.plant_id} ↔ ${r.related_plant_id}`
    )
);

// 4. Несимметричные связи в базе
const asymmetricRelations = db.prepare(`
    SELECT
        p.name AS plant,
        related.name AS related_plant,
        r.relationship_type
    FROM plant_relationships r
    JOIN plants p ON p.id = r.plant_id
    JOIN plants related ON related.id = r.related_plant_id
    WHERE NOT EXISTS (
        SELECT 1
        FROM plant_relationships reverse
        WHERE reverse.plant_id = r.related_plant_id
          AND reverse.related_plant_id = r.plant_id
          AND reverse.relationship_type = r.relationship_type
    )
`).all();

console.log("\n=== Несимметричные связи ===");

if (asymmetricRelations.length === 0) {
    console.log("Несимметричных связей не найдено.");
} else {
    for (const r of asymmetricRelations) {
        const typeName =
            r.relationship_type === "compatible"
                ? "совместимость"
                : "несовместимость";

        console.log(
            `Проверь: ${r.plant} → ${r.related_plant}. ` +
            `Тип: ${typeName}. Не найдена обратная запись ` +
            `${r.related_plant} → ${r.plant}.`
        );
    }
}

// 5. Проверки plants.json
console.log("\n=== Проверка plants.json ===");

try {
    const data = JSON.parse(
        fs.readFileSync(jsonPath, "utf8")
    );

    if (!Array.isArray(data.plants)) {
        report("Структура JSON", [
            'Ожидается массив "plants".'
        ]);
    } else {
        const plants = data.plants;
        const issues = [];
        const ids = new Set();
        const names = new Map();
        const validNames = new Set();

        // Проверяем ID и названия
        for (let i = 0; i < plants.length; i++) {
            const plant = plants[i];
            const position = `Растение №${i + 1}`;

            if (
                plant.id === undefined ||
                plant.id === null ||
                String(plant.id).trim() === ""
            ) {
                issues.push(`${position}: отсутствует id.`);
            } else {
                const id = String(plant.id);

                if (ids.has(id)) {
                    issues.push(`${position}: повторяется id "${id}".`);
                }

                ids.add(id);
            }

            if (
                typeof plant.name !== "string" ||
                plant.name.trim() === ""
            ) {
                issues.push(`${position}: отсутствует или пустое name.`);
                continue;
            }

            const normalizedName = plant.name.trim().toLocaleLowerCase("ru");

            if (names.has(normalizedName)) {
                issues.push(
                    `Повторяется название "${plant.name}" ` +
                    `(записи "${names.get(normalizedName)}" и "${plant.name}").`
                );
            } else {
                names.set(normalizedName, plant.name);
            }

            validNames.add(normalizedName);
        }

        // Проверяем списки связей
        // Проверяем списки связей и конфликты в JSON
        const relationTypesByPair = new Map();

        for (const plant of plants) {
            if (
                typeof plant.name !== "string" ||
                plant.name.trim() === ""
            ) {
                continue;
            }

            const sourceName = plant.name.trim().toLocaleLowerCase("ru");

            for (const type of ["compatible", "incompatible"]) {
                const seenRelations = new Set();
                const relations = plant[type];

                if (relations === undefined) {
                    continue;
                }

                if (!Array.isArray(relations)) {
                    issues.push(
                        `${plant.name}: поле "${type}" должно быть массивом.`
                    );
                    continue;
                }

                for (const relation of relations) {
                    if (
                        !relation ||
                        typeof relation.name !== "string" ||
                        relation.name.trim() === ""
                    ) {
                        issues.push(
                            `${plant.name}: в "${type}" есть связь без названия растения.`
                        );
                        continue;
                    }

                    const targetName = relation.name.trim().toLocaleLowerCase("ru");
                    if (seenRelations.has(targetName)) {
                        issues.push(
                            `${plant.name}: "${relation.name}" повторяется в списке "${type}".`
                        );
                    } else {
                        seenRelations.add(targetName);
                    }

                    if (!validNames.has(targetName)) {
                        issues.push(
                            `${plant.name}: "${relation.name}" из "${type}" ` +
                            `не найдено в plants.json.`
                        );
                        continue;
                    }

                    if (sourceName === targetName) {
                        issues.push(
                            `${plant.name}: растение связано само с собой в "${type}".`
                        );
                        continue;
                    }

                    const pairKey = `${sourceName}|||${targetName}`;

                    if (!relationTypesByPair.has(pairKey)) {
                        relationTypesByPair.set(pairKey, new Set());
                    }

                    relationTypesByPair.get(pairKey).add(type);
                }
            }
        }

        for (const [pairKey, types] of relationTypesByPair) {
            if (types.has("compatible") && types.has("incompatible")) {
                const [plantName, relatedName] = pairKey.split("|||");

                issues.push(
                    `Конфликт в plants.json: "${plantName}" и "${relatedName}" ` +
                    `указаны одновременно как совместимые и несовместимые.`
                );
            }
        }

        report("Ошибки в plants.json", issues);

        console.log(`Всего растений в JSON: ${plants.length}`);
    }
} catch (error) {
    report("Чтение plants.json", [
        `Не удалось прочитать или разобрать JSON: ${error.message}`
    ]);
} finally {
    db.close();
}

console.log(
    hasErrors
        ? "\nПроверка завершена: найдены проблемы, требующие внимания."
        : "\nПроверка завершена: ошибок не найдено."
);