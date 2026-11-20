export default {
  layout: "layouts/project.njk",
  eleventyComputed: {
    line: (data) => (data.lines && data.lines[0]) || "code",
  },
};
