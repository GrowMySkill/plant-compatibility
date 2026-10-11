
const plantContent = document.querySelector("#plant-content");
const params = new URLSearchParams(window.location.search);
const plantId = params.get("id");

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

async function loadPlant() {
    if (!plantId) {
        plantContent.textContent = "Не указано растение.";
        return;
    }

    try {
        const response = await fetch("/api/plants");

        if (!response.ok) {
            throw new Error("Не удалось загрузить растения");
        }

        const data = await response.json();
        const plants = Array.isArray(data) ? data : data.plants || [];
        const plant = plants.find(item =>
            String(item.id) === String(plantId)
        );

        if (!plant) {
            plantContent.textContent = "Растение не найдено.";
            return;
        }

        document.title = `${plant.name} — Plantory`;

        const tips = plant.growingTips || [];
        const compatible = plant.compatible || [];
        const incompatible = plant.incompatible || [];

        plantContent.className = "plant-detail";
        plantContent.innerHTML = `
            <div class="plant-detail-top">
                <div>
                    ${plant.image
                        ? `<img class="plant-detail-image" src="${escapeHTML(plant.image)}" alt="${escapeHTML(plant.name)}">`
                        : ""}
                </div>
                <div>
                    <span class="eyebrow">СПРАВОЧНИК РАСТЕНИЙ</span>
                    <h1>${escapeHTML(plant.name)}</h1>
                    <p class="plant-detail-scientific">${escapeHTML(plant.scientificName || "Научное название не указано")}</p>
                    <p>${escapeHTML(plant.description || "Описание пока не добавлено.")}</p>
                </div>
            </div>
            <section>
                <h2>Советы по выращиванию</h2>
                ${tips.length
                    ? `<ul class="plant-detail-list">${tips.map(tip => `<li>${escapeHTML(typeof tip === "string" ? tip : tip.text || tip.tip || "")}</li>`).join("")}</ul>`
                    : "<p>Советы пока не добавлены.</p>"}
            </section>
            <section>
                <h2>Хорошие соседи</h2>
                ${compatible.length
                    ? `<ul class="plant-detail-list">${compatible.map(item => `<li>${escapeHTML(typeof item === "string" ? item : item.name || "")}${item.reason ? ` — ${escapeHTML(item.reason)}` : ""}</li>`).join("")}</ul>`
                    : "<p>Данные о совместимых растениях пока не добавлены.</p>"}
            </section>
            <section>
                <h2>Несовместимые растения</h2>
                ${incompatible.length
                    ? `<ul class="plant-detail-list">${incompatible.map(item => `<li>${escapeHTML(typeof item === "string" ? item : item.name || "")}${item.reason ? ` — ${escapeHTML(item.reason)}` : ""}</li>`).join("")}</ul>`
                    : "<p>Данные о несовместимых растениях пока не добавлены.</p>"}
            </section>
        `;
    } catch (error) {
        console.error("Ошибка загрузки растения:", error);
        plantContent.textContent = "Не удалось загрузить растение. Проверь, запущен ли сервер, и обнови страницу.";
    }
}

loadPlant();
