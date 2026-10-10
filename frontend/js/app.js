
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#plant-search");
const resultsContainer = document.querySelector("#results");
const searchTags = document.querySelectorAll(".search-tag");
const suggestionsContainer = document.querySelector("#suggestions");
let suggestionsRequest;

const FAVORITES_KEY = "plantory-favorites";

function getFavorites() {
    try {
        return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    } catch {
        return [];
    }
}

function saveFavorites(favorites) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

function isFavorite(plantId) {
    return getFavorites().includes(Number(plantId));
}

function toggleFavorite(plantId) {
    const favorites = getFavorites();
    const id = Number(plantId);
    const updated = favorites.includes(id)
        ? favorites.filter(item => item !== id)
        : [...favorites, id];

    saveFavorites(updated);
    return updated.includes(id);
}
async function renderFavorites() {
    const favoritesList = document.querySelector("#favorites-list");
    const favoritesCount = document.querySelector("#favorites-count");

    if (!favoritesList) return;

    const favorites = getFavorites();

    if (favoritesCount) {
        favoritesCount.textContent = favorites.length;
    }

    if (favorites.length === 0) {
        favoritesList.innerHTML = `
            <p class="favorites-empty">
                Пока нет избранных растений. Добавь их с помощью кнопки «В избранное».
            </p>
        `;
        return;
    }

    try {
        const response = await fetch("/api/plants");
        if (!response.ok) throw new Error("Не удалось загрузить растения");

        const data = await response.json();
        const plants = Array.isArray(data) ? data : data.plants;
        const favoritePlants = plants.filter(plant =>
            favorites.includes(Number(plant.id))
        );

        if (favoritePlants.length === 0) {
            favoritesList.innerHTML = `
                <p class="favorites-empty">
                    Не удалось найти сохранённые растения.
                </p>
            `;
            return;
        }

        favoritesList.innerHTML = favoritePlants.map(plant => `
            <article class="favorite-card">
                <div class="favorite-card-info">
                    <h3>${escapeHTML(plant.name)}</h3>
                    <p>${escapeHTML(plant.scientificName || "")}</p>
                </div>
                <div class="favorite-card-actions">
                    <button type="button" data-open-plant="${plant.id}">
                        Открыть
                    </button>
                    <button type="button" data-remove-favorite="${plant.id}">
                        Удалить
                    </button>
                </div>
            </article>
        `).join("");

        favoritesList.querySelectorAll("[data-open-plant]").forEach(button => {
            button.addEventListener("click", () => {
                const plant = favoritePlants.find(item =>
                    Number(item.id) === Number(button.dataset.openPlant)
                );
                if (plant) {
                    searchInput.value = plant.name;
                    searchPlant(plant.name);
                    document.querySelector("#search")?.scrollIntoView({
                        behavior: "smooth"
                    });
                }
            });
        });

        favoritesList.querySelectorAll("[data-remove-favorite]").forEach(button => {
            button.addEventListener("click", () => {
                toggleFavorite(button.dataset.removeFavorite);
                renderFavorites();
                const favoriteButton = resultsContainer.querySelector("#favorite-button");
                if (favoriteButton) {
                    const plantId = Number(button.dataset.removeFavorite);
                    if (Number(favoriteButton.dataset.plantId) === plantId) {
                        favoriteButton.textContent = "♡ В избранное";
                        favoriteButton.classList.remove("is-favorite");
                    }
                }
            });
        });
    } catch (error) {
        favoritesList.innerHTML = `
            <p class="favorites-empty">
                Не удалось загрузить избранное. Проверь соединение с сервером.
            </p>
        `;
        console.error(error);
    }
}


