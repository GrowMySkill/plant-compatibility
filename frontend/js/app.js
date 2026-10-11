
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
    ${plant.image
                ? `<img
            class="favorite-plant-image"
            src="${escapeHTML(plant.image)}"
            alt="${escapeHTML(plant.name)}"
            loading="lazy"
            onerror="this.style.display='none'"
        >`
                : ""}
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
                ${plant.image
            ? `<img class="plant-photo" src="${escapeHTML(plant.image)}" alt="${escapeHTML(plant.name)}" loading="lazy" onerror="this.style.display='none'">`
            : '<div class="plant-symbol">♧</div>'}
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

let activeSuggestionIndex = -1;

async function loadSuggestions(query) {

    if (!Array.isArray(plants) || plants.length === 0) {
        suggestionsContainer.innerHTML = `
        <div class="suggestion-empty">
            <strong>Растение не найдено</strong>
            <span>Попробуйте другое название или научное имя.</span>
        </div>
    `;
        suggestionsContainer.hidden = false;
        return;
    }


    const requestId = {};
    suggestionsRequest = requestId;

    try {
        const response = await fetch(
            `/api/plants/suggestions?q=${encodeURIComponent(query)}`
        );

        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }

        const plants = await response.json();

        if (suggestionsRequest !== requestId) {
            return;
        }

        if (!Array.isArray(plants) || plants.length === 0) {
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
        if (suggestionsRequest === requestId) {
            suggestionsContainer.hidden = true;
            suggestionsContainer.innerHTML = "";
        }

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
    activeSuggestionIndex = -1;
    loadSuggestions(searchInput.value);
});

searchInput.addEventListener("keydown", event => {
    const buttons = suggestionsContainer.querySelectorAll(".suggestion-item");

    if (event.key === "Escape") {
        suggestionsContainer.hidden = true;
        activeSuggestionIndex = -1;
        return;
    }

    if (suggestionsContainer.hidden || buttons.length === 0) {
        return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();

        if (event.key === "ArrowDown") {
            activeSuggestionIndex =
                (activeSuggestionIndex + 1) % buttons.length;
        } else {
            activeSuggestionIndex =
                (activeSuggestionIndex - 1 + buttons.length) % buttons.length;
        }

        buttons.forEach((button, index) => {
            button.classList.toggle(
                "is-active",
                index === activeSuggestionIndex
            );
        });

        return;
    }

    if (event.key === "Enter" && activeSuggestionIndex >= 0) {
        event.preventDefault();
        buttons[activeSuggestionIndex].click();
    }
});


document.addEventListener("click", hideSuggestionsOnOutsideClick);
const catalogSearch = document.querySelector("#catalog-search");
const catalogGrid = document.querySelector("#catalog-grid");
const catalogCount = document.querySelector("#catalog-count");
let catalogPage = 1;
const catalogLimit = 24;
let catalogRequestId = 0;
let catalogTotalPages = 1;
let catalogSearchTimer;

let catalogPlants = [];


async function loadCatalog(page = 1) {
    if (!catalogGrid || !catalogCount) return;
    const requestId = ++catalogRequestId;

    catalogPage = page;

    const pagination = document.getElementById("catalog-pagination");
    const searchInput = document.getElementById("catalog-search");
    const query = searchInput ? searchInput.value.trim() : "";

    catalogGrid.innerHTML = `
        <p class="catalog-empty">Загружаем растения...</p>
    `;

    try {
        const params = new URLSearchParams({
            page: String(catalogPage),
            limit: String(catalogLimit),
            q: query
        });

        const response = await fetch(
            `/api/plants/catalog?${params.toString()}`
        );

        if (!response.ok) {
            throw new Error("Не удалось загрузить каталог");
        }

        const data = await response.json();
        if (requestId !== catalogRequestId) return;

        catalogPlants = data.plants || [];
        catalogPage = data.page;
        catalogTotalPages = data.totalPages;

        catalogCount.textContent =
            `Найдено растений: ${data.total}`;

        renderCatalog(catalogPlants);
        renderCatalogPagination(pagination);
    } catch (error) {
        if (requestId !== catalogRequestId) return;
        catalogCount.textContent = "Не удалось загрузить растения";
        catalogGrid.innerHTML = `
            <p class="catalog-empty">
                Проверь, запущен ли сервер, и обнови страницу.
            </p>
        `;

        if (pagination) {
            pagination.innerHTML = "";
        }

        console.error("Ошибка каталога:", error);
    }
}

function renderCatalogPagination(container) {
    if (!container) return;

    if (catalogTotalPages <= 1) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = `
        <button
            type="button"
            class="catalog-page-button"
            data-catalog-page="${catalogPage - 1}"
            ${catalogPage === 1 ? "disabled" : ""}
        >← Назад</button>

        <span class="catalog-page-info">
            Страница ${catalogPage} из ${catalogTotalPages}
        </span>

        <button
            type="button"
            class="catalog-page-button"
            data-catalog-page="${catalogPage + 1}"
            ${catalogPage === catalogTotalPages ? "disabled" : ""}
        >Вперёд →
        </button>
    `;

    container.querySelectorAll("[data-catalog-page]").forEach(button => {
        button.addEventListener("click", () => {
            loadCatalog(Number(button.dataset.catalogPage));
        });
    });
}


function renderCatalog(plants) {
    catalogCount.textContent = `Растений в каталоге: ${plants.length}`;


    if (plants.length === 0) {
        const searchInput = document.getElementById("catalog-search");

        catalogGrid.innerHTML = `
        <div class="catalog-empty-state">
            <p class="catalog-empty">
                Растения не найдены. Попробуй изменить запрос.
            </p>
            <button type="button" class="catalog-reset-button">
                Сбросить поиск
            </button>
        </div>
    `;

        const resetButton = catalogGrid.querySelector(".catalog-reset-button");

        resetButton.addEventListener("click", () => {
            if (searchInput) {
                searchInput.value = "";
                searchInput.focus();
            }

            loadCatalog(1);
        });

        return;
    }


    catalogGrid.innerHTML = plants.map(plant => `
        <article class="catalog-card">
${plant.image
            ? `<img
        class="catalog-card-image"
        src="${escapeHTML(plant.image)}"
        alt="${escapeHTML(plant.name)}"
        loading="lazy"
        onerror="this.outerHTML='<div class=&quot;catalog-card-symbol&quot;>♧</div>'"
    >`
            : '<div class="catalog-card-symbol">♧</div>'}

            <h3>${escapeHTML(plant.name)}</h3>
            <p class="catalog-scientific">
                ${escapeHTML(plant.scientificName || "Научное название не указано")}
            </p>
            <p class="catalog-description">
                ${escapeHTML(plant.description || "Описание пока не добавлено.")}
            </p>
            <button type="button" class="catalog-open-button" data-catalog-plant="${plant.id}">
                Подробнее →
            </button>
        </article>
    `).join("");


    catalogGrid.querySelectorAll("[data-catalog-plant]").forEach(button => {
        button.addEventListener("click", () => {
            const plantId = button.dataset.catalogPlant;
            window.location.href = `plant.html?id=${encodeURIComponent(plantId)}`;
        });
    });
}


if (catalogSearch) {
    catalogSearch.addEventListener("input", () => {
        clearTimeout(catalogSearchTimer);

        catalogSearchTimer = setTimeout(() => {
            loadCatalog(1);
        }, 300);
    });
}


loadCatalog();