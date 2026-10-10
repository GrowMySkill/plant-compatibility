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

app.get("/api/plants/suggestions", (req, res) => {
    const query = (req.query.q || "").trim().toLocaleLowerCase("ru-RU");

    if (!query) {
        return res.json([]);
    }

    const matches = getPlants().filter(plant => {
        const names = [
            plant.name,
            plant.scientificName,
            ...plant.synonyms
        ];

        return names.some(value =>
            typeof value === "string" &&
            value.toLocaleLowerCase("ru-RU").includes(query)
        );
    }).slice(0, 8);

    res.json(matches.map(plant => ({
        id: plant.id,
        name: plant.name,
        scientificName: plant.scientificName || ""
    })));
});

app.get("/api/plants/search", (req, res) => {
    const name = (req.query.name || "").trim().toLocaleLowerCase("ru-RU");

    if (!name) {
        return res.status(400).json({
            error: "Введите название растения"
        });
    }

    const matches = getPlants().filter(plant => {
        const names = [
            plant.name,
            plant.scientificName,
            ...plant.synonyms
        ];

        return names.some(value =>
            typeof value === "string" &&
            value.toLocaleLowerCase("ru-RU").includes(name)
        );
    });

    if (matches.length === 0) {
        return res.status(404).json({
            error: "Растение не найдено",
            query: req.query.name
        });
    }

    res.json(matches);
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