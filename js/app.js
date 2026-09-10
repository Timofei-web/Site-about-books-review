import { auth, db } from "./firebase.js";
import { onAuthStateChanged, logout, getCurrentUserData } from "./auth.js";
import { collection, query, orderBy, limit, getDocs, startAfter, where, onSnapshot } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const state = { lastDoc: null, loading: false, unsubscribe: null, search: "" };
const $ = (s) => document.querySelector(s);
const PLACEHOLDER = "https://placehold.co/600x800?text=Book";

async function loadBooks({ reset = false } = {}) {
  const list = $("#bookList");
  if (!list || state.loading) return;
  state.loading = true;
  if (reset) { state.lastDoc = null; list.innerHTML = ""; }

  const category = $("#category")?.value || "all";
  const sort = $("#sort")?.value || "new";
  const term = state.search.trim().toLowerCase();
  const constraints = [];

  if (category !== "all") constraints.push(where("category", "==", category));
  if (term) { constraints.push(where("titleLower", ">=", term)); constraints.push(where("titleLower", "<=", term + "\uf8ff")); }
  if (sort === "rating") constraints.push(orderBy("rating", "desc"), orderBy("titleLower", "asc"));
  else if (sort === "yearDesc") constraints.push(orderBy("year", "desc"), orderBy("titleLower", "asc"));
  else constraints.push(orderBy("createdAt", "desc"));
  constraints.push(limit(8));
  if (state.lastDoc) constraints.push(startAfter(state.lastDoc));

  try {
    const snap = await getDocs(query(collection(db, "books"), ...constraints));
    if (!snap.empty) state.lastDoc = snap.docs[snap.docs.length - 1];
    for (const d of snap.docs) list.insertAdjacentHTML("beforeend", bookCard({ id: d.id, ...d.data() }));
    $("#moreBtn").hidden = snap.size < 8;
  } catch (e) {
    console.error(e);
    showToast("Не удалось загрузить книги. Для комбинаций фильтров Firebase может потребовать индекс.");
  } finally { state.loading = false; }
}

function bookCard(book) {
  const rating = Number(book.rating || 0);
  return `<article class="product-card"><img src="${escapeAttr(book.imageUrl || PLACEHOLDER)}" alt="${escapeAttr(book.title || "Книга")}"><div class="product-card-body"><span class="badge">${escapeHtml(book.category || "Без жанра")}</span><h3>${escapeHtml(book.title || "Без названия")}</h3><p class="author">${escapeHtml(book.author || "Автор неизвестен")}</p><div class="rating">★ ${rating.toFixed(1)} <span class="muted">(${Number(book.reviewCount || 0)})</span></div><p>${escapeHtml((book.description || "").slice(0, 110))}${(book.description || "").length > 110 ? "…" : ""}</p><div class="product-bottom"><span>${book.year ? escapeHtml(book.year) : ""}</span><a class="btn small" href="product.html?id=${encodeURIComponent(book.id)}">Отзывы</a></div></div></article>`;
}

function showToast(msg) { const el = $("#toast"); if (!el) return; el.textContent = msg; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2300); }
function escapeHtml(v) { return String(v).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function escapeAttr(v) { return escapeHtml(v); }

function bindHeader(user, role) {
  $("#authLink")?.toggleAttribute("hidden", !!user);
  $("#accountLink")?.toggleAttribute("hidden", !user);
  $("#adminLink")?.toggleAttribute("hidden", role !== "admin");
  const logoutBtn = $("#logoutBtn");
  logoutBtn?.toggleAttribute("hidden", !user);
  logoutBtn?.addEventListener("click", async () => { await logout(); location.href = "index.html"; }, { once: true });
}

onAuthStateChanged(auth, async (user) => {
  let role = "user";
  if (user) role = (await getCurrentUserData(user.uid))?.role || "user";
  bindHeader(user, role);
  if ($("#bookList")) {
    await loadBooks({ reset: true });
    state.unsubscribe?.();
    state.unsubscribe = onSnapshot(collection(db, "books"), () => loadBooks({ reset: true }));
  }
});

$("#searchBtn")?.addEventListener("click", () => { state.search = $("#search").value; loadBooks({ reset: true }); });
$("#search")?.addEventListener("keydown", e => { if (e.key === "Enter") { state.search = e.target.value; loadBooks({ reset: true }); } });
$("#category")?.addEventListener("change", () => loadBooks({ reset: true }));
$("#sort")?.addEventListener("change", () => loadBooks({ reset: true }));
$("#moreBtn")?.addEventListener("click", () => loadBooks());
