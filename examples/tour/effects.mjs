// effects.mjs: a number that counts from its old value to its new one,
// instead of dipping out and back in. Use as {"change": "count"}.
//
// This is the count effect from references/effects.md, built on morph
// instead of the final element: the score sits at the end of its bar, so
// it has to travel with the bar while it counts. Returning {...b, text}
// would put the number at the bar's final end at once.
export default {
  count: {
    change(a, b, t, ctx) {
      const from = Number(String(a.text).replace(/,/g, ''));
      const to = Number(String(b.text).replace(/,/g, ''));
      const m = ctx.morph(a, b, t);
      if (!Number.isFinite(from) || !Number.isFinite(to)) return m;
      const text = Math.round(ctx.lerp(from, to, ctx.ease(t))).toLocaleString('en-US');
      const shift = { center: 0.5, right: 1 }[b.textAlign] ?? 0;
      const width = ctx.textWidth(text, b.fontFamily, b.fontSize);
      const final = ctx.textWidth(String(b.text), b.fontFamily, b.fontSize);
      // morph dips changed text out and back in; a count stays visible.
      return { ...m, opacity: b.opacity, text, originalText: text, x: m.x + (final - width) * shift, width };
    },
  },
};
