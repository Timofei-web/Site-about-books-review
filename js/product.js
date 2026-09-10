import { db, auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { doc, getDoc, addDoc, updateDoc, deleteDoc, collection, query, where, orderBy, onSnapshot, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const id = new URLSearchParams(location.search).get("id");
const root = document.querySelector("#book");
let currentUser = null;
let userReview = null;

onAuthStateChanged(auth, async user => { currentUser = user; await renderBook(); renderReviewForm(); });

async function renderBook() {
  if (!id) return root.innerHTML = "<p>Книга не найдена.</p>";
  const snap = await getDoc(doc(db, "books", id));
  if (!snap.exists()) return root.innerHTML = "<p>Книга не найдена.</p>";
  const b = { id: snap.id, ...snap.data() };
  root.innerHTML = `<div class="detail-image"><img src="${esc(b.imageUrl || "https://placehold.co/800x1000?text=Book")}" alt="${esc(b.title || "Книга")}"></div><div class="detail-info"><span class="badge">${esc(b.category || "")}</span><p class="muted">${esc(b.year || "")} ${b.year ? "·" : ""} ${esc(b.author || "")}</p><h1>${esc(b.title || "")}</h1><div class="detail-rating"><span class="rating big">★ ${Number(b.rating || 0).toFixed(1)}</span><span class="muted">${Number(b.reviewCount || 0)} отзывов</span></div><p>${esc(b.description || "")}</p></div>`;
  subscribeReviews();
}

function subscribeReviews() {
  const reviewsQuery = query(collection(db, "reviews"), where("bookId", "==", id), orderBy("createdAt", "desc"));
  onSnapshot(reviewsQuery, snap => {
    const list = document.querySelector("#reviewsList");
    document.querySelector("#reviewsCount").textContent = `${snap.size} отзывов`;
    const reviews = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    userReview = reviews.find(r => r.userId === currentUser?.uid) || null;
    list.innerHTML = reviews.length ? reviews.map(reviewCard).join("") : "<p class='muted'>Пока нет отзывов. Будьте первым.</p>";
    renderReviewForm();
    list.querySelectorAll("button[data-delete]").forEach(btn => btn.addEventListener("click", async () => { await deleteDoc(doc(db, "reviews", btn.dataset.delete)); await recalculateBookRating(); }));
    list.querySelectorAll("button[data-edit]").forEach(btn => btn.addEventListener("click", () => { const r = reviews.find(x => x.id === btn.dataset.edit); fillReviewForm(r); }));
  }, err => console.error(err));
}

function reviewCard(r) {
  const mine = currentUser?.uid === r.userId;
  return `<article class="review-card"><div class="review-head"><div><strong>${esc(r.userName || "Читатель")}</strong><div class="stars">${"★".repeat(Number(r.rating || 0))}${"☆".repeat(5 - Number(r.rating || 0))}</div></div>${mine ? `<div class="review-actions"><button class="link-btn" data-edit="${r.id}">Изменить</button><button class="link-btn danger-text" data-delete="${r.id}">Удалить</button></div>` : ""}</div><p>${esc(r.text || "")}</p></article>`;
}

function renderReviewForm() {
  const wrap = document.querySelector("#reviewFormWrap");
  if (!wrap) return;
  if (!currentUser) { wrap.innerHTML = `<div class="notice">Войдите, чтобы поставить оценку и оставить отзыв. <a href="auth.html">Войти</a></div>`; return; }
  const r = userReview;
  wrap.innerHTML = `<form id="reviewForm" class="review-form"><div class="section-head"><h3>${r ? "Редактировать отзыв" : "Оставить отзыв"}</h3>${r ? `<button type="button" class="link-btn" id="cancelEdit">Отмена</button>` : ""}</div><label>Оценка</label><select id="reviewRating" required><option value="">Выберите оценку</option>${[5,4,3,2,1].map(n=>`<option value="${n}" ${r?.rating===n?"selected":""}>${n} из 5</option>`).join("")}</select><label>Отзыв</label><textarea id="reviewText" rows="5" minlength="5" maxlength="1000" required placeholder="Поделитесь впечатлением о книге...">${esc(r?.text || "")}</textarea><button class="btn">${r ? "Сохранить изменения" : "Опубликовать отзыв"}</button><p id="reviewMessage" class="muted"></p></form>`;
  document.querySelector("#reviewForm").addEventListener("submit", submitReview);
  document.querySelector("#cancelEdit")?.addEventListener("click", () => { userReview = null; renderReviewForm(); });
}

function fillReviewForm(r) { userReview = r; renderReviewForm(); window.scrollTo({ top: document.querySelector("#reviewFormWrap").offsetTop - 90, behavior: "smooth" }); }

async function submitReview(e) {
  e.preventDefault();
  const rating = Number(document.querySelector("#reviewRating").value);
  const text = document.querySelector("#reviewText").value.trim();
  if (!rating || text.length < 5) return;
  const data = { bookId: id, userId: currentUser.uid, userName: currentUser.displayName || currentUser.email?.split("@")[0] || "Читатель", rating, text, updatedAt: serverTimestamp() };
  if (userReview?.id) await updateDoc(doc(db, "reviews", userReview.id), data);
  else await addDoc(collection(db, "reviews"), { ...data, createdAt: serverTimestamp() });
  await recalculateBookRating();
}

async function recalculateBookRating() {
  const snap = await getDocs(query(collection(db, "reviews"), where("bookId", "==", id)));
  const ratings = snap.docs.map(d => Number(d.data().rating || 0)).filter(Boolean);
  const rating = ratings.length ? ratings.reduce((a,b)=>a+b,0) / ratings.length : 0;
  await updateDoc(doc(db, "books", id), { rating: Number(rating.toFixed(1)), reviewCount: ratings.length, updatedAt: serverTimestamp() });
}

function esc(v) { return String(v ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
