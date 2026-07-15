(() => {
  const safeNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const choice = (items) => items[randInt(0, items.length - 1)];
  const sameCell = (a, b) => a && b && a.x === b.x && a.y === b.y;

  const storage = {
    get(key, fallback = 0) {
      try {
        const value = localStorage.getItem(key);
        if (value === null) return fallback;
        return safeNumber(value, fallback);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, String(value));
      } catch {
        // ignore storage failures
      }
    },
  };

  class SnakeGame {
    constructor(panel) {
      this.panel = panel;
      this.canvas = panel.querySelector('[data-snake-canvas]');
      this.ctx = this.canvas.getContext('2d');
      this.scoreEl = panel.querySelector('[data-snake-score]');
      this.bestEl = panel.querySelector('[data-snake-best]');
      this.statusEl = panel.querySelector('[data-snake-status]');
      this.controls = panel.querySelectorAll('[data-snake-action], [data-snake-dir]');
      this.panelVisible = panel.classList.contains('is-active');
      this.timer = null;
      this.speed = 140;
      this.rafResize = null;
      this.reset(true);
      this.bind();
      this.resize();
      this.render();
    }

    bind() {
      this.handleKeyDown = this.handleKeyDown.bind(this);
      window.addEventListener('keydown', this.handleKeyDown);

      this.controls.forEach((button) => {
        button.addEventListener('click', () => {
          const action = button.dataset.snakeAction;
          const dir = button.dataset.snakeDir;
          if (action === 'start') this.start();
          if (action === 'pause') this.togglePause();
          if (action === 'restart') this.restart();
          if (dir) this.setDirection(dir);
        });
      });

      window.addEventListener('resize', () => this.resize());
      window.addEventListener('portfolio:game-change', (event) => {
        this.setVisible(event.detail.game === 'snake');
      });
    }

    setVisible(isVisible) {
      this.panelVisible = isVisible;
      if (!isVisible) {
        this.pause();
      } else {
        this.resize();
        this.render();
      }
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const size = Math.max(280, Math.floor(rect.width || 560));
      this.canvas.width = size;
      this.canvas.height = size;
      this.cols = 20;
      this.rows = 20;
      this.cellSize = size / this.cols;
      this.render();
    }

    reset(initial = false) {
      this.score = 0;
      this.best = storage.get('snake-best', 0);
      this.direction = { x: 1, y: 0 };
      this.nextDirection = { x: 1, y: 0 };
      this.snake = [
        { x: 8, y: 10 },
        { x: 7, y: 10 },
        { x: 6, y: 10 },
      ];
      this.food = this.spawnCell();
      this.enemy = this.spawnCell();
      this.item = null;
      this.itemLife = 0;
      this.shield = 0;
      this.pendingEffect = '대기';
      this.status = initial ? '대기' : '재시작';
      this.speed = 140;
      this.itemSpawnTicker = 0;
      this.enemyTicker = 0;
      this.updateHud();
    }

    spawnCell() {
      let cell;
      do {
        cell = { x: randInt(0, this.cols - 1), y: randInt(0, this.rows - 1) };
      } while (this.isOccupied(cell));
      return cell;
    }

    isOccupied(cell) {
      return this.snake.some((segment) => sameCell(segment, cell)) ||
        sameCell(this.food, cell) ||
        sameCell(this.enemy, cell) ||
        sameCell(this.item?.cell, cell);
    }

    setDirection(name) {
      const map = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
      };
      const next = map[name];
      if (!next) return;

      const opposite = this.direction.x + next.x === 0 && this.direction.y + next.y === 0;
      if (opposite) return;

      this.nextDirection = next;
    }

    handleKeyDown(event) {
      if (!this.panelVisible) return;
      const key = event.key.toLowerCase();
      const map = {
        arrowup: 'up',
        w: 'up',
        arrowdown: 'down',
        s: 'down',
        arrowleft: 'left',
        a: 'left',
        arrowright: 'right',
        d: 'right',
        ' ': 'pause',
      };
      const action = map[key];
      if (!action) return;
      event.preventDefault();
      if (action === 'pause') {
        this.togglePause();
      } else {
        this.setDirection(action);
      }
    }

    start() {
      if (this.timer || !this.panelVisible) return;
      this.status = '진행 중';
      this.updateHud();
      this.timer = window.setInterval(() => this.step(), this.speed);
    }

    pause() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.status = this.score > 0 ? '일시정지' : '대기';
      this.updateHud();
    }

    togglePause() {
      if (this.timer) {
        this.pause();
      } else {
        this.start();
      }
    }

    restart() {
      this.pause();
      this.reset(false);
      this.render();
    }

    restartTimer() {
      if (!this.timer) return;
      clearInterval(this.timer);
      this.timer = window.setInterval(() => this.step(), this.speed);
    }

    gameOver(reason) {
      this.pause();
      this.status = reason || '게임 오버';
      this.best = Math.max(this.best, this.score);
      storage.set('snake-best', this.best);
      this.updateHud();
      this.render();
    }

    applyItem(type) {
      const effects = {
        speed: () => {
          this.speed = Math.max(70, this.speed - 18);
          this.pendingEffect = '속도 증가';
          this.restartTimer();
        },
        slow: () => {
          this.speed = Math.min(220, this.speed + 18);
          this.pendingEffect = '속도 감소';
          this.restartTimer();
        },
        shield: () => {
          this.shield += 1;
          this.pendingEffect = '실드 +1';
        },
        bonus: () => {
          this.score += 25;
          this.pendingEffect = '보너스 +25';
        },
      };
      (effects[type] || effects.bonus)();
      this.updateScore();
    }

    moveEnemy() {
      const moves = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ];
      const move = choice(moves);
      const next = {
        x: clamp(this.enemy.x + move.x, 0, this.cols - 1),
        y: clamp(this.enemy.y + move.y, 0, this.rows - 1),
      };
      if (!sameCell(next, this.food) && !this.snake.some((segment) => sameCell(segment, next))) {
        this.enemy = next;
      }
    }

    spawnRandomItem() {
      const types = ['speed', 'slow', 'shield', 'bonus'];
      this.item = {
        cell: this.spawnCell(),
        type: choice(types),
        life: 18,
      };
    }

    step() {
      this.direction = this.nextDirection;
      const head = this.snake[0];
      const nextHead = {
        x: head.x + this.direction.x,
        y: head.y + this.direction.y,
      };

      const wallHit = nextHead.x < 0 || nextHead.x >= this.cols || nextHead.y < 0 || nextHead.y >= this.rows;
      const selfHit = this.snake.some((segment) => sameCell(segment, nextHead));
      const enemyHit = sameCell(this.enemy, nextHead);
      if (wallHit || selfHit || enemyHit) {
        if (this.shield > 0) {
          this.shield -= 1;
          this.pendingEffect = '실드 사용';
        } else {
          this.gameOver('충돌');
          return;
        }
      }

      this.snake.unshift(nextHead);

      if (sameCell(nextHead, this.food)) {
        this.score += 10;
        this.food = this.spawnCell();
      } else {
        this.snake.pop();
      }

      if (this.item && sameCell(nextHead, this.item.cell)) {
        this.applyItem(this.item.type);
        this.item = null;
      }

      if (this.item) {
        this.item.life -= 1;
        if (this.item.life <= 0) {
          this.item = null;
        }
      }

      this.enemyTicker += 1;
      if (this.enemyTicker % 2 === 0) {
        this.moveEnemy();
      }

      if (!this.item) {
        this.itemSpawnTicker += 1;
        if (this.itemSpawnTicker >= 7) {
          this.spawnRandomItem();
          this.itemSpawnTicker = 0;
        }
      }

      if (sameCell(this.enemy, nextHead)) {
        if (this.shield > 0) {
          this.shield -= 1;
        } else {
          this.gameOver('적 충돌');
          return;
        }
      }

      this.best = Math.max(this.best, this.score);
      storage.set('snake-best', this.best);
      this.updateScore();
      this.render();
    }

    updateScore() {
      this.scoreEl.textContent = String(this.score);
      this.bestEl.textContent = String(this.best);
      this.statusEl.textContent = `${this.status}${this.shield > 0 ? ' · 실드 ' + this.shield : ''}`;
    }

    updateHud() {
      this.updateScore();
    }

    drawRoundedRect(x, y, width, height, radius) {
      const ctx = this.ctx;
      const r = Math.min(radius, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + width, y, x + width, y + height, r);
      ctx.arcTo(x + width, y + height, x, y + height, r);
      ctx.arcTo(x, y + height, x, y, r);
      ctx.arcTo(x, y, x + width, y, r);
      ctx.closePath();
    }

    render() {
      const ctx = this.ctx;
      const { width, height } = this.canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#f7fbf7';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#e4f1e7';
      for (let i = 0; i < this.cols; i += 1) {
        for (let j = 0; j < this.rows; j += 1) {
          if ((i + j) % 2 === 0) {
            ctx.fillRect(i * this.cellSize, j * this.cellSize, this.cellSize, this.cellSize);
          }
        }
      }

      const drawCell = (cell, fill, inset = 0.12) => {
        const padding = this.cellSize * inset;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.roundRect(
          cell.x * this.cellSize + padding,
          cell.y * this.cellSize + padding,
          this.cellSize - padding * 2,
          this.cellSize - padding * 2,
          this.cellSize * 0.22
        );
        ctx.fill();
      };

      drawCell(this.food, '#f4b53d', 0.2);
      if (this.item) {
        drawCell(this.item.cell, '#7d61ff', 0.18);
      }
      drawCell(this.enemy, '#ef5f7a', 0.16);

      this.snake.forEach((segment, index) => {
        const alpha = 1 - index / Math.max(1, this.snake.length + 2);
        drawCell(segment, `rgba(14, 143, 73, ${0.95 - index * 0.05})`, 0.12);
        if (index === 0) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(
            segment.x * this.cellSize + this.cellSize * 0.55,
            segment.y * this.cellSize + this.cellSize * 0.48,
            this.cellSize * 0.07,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      });

      ctx.fillStyle = 'rgba(14, 143, 73, 0.05)';
      ctx.fillRect(0, 0, width, height);
    }
  }

  class PlaneGame {
    constructor(panel) {
      this.panel = panel;
      this.canvas = panel.querySelector('[data-plane-canvas]');
      this.ctx = this.canvas.getContext('2d');
      this.scoreEl = panel.querySelector('[data-plane-score]');
      this.bestEl = panel.querySelector('[data-plane-best]');
      this.statusEl = panel.querySelector('[data-plane-status]');
      this.gaugeEl = panel.querySelector('[data-plane-gauge]');
      this.skillButton = panel.querySelector('[data-plane-action="skill"]');
      this.controls = panel.querySelectorAll('[data-plane-action], [data-plane-dir]');
      this.panelVisible = panel.classList.contains('is-active');
      this.running = false;
      this.rafId = 0;
      this.keys = new Set();
      this.touch = { up: false, down: false, left: false, right: false };
      this.reset(true);
      this.bind();
      this.resize();
      this.render();
    }

    bind() {
      this.handleKeyDown = this.handleKeyDown.bind(this);
      this.handleKeyUp = this.handleKeyUp.bind(this);
      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('keyup', this.handleKeyUp);
      this.controls.forEach((button) => {
        button.addEventListener('click', () => {
          const action = button.dataset.planeAction;
          const dir = button.dataset.planeDir;
          if (action === 'start') this.start();
          if (action === 'pause') this.togglePause();
          if (action === 'restart') this.restart();
          if (action === 'skill') this.activateSkill();
          if (dir) this.setTouchDirection(dir, true);
        });
        if (button.dataset.planeDir) {
          button.addEventListener('pointerup', () => this.setTouchDirection(button.dataset.planeDir, false));
          button.addEventListener('pointerleave', () => this.setTouchDirection(button.dataset.planeDir, false));
        }
      });
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('portfolio:game-change', (event) => {
        this.setVisible(event.detail.game === 'plane');
      });
    }

    setVisible(isVisible) {
      this.panelVisible = isVisible;
      if (!isVisible) {
        this.pause();
      } else {
        this.resize();
        this.render();
      }
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const width = Math.max(320, Math.floor(rect.width || 840));
      const height = Math.max(240, Math.floor(rect.height || width * 0.6));
      this.canvas.width = width;
      this.canvas.height = height;
      this.render();
    }

    reset(initial = false) {
      this.best = storage.get('plane-best', 0);
      this.score = 0;
      this.elapsed = 0;
      this.lastTime = 0;
      this.spawnTimer = 0;
      this.itemTimer = 0;
      this.skillGauge = 0;
      this.skillReady = false;
      this.skillUntil = 0;
      this.status = initial ? '대기' : '재시작';
      this.gameOverReason = '';
      this.fighter = {
        x: 0,
        y: 0,
        w: 50,
        h: 34,
        speed: 210,
      };
      this.missiles = [];
      this.items = [];
      this.stars = Array.from({ length: 36 }, () => this.randomStar(true));
      this.syncFighterPosition();
      this.updateHud();
      this.updateGauge();
    }

    syncFighterPosition() {
      this.fighter.x = this.canvas.width * 0.18;
      this.fighter.y = this.canvas.height * 0.5;
    }

    randomStar(initial = false) {
      return {
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        r: initial ? Math.random() * 1.8 + 0.4 : Math.random() * 1.3 + 0.3,
        speed: Math.random() * 24 + 8,
      };
    }

    handleKeyDown(event) {
      if (!this.panelVisible) return;
      const key = event.key.toLowerCase();
      if (['arrowup', 'w', 'arrowdown', 's', 'arrowleft', 'a', 'arrowright', 'd', ' '].includes(key)) {
        event.preventDefault();
      }
      if (key === ' ') {
        this.togglePause();
        return;
      }
      if (key === 'arrowup' || key === 'w') this.keys.add('up');
      if (key === 'arrowdown' || key === 's') this.keys.add('down');
      if (key === 'arrowleft' || key === 'a') this.keys.add('left');
      if (key === 'arrowright' || key === 'd') this.keys.add('right');
    }

    handleKeyUp(event) {
      const key = event.key.toLowerCase();
      if (key === 'arrowup' || key === 'w') this.keys.delete('up');
      if (key === 'arrowdown' || key === 's') this.keys.delete('down');
      if (key === 'arrowleft' || key === 'a') this.keys.delete('left');
      if (key === 'arrowright' || key === 'd') this.keys.delete('right');
    }

    setTouchDirection(direction, active) {
      this.touch[direction] = active;
    }

    start() {
      if (this.running || !this.panelVisible) return;
      this.running = true;
      this.status = '진행 중';
      this.lastTime = performance.now();
      this.loop(this.lastTime);
      this.updateHud();
    }

    pause() {
      if (this.running) {
        cancelAnimationFrame(this.rafId);
      }
      this.running = false;
      this.status = this.score > 0 ? '일시정지' : '대기';
      this.updateHud();
      this.render();
    }

    togglePause() {
      if (this.running) this.pause();
      else this.start();
    }

    restart() {
      this.pause();
      this.reset(false);
      this.render();
    }

    activateSkill() {
      if (!this.skillReady) return;
      this.skillReady = false;
      this.skillGauge = 0;
      this.skillUntil = performance.now() + 3500;
      this.status = '방어막 활성화';
      this.skillButton.disabled = true;
      this.updateGauge();
      this.updateHud();
    }

    spawnMissile() {
      const edge = randInt(0, 3);
      let x = 0;
      let y = 0;
      if (edge === 0) {
        x = Math.random() * this.canvas.width;
        y = -24;
      } else if (edge === 1) {
        x = this.canvas.width + 24;
        y = Math.random() * this.canvas.height;
      } else if (edge === 2) {
        x = Math.random() * this.canvas.width;
        y = this.canvas.height + 24;
      } else {
        x = -24;
        y = Math.random() * this.canvas.height;
      }
      const targetX = this.fighter.x + this.fighter.w / 2;
      const targetY = this.fighter.y + this.fighter.h / 2;
      const angle = Math.atan2(targetY - y, targetX - x);
      const speed = randInt(180, 280) + this.elapsed * 2;
      this.missiles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: randInt(6, 10),
      });
    }

    spawnItem() {
      const types = ['shield', 'engine', 'score', 'gauge'];
      this.items.push({
        x: randInt(40, this.canvas.width - 40),
        y: randInt(40, this.canvas.height - 40),
        type: choice(types),
        r: 11,
        life: 10 + Math.random() * 7,
      });
    }

    rectCircleHit(rect, circle) {
      const nearestX = clamp(circle.x, rect.x, rect.x + rect.w);
      const nearestY = clamp(circle.y, rect.y, rect.y + rect.h);
      const dx = circle.x - nearestX;
      const dy = circle.y - nearestY;
      return dx * dx + dy * dy <= circle.r * circle.r;
    }

    applyItem(type) {
      if (type === 'shield') {
        this.skillGauge = Math.min(100, this.skillGauge + 30);
        this.status = '실드 충전';
      } else if (type === 'engine') {
        this.fighter.speed = Math.min(320, this.fighter.speed + 35);
        this.status = '속도 증가';
      } else if (type === 'gauge') {
        this.skillGauge = Math.min(100, this.skillGauge + 45);
        this.status = '게이지 충전';
      } else {
        this.score += 20;
        this.status = '보너스 점수';
      }
      this.skillReady = this.skillGauge >= 100;
      if (this.skillReady) this.skillButton.disabled = false;
      this.updateGauge();
      this.updateHud();
    }

    gameOver(reason) {
      this.pause();
      this.gameOverReason = reason || '미사일 충돌';
      this.status = `게임 오버 · ${this.gameOverReason}`;
      this.best = Math.max(this.best, this.score);
      storage.set('plane-best', this.best);
      this.updateHud();
      this.render();
    }

    updateGauge() {
      this.gaugeEl.style.width = `${clamp(this.skillGauge, 0, 100)}%`;
      this.skillButton.disabled = !this.skillReady;
    }

    updateHud() {
      this.scoreEl.textContent = String(Math.floor(this.score));
      this.bestEl.textContent = String(this.best);
      this.statusEl.textContent = this.status;
    }

    loop(now) {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.update(dt, now);
      this.render();
      this.rafId = requestAnimationFrame((next) => this.loop(next));
    }

    update(dt, now) {
      this.elapsed += dt;
      const moveX = (this.keys.has('right') ? 1 : 0) - (this.keys.has('left') ? 1 : 0) +
        (this.touch.right ? 1 : 0) - (this.touch.left ? 1 : 0);
      const moveY = (this.keys.has('down') ? 1 : 0) - (this.keys.has('up') ? 1 : 0) +
        (this.touch.down ? 1 : 0) - (this.touch.up ? 1 : 0);
      const length = Math.hypot(moveX, moveY) || 1;
      this.fighter.x += (moveX / length) * this.fighter.speed * dt;
      this.fighter.y += (moveY / length) * this.fighter.speed * dt;
      this.fighter.x = clamp(this.fighter.x, 16, this.canvas.width - this.fighter.w - 16);
      this.fighter.y = clamp(this.fighter.y, 16, this.canvas.height - this.fighter.h - 16);

      this.spawnTimer += dt;
      const spawnInterval = Math.max(0.55, 1.3 - this.elapsed * 0.025);
      if (this.spawnTimer >= spawnInterval) {
        this.spawnMissile();
        this.spawnTimer = 0;
      }

      this.itemTimer += dt;
      if (this.itemTimer >= 5.8) {
        this.spawnItem();
        this.itemTimer = 0;
      }

      this.missiles = this.missiles.filter((missile) => {
        missile.x += missile.vx * dt;
        missile.y += missile.vy * dt;
        const offscreen =
          missile.x < -80 || missile.x > this.canvas.width + 80 ||
          missile.y < -80 || missile.y > this.canvas.height + 80;
        if (offscreen) {
          this.score += 5;
          return false;
        }
        if (this.rectCircleHit(this.fighter, missile)) {
          if (now < this.skillUntil) {
            return false;
          }
          this.gameOver('피격');
          return false;
        }
        return true;
      });

      this.items = this.items.filter((item) => {
        item.life -= dt;
        if (item.life <= 0) return false;
        const circleHit = this.rectCircleHit(this.fighter, item);
        if (circleHit) {
          this.applyItem(item.type);
          return false;
        }
        return true;
      });

      this.skillGauge = clamp(this.skillGauge + dt * 12, 0, 100);
      this.skillReady = this.skillGauge >= 100;
      this.skillButton.disabled = !this.skillReady;
      this.score += dt * 10;
      this.best = Math.max(this.best, this.score);
      storage.set('plane-best', Math.floor(this.best));
      this.updateGauge();
      this.updateHud();
    }

    drawStars() {
      const ctx = this.ctx;
      ctx.fillStyle = '#f7fbff';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
      gradient.addColorStop(0, '#eff6ff');
      gradient.addColorStop(1, '#fefeff');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      this.stars.forEach((star) => {
        star.x -= star.speed * 0.016;
        if (star.x < -2) {
          star.x = this.canvas.width + 2;
          star.y = Math.random() * this.canvas.height;
        }
        ctx.fillStyle = 'rgba(30, 51, 36, 0.65)';
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    renderMissiles() {
      const ctx = this.ctx;
      this.missiles.forEach((missile) => {
        const glow = ctx.createRadialGradient(missile.x, missile.y, 0, missile.x, missile.y, missile.r * 3.5);
        glow.addColorStop(0, 'rgba(78, 115, 255, 0.95)');
        glow.addColorStop(1, 'rgba(78, 115, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(missile.x, missile.y, missile.r * 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3b5de7';
        ctx.beginPath();
        ctx.arc(missile.x, missile.y, missile.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    renderItems() {
      const ctx = this.ctx;
      this.items.forEach((item) => {
        const fill =
          item.type === 'shield' ? '#31c6d7' :
          item.type === 'engine' ? '#0e8f49' :
          item.type === 'score' ? '#f4b53d' : '#7d61ff';
        const glow = ctx.createRadialGradient(item.x, item.y, 0, item.x, item.y, item.r * 3);
        glow.addColorStop(0, fill);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.r * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    renderFighter() {
      const ctx = this.ctx;
      const { x, y, w, h } = this.fighter;
      const shieldActive = performance.now() < this.skillUntil;

      if (shieldActive) {
        ctx.strokeStyle = 'rgba(49, 198, 215, 0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w * 0.95, h * 1.1, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      const glow = ctx.createLinearGradient(x, y, x + w, y + h);
      glow.addColorStop(0, '#0e8f49');
      glow.addColorStop(1, '#c7f6d9');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.moveTo(x, y + h / 2);
      ctx.lineTo(x + w * 0.62, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w * 0.62, y + h);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.26, y + h * 0.5);
      ctx.lineTo(x + w * 0.68, y + h * 0.34);
      ctx.lineTo(x + w * 0.82, y + h * 0.5);
      ctx.lineTo(x + w * 0.68, y + h * 0.66);
      ctx.closePath();
      ctx.fill();
    }

    render() {
      this.drawStars();
      this.renderItems();
      this.renderMissiles();
      this.renderFighter();

      if (!this.running && this.score === 0) {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(16, 22, 20, 0.7)';
        ctx.font = '600 18px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('전투기를 움직여 미사일을 피하세요', this.canvas.width / 2, this.canvas.height / 2 - 12);
        ctx.font = '500 13px Inter, sans-serif';
        ctx.fillText('방향키 / WASD / 모바일 버튼 지원', this.canvas.width / 2, this.canvas.height / 2 + 14);
      }
    }
  }

  function initGames() {
    const snakePanel = document.querySelector('[data-game-panel="snake"]');
    const planePanel = document.querySelector('[data-game-panel="plane"]');
    if (!snakePanel || !planePanel) return;
    const snakeGame = new SnakeGame(snakePanel);
    const planeGame = new PlaneGame(planePanel);

    window.addEventListener('portfolio:game-change', (event) => {
      if (event.detail.game === 'snake') {
        snakeGame.setVisible(true);
        planeGame.setVisible(false);
      } else {
        snakeGame.setVisible(false);
        planeGame.setVisible(true);
      }
    });

    snakeGame.setVisible(true);
    planeGame.setVisible(false);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        snakeGame.pause();
        planeGame.pause();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGames, { once: true });
  } else {
    initGames();
  }
})();
