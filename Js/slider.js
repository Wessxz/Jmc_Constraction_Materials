// ================= HAMBURGER =================
const hamburger = document.getElementById("hamburgerMenu");
const categoryMenu = document.querySelector(".category-menu");

if (hamburger && categoryMenu) {
  hamburger.addEventListener("click", () => {
    categoryMenu.classList.toggle("active");
  });
}

// ================= SLIDER =================
let current = 0;
let slideInterval = null;

function showSlide(index, slides) {
  slides.forEach(slide => slide.classList.remove("active"));
  slides[index].classList.add("active");
}

function startSlider(slides) {
  const nextBtn = document.querySelector(".next-slide");
  const prevBtn = document.querySelector(".prev-slide");

  if (nextBtn) nextBtn.addEventListener("click", () => {
    current = (current + 1) % slides.length;
    showSlide(current, slides);
  });

  if (prevBtn) prevBtn.addEventListener("click", () => {
    current = (current - 1 + slides.length) % slides.length;
    showSlide(current, slides);
  });

  if (slideInterval) clearInterval(slideInterval);
  slideInterval = setInterval(() => {
    current = (current + 1) % slides.length;
    showSlide(current, slides);
  }, 4000);
}

async function initSlider() {
  const sliderEl = document.querySelector(".hero-slider");
  if (!sliderEl) return;

  // Disabled API loading - using hardcoded images from Page.html
  /*
  try {
    const res = await fetch('/api/banners');
    const json = await res.json();
    if (json.success && json.data.length > 0) {
      // Replace hardcoded slides with API banners
      sliderEl.querySelectorAll('.hero-slide').forEach(s => s.remove());
      json.data.forEach((b, i) => {
        const img = document.createElement('img');
        img.src = b.url;
        img.className = 'hero-slide' + (i === 0 ? ' active' : '');
        img.onerror = function() { this.src = 'img/slide1.png'; };
        sliderEl.appendChild(img);
      });
    }
  } catch (e) {
    console.error('Failed to load banners:', e);
  }
  */

  const slides = document.querySelectorAll(".hero-slide");
  if (slides.length > 0) startSlider(slides);
}

document.addEventListener('DOMContentLoaded', initSlider);