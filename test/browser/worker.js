// A worker hero for the browser test: fills its canvas green and reports each draw.
import { serveWorkerHero } from '/dist/worker.js';

serveWorkerHero(self, (canvas) => {
  const ctx = canvas.getContext('2d');
  let draws = 0;
  return {
    onResize: (w, h, dpr) => ctx.setTransform(dpr, 0, 0, dpr, 0, 0),
    draw() {
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      draws += 1;
      self.postMessage({ draws, width: canvas.width, height: canvas.height });
    }
  };
});
