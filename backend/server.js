const express = require("express");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "frontend")));

function getPlants() {
    const plants = db.prepare(`
        SELECT
            id,
            name,
            scientific_name AS scientificName,
            description,
            image
        FROM plants
        ORDER BY id
    `).all();

    return plants.map(plant => ({
        ...plant,
        synonyms: db.prepare(`
            SELECT synonym
            FROM plant_synonyms
            WHERE plant_id = ?
            ORDER BY id
        `).all(String(plant.id)).map(row => row.synonym),
        growingTips: db.prepare(`
            SELECT tip
            FROM plant_tips
            WHERE plant_id = ?
            ORDER BY id
        `).all(String(plant.id)).map(row => row.tip),
        compatible: db.prepare(`
            SELECT
                related_plant_name AS name,
                reason,
                verified
            FROM plant_relationships
            WHERE plant_id = ? AND relationship_type = 'compatible'
            ORDER BY id
        `).all(String(plant.id)).map(row => ({
            ...row,
            verified: Boolean(row.verified)
        })),
        incompatible: db.prepare(`
            SELECT
                related_plant_name AS name,
                reason,
                verified
            FROM plant_relationships
            WHERE plant_id = ? AND relationship_type = 'incompatible'
            ORDER BY id
        `).all(String(plant.id)).map(row => ({
            ...row,
            verified: Boolean(row.verified)
        }))
    }));
}

app.get("/api/plants", (req, res) => {
    res.json(getPlants());
});

app.get("/api/plants/catalog", (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
        100,
        Math.max(1, Number.parseInt(req.query.limit, 10) || 24)
    );
    const offset = (page - 1) * limit;

    try {
        const total = db.prepare(`
            SELECT COUNT(*) AS count
            FROM plants
        `).get().count;

        const plants = db.prepare(`
            SELECT
                id,
                name,
                scientific_name AS scientificName,
                description,
                image
            FROM plants
            ORDER BY name COLLATE NOCASE, id
            LIMIT ? OFFSET ?
        `).all(limit, offset);

        res.json({
            plants,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error("Ошибка загрузки каталога:", error);
        res.status(500).json({
            error: "Не удалось загрузить каталог"
        });
    }
});



app.get("/api/plants/suggestions", (req, res) => {
    const query = (req.query.q || "").trim();

    if (!query) {
        return res.json([]);
    }

    try {
        const search = `%${query.replace(/[\\%_]/g, "\\$&")}%`;

        const matches = db.prepare(`
            SELECT DISTINCT
                p.id,
                p.name,
                p.scientific_name AS scientificName
            FROM plants p
            LEFT JOIN plant_synonyms s ON s.plant_id = p.id
            WHERE
                p.name LIKE ? ESCAPE '\\'
                OR p.scientific_name LIKE ? ESCAPE '\\'
                OR s.synonym LIKE ? ESCAPE '\\'
            ORDER BY p.name COLLATE NOCASE
            LIMIT 8
        `).all(search, search, search);

        res.json(matches);
    } catch (error) {
        console.error("Ошибка подсказок:", error);
        res.status(500).json({
            error: "Не удалось загрузить подсказки"
        });
    }
});



app.get("/api/plants/search", (req, res) => {
    const name = (req.query.name || "").trim();

    if (!name) {
        return res.status(400).json({
            error: "Введите название растения"
        });
    }

    try {
        const search = `%${name.replace(/[\\%_]/g, "\\$&")}%`;

        const matches = db.prepare(`
            SELECT DISTINCT p.id
            FROM plants p
            LEFT JOIN plant_synonyms s ON s.plant_id = p.id
            WHERE
                p.name LIKE ? ESCAPE '\\'
                OR p.scientific_name LIKE ? ESCAPE '\\'
                OR s.synonym LIKE ? ESCAPE '\\'
            ORDER BY p.name COLLATE NOCASE
        `).all(search, search, search);

        if (matches.length === 0) {
            return res.status(404).json({
                error: "Растение не найдено",
                query: req.query.name
            });
        }

        const getPlantById = db.prepare(`
            SELECT
                id,
                name,
                scientific_name AS scientificName,
                description,
                image
            FROM plants
            WHERE id = ?
        `);

        const getSynonyms = db.prepare(`
            SELECT synonym
            FROM plant_synonyms
            WHERE plant_id = ?
            ORDER BY id
        `);

        const getTips = db.prepare(`
            SELECT tip
            FROM plant_tips
            WHERE plant_id = ?
            ORDER BY id
        `);

        const getRelationships = db.prepare(`
            SELECT
                related_plant_name AS name,
                reason,
                verified
            FROM plant_relationships
            WHERE plant_id = ? AND relationship_type = ?
            ORDER BY id
        `);

        const plants = matches.map(({ id }) => {
            const plant = getPlantById.get(id);

            return {
                ...plant,
                synonyms: getSynonyms.all(id).map(row => row.synonym),
                growingTips: getTips.all(id).map(row => row.tip),
                compatible: getRelationships.all(id, "compatible").map(row => ({
                    ...row,
                    verified: Boolean(row.verified)
                })),
                incompatible: getRelationships.all(id, "incompatible").map(row => ({
                    ...row,
                    verified: Boolean(row.verified)
                }))
            };
        });

        res.json(plants);
    } catch (error) {
        console.error("Ошибка поиска растения:", error);
        res.status(500).json({
            error: "Не удалось выполнить поиск"
        });
    }
});


app.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
});

process.on("SIGINT", () => {
    db.close();
    process.exit(0);
});

process.on("SIGTERM", () => {
    db.close();
    process.exit(0);
});