
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

const dataPath = path.join(__dirname, "data", "plants.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "frontend")));


function getPlants() {
    const data = fs.readFileSync(dataPath, "utf8");
    return JSON.parse(data).plants;
}

app.get("/api/plants", (req, res) => {
    const plants = getPlants();
    res.json(plants);
});


app.get("/api/plants/suggestions", (req, res) => {
    const query = (req.query.q || "").trim().toLocaleLowerCase("ru-RU");

    if (query.length < 1) {
        return res.json([]);
    }

    const plants = getPlants();

    const matches = plants.filter(plant => {
        const names = [
            plant.name,
            plant.scientificName,
            ...(plant.synonyms || [])
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

    const plants = getPlants();

    const matches = plants.filter(plant => {
        const names = [
            plant.name,
            plant.scientificName,
            ...(plant.synonyms || [])
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
