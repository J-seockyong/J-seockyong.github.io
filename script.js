const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('#site-nav');

if (navToggle && siteNav) {
  navToggle.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    siteNav.classList.toggle('is-open');
  });

  siteNav.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement && window.innerWidth <= 760) {
      navToggle.setAttribute('aria-expanded', 'false');
      siteNav.classList.remove('is-open');
    }
  });
}

const currentYear = new Date().getFullYear();
document.documentElement.dataset.year = String(currentYear);
