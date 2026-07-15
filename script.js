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

const gameTabs = document.querySelectorAll('[data-game-tab]');
const gamePanels = document.querySelectorAll('[data-game-panel]');

function activateGame(name) {
  gameTabs.forEach((button) => {
    const active = button.dataset.gameTab === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });

  gamePanels.forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.gamePanel === name);
  });

  window.dispatchEvent(new CustomEvent('portfolio:game-change', { detail: { game: name } }));
}

if (gameTabs.length && gamePanels.length) {
  gameTabs.forEach((button) => {
    button.addEventListener('click', () => activateGame(button.dataset.gameTab));
  });
}

document.documentElement.dataset.year = String(new Date().getFullYear());
