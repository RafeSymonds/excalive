// effects.mjs: a number that counts from its old value to its new one,
// instead of dipping out and back in. Use as {"change": "count"}.
//
// This is the count effect from references/effects.md with one addition:
// it keeps a centered number centered while its width changes. Returning
// {...b, text} alone keeps b's x, which for a centered label is the left
// edge of the final text, so a shorter number in between ("118" on the way
// to "1,042") drew left of center.
export default {
  count: {
    change(a, b, t, ctx) {
      const from = Number(String(a.text).replace(/,/g, ''));
      const to = Number(String(b.text).replace(/,/g, ''));
      if (!Number.isFinite(from) || !Number.isFinite(to)) return ctx.morph(a, b, t);
      const text = Math.round(ctx.lerp(from, to, ctx.ease(t))).toLocaleString('en-US');
      const shift = { center: 0.5, right: 1 }[b.textAlign] ?? 0;
      const finalWidth = ctx.textWidth(String(b.text), b.fontFamily, b.fontSize);
      const width = ctx.textWidth(text, b.fontFamily, b.fontSize);
      return { ...b, text, originalText: text, x: b.x + (finalWidth - width) * shift, width };
    },
  },
};
