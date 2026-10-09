import { describe, expect, it } from 'vitest';
import { mat4, type Mat4 } from '../src/index.js';

const { multiply, orthographic, perspective, rotationX, rotationY, rotationZ, scaling, transform, translation, identity } = mat4;
const close = (actual: number[], expected: number[]) => actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 5));

// moved with the helpers from OPRA's site/tests/unit/ribbons.test.ts
describe('mat4 (column-major, as WebGL expects)', () => {
  it('translates a point', () => {
    close(transform(translation(1, 2, 3), [1, 1, 1]), [2, 3, 4]);
  });

  it('rotates a quarter turn about Z (x to y), X (y to z) and Y (z to x)', () => {
    close(transform(rotationZ(Math.PI / 2), [1, 0, 0]), [0, 1, 0]);
    close(transform(rotationX(Math.PI / 2), [0, 1, 0]), [0, 0, 1]);
    close(transform(rotationY(Math.PI / 2), [0, 0, 1]), [1, 0, 0]);
  });

  it('applies the right-hand matrix first when multiplying', () => {
    // rotate then translate: (1,0,0) -> (0,1,0) -> (5,1,0)
    close(transform(multiply(translation(5, 0, 0), rotationZ(Math.PI / 2)), [1, 0, 0]), [5, 1, 0]);
  });

  it('identity is neutral and scaling scales', () => {
    const m: Mat4 = rotationY(0.3);
    expect(Array.from(multiply(identity(), m))).toEqual(Array.from(m));
    close(transform(scaling(2), [1, -3, 0.5]), [2, -6, 1]);
  });

  it('projects the near and far planes to -1 and 1 in depth', () => {
    const p = perspective(Math.PI / 4, 1.5, 1, 10);
    const ndcZ = (z: number) => (p[10] * z + p[14]) / (p[11] * z + p[15]);
    expect(ndcZ(-1)).toBeCloseTo(-1, 5);
    expect(ndcZ(-10)).toBeCloseTo(1, 5);
  });

  it('maps an orthographic box to clip space without perspective', () => {
    const o = orthographic(800, 400, 100);
    close(transform(o, [400, -200, 0]), [1, -1, 0]);
    close(transform(o, [0, 0, -100]), [0, 0, 1]);
    expect(o[11]).toBe(0);
    expect(o[15]).toBe(1);
  });
});