function showMessage(title, message, type = "info") {
    const icon = type === "error" ? "!" : "✿";
    resultsContainer.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">${icon}</div>
            <h3>${title}</h3>
            <p>${message}</p>
        </div>
    `;
}

function createPlantCard(plant, type) {
    const isCompatible = type === "compatible";
    const title = isCompatible ? "Подходящие соседи" : "Нежелательные соседи";
    const icon = isCompatible ? "✓" : "×";
    const className = isCompatible ? "compatible" : "incompatible";
    const plants = plant[type];

    if (!plants || plants.length === 0) {
        return `
            <section class="result-group ${className}">
                <div class="result-group-heading">
                    <span class="result-status">${icon}</span>
                    <h3>${title}</h3>
                </div>
                <p class="result-empty">В тестовой базе пока нет данных для этой категории.</p>
            </section>
        `;
    }

    const cards = plants.map(item => `
        <article class="neighbor-card">
            <div class="neighbor-icon">${isCompatible ? "♧" : "!"}</div>
            <div class="neighbor-info">
                <h4>${escapeHTML(item.name)}</h4>
                <p>${escapeHTML(item.reason || "Дополнительная информация отсутствует.")}</p>
            </div>
            <span class="neighbor-mark">${icon}</span>
        </article>
    `).join("");

    return `
        <section class="result-group ${className}">
            <div class="result-group-heading">
                <span class="result-status">${icon}</span>
                <h3>${title}</h3>
                <span class="result-count">${plants.length}</span>
            </div>
            <div class="neighbor-list">${cards}</div>
        </section>
    `;
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function renderPlant(plant) {
    resultsContainer.innerHTML = `
        <div class="plant-result">
            <div class="plant-result-header">
                <div class="plant-symbol">♧</div>
                <div class="plant-title">
                    <span class="eyebrow">РЕЗУЛЬТАТ ПОИСКА</span>
                    <h2>${escapeHTML(plant.name)}</h2>
                    <p class="scientific-name">${escapeHTML(plant.scientificName || "Научное название не указано")}</p>
                </div>
                <span class="plant-id">ID / ${escapeHTML(plant.id)}</span>
                <button type="button" class="favorite-button" id="favorite-button" data-plant-id="${plant.id}">
                    ${isFavorite(plant.id) ? "♥ В избранном" : "♡ В избранное"}
                </button>
            </div>
            ${plant.description ? `
                <p class="plant-description">${escapeHTML(plant.description)}</p>
            ` : ""}
            ${plant.growingTips && plant.growingTips.length ? `
                <section class="growing-tips">
                    <h3>Советы по уходу</h3>
                    <ul>
                        ${plant.growingTips.map(tip => `<li>${escapeHTML(tip)}</li>`).join("")}
                    </ul>
                </section>
            ` : ""}
            <div class="result-groups">
                ${createPlantCard(plant, "compatible")}
                ${createPlantCard(plant, "incompatible")}
            </div>
            <p class="data-note">Информация предоставлена тестовой базой. Научные рекомендации необходимо подтвердить данными биологов.</p>
        </div>
    `;

    const favoriteButton = resultsContainer.querySelector("#favorite-button");

    favoriteButton.addEventListener("click", () => {
        const added = toggleFavorite(plant.id);
        favoriteButton.textContent = added ? "♥ В избранном" : "♡ В избранное";
        favoriteButton.classList.toggle("is-favorite", added);
        renderFavorites();
    });

    favoriteButton.classList.toggle("is-favorite", isFavorite(plant.id));
}


async function loadSuggestions(query) {
    if (!query.trim()) {
        suggestionsContainer.hidden = true;
        suggestionsContainer.innerHTML = "";
        return;
    }

    const requestId = {};
    suggestionsRequest = requestId;

    try {
        const response = await fetch(
            `/api/plants/suggestions?q=${encodeURIComponent(query)}`
        );

        const plants = await response.json();

        if (suggestionsRequest !== requestId) {
            return;
        }

        if (!response.ok || plants.length === 0) {
            suggestionsContainer.hidden = true;
            suggestionsContainer.innerHTML = "";
            return;
        }

        suggestionsContainer.innerHTML = plants.map(plant => `
            <button type="button" class="suggestion-item" data-plant-id="${escapeHTML(plant.id)}">
                <span class="suggestion-name">${escapeHTML(plant.name)}</span>
                <span class="suggestion-scientific">${escapeHTML(plant.scientificName || "")}</span>
            </button>
        `).join("");

        suggestionsContainer.hidden = false;

        suggestionsContainer.querySelectorAll(".suggestion-item").forEach(button => {
            button.addEventListener("click", () => {
                const plant = plants.find(item =>
                    String(item.id) === button.dataset.plantId
                );

                if (plant) {
                    searchInput.value = plant.name;
                    suggestionsContainer.hidden = true;
                    searchPlant(plant.name);
                }
            });
        });
    } catch (error) {
        console.error("Ошибка загрузки подсказок:", error);
    }
}

function hideSuggestionsOnOutsideClick(event) {
    if (!searchForm.contains(event.target)) {
        suggestionsContainer.hidden = true;
    }
}


async function searchPlant(name) {
    const query = name.trim();

    if (!query) {
        showMessage("Введите название растения", "Напишите название в поле поиска, чтобы получить результаты.", "error");
        searchInput.focus();
        return;
    }

    resultsContainer.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">⌕</div>
            <h3>Ищем растение...</h3>
            <p>Обращаемся к базе данных.</p>
        </div>
    `;

    try {
        const response = await fetch(`/api/plants/search?name=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (!response.ok) {
            showMessage("Растение не найдено", data.error || "Попробуйте другое название.", "error");
            return;
        }

        if (!Array.isArray(data) || data.length === 0) {
            showMessage("Растение не найдено", "Попробуйте другое название.", "error");
            return;
        }

        if (data.length === 1) {
            renderPlant(data[0]);
            return;
        }

        resultsContainer.innerHTML = `
            <div class="plant-result">
                <div class="section-heading">
                    <div>
                        <div class="eyebrow">РЕЗУЛЬТАТЫ ПОИСКА</div>
                        <h2>Найдено растений: ${data.length}</h2>
                    </div>
                </div>
                <div class="plant-matches">
                    ${data.map(plant => `
                        <button type="button" class="plant-match" data-plant-id="${escapeHTML(plant.id)}">
                            <span class="plant-match-icon">♧</span>
                            <span class="plant-match-info">
                                <strong>${escapeHTML(plant.name)}</strong>
                                <small>${escapeHTML(plant.scientificName || "Научное название не указано")}</small>
                            </span>
                            <span class="plant-match-arrow">→</span>
                        </button>
                    `).join("")}
                </div>
            </div>
        `;

        resultsContainer.querySelectorAll(".plant-match").forEach(button => {
            button.addEventListener("click", () => {
                const plant = data.find(item => String(item.id) === button.dataset.plantId);

                if (plant) {
                    renderPlant(plant);
                }
            });
        });
    } catch (error) {
        showMessage("Не удалось подключиться к серверу", "Проверьте, запущен ли backend, и попробуйте ещё раз.", "error");
        console.error("Ошибка поиска растения:", error);
    }
}


searchForm.addEventListener("submit", event => {
    event.preventDefault();
    searchPlant(searchInput.value);
});

searchTags.forEach(tag => {
    tag.addEventListener("click", () => {
        const plantName = tag.dataset.plant;
        searchInput.value = plantName;
        searchPlant(plantName);
    });
});

searchInput.addEventListener("input", () => {
    loadSuggestions(searchInput.value);
});

document.addEventListener("click", hideSuggestionsOnOutsideClick);
