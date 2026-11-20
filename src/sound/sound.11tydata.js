export default {
  layout: "layouts/sound.njk",
  eleventyComputed: {
    // a recording sits on the Sound line unless it says otherwise
    lines: (data) => (data.lines && data.lines.length ? data.lines : ["sound"]),
    line: (data) => (data.lines && data.lines[0]) || "sound",
  },
};
